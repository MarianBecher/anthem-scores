// Shape of sources.json: one curated entry per country code.
import type { KeyGuess } from './music.ts';
import type { SourceRef } from './sources.ts';

export interface VoiceSelect {
  /** Track index in the MIDI file. */
  track: number;
  /** Channel inside the track (default: any). */
  ch?: number;
}

export interface MelodySelect extends VoiceSelect {
  /** Grace-note filter of `monophonic` (default 0.4; 0 = off, for two voices in one track). */
  graceRatio?: number;
  /** Hold a sustained upper voice instead of jumping to the lower voice (two voices in one track). */
  holdTop?: boolean;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface AnthemConfig {
  title: string;
  /** Composer of the melody; `traditional` for folk tunes. */
  composer?: string;
  /** Year of death of the composer, `null` for traditional tunes. Decides the copyright question. */
  composerDied?: number | null;
  src?: SourceRef;
  /** Deliberately left out (reason shown in the report). */
  skip?: string;
  /** No usable free source (reason shown in the report). */
  missing?: string;
  /** Shares the melody of another country: the index entry points to that country's file. */
  sameAs?: string;
  /** Melody voice (default: automatic choice). */
  melody?: MelodySelect;
  /** Bass voice (default: automatic choice); `null` = no bass. */
  bass?: VoiceSelect | null;
  /** `false` = no inner voices. */
  inner?: false;
  /** Tracks that must not contribute inner voices. */
  innerExclude?: number[];
  /** Skip an instrumental introduction in the melody track (beats). */
  skipBeats?: number;
  /** Override of the pickup length in beats. */
  pickupBeats?: number;
  /** Override of the bar length in beats (the file has no or a wrong time signature). */
  beatsPerBar?: number;
  /** Manual cut: length of the excerpt in beats. */
  lengthBeats?: number;
  /** With `lengthBeats`: drop the pickup of the next phrase before the cut. */
  dropPickupAtEnd?: boolean;
  /** With `lengthBeats`: all melody notes from this beat on are dropped. */
  cutNotesFrom?: number;
  /** Octave shift of the melody (instead of the automatic placement). */
  octave?: number;
  /** Tempo override, with `bpmReason`. */
  bpm?: number;
  bpmReason?: string;
  /** Key override. */
  key?: KeyGuess;
  /** Quantization grid: 4 = 1/16, 3 = 1/12, 'mixed' = nearest of both (default: automatic). */
  grid?: 3 | 4 | 'mixed';
  /** Remark shown in the report. */
  note?: string;
  confidence?: Confidence;
}

export type Sources = Record<string, AnthemConfig>;
