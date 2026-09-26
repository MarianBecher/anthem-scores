// Conversion of one curated source into an anthem file.
//
// Steps per anthem: load MIDI -> split voices -> choose melody/bass ->
// convert to beats and quantize -> determine key, pickup, tempo -> cut the
// opening phrase -> adjust the octave -> check.
import type { Anthem, InnerChord, Note } from '../../src/index.ts';
import { sanityCheck } from './checks.ts';
import type { AnthemConfig, VoiceSelect } from './config.ts';
import { parseMidi, type Midi, type MidiNote } from './midi.ts';
import {
  barLines,
  chooseGrid,
  detectKey,
  estimatePickup,
  findCut,
  monophonic,
  noteName,
  octaveShift,
  pcName,
  quantize,
  snap,
  type BarSig,
  type BeatNote,
  type DetectedKey,
  type Grid,
} from './music.ts';
import { loadSource, lyHasTempo, lyPartial, type LoadedSource, type SourceRef } from './sources.ts';

const EPS = 1e-6;

// Names by which a melody/vocal track can be recognized (multilingual,
// because the files come from all over the world).
const MELODY_NAME = /melod|vocal|voice|voix|voce|voz|sopran|lead|chant|canto|canta|gesang|singstimme|tune|mel\b/i;
const round = (x: number, d = 4): number => Math.round(x * 10 ** d) / 10 ** d;
// Length as the difference of rounded start and end times, so triplets
// (1/3 beat) do not overlap minimally through rounding.
const len = (on: number, dur: number): number => round(round(on + dur) - round(on));

interface Voice {
  id: string;
  track: number;
  ch: number;
  name: string;
  notes: MidiNote[];
}

/** A note in beats that remembers the MIDI note it came from. */
interface Tone extends BeatNote {
  src: MidiNote;
}

/** Splits the file into voices = (track, channel); channel 10 (percussion) is dropped. */
function voicesOf(midi: Midi): Voice[] {
  const voices: Voice[] = [];
  midi.tracks.forEach((t, ti) => {
    const chans = [...new Set(t.notes.map((n) => n.ch))].filter((c) => c !== 9);
    for (const ch of chans) voices.push({ id: `${ti}:${ch}`, track: ti, ch, name: t.name || t.instrument, notes: t.notes.filter((n) => n.ch === ch) });
  });
  return voices;
}

const meanPitch = (notes: readonly { pitch: number }[]): number => notes.reduce((s, n) => s + n.pitch, 0) / Math.max(1, notes.length);

function findVoice(voices: Voice[], sel: VoiceSelect): Voice {
  const v = voices.find((x) => x.track === sel.track && (sel.ch === undefined || x.ch === sel.ch));
  if (!v) throw new Error(`voice ${JSON.stringify(sel)} not found`);
  return v;
}

function pickMelody(voices: Voice[], sel: VoiceSelect | undefined): Voice {
  if (sel) return findVoice(voices, sel);
  const usable = voices.filter((v) => v.notes.length >= 8);
  const named = usable.find((v) => MELODY_NAME.test(v.name));
  if (named) return named;
  // Without names: the voice that is highest on average among those with a
  // substantial number of notes (high accompaniment figures with few notes,
  // such as bells, drop out this way).
  const maxN = Math.max(...usable.map((v) => v.notes.length));
  const best = usable.filter((v) => v.notes.length >= maxN * 0.3).sort((a, b) => meanPitch(b.notes) - meanPitch(a.notes))[0];
  if (!best) throw new Error('no voice with at least 8 notes');
  return best;
}

function pickBass(voices: Voice[], melodyVoice: Voice, sel: VoiceSelect | null | undefined): Voice | null {
  if (sel === null) return null;
  if (sel) return findVoice(voices, sel);
  const mMean = meanPitch(melodyVoice.notes);
  const cands = voices.filter((v) => v !== melodyVoice && v.notes.length >= 8 && meanPitch(v.notes) < mMean - 7);
  return cands.sort((a, b) => meanPitch(a.notes) - meanPitch(b.notes))[0] ?? null;
}

export interface BuildResult {
  out: Anthem;
  log: string[];
  flags: string[];
  errors: string[];
  src: LoadedSource;
}

