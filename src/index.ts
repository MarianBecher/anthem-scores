/**
 * Types for the note data shipped in `anthem-scores/anthems/*.json`.
 *
 * Every anthem file describes the opening phrase of one national anthem
 * (roughly 8 to 20 seconds), converted from a freely licensed score. All
 * times are measured in beats, and **a beat is always a quarter note**,
 * regardless of the notated time signature. Pitches are MIDI note numbers
 * (60 = middle C).
 *
 * This module contains types only; it has no runtime code. Load the JSON
 * files with your bundler, `fetch`, or `fs` (see `anthem-scores/node`).
 *
 * @packageDocumentation
 */

/**
 * One note of a single-voice line: `[beat, midi, lengthBeats]`.
 *
 * - `beat`: onset in quarter-note beats from the first melody note (beat 0,
 *   so a pickup is included). Multiples of 1/4, or of 1/3 for triplets
 *   (rounded to 4 decimals).
 * - `midi`: MIDI note number (integer, 60 = middle C).
 * - `lengthBeats`: duration in beats (> 0).
 */
export type Note = [beat: number, midi: number, lengthBeats: number];

/**
 * A chord of inner voices: `[beat, [midi, ...], lengthBeats]`, with one or
 * two pitches sorted from low to high, all lying between bass and melody.
 */
export type InnerChord = [beat: number, midi: number[], lengthBeats: number];

/** Key of the anthem, determined over the whole source (not only the excerpt). */
export interface Key {
  /** Pitch class of the tonic: 0 = C, 1 = C#/Db, ..., 11 = B. */
  tonic: number;
  /** `major` or `minor`. */
  mode: 'major' | 'minor';
}

/** Content of one `anthems/<CC>.json` file. */
export interface Anthem {
  /** ISO 3166-1 alpha-2 code of the country the file was built for, e.g. `"DE"`. */
  code: string;
  /** Title of the anthem, usually in its original language and script. */
  title: string;
  /** Composer of the melody, `traditional` for folk tunes, possibly with a short remark in parentheses. */
  composer: string;
  /** URL of the exact source: a Commons file page or a pinned wiki revision (`oldid`). */
  source: string;
  /** Author(s) of the score the data was converted from, as the source credits them. */
  author: string;
  /** License of that score, e.g. `CC BY-SA 4.0`, `CC0`, `Public domain`. The data keeps this license. */
  license: string;
  /** Tempo in quarter notes per minute, as given by the source (rounded). */
  bpm: number;
  /**
   * `true` if `bpm` is not stated by the source but a default (a score
   * without a tempo mark renders at 100, a MIDI file without a tempo event
   * plays at 120). Players may then choose their own tempo.
   */
  tempoGuessed: boolean;
  /** Bar length in quarter-note beats: numerator * 4 / denominator (3/4 -> 3, 6/8 -> 3, 2/2 -> 4). */
  beatsPerBar: number;
  /** Length of the pickup (anacrusis) in beats; 0 if the melody starts on a downbeat. Always < `beatsPerBar`. */
  pickupBeats: number;
  /** Key of the anthem. */
  key: Key;
  /** Length of the excerpt in beats. The excerpt always ends on a bar line: `(lengthBeats - pickupBeats) / beatsPerBar` is an integer. */
  lengthBeats: number;
  /**
   * The melody: monophonic, sorted, non-overlapping, starting at beat 0,
   * shifted by whole octaves into roughly MIDI 60-84. The last note is held
   * until `lengthBeats`.
   */
  melody: Note[];
  /** The bass line: monophonic and sorted, roughly MIDI 26-62. May be empty (melody-only scores). */
  bass: Note[];
  /** Inner voices, up to two pitches per quarter note, equal consecutive chords merged. May be empty. */
  inner: InnerChord[];
}

/** One entry of `anthems/index.json`. */
export interface AnthemIndexEntry {
  /** Title of the anthem of this country. */
  title: string;
  /**
   * File name inside `anthems/`, e.g. `"GB.json"`. Several countries can
   * point to the same file when they share a melody (e.g. `LI` -> `GB.json`).
   */
  file: string;
}

/** Content of `anthems/index.json`: ISO 3166-1 alpha-2 code -> entry, sorted by code. */
export type AnthemIndex = Record<string, AnthemIndexEntry>;
