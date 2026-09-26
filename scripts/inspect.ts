// Curation tool: shows the structure of a MIDI file (URL or path), to find
// the right melody track while curating.
//
//   npm run inspect -- <url|file> [numberOfNotes]
import { readFileSync } from 'node:fs';
import { parseMidi } from './lib/midi.ts';
import { fetchCached } from './lib/cache.ts';
import { noteName } from './lib/music.ts';

const [src, count] = process.argv.slice(2);
if (!src) {
  console.error('Usage: npm run inspect -- <url|file> [numberOfNotes]');
  process.exit(1);
}
const show = Number(count ?? 24);
const buf = /^https?:/.test(src) ? await fetchCached(src, { ext: '.mid' }) : readFileSync(src);
const m = parseMidi(buf);
console.log(`format ${m.format}, division ${m.division}`);
console.log('tempos', m.tempos.slice(0, 4).map((t) => `${t.tick}:${Math.round(60e6 / t.usPerQuarter)}`).join(' '));
console.log('timesigs', m.timeSigs.slice(0, 4).map((t) => `${t.tick}:${t.num}/${t.den}`).join(' '));
console.log('keysigs', m.keySigs.slice(0, 3).map((k) => `${k.tick}:${k.sf}${k.minor ? 'm' : ''}`).join(' '));
m.tracks.forEach((t, i) => {
  if (!t.notes.length) return;
  for (const ch of new Set(t.notes.map((n) => n.ch))) {
    const notes = t.notes.filter((n) => n.ch === ch);
    let poly = 0;
    for (let k = 1; k < notes.length; k++) if (notes[k]!.tick < notes[k - 1]!.tick + notes[k - 1]!.dur - 2) poly++;
    const ps = notes.map((n) => n.pitch);
    console.log(
      `#${i} ch${ch} "${t.name}" prog=${t.programs[0] ?? '-'} n=${notes.length} range=${noteName(Math.min(...ps))}-${noteName(Math.max(...ps))} overlaps=${poly} start=${notes[0]!.tick}`,
    );
    console.log('   ' + notes.slice(0, show).map((n) => `${noteName(n.pitch)}/${+(n.dur / m.division).toFixed(2)}@${+(n.tick / m.division).toFixed(2)}`).join(' '));
  }
});
