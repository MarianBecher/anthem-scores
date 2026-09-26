// Curation tool: prints the score candidates of countries as ready-made
// sources.json snippets (including scoreIndex = position on the page).
//
//   node scripts/cand.ts GB
import { readCandidates } from './lib/candidates.ts';
import type { ScoreSource } from './lib/sources.ts';

const cands = readCandidates();
for (const code of process.argv.slice(2).map((a) => a.toUpperCase())) {
  const perPage = new Map<string, number>();
  for (const c of cands[code]?.candidates ?? []) {
    if (c.kind !== 'score') continue;
    const k = c.lang + ':' + c.page;
    const i = perPage.get(k) ?? 0;
    perPage.set(k, i + 1);
    const src: ScoreSource = { type: 'score', lang: c.lang, page: c.page, revid: c.revid, scoreIndex: i, midi: c.midi };
    console.log(code, c.midi.split('/').pop(), JSON.stringify(src));
  }
}
