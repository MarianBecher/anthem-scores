# anthem-scores

[![npm](https://img.shields.io/npm/v/anthem-scores)](https://www.npmjs.com/package/anthem-scores)
[![CI](https://github.com/MarianBecher/anthem-scores/actions/workflows/ci.yml/badge.svg)](https://github.com/MarianBecher/anthem-scores/actions/workflows/ci.yml)

The opening phrases of national anthems as note data: melody, bass and inner
voices of the first 8 to 20 seconds, one small JSON file per country.

I made this for a geography game whose background music modulates into the
anthem of the country a round took place in. The data is handy for anything
that wants to play or show a recognizable anthem opening without shipping
audio.

One rule above all: the melodies have to be right. Nothing here is written
down from memory. Every file is converted from a real, freely licensed score
(LilyPond scores on Wikipedia and Wikisource, MIDI files on Wikimedia
Commons), and every file names its source, author and license. Anthems whose
composition is still under copyright are left out. At the moment there are 43
countries, 36 melodies (some countries share one); [REPORT.md](REPORT.md)
shows where every country stands.

The repository holds two things: the npm package `anthem-scores`, which is
the data in `anthems/` plus TypeScript types and has no dependencies, and the
pipeline that discovers, converts and checks the scores.

## Install

```sh
npm install anthem-scores
```

```ts
import type { Anthem, AnthemIndex } from 'anthem-scores';
import index from 'anthem-scores/anthems/index.json' with { type: 'json' };
import de from 'anthem-scores/anthems/DE.json' with { type: 'json' };

const anthem = de as unknown as Anthem;   // TypeScript reads the note tuples as number[][]
(index as AnthemIndex).LI?.file;          // "GB.json"
```

`index.json` maps country codes to `{ title, file }`; several codes can point
to the same file (Liechtenstein plays the British melody). In Node,
`anthemsDir()` from `anthem-scores/node` gives the absolute path of the
installed data, for reading files or copying them into a web folder. The
package itself has no runtime code, so any bundler or `fetch` works too.

## Format

```json
{ "code": "FI", "title": "Maamme / Vårt land", "composer": "Fredrik Pacius",
  "source": "https://en.wikisource.org/w/index.php?title=Page%3AThe_songs_of_Ensign_St%C3%A5l.djvu%2F44&oldid=16314830",
  "author": "Wikisource contributors (en.wikisource.org, \"Page:The songs of Ensign Stål.djvu/44\")",
  "license": "CC BY-SA 4.0",
  "bpm": 90, "tempoGuessed": false, "beatsPerBar": 3, "pickupBeats": 1.5,
  "key": { "tonic": 10, "mode": "major" },
  "lengthBeats": 19.5,
  "melody": [[0, 65, 0.5], [0.5, 62, 0.5], [1, 63, 0.5]],
  "bass": [[0, 53, 0.5], [0.5, 50, 0.5]],
  "inner": [[3, [65, 69], 1], [4, [60, 62], 1]] }
```

A beat is always a quarter note, whatever the notated time signature; that
spares the player any time-signature logic. A beat lasts `60 / bpm` seconds.
Beat 0 is the first melody note, so a pickup is included and `pickupBeats`
says how long it is. `melody` and `bass` are monophonic `[beat, midi, length]`
notes, `inner` holds chords `[beat, [midi, ...], length]` of one or two
pitches between them, and `lengthBeats` always ends on a bar line. The melody
is shifted into roughly MIDI 60-84, the bass sits below it; the last melody
note is held until the cut. `key.tonic` is a pitch class (0 = C). `bpm` is
the tempo of the source; `tempoGuessed` means the source did not state one
and the value is a default you should feel free to replace. Every field is
documented in the [types](src/index.ts).

## Building the data

```sh
npm run build                # sources.json -> anthems/*.json, REPORT.md, CREDITS.md
npm run build -- DE FR       # only these countries, with a verbose log
npm run preview              # renders every anthem as WAV for listening
npm test
```

Needs Node 22.18 or newer (the scripts run as TypeScript directly).
Downloads are cached in `cache/`, so a second build runs offline. `make help`
lists the shortcuts.

Missing countries are listed in [REPORT.md](REPORT.md). If you know a freely
licensed score for one of them, [CONTRIBUTING.md](CONTRIBUTING.md) explains
what counts as a source, how a score is converted and checked, and how to add
an entry to `sources.json`.

## License

The code is [MIT](LICENSE). The note data keeps the license of its source,
file by file: the melodies are public domain, but some of the scores they
were extracted from are CC BY-SA. If you use the data, credit the sources
listed in [CREDITS.md](CREDITS.md), and share alike where the source is
CC BY-SA.
