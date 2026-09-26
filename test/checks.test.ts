import { describe, expect, test } from 'vitest';
import type { Anthem, Note } from '../src/index.ts';
import { sanityCheck } from '../scripts/lib/checks.ts';

// Haydn's opening in C, 4/4 at 60 bpm with a two-beat pickup: 18 beats = 18 s.
const melody: Note[] = [
  [0, 60, 1.5],
  [1.5, 62, 0.5],
  [2, 64, 1],
  [3, 62, 1],
  [4, 65, 1],
  [5, 64, 1],
  [6, 62, 0.5],
  [6.5, 59, 0.5],
  [7, 60, 1],
  [8, 69, 1],
  [9, 67, 1],
  [10, 65, 1],
  [11, 64, 1],
  [12, 62, 1],
  [13, 64, 0.5],
  [13.5, 60, 0.5],
  [14, 67, 4],
];
const base: Anthem = {
  code: 'XX',
  title: 'Test',
  composer: 'traditional',
  source: 'https://example.org',
  author: 'unknown',
  license: 'CC0',
  bpm: 60,
  tempoGuessed: false,
  beatsPerBar: 4,
  pickupBeats: 2,
  key: { tonic: 0, mode: 'major' },
  lengthBeats: 18,
  melody,
  bass: [
    [0, 48, 2],
    [2, 43, 4],
  ],
  inner: [],
};

describe('sanityCheck', () => {
  test('passes a clean opening phrase', () => {
    expect(sanityCheck(base)).toEqual({ errors: [], flags: [] });
  });

  test('rejects overlapping melody notes and a final note that misses the cut', () => {
    const m = melody.map((n): Note => [...n]);
    m[1]![2] = 1;
    m.at(-1)![2] = 3;
    const { errors } = sanityCheck({ ...base, melody: m });
    expect(errors).toContain('melody not monophonic at beat 2');
    expect(errors).toContain('final note does not end at the cut');
  });

  test('rejects excerpts outside 8-20 s and too few notes', () => {
    expect(sanityCheck({ ...base, bpm: 200 }).errors).toContain('duration 5.4 s');
    expect(sanityCheck({ ...base, melody: [[0, 60, 18]] }).errors).toContain('only 1 melody notes');
  });

  test('flags a final note that does not fit the key and a bass above the melody', () => {
    const m = melody.map((n): Note => [...n]);
    m.at(-1)![1] = 62;
    const { errors, flags } = sanityCheck({ ...base, melody: m, bass: [[0, 80, 1]] });
    expect(errors).toEqual([]);
    expect(flags).toEqual(['final note does not fit the key (degree +2)', 'bass reaches above the melody']);
    expect(sanityCheck({ ...base, key: { tonic: 3, mode: 'major' } }).flags).toContain('ends on the third');
  });
});
