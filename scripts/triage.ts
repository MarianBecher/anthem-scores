// Curation tool: shows all candidates from cache/candidates.json for one or
// more countries, with license, track structure and the start of every
// voice - the basis for choosing a source in sources.json.
//
//   node scripts/triage.ts DE FR
//   node scripts/triage.ts DE --scores     only LilyPond scores
import { fetchCached } from './lib/cache.ts';
import { readCandidates } from './lib/candidates.ts';
import { parseMidi } from './lib/midi.ts';
import { noteName } from './lib/music.ts';
import { loadSource } from './lib/sources.ts';

const cands = readCandidates();
const onlyScores = process.argv.includes('--scores');
const codes = process.argv
  .slice(2)
  .filter((a) => !a.startsWith('--'))
  .map((a) => a.toUpperCase());

function summary(buf: Buffer, n = 14): string {
  const m = parseMidi(buf);
  const lines: string[] = [];
  const t0 = m.tempos[0];
  const ts = m.timeSigs[0];
  const ks = m.keySigs[0];
  lines.push(
    `      tempo ${t0 ? Math.round(60e6 / t0.usPerQuarter) : '-'} ts ${ts ? `${ts.num}/${ts.den}` : '-'} key ${ks ? `${ks.sf}${ks.minor ? 'm' : ''}` : '-'} div ${m.division}`,
  );
  m.tracks.forEach((t, i) => {
    for (const ch of [...new Set(t.notes.map((x) => x.ch))].filter((c) => c !== 9)) {
      const notes = t.notes.filter((x) => x.ch === ch);
      const ps = notes.map((x) => x.pitch);
      let poly = 0;
      for (let k = 1; k < notes.length; k++) if (notes[k]!.tick < notes[k - 1]!.tick + notes[k - 1]!.dur - 2) poly++;
      lines.push(
        `      #${i}:${ch} "${t.name}" n=${notes.length} ${noteName(Math.min(...ps))}-${noteName(Math.max(...ps))} poly=${poly} @${(notes[0]!.tick / m.division).toFixed(2)}: ` +
          notes
            .slice(0, n)
            .map((x) => `${noteName(x.pitch)}/${+(x.dur / m.division).toFixed(2)}`)
            .join(' '),
      );
    }
  });
  return lines.join('\n');
}

for (const code of codes) {
  const e = cands[code];
  if (!e) {
    console.log(`=== ${code}: not in cache/candidates.json (run npm run discover -- ${code})`);
    continue;
  }
  console.log(`=== ${code} ${e.name}: ${e.anthems.map((a) => `${a.label} [${a.composers.map((c) => `${c.name} d. ${c.died?.slice(0, 4) ?? '?'}`).join(', ')}]`).join(' / ')}`);
  // The Commons full-text search is very fuzzy -> only files whose name
  // contains a word of the anthem title or the country name.
  const words = [e.name, ...e.anthems.map((a) => a.label ?? '')]
    .join(' ')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 4 && !['national', 'anthem', 'republic', 'state'].includes(w));
  const seen = new Set<string>();
  for (const c of e.candidates) {
    const key = c.kind === 'score' ? c.midi : c.file;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (c.kind === 'score') {
        console.log(`  [score] ${c.lang} "${c.page}" rev ${c.revid} midi=${c.midi}`);
        console.log(`      ly: ${c.lySnippet}`);
        console.log(summary(await fetchCached(c.midi, { ext: '.mid' })));
      } else {
        if (onlyScores) continue;
        if (!c.via && !words.some((w) => c.file.toLowerCase().includes(w))) continue;
        const s = await loadSource({ type: 'commons', file: c.file });
        console.log(`  [commons] ${c.file} | ${s.license} | ${s.author.slice(0, 60)}${c.via ? ' | via ' + c.via : ''}`);
        console.log(summary(s.midi));
      }
    } catch (err) {
      console.log(`  ! ${key}: ${(err as Error).message}`);
    }
  }
}
