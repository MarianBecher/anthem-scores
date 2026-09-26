// Tiny Standard MIDI File writer for the tests: builds files byte by byte so
// the parser can be tested without binary fixtures.

export function vlq(n: number): number[] {
  const out = [n & 0x7f];
  for (let v = n >> 7; v > 0; v >>= 7) out.unshift((v & 0x7f) | 0x80);
  return out;
}

/** One track chunk from [deltaTicks, ...eventBytes] entries; an end-of-track event is appended. */
export function track(events: Array<[number, ...number[]]>): number[] {
  const body = events.flatMap(([delta, ...bytes]) => [...vlq(delta), ...bytes]);
  body.push(0, 0xff, 0x2f, 0);
  const len = body.length;
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...body];
}

export function smf(tracks: number[][], { format = 1, division = 480 } = {}): Buffer {
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, format, 0, tracks.length, (division >> 8) & 0xff, division & 0xff];
  return Buffer.from([...header, ...tracks.flat()]);
}

export const meta = (type: number, data: number[]): number[] => [0xff, type, ...vlq(data.length), ...data];
export const text = (type: number, s: string): number[] => meta(type, [...Buffer.from(s, 'latin1')]);
