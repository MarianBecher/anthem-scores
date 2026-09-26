import { describe, expect, test } from 'vitest';
import { parseMidi } from '../scripts/lib/midi.ts';
import { meta, smf, text, track, vlq } from './smf.ts';

describe('parseMidi', () => {
  test('encodes variable-length quantities like the spec', () => {
    expect(vlq(0)).toEqual([0]);
    expect(vlq(0x7f)).toEqual([0x7f]);
    expect(vlq(0x80)).toEqual([0x81, 0x00]);
    expect(vlq(0x3fff)).toEqual([0xff, 0x7f]);
  });

  test('reads header, meta events and notes', () => {
    const conductor = track([
      [0, ...meta(0x51, [0x07, 0xa1, 0x20])], // 500000 us per quarter = 120 bpm
      [0, ...meta(0x58, [3, 2, 24, 8])], // 3/4
      [0, ...meta(0x59, [0xfe, 1])], // 2 flats, minor
      [960, ...meta(0x51, [0x0f, 0x42, 0x40])], // 60 bpm
    ]);
    const melody = track([
      [0, ...text(0x03, 'Melody')],
      [0, ...text(0x04, 'Flute')],
      [0, 0xc0, 73],
      [0, 0x90, 60, 100],
      [480, 0x80, 60, 0],
      [0, 0x90, 64, 90],
      [240, 0x80, 64, 0],
    ]);
    const m = parseMidi(smf([conductor, melody]));
    expect(m.format).toBe(1);
    expect(m.division).toBe(480);
    expect(m.tempos).toEqual([
      { tick: 0, usPerQuarter: 500000 },
      { tick: 960, usPerQuarter: 1000000 },
    ]);
    expect(m.timeSigs).toEqual([{ tick: 0, num: 3, den: 4 }]);
    expect(m.keySigs).toEqual([{ tick: 0, sf: -2, minor: true }]);
    expect(m.tracks).toHaveLength(2);
    const t = m.tracks[1]!;
    expect(t.name).toBe('Melody');
    expect(t.instrument).toBe('Flute');
    expect(t.programs).toEqual([73]);
    expect(t.channels).toEqual([0]);
    expect(t.notes).toEqual([
      { tick: 0, pitch: 60, vel: 100, ch: 0, dur: 480 },
      { tick: 480, pitch: 64, vel: 90, ch: 0, dur: 240 },
    ]);
  });

  test('handles running status and note-on with velocity 0 as note-off', () => {
    const t = track([
      [0, 0x91, 60, 80],
      [0, 64, 80], // running status: another note-on on channel 1
      [480, 60, 0], // note-off via velocity 0
      [0, 64, 0],
    ]);
    const notes = parseMidi(smf([t], { format: 0 })).tracks[0]!.notes;
    expect(notes).toEqual([
      { tick: 0, pitch: 64, vel: 80, ch: 1, dur: 480 },
      { tick: 0, pitch: 60, vel: 80, ch: 1, dur: 480 },
    ]);
  });

  test('pairs repeated pitches first in, first out', () => {
    const t = track([
      [0, 0x90, 60, 80],
      [100, 0x90, 60, 80],
      [100, 0x80, 60, 0],
      [100, 0x80, 60, 0],
    ]);
    const notes = parseMidi(smf([t])).tracks[0]!.notes;
    expect(notes.map((n) => [n.tick, n.dur])).toEqual([
      [0, 200],
      [100, 200],
    ]);
  });

  test('skips SysEx, controllers and unknown chunks, and closes hanging notes', () => {
    const t = track([
      [0, 0xf0, ...vlq(3), 0x7e, 0x7f, 0xf7],
      [0, 0xb0, 7, 100],
      [0, 0xd0, 64],
      [0, 0x90, 67, 70],
      [240, 0xe0, 0, 64], // pitch bend
    ]);
    const junk = [0x58, 0x58, 0x58, 0x58, 0, 0, 0, 2, 1, 2];
    const m = parseMidi(smf([junk, t]));
    expect(m.tracks).toHaveLength(1);
    expect(m.tracks[0]!.notes).toEqual([{ tick: 0, pitch: 67, vel: 70, ch: 0, dur: 240 }]);
  });

  test('finds the header inside a RIFF wrapper', () => {
    const inner = smf([track([[0, 0x90, 72, 1], [10, 0x80, 72, 0]])]);
    const m = parseMidi(Buffer.concat([Buffer.from('RIFF\0\0\0\0RMIDdata\0\0\0\0'), inner]));
    expect(m.tracks[0]!.notes[0]!.pitch).toBe(72);
  });

  test('rejects files without header and SMPTE time division', () => {
    expect(() => parseMidi(Buffer.from('not a midi file'))).toThrow(/MThd/);
    expect(() => parseMidi(smf([], { division: 0xe728 }))).toThrow(/SMPTE/);
  });
});
