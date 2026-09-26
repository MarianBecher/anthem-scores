import { describe, expect, test } from 'vitest';
import {
  barLines,
  chooseGrid,
  detectKey,
  estimatePickup,
  findCut,
  keyScores,
  monophonic,
  noteName,
  octaveShift,
  quantize,
  snap,
  type BeatNote,
} from '../scripts/lib/music.ts';

const n = (on: number, pitch: number, dur = 1): BeatNote => ({ on, pitch, dur });
// C major scale up and down, quarter notes.
const scale = [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60].map((p, i) => n(i, p));

describe('note names', () => {
  test('uses scientific pitch notation', () => {
    expect(noteName(60)).toBe('C4');
    expect(noteName(70)).toBe('Bb4');
    expect(noteName(21)).toBe('A0');
  });
});

describe('grid and quantization', () => {
  test('keeps sixteenths and dotted rhythms on the 1/16 grid', () => {
    expect(chooseGrid([n(0, 60, 0.75), n(0.75, 62, 0.25), n(1, 64, 0.5)])).toBe(0.25);
  });

  test('switches to the mixed grid when triplets show up', () => {
    const triplets = [0, 1 / 3, 2 / 3, 1].map((on) => n(on, 60, 1 / 3));
    expect(chooseGrid(triplets)).toBe('mixed');
    expect(snap(0.34, 'mixed')).toBeCloseTo(1 / 3);
    expect(snap(0.5, 'mixed')).toBe(0.5);
    expect(snap(0.26, 0.25)).toBe(0.25);
  });

  test('snaps onsets and ends and keeps the raw length', () => {
    const q = quantize([n(1.02, 60, 0.46), n(0.01, 64, 0.1)], 0.25);
    expect(q).toEqual([
      { on: 0, pitch: 64, dur: 0.25, rawDur: 0.1 },
      { on: 1, pitch: 60, dur: 0.5, rawDur: 0.46 },
    ]);
  });
});

describe('monophonic', () => {
  test('keeps the top note of chords and cuts overlaps at the next onset', () => {
    const line = monophonic([n(0, 60, 2), n(0, 67, 2), n(1, 65, 1)]);
    expect(line.map((x) => [x.on, x.pitch, x.dur])).toEqual([
      [0, 67, 1],
      [1, 65, 1],
    ]);
  });

  test('picks the bottom note for the bass', () => {
    expect(monophonic([n(0, 48), n(0, 55)], 'bottom').map((x) => x.pitch)).toEqual([48]);
  });

  test('lets a long note win against a simultaneous grace note', () => {
    const line = monophonic([{ ...n(0, 72, 0.25), rawDur: 0.1 }, { ...n(0, 67, 1), rawDur: 1 }]);
    expect(line.map((x) => x.pitch)).toEqual([67]);
    expect(monophonic([{ ...n(0, 72, 0.25), rawDur: 0.1 }, { ...n(0, 67, 1), rawDur: 1 }], 'top', { graceRatio: 0 })[0]!.pitch).toBe(72);
  });

  test('holdTop keeps a sustained upper voice over a moving lower voice', () => {
    const notes = [n(0, 72, 2), n(0, 64, 1), n(1, 62, 1), n(2, 71, 1)];
    expect(monophonic(notes).map((x) => x.pitch)).toEqual([72, 62, 71]);
    expect(monophonic(notes, 'top', { holdTop: true }).map((x) => [x.pitch, x.dur])).toEqual([
      [72, 2],
      [71, 1],
    ]);
  });
});

