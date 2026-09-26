// Shape of cache/candidates.json (written by scripts/discover.ts, read by
// the triage tools) and of the frozen Wikidata snapshot in data/.
import { join } from 'node:path';
import { CACHE_DIR, fetchJson, readJson } from './cache.ts';

export const CANDIDATES_FILE = join(CACHE_DIR, 'candidates.json');

export interface ScoreCandidate {
  kind: 'score';
  lang: string;
  page: string;
  revid: number;
  midi: string;
  /** Number of staves/voices in the LilyPond text, if found. */
  staves: number | null;
  lySnippet: string | null;
}

export interface CommonsCandidate {
  kind: 'commons';
  file: string;
  /** Article that embeds the file (`lang:title`), if found that way. */
  via?: string;
}

export type Candidate = ScoreCandidate | CommonsCandidate;

export interface AnthemInfo {
  label: string | undefined;
  enwiki: string | undefined;
  composers: Array<{ name: string; died: string | null }>;
}

export interface CountryCandidates {
  name: string;
  anthems: AnthemInfo[];
  candidates: Candidate[];
}

export type Candidates = Record<string, CountryCandidates>;

export const readCandidates = (): Candidates => readJson<Candidates>('cache', 'candidates.json');

interface Binding {
  value: string;
}

/** One row of the SPARQL result: country -> anthem -> composer -> date of death. */
export interface WikidataRow {
  iso: Binding;
  countryLabel?: Binding;
  anthem: Binding;
  anthemLabel?: Binding;
  composer?: Binding;
  composerLabel?: Binding;
  died?: Binding;
  enwiki?: Binding;
}

export const readWikidata = (): WikidataRow[] =>
  readJson<{ results: { bindings: WikidataRow[] } }>('data', 'wikidata-anthems.json').results.bindings;

/** Full-text search for files of one MIME type on Wikimedia Commons; returns file titles. */
export async function commonsSearch(q: string, mime = 'audio/midi', limit = 20): Promise<string[]> {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&format=json&srnamespace=6&srlimit=${limit}&srsearch=${encodeURIComponent(`${q} filemime:${mime}`)}`;
  const d = await fetchJson<{ query?: { search?: Array<{ title: string }> } }>(url);
  return (d.query?.search ?? []).map((s) => s.title);
}