export async function buildOne(code: string, cfg: AnthemConfig & { src: SourceRef }, verbose = false): Promise<BuildResult> {
  const log: string[] = [];
  const flags: string[] = [];
  const src = await loadSource(cfg.src);
  const midi = parseMidi(src.midi);
  const div = midi.division;
  const voices = voicesOf(midi);
  const melVoice = pickMelody(voices, cfg.melody);
  const bassVoice = pickBass(voices, melVoice, cfg.bass);
  log.push(`melody: track ${melVoice.id} "${melVoice.name}", bass: ${bassVoice ? `track ${bassVoice.id} "${bassVoice.name}"` : '-'}`);

  // Beat 0 = first melody note (possibly a pickup). Optionally
  // cfg.skipBeats skips an instrumental introduction in the melody track.
  const skipTicks = (cfg.skipBeats ?? 0) * div;
  const melRaw = melVoice.notes.filter((n) => n.tick >= skipTicks - EPS);
  const t0 = melRaw[0]?.tick;
  if (t0 === undefined) throw new Error('melody voice is empty');
  const toBeats = (notes: readonly MidiNote[]): Tone[] => notes.map((n) => ({ on: (n.tick - t0) / div, dur: n.dur / div, pitch: n.pitch, src: n }));

  // Tempo at the first melody note.
  const tempo = midi.tempos.filter((t) => t.tick <= t0 + EPS).at(-1) ?? midi.tempos[0];
  let bpm = tempo ? 60e6 / tempo.usPerQuarter : 120;
  // tempoGuessed: the tempo is not stated by the source but a default
  // (missing tempo event, or a score without \tempo). The game may then
  // choose its own tempo with a clear conscience.
  let tempoGuessed = !tempo;
  if (!tempo) flags.push('no tempo in the file (120 assumed)');
  // Scores without \tempo get a default tempo from the Score extension -
  // that is not a statement of the source, so mark it.
  if (src.ly && !lyHasTempo(src.ly) && !cfg.bpm) {
    tempoGuessed = true;
    flags.push(`score without tempo mark (default ${Math.round(bpm)})`);
  }
  if (cfg.bpm) {
    log.push(`tempo overridden: ${round(bpm, 1)} -> ${cfg.bpm} (${cfg.bpmReason ?? 'no reason given'})`);
    bpm = cfg.bpm;
  }

  // Time signatures relative to beat 0.
  // Many sequencer files notate the pickup as a short bar of its own (e.g.
  // 1/4 or 2/4, then 4/4). Then the second time signature is the real one,
  // and the pickup ends at the second time signature event.
  let rawSigs = midi.timeSigs;
  let pickupBarTick: number | null = null;
  const [first, second] = rawSigs;
  if (first && second && first.tick === 0) {
    const firstBar = (first.num * 4 * div) / first.den;
    if (Math.abs(second.tick - firstBar) < 2 && t0 < second.tick && (first.num * 4) / first.den < (second.num * 4) / second.den) {
      pickupBarTick = second.tick;
      rawSigs = rawSigs.slice(1);
    }
  }
  const sigs = (rawSigs.length ? rawSigs : [{ tick: 0, num: 4, den: 4 }]).map((s) => ({
    beat: (s.tick - t0) / div,
    beatsPerBar: (s.num * 4) / s.den,
    num: s.num,
    den: s.den,
  }));
  if (!midi.timeSigs.length) flags.push('no time signature in the file (4/4 assumed)');
  const startBeat = pickupBarTick !== null ? (pickupBarTick - t0) / div : 0;
  const sigAtStart = sigs.filter((s) => s.beat <= startBeat + EPS).at(-1) ?? sigs[0]!;
  const beatsPerBar = cfg.beatsPerBar ?? sigAtStart.beatsPerBar;

  const melAll = toBeats(melRaw);
  const grid: Grid = cfg.grid ? (cfg.grid === 'mixed' ? 'mixed' : 1 / cfg.grid) : chooseGrid(melAll);
  // graceRatio 0: no grace-note filter (two voices in one track, where the
  // upper voice has shorter notes than the simultaneous lower voice).
  // holdTop: do not interrupt a sustained upper voice by onsets of the lower
  // voice (also for two-voice tracks).
  let melody = monophonic(quantize(melAll, grid), 'top', { graceRatio: cfg.melody?.graceRatio ?? 0.4, holdTop: cfg.melody?.holdTop ?? false });
  if (!melody.length) throw new Error('melody is empty after quantization');

  // Pickup: override > LilyPond \partial > bar grid from tick 0.
  let pickup: number;
  const lyP = lyPartial(src.ly);
  if (cfg.pickupBeats !== undefined) pickup = cfg.pickupBeats;
  else if (lyP !== null) pickup = lyP - t0 / div;
  else if (pickupBarTick !== null) pickup = (pickupBarTick - t0) / div;
  else {
    // Sequencer files start the first bar at tick 0 and fill the pickup
    // with a rest -> the first bar line after t0 gives the pickup.
    const barTicks = sigAtStart.beatsPerBar * div;
    const sigTick = midi.timeSigs.filter((s) => s.tick <= t0).at(-1)?.tick ?? 0;
    const into = (t0 - sigTick) % barTicks;
    pickup = into < 1 ? 0 : (barTicks - into) / div;
  }
  pickup = round(snap(pickup, grid));
  if (pickup >= beatsPerBar - EPS) pickup = round(pickup % beatsPerBar);
  const est = estimatePickup(melody, beatsPerBar, grid, pickup);
  if (est !== null && cfg.pickupBeats === undefined) flags.push(`pickup ${pickup} according to the source, the rhythm suggests ${est}`);

  // Key: over the whole melody (+ bass), not only the excerpt - the opening
  // may briefly move to the dominant.
  const keySig = midi.keySigs.filter((k) => k.tick <= t0 + EPS).at(-1) ?? midi.keySigs[0] ?? null;
  let bassLineAll: Tone[] = [];
  if (bassVoice) {
    let bn = toBeats(bassVoice.notes).filter((n) => n.on >= -EPS);
    if (bassVoice === melVoice) {
      // Piano setting in one track: bass = lowest note, but only where it
      // really lies below the melody.
      const top = new Set(melody.map((n) => n.src));
      bn = bn.filter((n) => !top.has(n.src));
    }
    bassLineAll = monophonic(quantize(bn, grid), 'bottom');
  }
  let key: DetectedKey = detectKey(keySig, [...melody, ...bassLineAll]);
  if (cfg.key) {
    log.push(`key overridden: ${JSON.stringify(key)} -> ${JSON.stringify(cfg.key)}`);
    key = { ...cfg.key, method: 'override', r: 0 };
  }

  // Cut.
  const lastNote = melody.at(-1)!;
  const lastBeat = lastNote.on + lastNote.dur;
  // With an overridden time signature only that one applies (the file has
  // no or a wrong time signature then).
  const barSigs: BarSig[] = cfg.beatsPerBar ? [{ beat: 0, beatsPerBar }] : sigs.map((s) => ({ ...s, beat: Math.max(0, s.beat) }));
  const bars = barLines(pickup, barSigs, lastBeat);
  if (!cfg.beatsPerBar && sigs.slice(pickupBarTick !== null ? 1 : 0).some((s) => s.beat > EPS && s.beat < 20)) flags.push('time signature change near the start');
  let cut: { E: number; lastIdx: number; sec: number };
  if (cfg.lengthBeats) {
    const E = cfg.lengthBeats;
    // All melody notes from `limit` on belong to the next phrase (its
    // pickup) and are dropped; the note before is held.
    const limit = cfg.cutNotesFrom ?? E - (cfg.dropPickupAtEnd ? pickup : 0);
    cut = { E, lastIdx: melody.findLastIndex((n) => n.on < limit - EPS), sec: (E * 60) / bpm };
  } else {
    const cands = findCut({ melody, bars, bpm, key, beatsPerBar, pickup });
    if (!cands[0]) throw new Error('no bar line in the 8-20 s window');
    cut = cands[0];
    if (verbose)
      for (const c of cands.slice(0, 5)) log.push(`  cut candidate E=${c.E} ${round(c.sec, 1)}s q=${c.q} score=${round(c.score, 2)}${c.dropped ? ' (pickup dropped)' : ''}`);
  }
  const E = cut.E;
  const melodyLineSrc = new Set(melody.map((n) => n.src));
  melody = melody.slice(0, cut.lastIdx + 1);
  const final = melody.at(-1);
  if (!final) throw new Error(`no melody note before the cut at ${E}`);
  final.dur = E - final.on;

  // Trim the bass to the excerpt; hold its last note until the end.
  const bass = bassLineAll.filter((n) => n.on < E - EPS).map((n) => ({ ...n, dur: Math.min(n.dur, E - n.on) }));
  const bassLast = bass.at(-1);
  if (bassLast && bassLast.on >= E - beatsPerBar - EPS) bassLast.dur = E - bassLast.on;

  // Inner voices: everything that is neither melody nor bass line. The
  // melody notes that were cut off (pickup of the next phrase) must not
  // come back as inner voices either.
  const used = new Set([...melodyLineSrc, ...bassLineAll.map((n) => n.src)]);
  const pool =
    cfg.inner === false
      ? []
      : voices
          .filter((v) => !(cfg.innerExclude ?? []).includes(v.track))
          .flatMap((v) => quantize(toBeats(v.notes), grid))
          .filter((n) => !used.has(n.src) && n.on < E - EPS && n.on >= -EPS);
  const inner = innerChords(pool, melody, bass, E);

  // Octave placement: the melody into MIDI 60-84, bass and inner voices by
  // the same amount (the bass one more octave if needed to stay in 26-62).
  const shift = cfg.octave !== undefined ? cfg.octave * 12 : octaveShift(melody.map((n) => n.pitch));
  let bassShift = shift;
  if (bass.length) {
    const lo = Math.min(...bass.map((n) => n.pitch)) + bassShift;
    const hi = Math.max(...bass.map((n) => n.pitch)) + bassShift;
    if (hi > 62) bassShift -= 12 * Math.ceil((hi - 62) / 12);
    else if (lo < 26) bassShift += 12 * Math.ceil((26 - lo) / 12);
  }

  const out: Anthem = {
    code,
    title: cfg.title,
    composer: cfg.composer ?? 'unknown',
    source: src.url,
    author: src.author,
    license: src.license,
    bpm: Math.round(bpm),
    tempoGuessed: tempoGuessed && !cfg.bpm,
    beatsPerBar,
    pickupBeats: pickup,
    key: { tonic: key.tonic, mode: key.mode },
    lengthBeats: round(E),
    melody: melody.map((n): Note => [round(n.on), n.pitch + shift, len(n.on, n.dur)]),
    // A bass note that starts (up to rounding) only at the cut would have
    // length 0 and is dropped.
    bass: bass.map((n): Note => [round(n.on), n.pitch + bassShift, len(n.on, n.dur)]).filter((n) => n[2] > 0),
    inner: inner.map(([b, ps, l]): InnerChord => [round(b), ps.map((p) => p + shift), len(b, l)]),
  };

  const check = sanityCheck(out);
  flags.push(...check.flags);
  const meter = cfg.beatsPerBar ? `${beatsPerBar} beats/bar (override)` : `${sigAtStart.num}/${sigAtStart.den}`;
  const gridName = grid === 'mixed' ? '1/16+1/12' : `1/${Math.round(4 / grid)}`;
  log.push(
    `bpm ${out.bpm}, ${meter}, pickup ${pickup}, grid ${gridName}, key ${pcName(key.tonic)} ${key.mode} (${key.method}), cut ${E} beats = ${round(cut.sec, 1)} s, ${out.melody.length} notes`,
  );
  if (verbose) log.push('  ' + out.melody.map(([b, p, l]) => `${noteName(p)}/${l}${process.env.ONSETS ? '@' + b : ''}`).join(' '));
  return { out, log, flags, errors: check.errors, src };
}