describe('key detection', () => {
  test('recognizes a major scale by Krumhansl-Kessler correlation', () => {
    expect(keyScores(scale)[0]).toMatchObject({ tonic: 0, mode: 'major' });
    expect(detectKey(null, scale)).toMatchObject({ tonic: 0, mode: 'major', method: 'krumhansl' });
  });

  test('takes the accidentals from the key signature', () => {
    const f = scale.map((x) => ({ ...x, pitch: x.pitch + 5 + (x.pitch % 12 === 11 ? -1 : 0) }));
    expect(detectKey({ tick: 0, sf: -1, minor: false }, f)).toMatchObject({ tonic: 5, mode: 'major', method: 'keysig' });
  });

  test('believes a set minor flag and discards an obviously wrong signature', () => {
    const aMinor = [69, 71, 72, 74, 76, 72, 69, 68, 69].map((p, i) => n(i, p, i === 8 ? 4 : 1));
    expect(detectKey({ tick: 0, sf: 0, minor: true }, aMinor)).toMatchObject({ tonic: 9, mode: 'minor' });
    const eMajor = [64, 66, 68, 69, 71, 73, 75, 76, 71, 68, 64].map((p, i) => n(i, p));
    expect(detectKey({ tick: 0, sf: 0, minor: false }, eMajor)).toMatchObject({ tonic: 4, mode: 'major', method: 'krumhansl (key signature discarded)' });
  });
});

describe('octave placement', () => {
  test('moves the melody into MIDI 60-84', () => {
    expect(octaveShift([43, 50, 55])).toBe(24);
    expect(octaveShift([62, 74])).toBe(0);
    expect(octaveShift([88, 95])).toBe(-24);
  });
});

describe('bars and pickup', () => {
  test('bar lines start after the pickup and follow time signature changes', () => {
    expect(barLines(1, [{ beat: 0, beatsPerBar: 3 }], 10)).toEqual([0, 1, 4, 7, 10]);
    expect(barLines(0, [{ beat: 0, beatsPerBar: 4 }, { beat: 8, beatsPerBar: 3 }], 14)).toEqual([0, 4, 8, 11, 14]);
  });

  test('the rhythm estimate reports a clearly different pickup', () => {
    // Long notes on beats 1, 4, 7, ... of a 3/4 melody: the pickup is 1.
    const mel = [n(0, 60)];
    for (let b = 1; b < 25; b += 3) mel.push(n(b, 64, 2.5), n(b + 2.5, 62, 0.5));
    expect(estimatePickup(mel, 3, 0.25, 0)).toBe(1);
    expect(estimatePickup(mel, 3, 0.25, 1)).toBeNull();
  });
});

describe('phrase cut', () => {
  test('prefers a bar line after a long tonic note in the 10-16 s window', () => {
    // 4/4 at 60 bpm: two phrases of 3 bars (quarters) + a whole-bar tonic.
    const phrase = [64, 62, 60, 62, 64, 64, 64, 64, 62, 62, 62, 62];
    const melody: BeatNote[] = [];
    for (let p = 0; p < 2; p++) {
      phrase.forEach((pitch, i) => melody.push(n(p * 16 + i, pitch)));
      melody.push(n(p * 16 + 12, 60, 4));
    }
    const bars = barLines(0, [{ beat: 0, beatsPerBar: 4 }], 32);
    const cands = findCut({ melody, bars, bpm: 60, key: { tonic: 0, mode: 'major' }, beatsPerBar: 4, pickup: 0 });
    expect(cands[0]).toMatchObject({ E: 16, lastIdx: 12, dropped: false });
  });

  test('drops the pickup of the next phrase before the bar line', () => {
    // 3/4 at 60 bpm with a one-beat pickup: the note on beat 12 is the pickup of phrase two.
    const melody = [n(0, 67), n(1, 72), n(2, 71), n(3, 69), n(4, 67, 3), n(7, 69), n(8, 71), n(9, 72, 3), n(12, 67), n(13, 74, 3)];
    const bars = barLines(1, [{ beat: 0, beatsPerBar: 3 }], 16);
    const cands = findCut({ melody, bars, bpm: 60, key: { tonic: 0, mode: 'major' }, beatsPerBar: 3, pickup: 1, minSec: 8, maxSec: 14 });
    expect(cands[0]).toMatchObject({ E: 13, lastIdx: 7, dropped: true });
  });
});
