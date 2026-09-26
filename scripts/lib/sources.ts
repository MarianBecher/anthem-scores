// Loading the curated sources: MIDI bytes plus metadata (URL, author,
// license) and - for LilyPond scores from wiki pages - the score text, from
// which we read the pickup (\partial) and the tempo mark (\tempo).
import { fetchCached, fetchJson } from './cache.ts';

/**
 * A LilyPond `<score>` block in a wiki page. The Score extension renders
 * every block to a MIDI file with a content-addressed (hence stable) URL.
 */
export interface ScoreSource {
  type: 'score';
  /** Language of the Wikipedia (also used for labels when `site` is set). */
  lang: string;
  /** Another wiki with the Score extension, e.g. `en.wikisource.org`. Default: `<lang>.wikipedia.org`. */
  site?: string;
  /** Page title. */
  page: string;
  /** Pinned revision whose LilyPond text is read. */
  revid: number;
  /** Position of the `<score>` block on the page (default 0). */
  scoreIndex?: number;
  /** URL of the rendered MIDI file (upload.wikimedia.org/score/...). */
  midi: string;
}

/** A MIDI file on Wikimedia Commons. Author and license come from the file's metadata. */
export interface CommonsSource {
  type: 'commons';
  /** File title, with or without the `File:` prefix. */
  file: string;
  /** Overrides the author text from the metadata (e.g. to give it in English). */
  author?: string;
}

export type SourceRef = ScoreSource | CommonsSource;

export interface LoadedSource {
  midi: Buffer;
  /** Human-readable source page (Commons file page or pinned revision). */
  url: string;
  /** Direct URL of the MIDI file. */
  fileUrl: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  /** LilyPond text of the score, if any. */
  ly: string | null;
}

const stripHtml = (s: string | undefined): string =>
  (s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

interface MetaValue {
  value?: string;
}
interface ImageInfoResponse {
  query: {
    pages: Array<{
      imageinfo?: Array<{ url: string; descriptionurl: string; extmetadata?: Record<string, MetaValue | undefined> }>;
    }>;
  };
}
interface RevisionResponse {
  query: { pages: Array<{ revisions: Array<{ slots: { main: { content: string } } }> }> };
}

async function commonsSource(src: CommonsSource): Promise<LoadedSource> {
  const title = src.file.startsWith('File:') ? src.file : 'File:' + src.file;
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|extmetadata&titles=${encodeURIComponent(title)}`;
  const d = await fetchJson<ImageInfoResponse>(api);
  const info = d.query.pages[0]?.imageinfo?.[0];
  if (!info) throw new Error(`Commons file missing: ${title}`);
  const meta = info.extmetadata ?? {};
  const midi = await fetchCached(info.url, { ext: '.mid' });
  return {
    midi,
    url: info.descriptionurl,
    fileUrl: info.url,
    author: src.author ?? (stripHtml(meta.Artist?.value) || 'unknown'),
    license: stripHtml(meta.LicenseShortName?.value) || 'unknown',
    licenseUrl: meta.LicenseUrl?.value ?? null,
    ly: null,
  };
}

export const scoreHost = (src: ScoreSource): string => src.site ?? `${src.lang}.wikipedia.org`;

async function scoreSource(src: ScoreSource): Promise<LoadedSource> {
  // Default: the Wikipedia of language `lang`; `site` allows other wikis
  // with the Score extension, e.g. Wikisource (transcriptions of public
  // domain songbooks).
  const host = scoreHost(src);
  const base = `https://${host}/w/api.php?format=json&formatversion=2`;
  const d = await fetchJson<RevisionResponse>(`${base}&action=query&prop=revisions&rvprop=content&rvslots=main&revids=${src.revid}`);
  const text = d.query.pages[0]?.revisions[0]?.slots.main.content ?? '';
  const scores = [...text.matchAll(/<score([^>]*)>([\s\S]*?)<\/score>/g)];
  const ly = scores[src.scoreIndex ?? 0]?.[2] ?? null;
  const midi = await fetchCached(src.midi, { ext: '.mid' });
  const page = src.page.replace(/ /g, '_');
  return {
    midi,
    url: `https://${host}/w/index.php?title=${encodeURIComponent(page)}&oldid=${src.revid}`,
    fileUrl: src.midi,
    // Wiki scores are collaborative works; the page history is the
    // authoritative list of authors.
    author: `${/wikisource/.test(host) ? 'Wikisource' : 'Wikipedia'} contributors (${host}, "${src.page}")`,
    license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    ly,
  };
}

export async function loadSource(src: SourceRef): Promise<LoadedSource> {
  switch (src.type) {
    case 'commons':
      return commonsSource(src);
    case 'score':
      return scoreSource(src);
  }
}

/** LilyPond duration ("4", "8.", "2*3", "4*1/2") in quarter-note beats, or null. */
export function lyDuration(s: string): number | null {
  const m = /^(\d+)(\.*)(?:\*(\d+)(?:\/(\d+))?)?$/.exec(s.trim());
  if (!m) return null;
  let v = 4 / Number(m[1]);
  let add = v;
  for (let i = 0; i < (m[2] ?? '').length; i++) {
    add /= 2;
    v += add;
  }
  if (m[3]) v *= Number(m[3]) / Number(m[4] ?? 1);
  return v;
}

/** Pickup according to the LilyPond source (\partial), otherwise null. */
export function lyPartial(ly: string | null): number | null {
  const m = ly ? /\\partial\s+([\d.*/]+)/.exec(ly) : null;
  return m?.[1] ? lyDuration(m[1]) : null;
}

/** Whether a score states a tempo (LilyPond \tempo, or an ABC "Q:" field in <score lang="ABC">). */
export const lyHasTempo = (ly: string): boolean => /\\tempo|(^|\s)Q:/.test(ly);
