// Music helpers: quantization, monophonic lines, key detection, phrase cut.
// Everything works in "beats" = quarter notes, regardless of the notated
// time signature (see README, section "Tempo and beats").

import type { KeySig } from './midi.ts';

export const PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const pitchClass = (p: number): number => ((p % 12) + 12) % 12;
export const pcName = (p: number): string => PC_NAMES[pitchClass(p)] ?? '?';
export const noteName = (p: number): string => pcName(p) + (Math.floor(p / 12) - 1);
const EPS = 1e-6;

/** A note measured in beats. `rawDur` is the length before quantization. */
export interface BeatNote {
  on: number;
  dur: number;
  pitch: number;
  rawDur?: number;
}

/** Quantization grid in beats (0.25 = 1/16), or 'mixed' = nearest of 1/16 and 1/12. */
export type Grid = number | 'mixed';

export type Mode = 'major' | 'minor';
export interface KeyGuess {
  tonic: number;
  mode: Mode;
}

/**
 * Chooses the grid. 1/16 (= 0.25 beat) fits almost everything including
 * dotted rhythms, but triplets land crooked in it. If several onsets sit
 * clearly on the triplet grid (1/12 = 1/3 beat) and clearly off the 1/16
 * grid, every note snaps to the nearer of the two grids (returns 'mixed').
 * A purely triplet melody thus also comes out right, and ordinary
 * sixteenths stay sixteenths.
 */
export function chooseGrid(notes: readonly BeatNote[]): Grid {
  const off = (x: number, g: number): number => Math.abs(x / g - Math.round(x / g)) * g;
  let triplets = 0;
  for (const n of notes) {
    for (const x of [n.on, n.on + n.dur]) if (off(x, 1 / 3) < 0.03 && off(x, 0.25) > 0.06) triplets++;
  }
  return triplets >= 3 ? 'mixed' : 0.25;
}

export function snap(x: number, grid: Grid): number {
  if (grid !== 'mixed') return Math.round(x / grid) * grid;
  const a = Math.round(x * 4) / 4;
  const b = Math.round(x * 3) / 3;
  return Math.abs(a - x) <= Math.abs(b - x) + 0.01 ? a : b;
}

export const minStep = (grid: Grid): number => (grid === 'mixed' ? 1 / 12 : grid);

/** Snaps onsets and ends to the grid (at least one grid step long), keeps the raw length in `rawDur`. */
export function quantize<T extends BeatNote>(notes: readonly T[], grid: Grid): Array<T & { rawDur: number }> {
  return notes
    .map((n) => {
      const on = snap(n.on, grid);
      const end = snap(n.on + n.dur, grid);
      return { ...n, on, dur: Math.max(minStep(grid), end - on), rawDur: n.dur };
    })
    .sort((a, b) => a.on - b.on || b.pitch - a.pitch);
}

export interface MonophonicOptions {
  /** Notes shorter than this share of the longest simultaneous note count as grace notes. */
  graceRatio?: number;
  /** Keep a sustained upper voice instead of jumping to onsets of a lower voice below it. */
  holdTop?: boolean;
}

/**
 * Turns a (possibly chordal) voice into a monophonic line: per onset the
 * highest (pick='top') or lowest (pick='bottom') note wins. Overlaps are
 * cut at the next onset. Grace notes (very short notes together with a
 * long one) lose against the long note, otherwise a high grace note would
 * replace the melody.
 */
export function monophonic<T extends BeatNote>(notes: readonly T[], pick: 'top' | 'bottom' = 'top', { graceRatio = 0.4, holdTop = false }: MonophonicOptions = {}): T[] {
  const groups = new Map<string, T[]>();
  for (const n of notes) {
    const k = n.on.toFixed(4);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(n);
  }
  let line: T[] = [];
  for (const g of groups.values()) {
    const longest = Math.max(...g.map((n) => n.rawDur ?? n.dur));
    const real = g.filter((n) => (n.rawDur ?? n.dur) >= longest * graceRatio);
    const chosen = real.reduce((a, b) => ((pick === 'top' ? b.pitch > a.pitch : b.pitch < a.pitch) ? b : a));
    line.push({ ...chosen, dur: Math.max(...g.map((n) => n.dur)) });
  }
  line.sort((a, b) => a.on - b.on);
  if (holdTop) {
    // Two voices in one track (a score): if the last chosen note is still
    // sounding and only the lower voice starts a new note below it, the
    // upper voice is held instead of jumping down to the lower voice.
    const kept: T[] = [];
    for (const n of line) {
      const k = kept.at(-1);
      const below = k !== undefined && (pick === 'top' ? n.pitch < k.pitch : n.pitch > k.pitch);
      if (k && below && k.on + k.dur > n.on + EPS) continue;
      kept.push(n);
    }
    line = kept;
  }
  for (let i = 0; i < line.length - 1; i++) {
    const cur = line[i]!;
    cur.dur = Math.min(cur.dur, line[i + 1]!.on - cur.on);
  }
  return line.filter((n) => n.dur > EPS);
}

