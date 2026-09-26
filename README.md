# anthem-scores

Compact note data for the **opening phrases of national anthems**: melody,
bass and inner voices of roughly the first 8 to 20 seconds, one small JSON
file per country, converted from freely licensed scores.

It was made for [geo-battler](https://github.com/MarianBecher/geo-battler),
where the background music modulates into the anthem of the country a round
took place in, played by the sampler
[tiny-orchestra](https://github.com/MarianBecher/tiny-orchestra). The data is
useful for anything else that wants to play or show a recognizable anthem
opening without shipping audio.

**The guiding principle: the melodies must be right.** Nothing is written
down from memory. Everything is converted from real, freely licensed scores
(MIDI rendered from LilyPond scores on Wikipedia and Wikisource, or MIDI files
on Wikimedia Commons), and every file carries its source, author and license.

This repository contains two things:

1. the npm package `anthem-scores`: the note data in `anthems/`, its types and
   `CREDITS.md`, nothing else;
2. the curation pipeline (repository only): TypeScript scripts that discover
   candidate scores, convert them, check them and generate `REPORT.md` and
   `CREDITS.md`.

`REPORT.md` shows the status of every country the game can land in.
Currently 43 countries have an anthem (36 melodies; some countries share one).

## Using the package

```sh
npm install anthem-scores
```

The package has no runtime dependencies. It contains

| Import | What |
|---|---|
| `anthem-scores` | TypeScript types `Anthem`, `AnthemIndex`, `AnthemIndexEntry`, `Note`, `InnerChord`, `Key` (no runtime code) |
| `anthem-scores/node` | `anthemsDir(): string`, the absolute path of the installed `anthems/` directory (Node only) |
| `anthem-scores/anthems/index.json` | country code -> `{ title, file }`, also available as `anthem-scores/index.json` |
| `anthem-scores/anthems/<file>` | one anthem, e.g. `anthem-scores/anthems/DE.json` |

With a bundler or JSON import attributes:

```ts
import type { Anthem, AnthemIndex } from 'anthem-scores';
import indexJson from 'anthem-scores/anthems/index.json' with { type: 'json' };
import deJson from 'anthem-scores/anthems/DE.json' with { type: 'json' };

const index = indexJson as AnthemIndex;
// TypeScript infers number[][] for the note arrays, so go through unknown.
const de = deJson as unknown as Anthem;
```

In Node, without a bundler:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Anthem, AnthemIndex } from 'anthem-scores';
import { anthemsDir } from 'anthem-scores/node';

const index = JSON.parse(readFileSync(join(anthemsDir(), 'index.json'), 'utf8')) as AnthemIndex;
const entry = index['LI']; // Liechtenstein shares the melody of GB
const anthem = entry && (JSON.parse(readFileSync(join(anthemsDir(), entry.file), 'utf8')) as Anthem);
```

In a browser, copy `anthems/` to your static files and `fetch` them (the
`export` script below does that for a game client).

### Format

`anthems/<CC>.json` (shortened):

```json
{ "code": "DE", "title": "Das Lied der Deutschen", "composer": "Joseph Haydn",
  "source": "https://en.wikipedia.org/w/index.php?title=Deutschlandlied&oldid=1375806761",
  "author": "Wikipedia contributors (en.wikipedia.org, \"Deutschlandlied\")",
  "license": "CC BY-SA 4.0",
  "bpm": 100, "tempoGuessed": true, "beatsPerBar": 4, "pickupBeats": 2,
  "key": { "tonic": 3, "mode": "major" },
  "lengthBeats": 18,
  "melody": [[0, 63, 1.5], [1.5, 65, 0.5], [2, 67, 1]],
  "bass": [],
  "inner": [] }
```

| Field | Meaning |
|---|---|
| `code` | ISO 3166-1 alpha-2 code the file was built for |
| `title` | title of the anthem, usually in its original language and script |
| `composer` | composer of the melody; `traditional` for folk tunes |
| `source` | exact source: Commons file page or pinned wiki revision (`oldid`) |
| `author` | author(s) of the score, as the source credits them |
| `license` | license of that score (`Public domain`, `CC0` or `CC BY-SA x.y`); the data keeps it |
| `bpm` | tempo in quarter notes per minute, as given by the source |
| `tempoGuessed` | `true` if `bpm` is a default and not stated by the source (a score without a tempo mark renders at 100, a MIDI file without a tempo event plays at 120); choose your own tempo then |
| `beatsPerBar` | bar length in quarter-note beats: numerator * 4 / denominator (3/4 -> 3, 6/8 -> 3, 2/2 -> 4) |
| `pickupBeats` | length of the pickup (anacrusis) in beats, 0 if the melody starts on a downbeat |
| `key` | `tonic` as pitch class (0 = C ... 11 = B) and `mode` (`major` / `minor`) |
| `lengthBeats` | length of the excerpt; it always ends on a bar line |
| `melody` | notes `[beat, midi, lengthBeats]`, monophonic, starting at beat 0, in about MIDI 60-84 |
| `bass` | notes `[beat, midi, lengthBeats]`, monophonic, about MIDI 26-62; may be empty |
| `inner` | chords `[beat, [midi, ...], lengthBeats]` with one or two pitches between bass and melody; may be empty |

**A beat is always a quarter note**, regardless of the notated time
signature. That is unambiguous and spares the player any time signature
logic. Beat 0 is the onset of the first melody note, so a pickup is included.
Onsets are multiples of 1/4 beat, or of 1/3 beat for triplets (rounded to 4
decimals). `anthems/index.json` maps country codes to `{ title, file }`;
several codes can point to the same file (LI, GG, JE, GI -> `GB.json`,
PM -> `FR.json`, TZ, ZM -> `ZA.json`).

### License of the data

The MIT license of this repository covers the code. **The note data keeps the
license of its source, file by file**: the melodies are in the public domain,
but some of the scores they were extracted from are CC BY-SA. If you use the
data, credit the sources as listed in `CREDITS.md` (and share alike where the
source is CC BY-SA). Every JSON file carries `source`, `author` and `license`.

## Pipeline

Node 22.18 or newer runs the TypeScript scripts directly (type stripping);
`npm install` only fetches the dev tools.

```sh
npm run countries            # countries.json from the game's region boxes
npm run build                # sources.json -> anthems/*.json, REPORT.md, CREDITS.md
npm run build -- DE FR       # only these countries, with a verbose log
npm test                     # MIDI parser, music helpers, known melodies, data sanity
npm run preview              # preview/<CC>.wav + preview/index.html for listening
npm run export -- <target>   # anthems/ -> <target>/audio/anthems
npm run lint && npm run typecheck
```

Curation tools (not part of the build):

```sh
npm run discover [-- --all-langs CODES]   # collect candidates -> cache/candidates.json
node scripts/triage.ts DE FR              # candidates with license, tracks, start of every voice
node scripts/cand.ts DE                   # score candidates as sources.json snippets
node scripts/search.ts "Himno Nacional"   # free Commons search for MIDI/MusicXML files
npm run inspect -- <url|file>             # structure of a MIDI file
```

Downloads land in `cache/` (gitignored). A second build runs entirely from the
cache, so it is reproducible and does not strain the Wikimedia servers;
`OFFLINE=1` makes a missing cache entry an error instead of a download. The
MIDI parser is our own (`scripts/lib/midi.ts`), because we only need a small
part of the format.

### Which countries?

`countries.json` is computed from the game's Street View boxes (a copy of
`REGIONS` from geo-battler's `server/locations.js` in `scripts/regions.ts`).
The boxes are rough rectangles: the box "Germany" also hits NL, BE, LU, FR,
CH, AT, CZ, PL and DK, and Google's reverse geocoding then returns their
country code. So every box is rasterized (0.1 degrees) and checked by
point-in-polygon against Natural Earth 1:10m for how much of its land area
each country makes up. A country is included if it

- makes up at least 0.5 % of the land area of a box, or
- lies entirely inside a box (microstates such as VA, SM, MC, LI, AD).

Each country lists its regions and its area share (`share`). Box weight times
share roughly says how often the game lands there; sources were curated in
that order.

### Sources

Curation happens in `sources.json`, one entry per country:

```jsonc
"DE": {
  "title": "Das Lied der Deutschen", "composer": "Joseph Haydn", "composerDied": 1809,
  "src": { "type": "score", "lang": "en", "page": "Deutschlandlied", "revid": 1375806761,
           "scoreIndex": 0, "midi": "https://upload.wikimedia.org/score/.../04ljubf8.midi" },
  "melody": { "track": 1 },      // optional, otherwise chosen automatically
  "bass": { "track": 4 },        // optional; null = no bass
  "confidence": "high"
}
```

There are three kinds of sources:

1. **LilyPond scores in Wikipedia articles** (`type: "score"`). The Score
   extension renders every `<score>` block to a MIDI file. We load it through
   its content-addressed (hence stable) URL and also read the LilyPond text of
   the pinned revision (`revid`) to know `\partial` (pickup) and `\tempo`.
   License: CC BY-SA 4.0, authors according to the page history.
2. **MIDI files on Wikimedia Commons** (`type: "commons"`). Author and license
   come from the `extmetadata` of the MediaWiki API (`author` in `src`
   overrides the author text).
3. **LilyPond transcriptions on Wikisource** (`type: "score"` with
   `"site": "en.wikisource.org"`). Wikisource projects transcribe public
   domain songbooks page by page (namespace `Page:`), e.g. "The Songs of
   Ensign Stål" (FI) or "Face to Face with the Mexicans" (MX). Same Score
   extension, same license (CC BY-SA 4.0) as Wikipedia.

Why not simply the Commons category "MIDI files of national anthems"? It does
not exist (any more), and the full-text search is noisy. Most usable scores
live in the `<score>` blocks of Wikipedia articles, especially in
it.wikipedia. `npm run discover` collects both: articles via Wikidata
(country -> anthem -> article in several languages) and Commons search hits.

**Copyright:** every anthem whose *composition* is still protected is left
out, i.e. the composer died less than 70 years ago (reference year 2026:
died 1956 or later) or the year of death is not documented. Free scores alone
are not enough when the melody itself is protected. The dates come from
Wikidata: `data/wikidata-anthems.json` is a frozen snapshot (country ->
anthem -> composer -> date of death, SPARQL query of 2026-09-25), which keeps
the copyright decisions traceable. Countries that share a melody point to the
same file via `"sameAs"`.

### Conversion

Per anthem (`scripts/lib/build.ts`, helpers in `scripts/lib/music.ts`):

1. **Split voices.** A voice is (track, channel); channel 10 (percussion) is
   dropped.
2. **Choose the melody.** A track whose name sounds like melody or voice
   wins, otherwise the voice that is highest on average among those with a
   substantial number of notes. For multi-voice settings the track is set
   explicitly in `sources.json`, because "highest voice" goes wrong with
   descants or accompaniment figures.
3. **Make it monophonic.** Per onset the highest note wins (melody), or the
   lowest (bass). Overlaps are cut at the next onset, and grace notes lose
   against a simultaneous long note. If upper and lower voice share a track
   (two-voice score), `melody.graceRatio: 0` switches the grace-note filter
   off and `melody.holdTop: true` holds a sustained upper voice instead of
   jumping to onsets of the lower voice.
4. **Quantize** to 1/16 (0.25 beat). If several onsets lie clearly on the
   triplet grid, every note snaps to the nearer of 1/16 and 1/12 (triplets
   become multiples of 1/3 beat, rounded to 4 decimals).
5. **Beat 0** is the onset of the first melody note, so the pickup is
   included. `pickupBeats` is its length: from `\partial` for LilyPond
   scores, otherwise from the position of the first note in the bar grid from
   tick 0 (sequencers fill the pickup bar with a rest), or from a short first
   bar with its own time signature. A rhythm heuristic cross-checks it and
   flags contradictions in the report.
6. **Key:** accidentals from the key signature event. Major or minor is
   decided (unless the file sets the minor flag) by a Krumhansl-Kessler
   comparison over melody and bass. Without an event, pure Krumhansl.
7. **Cut:** candidates are all bar lines at which the excerpt lasts 8-20 s
   (preferably 10-16 s). Scored is whether the melody breathes out there:
   long note or rest, tonic or fifth, onset on a strong beat. If the pickup
   of the next phrase already lies before the bar line, it is cut off. The
   final note is always held until the bar line. Where the heuristic is
   wrong, `lengthBeats` in `sources.json` sets the cut.
8. **Octave:** the melody is shifted by whole octaves into MIDI 60-84, bass
   and inner voices by the same amount (the bass one more octave if needed to
   stay between 26 and 62).
9. **Inner voices** (`inner`): per quarter note up to two of the
   longest-sounding notes between bass and melody. Equal consecutive chords
   are merged.

`bpm` is the tempo of the source. If a LilyPond score has no `\tempo`, the
Score extension uses 100; that is not a statement of the source, so the file
says `tempoGuessed: true` and the report marks it. Exceptions where the
source notates differently are a `note` in `sources.json` (e.g. RU: halved
note values).

### Checks

Nobody listens during the build, so everything is checked three times:

- **Build checks** (`scripts/lib/checks.ts`): accepted license, melody and
  bass monophonic, range at most about two octaves, no dominating octave
  leaps, duration 8-20 s, final note at least 1 beat and ending at the cut,
  final note fits the key (tonic/fifth, otherwise a flag). Errors prevent
  shipping, flags end up in the report.
- **Spot checks** (`test/known.test.ts`): openings we know for certain (DE,
  FR, US, GB, RU, JP, CA, ZA, IN) as a transposition-independent pitch
  sequence plus rhythm/time signature where unambiguous. If one fails, almost
  always the wrong track or a variant was chosen (as happened with GB: the
  it.wikipedia scores show historical versions). Fix the source, not the
  test.
- **Ears:** `npm run preview` renders every anthem with a simple additive
  synth; `preview/index.html` lists them with players.

`test/sanity.test.ts` runs the build checks and format checks again over every
file in `anthems/` and verifies that `index.json` matches the files and
`sources.json`.

## Contributing an anthem

Countries still missing are listed in `REPORT.md` with status **missing**.

1. **Check the copyright of the composition.** Only anthems whose composer
   died at least 70 years ago (2026: in 1955 or earlier), or traditional
   tunes, qualify. An arrangement counts too: if the official version is a
   protected arrangement, leave the country out.
2. **Find a freely licensed, machine-readable score.** Accepted are scores in
   the **public domain**, under **CC0** or under **CC BY-SA**, from the three
   source kinds above. Recordings, PDFs, and files without a clear free
   license or of unclear origin are not accepted, even if the melody itself
   is old. Run `npm run discover -- <CC>` and `node scripts/triage.ts <CC>`
   to see the candidates with their licenses and voices.
3. **Add an entry to `sources.json`** with `title`, `composer`,
   `composerDied`, `src` (pin the `revid` for wiki scores) and a
   `confidence`. Choose tracks with `node scripts/triage.ts` or
   `npm run inspect`.
4. **Build and listen:** `npm run build -- <CC>` shows the log (chosen
   tracks, tempo, pickup, key, cut, the notes), `npm run preview` renders
   the result. Compare it with a second, independent source (another score,
   a recording); if you are sure about the opening, add it to
   `test/known.test.ts`.
5. **Run `npm run build`, `npm test` and `npm run lint`**, then commit
   `sources.json` together with the regenerated `anthems/`, `REPORT.md` and
   `CREDITS.md`.

Further options in `sources.json` (see `scripts/lib/config.ts`):
`melody`/`bass` (`{ track, ch? }`, `bass: null` = none), `inner: false`,
`innerExclude: [track]`, `skipBeats` (skip an introduction in the melody
track), `pickupBeats`, `beatsPerBar`, `lengthBeats` + `dropPickupAtEnd` or
`cutNotesFrom` (manual cut), `octave`, `bpm` + `bpmReason`, `key`, `grid`
(4 = 1/16, 3 = 1/12, `"mixed"`), `sameAs`, `skip` / `missing` (reason shown in
the report), `note` (shown in the report), `confidence`.

## License

Code: [MIT](LICENSE), Copyright (c) 2026 Marian Becher. Note data: the license
of each file's source, see `CREDITS.md`.
