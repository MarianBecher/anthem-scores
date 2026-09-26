// Spot checks against melody openings we know for certain. Pitches are
// compared relative to the first note (independent of transposition) and -
// where unambiguous - rhythm and time signature. If a test fails, almost
// always the wrong track or a bad source was chosen: then fix the source or
// leave the country out, do not adjust the test.
import { describe, expect, test } from 'vitest';
import type { Anthem } from '../src/index.ts';
import { index, load } from './data.ts';

const rel = (a: Anthem, n: number): number[] => a.melody.slice(0, n).map((m) => m[1] - a.melody[0]![1]);
const durs = (a: Anthem, n: number): number[] => a.melody.slice(0, n).map((m) => m[2]);

interface Known {
  pitches: number[];
  durs?: number[];
  beatsPerBar?: number;
  pickup?: boolean;
}

const KNOWN: Record<string, Known> = {
  // Haydn: "Ei-nig-keit und Recht und Frei-heit" = do re mi re fa mi re ti do,
  // dotted quarter + eighth at the start, 4/4.
  DE: { pitches: [0, 2, 4, 2, 5, 4, 2, -1, 0], durs: [1.5, 0.5, 1, 1], beatsPerBar: 4 },
  // "Al-lons en-fants de la pa-tri-e": D D D G G A A D' B G.
  FR: { pitches: [0, 0, 0, 5, 5, 7, 7, 12, 9, 5] },
  // "O-oh say can you see": sol mi do mi sol do', 3/4 with pickup.
  US: { pitches: [0, -3, -7, -3, 0, 5], beatsPerBar: 3, pickup: true },
  // "God save our gra-cious King, long live our no-ble King, God save the King".
  // A failing test here once caught the it.wikipedia GB scores, which show
  // historical versions.
  GB: { pitches: [0, 0, 2, -1, 0, 2, 4, 4, 5, 4, 2, 0, 2, 0, -1, 0], beatsPerBar: 3, durs: [1, 1, 1, 1.5, 0.5, 1] },
  // Alexandrov: "Ros-si-ja svja-shchen-na-ja": sol | do' sol la ti mi mi
  RU: { pitches: [0, 5, 0, 2, 4, -3, -3], pickup: true },
  // "Ki-mi-ga-yo-wa": re do re mi sol mi re
  JP: { pitches: [0, -2, 0, 2, 5, 2, 0] },
  // "O Ca-na-da! Our home and na-tive land": mi sol sol do | re mi fa sol la re
  CA: { pitches: [0, 3, 3, -4, -2, 0, 1, 3, 5, -2] },
  // "Nko-si si-ke-lel' i-A-fri-ka": do ti do re mi mi | re re do, eighths/quarters/half.
  // Second source: Government Gazette No. 18341 (10 Oct 1997), tonic sol-fa line
  // "d.t,:d.r|m:m|r:r|d:-" (Commons: South African national anthem (1997)...pdf).
  ZA: { pitches: [0, -1, 0, 2, 4, 4, 2, 2, 0], durs: [0.5, 0.5, 0.5, 0.5, 1, 1, 1, 1, 2], beatsPerBar: 4 },
  // "Ja-na-ga-na-ma-na a-dhi-na-ya-ka ja-ya he": sa re ga ga ga ga ga ga | ga ga ga re ga ma.
  // Second source: Cantorion piano setting on Commons (জন গণ মন - পিয়ানো ... .pdf), same pitches and values.
  IN: {
    pitches: [0, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 4, 5, 4, 4, 4, 2, 2, 2, -1, 2, 0],
    durs: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5, 1],
    beatsPerBar: 4,
  },
};

describe('known melody openings', () => {
  for (const [code, k] of Object.entries(KNOWN)) {
    test.skipIf(!index[code])(code, () => {
      const a = load(code);
      expect(rel(a, k.pitches.length), 'pitch sequence').toEqual(k.pitches);
      if (k.durs) expect(durs(a, k.durs.length), 'rhythm').toEqual(k.durs);
      if (k.beatsPerBar) expect(a.beatsPerBar, 'time signature').toBe(k.beatsPerBar);
      if (k.pickup) expect(a.pickupBeats, 'pickup expected').toBeGreaterThan(0);
    });
  }
});

// Countries that only point to another melody must point to the right one.
test('shared melodies', () => {
  for (const cc of ['LI', 'GG', 'JE', 'GI']) if (index[cc]) expect(index[cc].file).toBe('GB.json');
  for (const cc of ['TZ', 'ZM']) if (index[cc]) expect(index[cc].file).toBe('ZA.json');
  if (index.PM) expect(index.PM.file).toBe('FR.json');
});