// Krumhansl-Kessler profiles (perceptual weights of the 12 scale degrees).
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: readonly number[], b: readonly number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x ** 2;
    db += y ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

export interface KeyScore extends KeyGuess {
  r: number;
}

/** Correlation of the duration-weighted pitch-class histogram with all 24 keys, best first. */
export function keyScores(notes: readonly BeatNote[]): KeyScore[] {
  const hist = new Array<number>(12).fill(0);
  for (const n of notes) hist[pitchClass(n.pitch)]! += n.dur;
  const scores: KeyScore[] = [];
  for (let t = 0; t < 12; t++) {
    const rot = (p: readonly number[]): number[] => p.map((_, i) => p[(i - t + 12) % 12]!);
    scores.push({ tonic: t, mode: 'major', r: correlation(hist, rot(KK_MAJOR)) });
    scores.push({ tonic: t, mode: 'minor', r: correlation(hist, rot(KK_MINOR)) });
  }
  return scores.sort((a, b) => b.r - a.r);
}

export interface DetectedKey extends KeyGuess {
  method: string;
  r: number;
}

const keyOf = ({ tonic, mode }: KeyGuess): KeyGuess => ({ tonic, mode });

/**
 * Determines the key. A key signature meta event is the most reliable
 * source for the accidentals, but many sequencers do not write the minor
 * flag. Hence: accidentals from the event, major/minor (i.e. the relative
 * key) by Krumhansl comparison; without an event pure Krumhansl.
 */
export function detectKey(keySig: KeySig | null, notes: readonly BeatNote[]): DetectedKey {
  const scores = keyScores(notes);
  const best = scores[0]!;
  if (keySig) {
    const major = pitchClass(keySig.sf * 7);
    const minor = (major + 9) % 12;
    const rMaj = scores.find((s) => s.tonic === major && s.mode === 'major')!.r;
    const rMin = scores.find((s) => s.tonic === minor && s.mode === 'minor')!.r;
    // We trust the minor flag when it is set; a missing flag proves nothing.
    const useMinor = keySig.minor || rMin > rMaj + 0.05;
    const key: KeyGuess = useMinor ? { tonic: minor, mode: 'minor' } : { tonic: major, mode: 'major' };
    const agrees = best.tonic === key.tonic && best.mode === key.mode;
    // If a file writes no real accidentals at all (sf=0 in an obviously
    // different key), Krumhansl wins.
    const rKey = useMinor ? rMin : rMaj;
    if (!agrees && best.r - rKey > 0.25) return { ...keyOf(best), method: 'krumhansl (key signature discarded)', r: best.r };
    return { ...key, method: 'keysig', r: rKey };
  }
  return { ...keyOf(best), method: 'krumhansl', r: best.r };
}

/**
 * Octave placement: shift by whole octaves until the melody lies inside
 * [lo, hi] as completely as possible (on a tie: middle closest to 72).
 */
export function octaveShift(pitches: readonly number[], lo = 60, hi = 84): number {
  let best: { s: number; cost: number } | null = null;
  for (let k = -4; k <= 4; k++) {
    const s = 12 * k;
    const out = pitches.reduce((acc, p) => acc + Math.max(0, lo - (p + s)) + Math.max(0, p + s - hi), 0);
    const mid = (Math.min(...pitches) + Math.max(...pitches)) / 2 + s;
    const cost = out * 100 + Math.abs(mid - 72);
    if (!best || cost < best.cost) best = { s, cost };
  }
  return best!.s;
}

/** A time signature relative to the first melody note, in beats. */
export interface BarSig {
  beat: number;
  beatsPerBar: number;
}

/**
 * Bar lines (in beats relative to the first melody note) from the pickup
 * and the time signature changes (sorted, relative to the first note).
 */
export function barLines(pickup: number, timeSigs: readonly BarSig[], until: number): number[] {
  const lines: number[] = [];
  let pos = pickup > EPS ? pickup : 0;
  if (pickup > EPS) lines.push(0);
  let i = 0;
  while (pos <= until + EPS) {
    lines.push(pos);
    while (i + 1 < timeSigs.length && timeSigs[i + 1]!.beat <= pos + EPS) i++;
    pos += timeSigs[i]!.beatsPerBar;
  }
  return lines;
}

