// Curation tool: collects candidate score sources for every country. Not
// part of the build - the result (cache/candidates.json) is only a basis for
// curating sources.json by hand. Choosing the right source is deliberately a
// human (or at least verified) decision, because automatic heuristics easily
// pick the wrong anthem, an old version or an accompaniment voice.
//
//   npm run discover                       all countries
//   npm run discover -- DE FR              only these, merged into the existing file
//   npm run discover -- --all-langs PH     search every language version of the article
//
// Sources:
//   1. <score> blocks (LilyPond) in Wikipedia articles about the anthem. The
//      Score extension renders them to MIDI files, which we load directly.
//      The articles are found via Wikidata (country -> anthem -> article).
//   2. MIDI files on Wikimedia Commons (embedded in those articles, or found
//      by full-text search for the title/country).
//
// Why not simply the Commons category "MIDI files of national anthems"? It
// does not exist (any more), and the full-text search is noisy. Most usable
// scores live in the <score> blocks of Wikipedia articles, especially in
// it.wikipedia.
import { existsSync, writeFileSync } from 'node:fs';
import { fetchJson, readJson } from './lib/cache.ts';
import { CANDIDATES_FILE, commonsSearch, readCandidates, readWikidata, type AnthemInfo, type Candidate, type Candidates, type CommonsCandidate, type CountryCandidates, type ScoreCandidate } from './lib/candidates.ts';
import type { Countries } from './lib/countries.ts';

const countries = readJson<Countries>('countries.json');
const wd = readWikidata();
const LANGS = ['de', 'fr', 'es', 'it', 'pt', 'ru'];

interface Page {
  title: string;
  revid: number;
  wikitext: string;
  text: string;
  langlinks: Array<{ lang: string; title: string }>;
  midiFiles: string[];
}

interface QueryResponse {
  query?: {
    pages?: Array<{
      title: string;
      missing?: boolean;
      revisions?: Array<{ revid: number; slots?: { main?: { content?: string } } }>;
      langlinks?: Array<{ lang: string; title: string }>;
      images?: Array<{ title: string }>;
    }>;
  };
}

// First fetch the cheap raw wikitext; the expensive parse (for the URLs of
// the rendered MIDI files) only if the article contains <score> at all.
// The parse API is throttled with 429 quickly otherwise.
async function parsePage(lang: string, title: string): Promise<Page | null> {
  const base = `https://${lang}.wikipedia.org/w/api.php?format=json&formatversion=2&redirects=1`;
  const q = await fetchJson<QueryResponse>(`${base}&action=query&prop=langlinks|revisions&rvprop=content|ids&rvslots=main&lllimit=500&titles=${encodeURIComponent(title)}`);
  const pg = q.query?.pages?.[0];
  if (!pg || pg.missing) return null;
  const rev = pg.revisions?.[0];
  const page: Page = { title: pg.title, revid: rev?.revid ?? 0, wikitext: rev?.slots?.main?.content ?? '', text: '', langlinks: pg.langlinks ?? [], midiFiles: [] };
  if (page.wikitext.includes('<score')) {
    const d = await fetchJson<{ parse?: { text?: string } }>(`${base}&action=parse&prop=text&oldid=${page.revid}`);
    page.text = d.parse?.text ?? '';
  }
  // Embedded files (also through templates) - this finds MIDI files that an
  // article uses but that the Commons search does not return.
  const im = await fetchJson<QueryResponse>(`${base}&action=query&prop=images&imlimit=500&titles=${encodeURIComponent(pg.title)}`);
  page.midiFiles = (im.query?.pages?.[0]?.images ?? []).map((i) => i.title).filter((t) => /\.(midi?|mxl|musicxml|abc)$/i.test(t));
  return page;
}

const filesOf = (lang: string, page: Page): CommonsCandidate[] =>
  page.midiFiles.map((t) => ({ kind: 'commons', file: t.replace(/^[^:]+:/, 'File:'), via: `${lang}:${page.title}` }));

function scoresOf(lang: string, page: Page): ScoreCandidate[] {
  const midis = [...page.text.matchAll(/upload\.wikimedia\.org\/score\/[^"\s]+?\.midi/g)].map((m) => 'https://' + m[0]);
  const srcs = [...page.wikitext.matchAll(/<score([^>]*)>([\s\S]*?)<\/score>/g)].map((m) => m[2] ?? '');
  return [...new Set(midis)].map((midi, i) => {
    const ly = srcs[i];
    return {
      kind: 'score',
      lang,
      page: page.title,
      revid: page.revid,
      midi,
      staves: ly !== undefined ? (ly.match(/\\new\s+(Staff|PianoStaff|GrandStaff|Voice)/g) ?? []).length : null,
      lySnippet: ly !== undefined ? ly.replace(/\s+/g, ' ').slice(0, 160) : null,
    };
  });
}

async function discover(code: string, allLangs: boolean): Promise<CountryCandidates> {
  const anthems = new Map<string, AnthemInfo>();
  for (const r of wd.filter((row) => row.iso.value === code)) {
    const a = anthems.get(r.anthem.value) ?? { label: r.anthemLabel?.value, enwiki: r.enwiki?.value, composers: [] };
    if (r.composerLabel) a.composers.push({ name: r.composerLabel.value, died: r.died?.value.slice(0, 10) ?? null });
    anthems.set(r.anthem.value, a);
  }
  // Wikidata knows no current anthem for PT (data gap) -> by hand.
  if (code === 'PT') anthems.set('pt', { label: 'A Portuguesa', enwiki: 'https://en.wikipedia.org/wiki/A_Portuguesa', composers: [] });
  const name = countries[code]?.name ?? code;
  const entry: CountryCandidates = { name, anthems: [...anthems.values()], candidates: [] };
  const push = (...c: Candidate[]): number => entry.candidates.push(...c);
  for (const a of entry.anthems) {
    const enTitle = a.enwiki?.split('/wiki/')[1];
    if (enTitle) {
      const en = await parsePage('en', decodeURIComponent(enTitle));
      if (en) {
        push(...scoresOf('en', en), ...filesOf('en', en));
        for (const ll of en.langlinks) {
          if (!allLangs && !LANGS.includes(ll.lang)) continue;
          const p = await parsePage(ll.lang, ll.title);
          if (p) push(...scoresOf(ll.lang, p), ...filesOf(ll.lang, p));
        }
      }
    }
    if (a.label) for (const t of await commonsSearch(a.label)) push({ kind: 'commons', file: t });
  }
  for (const t of await commonsSearch(name + ' anthem')) if (!entry.candidates.some((c) => c.kind === 'commons' && c.file === t)) push({ kind: 'commons', file: t });
  return entry;
}

{
  const args = process.argv.slice(2);
  const allLangs = args.includes('--all-langs');
  const only = args.filter((a) => !a.startsWith('--')).map((a) => a.toUpperCase());
  const out: Candidates = only.length && existsSync(CANDIDATES_FILE) ? readCandidates() : {};
  // Two countries in parallel - fast enough without overrunning the API.
  const queue = only.length ? only : Object.keys(countries);
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      for (let code = queue.shift(); code; code = queue.shift()) {
        const entry = await discover(code, allLangs);
        out[code] = entry;
        console.log(code, entry.candidates.length);
      }
    }),
  );
  writeFileSync(CANDIDATES_FILE, JSON.stringify(out, null, 2));
}
