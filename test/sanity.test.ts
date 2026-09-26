// Formal and musical plausibility of *all* shipped anthems. The same rules
// already run in the build (scripts/lib/checks.ts) and prevent shipping
// there; this test makes sure the data did not come about by bypassing
// them, and additionally checks the format.
import { describe, expect, test } from 'vitest';
import { readJson } from '../scripts/lib/cache.ts';
import { sanityCheck } from '../scripts/lib/checks.ts';
import type { Sources } from '../scripts/lib/config.ts';
import { anthemFiles, index, readFile } from './data.ts';

const KEYS = ['code', 'title', 'composer', 'source', 'author', 'license', 'bpm', 'tempoGuessed', 'beatsPerBar', 'pickupBeats', 'key', 'lengthBeats', 'melody', 'bass', 'inner'];
const sources = readJson<Sources>('sources.json');

describe('index.json', () => {
  test('is sorted and points only to existing files', () => {
    const codes = Object.keys(index);
    expect(codes).toEqual([...codes].sort());
    for (const [code, e] of Object.entries(index)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(anthemFiles, `${code} -> ${e.file}`).toContain(e.file);
      expect(e.title).toBeTruthy();
    }
  });

  test('lists every file under its own code, with the title of the file', () => {
    for (const file of anthemFiles) {
      const code = file.slice(0, 2);
      expect(index[code], code).toEqual({ title: readFile(file).title, file });
    }
  });

  test('matches sources.json: every buildable entry is shipped, shared melodies point to their file', () => {
    for (const [code, cfg] of Object.entries(sources)) {
      if (cfg.skip || cfg.missing) expect(index[code], code).toBeUndefined();
      else if (cfg.sameAs) expect(index[code], code).toEqual({ title: cfg.title, file: `${cfg.sameAs}.json` });
      else expect(index[code], code).toEqual({ title: cfg.title, file: `${code}.json` });
    }
    for (const code of Object.keys(index)) expect(sources[code], code).toBeDefined();
  });
});

describe.each(anthemFiles)('%s', (file) => {
  const a = readFile(file);

  test('format', () => {
    expect(Object.keys(a)).toEqual(KEYS);
    expect(a.code + '.json').toBe(file);
    for (const k of ['title', 'composer', 'source', 'author', 'license'] as const) expect(a[k], k).toMatch(/\S/);
    expect(a.source).toMatch(/^https:\/\/[a-z.]+\.(wikipedia|wikisource|wikimedia)\.org\//);
    expect(typeof a.tempoGuessed).toBe('boolean');
    expect(Number.isInteger(a.key.tonic) && a.key.tonic >= 0 && a.key.tonic < 12).toBe(true);
    expect(['major', 'minor']).toContain(a.key.mode);
    for (const line of [a.melody, a.bass])
      for (const n of line) {
        expect(n).toHaveLength(3);
        expect(n[0] >= 0 && n[0] + n[2] <= a.lengthBeats + 1e-6, `note ${n} outside`).toBe(true);
        expect(Number.isInteger(n[1]) && n[2] > 0).toBe(true);
      }
    for (const [b, ps, l] of a.inner) {
      expect(b >= 0 && b + l <= a.lengthBeats + 1e-6 && ps.length >= 1 && ps.length <= 2).toBe(true);
    }
    expect(a.pickupBeats >= 0 && a.pickupBeats < a.beatsPerBar).toBe(true);
  });

  test('cut on a bar line', () => {
    const bars = (a.lengthBeats - a.pickupBeats) / a.beatsPerBar;
    expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-6);
  });

  test('passes the build checks', () => {
    expect(sanityCheck(a).errors).toEqual([]);
  });
});
