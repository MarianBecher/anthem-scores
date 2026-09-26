// Minimal Standard MIDI File parser (SMF format 0 and 1).
//
// Why write our own? We only need a small part of the format (notes, tempo,
// time signature, key signature, track names), and our own parser keeps the
// project free of runtime dependencies. Everything we do not understand
// (SysEx, controllers, ...) is skipped cleanly.

export interface MidiNote {
  /** Onset in ticks. */
  tick: number;
  /** Duration in ticks. */
  dur: number;
  pitch: number;
  vel: number;
  /** Channel 0-15 (9 = General MIDI percussion). */
  ch: number;
}

export interface MidiTrack {
  name: string;
  instrument: string;
  programs: number[];
  channels: number[];
  /** Sorted by onset, higher pitch first on equal onsets. */
  notes: MidiNote[];
}

export interface Tempo {
  tick: number;
  usPerQuarter: number;
}

export interface TimeSig {
  tick: number;
  num: number;
  den: number;
}

export interface KeySig {
  tick: number;
  /** Number of sharps (> 0) or flats (< 0). */
  sf: number;
  minor: boolean;
}

export interface Midi {
  format: number;
  /** Ticks per quarter note. */
  division: number;
  tracks: MidiTrack[];
  tempos: Tempo[];
  timeSigs: TimeSig[];
  keySigs: KeySig[];
}

class Reader {
  pos = 0;
  readonly buf: Buffer;
  constructor(buf: Buffer) {
    this.buf = buf;
  }
  u8(): number {
    const v = this.buf[this.pos++];
    if (v === undefined) throw new Error('Unexpected end of MIDI data');
    return v;
  }
  u16(): number {
    const v = this.buf.readUInt16BE(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    const v = this.buf.readUInt32BE(this.pos);
    this.pos += 4;
    return v;
  }
  str(n: number): string {
    const s = this.buf.toString('latin1', this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  bytes(n: number): Buffer {
    const b = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
  // Variable-length quantity: 7 bits per byte, the high bit means "more follows".
  vlq(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  }
}

interface OpenNote {
  tick: number;
  pitch: number;
  vel: number;
  ch: number;
}

const byTick = <T extends { tick: number }>(a: T, b: T): number => a.tick - b.tick;

export function parseMidi(buf: Buffer): Midi {
  const r = new Reader(buf);
  // Some files come in a RIFF wrapper (RMID), so search for the MThd chunk.
  const start = buf.indexOf('MThd');
  if (start < 0) throw new Error('No MThd header');
  r.pos = start + 4;
  const hlen = r.u32();
  const format = r.u16();
  const ntracks = r.u16();
  const division = r.u16();
  r.pos = start + 8 + hlen;
  if (division & 0x8000) throw new Error('SMPTE time division is not supported');

  const tracks: MidiTrack[] = [];
  const tempos: Tempo[] = [];
  const timeSigs: TimeSig[] = [];
  const keySigs: KeySig[] = [];

  for (let t = 0; t < ntracks && r.pos < buf.length; t++) {
    const id = r.str(4);
    const len = r.u32();
    const end = r.pos + len;
    if (id !== 'MTrk') {
      // Unknown chunk: skip it without counting it as a track.
      r.pos = end;
      t--;
      continue;
    }
    const track: MidiTrack = { name: '', instrument: '', programs: [], channels: [], notes: [] };
    const open = new Map<string, OpenNote[]>(); // "ch:pitch" -> queue of sounding notes
    let tick = 0;
    let status = 0;
    while (r.pos < end) {
      tick += r.vlq();
      let b = r.u8();
      if (b < 0x80) {
        // Running status: the status byte of the previous message still applies.
        r.pos--;
        b = status;
      } else if (b < 0xf0) {
        status = b;
      }
      if (b === 0xff) {
        const type = r.u8();
        const l = r.vlq();
        const data = r.bytes(l);
        const d = (i: number): number => data[i] ?? 0;
        if (type === 0x03 && !track.name) track.name = data.toString('latin1').trim();
        else if (type === 0x04) track.instrument = data.toString('latin1').trim();
        else if (type === 0x51) tempos.push({ tick, usPerQuarter: (d(0) << 16) | (d(1) << 8) | d(2) });
        else if (type === 0x58) timeSigs.push({ tick, num: d(0), den: 2 ** d(1) });
        else if (type === 0x59) keySigs.push({ tick, sf: (d(0) << 24) >> 24, minor: d(1) === 1 });
        else if (type === 0x2f) break;
        continue;
      }
      if (b === 0xf0 || b === 0xf7) {
        // SysEx: length, then data. Read the length first: `r.pos += r.vlq()`
        // would add it to the position *before* the length bytes.
        const l = r.vlq();
        r.pos += l;
        continue;
      }
      const kind = b & 0xf0;
      const ch = b & 0x0f;
      if (kind === 0xc0 || kind === 0xd0) {
        const v = r.u8();
        if (kind === 0xc0) track.programs.push(v);
        continue;
      }
      const d1 = r.u8();
      const d2 = r.u8();
      if (kind === 0x90 && d2 > 0) {
        const k = ch + ':' + d1;
        let queue = open.get(k);
        if (!queue) open.set(k, (queue = []));
        queue.push({ tick, pitch: d1, vel: d2, ch });
        if (!track.channels.includes(ch)) track.channels.push(ch);
      } else if (kind === 0x80 || (kind === 0x90 && d2 === 0)) {
        const n = open.get(ch + ':' + d1)?.shift();
        if (n) track.notes.push({ ...n, dur: tick - n.tick });
      }
    }
    // Notes that never end (broken files) last until the end of the track.
    for (const queue of open.values()) for (const n of queue) track.notes.push({ ...n, dur: Math.max(1, tick - n.tick) });
    track.notes.sort((a, b) => a.tick - b.tick || b.pitch - a.pitch);
    r.pos = end;
    tracks.push(track);
  }
  return { format, division, tracks, tempos: tempos.sort(byTick), timeSigs: timeSigs.sort(byTick), keySigs: keySigs.sort(byTick) };
}
