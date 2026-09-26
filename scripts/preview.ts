// Renders every anthem in anthems/ as a WAV file into preview/ and writes
// preview/index.html with audio players - for listening by a human.
//
//   npm run preview
//
// A deliberately primitive additive synth: the point is recognizing the
// melody, not sound quality, and this way no sound fonts are needed. For
// real instruments see https://github.com/MarianBecher/tiny-orchestra.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Anthem, AnthemIndex } from '../src/index.ts';
import { readJson, ROOT } from './lib/cache.ts';
import { pcName } from './lib/music.ts';

const RATE = 22050;
const DIST = join(ROOT, 'anthems');
const OUT = join(ROOT, 'preview');

interface Timbre {
  gain: number;
  partials: number[];
}

// Overtone amplitudes per voice: melody bright, bass round, inner voices quiet.
const TIMBRE = {
  melody: { gain: 0.32, partials: [1, 0.5, 0.3, 0.15, 0.08] },
  bass: { gain: 0.26, partials: [1, 0.35, 0.12] },
  inner: { gain: 0.08, partials: [1, 0.3] },
} satisfies Record<string, Timbre>;

const freq = (m: number): number => 440 * 2 ** ((m - 69) / 12);

function addNote(buf: Float32Array, start: number, dur: number, midi: number, { gain, partials }: Timbre): void {
  const f = freq(midi);
  const s0 = Math.floor(start * RATE);
  const len = Math.floor(dur * RATE);
  const attack = Math.min(0.02 * RATE, len / 4);
  const release = Math.min(0.08 * RATE, len / 3);
  for (let i = 0; i < len && s0 + i < buf.length; i++) {
    const t = i / RATE;
    let env = 1;
    if (i < attack) env = i / attack;
    else if (i > len - release) env = (len - i) / release;
    env *= 0.75 + 0.25 * Math.exp(-t * 3); // slight decay after the attack
    let v = 0;
    partials.forEach((a, k) => {
      if (f * (k + 1) < RATE / 2) v += a * Math.sin(2 * Math.PI * f * (k + 1) * t);
    });
    buf[s0 + i]! += v * env * gain;
  }
}

/** Renders an anthem to a 16-bit mono WAV file. */
function render(a: Anthem): Buffer {
  const spb = 60 / a.bpm;
  const total = a.lengthBeats * spb + 0.5;
  const buf = new Float32Array(Math.ceil(total * RATE));
  for (const [b, p, l] of a.melody) addNote(buf, b * spb, l * spb, p, TIMBRE.melody);
  for (const [b, p, l] of a.bass) addNote(buf, b * spb, l * spb, p, TIMBRE.bass);
  for (const [b, ps, l] of a.inner) for (const p of ps) addNote(buf, b * spb, l * spb, p, TIMBRE.inner);
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const norm = peak > 0.95 ? 0.95 / peak : 1;
  const wav = Buffer.alloc(44 + buf.length * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + buf.length * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(1, 22); // mono
  wav.writeUInt32LE(RATE, 24);
  wav.writeUInt32LE(RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(buf.length * 2, 40);
  for (let i = 0; i < buf.length; i++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, buf[i]! * norm)) * 32767), 44 + i * 2);
  return wav;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

mkdirSync(OUT, { recursive: true });
const index = readJson<AnthemIndex>('anthems', 'index.json');
const rows: string[] = [];
const rendered = new Set<string>();
for (const [code, { title, file }] of Object.entries(index)) {
  const a = JSON.parse(readFileSync(join(DIST, file), 'utf8')) as Anthem;
  const wavName = file.replace('.json', '.wav');
  if (!rendered.has(wavName)) {
    writeFileSync(join(OUT, wavName), render(a));
    rendered.add(wavName);
  }
  const key = `${pcName(a.key.tonic)} ${a.key.mode}`;
  const sec = ((a.lengthBeats * 60) / a.bpm).toFixed(1);
  const shared = file !== code + '.json' ? ` <small>(= ${file.replace('.json', '')})</small>` : '';
  rows.push(
    `<tr><td>${code}</td><td>${esc(title)}${shared}<br><small>${esc(a.composer)}</small></td>` +
      `<td>${a.bpm} bpm${a.tempoGuessed ? ' (guessed)' : ''}, ${a.beatsPerBar}/4, pickup ${a.pickupBeats}<br>${key}, ${sec} s</td>` +
      `<td><audio controls preload="none" src="${wavName}"></audio></td><td><a href="${esc(a.source)}">source</a></td></tr>`,
  );
}
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Anthem preview</title>
<style>body{font:14px system-ui;margin:2em}td{padding:4px 10px;border-bottom:1px solid #ddd;vertical-align:middle}small{color:#666}</style>
<h1>Anthem preview</h1><p>Melody + bass + inner voices, simple additive synth. ${rows.length} entries.</p>
<table>${rows.join('\n')}</table>\n`,
);
console.log(`${rendered.size} WAVs, ${rows.length} entries -> preview/index.html`);
