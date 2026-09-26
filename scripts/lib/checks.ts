// Automatic plausibility check of every generated anthem. Nobody listens
// during the build, so these rules catch the typical conversion errors:
// wrong track (accompaniment figure instead of melody), broken tempo, cut in
// the middle of a phrase, wrongly detected key.
//   errors -> the anthem is not shipped
//   flags  -> it is shipped, but marked in the report
import type { Anthem } from '../../src/index.ts';
import { pitchClass } from './music.ts';

const EPS = 1e-6;

export interface CheckResult {
  errors: string[];
  flags: string[];
}

export function sanityCheck(a: Anthem): CheckResult {
  const errors: string[] = [];
  const flags: string[] = [];
  const mel = a.melody;
  if (mel.length < 6) errors.push(`only ${mel.length} melody notes`);
  for (const [name, line] of [
    ['melody', mel],
    ['bass', a.bass],
  ] as const) {
    for (let i = 1; i < line.length; i++) {
      const [on] = line[i]!;
      const [prevOn, , prevLen] = line[i - 1]!;
      if (on < prevOn + prevLen - EPS) {
        errors.push(`${name} not monophonic at beat ${on}`);
        break;
      }
    }
  }
  const last = mel.at(-1);
  if (!last) return { errors: ['no melody'], flags };
  const ps = mel.map((n) => n[1]);
  const range = Math.max(...ps) - Math.min(...ps);
  if (range > 28) errors.push(`range ${range} semitones`);
  else if (range > 24) flags.push(`range ${range} semitones (> 2 octaves)`);
  if (Math.min(...ps) < 57 || Math.max(...ps) > 86) flags.push(`melody outside 60-84 (${Math.min(...ps)}-${Math.max(...ps)})`);
  const leaps: number[] = [];
  for (let i = 1; i < ps.length; i++) leaps.push(Math.abs(ps[i]! - ps[i - 1]!));
  const big = leaps.filter((l) => l > 12).length;
  if (big / Math.max(1, leaps.length) > 0.15) errors.push(`${big} leaps > octave`);
  else if (leaps.some((l) => l > 16)) flags.push(`leap of ${Math.max(...leaps)} semitones`);
  const stepwise = leaps.filter((l) => l <= 2).length / Math.max(1, leaps.length);
  if (stepwise < 0.25) flags.push(`little stepwise motion (${Math.round(stepwise * 100)} %) - accompaniment figure?`);
  const tiny = mel.filter((n) => n[2] < 0.2).length;
  if (tiny) flags.push(`${tiny} very short melody notes (< 1/32) - ornament or quantization error?`);
  const sec = (a.lengthBeats * 60) / a.bpm;
  if (sec < 8 - EPS || sec > 20 + EPS) errors.push(`duration ${sec.toFixed(1)} s`);
  if (a.bpm < 40 || a.bpm > 200) flags.push(`unusual tempo ${a.bpm}`);
  if (last[2] < 1 - EPS) errors.push(`final note only ${last[2]} beats`);
  if (Math.abs(last[0] + last[2] - a.lengthBeats) > EPS) errors.push('final note does not end at the cut');
  if (mel[0]![0] !== 0) errors.push('melody does not start at beat 0');
  const rel = pitchClass(last[1] - a.key.tonic);
  const third = a.key.mode === 'major' ? 4 : 3;
  if (rel === third) flags.push('ends on the third');
  else if (rel !== 0 && rel !== 7) flags.push(`final note does not fit the key (degree +${rel})`);
  if (a.bass.length && Math.max(...a.bass.map((n) => n[1])) >= Math.max(...ps)) flags.push('bass reaches above the melody');
  return { errors, flags };
}