/**
 * Up to two inner voices per quarter note: the longest-sounding notes
 * between bass and melody, equal consecutive chords merged.
 */
function innerChords(pool: readonly BeatNote[], melody: readonly BeatNote[], bass: readonly BeatNote[], E: number): Array<[number, number[], number]> {
  if (!pool.length) return [];
  const at = (line: readonly BeatNote[], b: number): BeatNote[] => line.filter((n) => n.on < b + 1 - EPS && n.on + n.dur > b + EPS);
  const chords: Array<[number, number[], number]> = [];
  for (let b = 0; b < E - EPS; b++) {
    const mel = at(melody, b);
    const bs = at(bass, b);
    const top = mel.length ? Math.min(...mel.map((n) => n.pitch)) : Infinity;
    const bottom = bs.length ? Math.max(...bs.map((n) => n.pitch)) : -Infinity;
    const weight = new Map<number, number>();
    for (const n of pool) {
      const ov = Math.min(b + 1, n.on + n.dur, E) - Math.max(b, n.on);
      // Only real inner voices: between bass and melody and not lower than
      // two octaves below the melody (otherwise bass octaves slip in).
      if (ov <= EPS || n.pitch >= top || n.pitch <= bottom || n.pitch < top - 24 || n.pitch < 45) continue;
      weight.set(n.pitch, (weight.get(n.pitch) ?? 0) + ov);
    }
    const picked: number[] = [];
    for (const [p] of [...weight.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])) {
      if (picked.some((q) => q % 12 === p % 12)) continue;
      picked.push(p);
      if (picked.length === 2) break;
    }
    picked.sort((x, y) => x - y);
    const l = Math.min(1, E - b);
    const prev = chords.at(-1);
    if (prev && prev[0] + prev[2] >= b - EPS && prev[1].join() === picked.join()) prev[2] += l;
    else if (picked.length) chords.push([b, picked, l]);
  }
  return chords;
}
