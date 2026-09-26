// Curation tool: free Commons search for MIDI and MusicXML files.
//
//   node scripts/search.ts "Hino Nacional" "Himno Argentino"
import { commonsSearch } from './lib/candidates.ts';

for (const q of process.argv.slice(2)) {
  for (const mime of ['audio/midi', 'audio/mid', 'application/vnd.recordare.musicxml']) {
    const hits = await commonsSearch(q, mime, 30);
    if (hits.length) console.log(`${q} [${mime}]: ${hits.join(' || ')}`);
  }
}