/**
 * Estimates the bar phase from the rhythm: long notes and onsets prefer to
 * fall on the downbeat. Serves only as a plausibility check for the pickup
 * (the actual value comes from the source). Returns the better phase, or
 * null if the rhythm does not clearly contradict `pickup`.
 */
export function estimatePickup(melody: readonly BeatNote[], beatsPerBar: number, grid: Grid, pickup: number): number | null {
  const g = grid === 'mixed' ? 0.25 : grid;
  const steps = Math.round(beatsPerBar / g);
  const scoreOf = (phase: number): number => {
    let score = 0;
    for (const n of melody.slice(0, 40)) {
      const pos = (((n.on - phase) % beatsPerBar) + beatsPerBar) % beatsPerBar;
      if (pos < 1e-6 || beatsPerBar - pos < 1e-6) score += 1 + n.dur;
    }
    return score;
  };
  let best = { phase: 0, score: -1 };
  for (let s = 0; s < steps; s++) {
    const sc = scoreOf(s * g);
    if (sc > best.score + 1e-6) best = { phase: s * g, score: sc };
  }
  // Only report if the rhythm clearly (> 40 %) favours another phase - with
  // uniform melodies the estimate is noise otherwise.
  const own = scoreOf(pickup);
  return best.score > own * 1.4 + 1 ? best.phase : null;
}

export interface CutOptions {
  melody: readonly BeatNote[];
  bars: readonly number[];
  bpm: number;
  key: KeyGuess;
  beatsPerBar: number;
  pickup: number;
  minSec?: number;
  maxSec?: number;
  prefMin?: number;
  prefMax?: number;
}

export interface CutCandidate {
  /** End of the excerpt (a bar line), in beats. */
  E: number;
  /** Index of the last melody note that is kept. */
  lastIdx: number;
  sec: number;
  /** How well the melody breathes out here. */
  q: number;
  /** q minus a penalty for leaving the preferred duration. */
  score: number;
  /** Notes before the bar line were dropped (pickup of the next phrase). */
  dropped: boolean;
}

/**
 * Looks for the end of the opening phrase: a bar line inside the target
 * window before which the melody really breathes out (long note, rest,
 * tonic/fifth). If the pickup of the next phrase already lies before the
 * bar line, it is cut off and the final note is held until the bar line.
 * Returns all candidates, best first.
 */
export function findCut({ melody, bars, bpm, key, beatsPerBar, pickup, minSec = 8, maxSec = 20, prefMin = 10, prefMax = 16 }: CutOptions): CutCandidate[] {
  const secPerBeat = 60 / bpm;
  const cands: CutCandidate[] = [];
  for (const E of bars) {
    const sec = E * secPerBeat;
    if (sec < minSec - EPS || sec > maxSec + EPS) continue;
    // Candidates for the final note: the last note before the bar line, or
    // an earlier one if everything after it already belongs to the pickup
    // of the next phrase (which is then cut off).
    const last = melody.findLastIndex((n) => n.on < E - EPS);
    const idxs: number[] = [];
    for (let i = last; i >= 0; i--) {
      if (i < last && melody[i + 1]!.on < E - pickup - EPS) break;
      idxs.push(i);
    }
    for (const idx of idxs) {
      const L = melody[idx]!;
      const next = melody[idx + 1];
      const span = (next ? next.on : L.on + L.dur) - L.on; // including the rest after it
      const rest = next ? next.on - (L.on + L.dur) : 0;
      const rel = pitchClass(L.pitch - key.tonic);
      const third = key.mode === 'major' ? 4 : 3;
      let q = 0;
      q += span >= 2 - EPS ? 2 : span >= 1 - EPS ? 1 : -2;
      if (rest >= 0.5 - EPS) q += 1;
      q += rel === 0 ? 2 : rel === 7 ? 1.5 : rel === third ? 0.5 : 0;
      const posInBar = bars.findLast((b) => b <= L.on + EPS);
      if (posInBar !== undefined && Math.abs(L.on - posInBar) < EPS) q += 1;
      else if (posInBar !== undefined && Math.abs((L.on - posInBar) % (beatsPerBar / 2)) < EPS) q += 0.5;
      // Does the final note (including its extension) last at least one beat?
      if (E - L.on < 1 - EPS) q -= 3;
      const penalty = sec < prefMin ? (prefMin - sec) * 0.6 : sec > prefMax ? (sec - prefMax) * 0.6 : 0;
      cands.push({ E, lastIdx: idx, sec, q, score: q - penalty, dropped: idx !== last });
    }
  }
  cands.sort((a, b) => b.score - a.score || Math.abs(a.sec - 13) - Math.abs(b.sec - 13));
  return cands;
}
