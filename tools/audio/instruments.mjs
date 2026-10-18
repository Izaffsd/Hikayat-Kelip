/**
 * Synthesised instruments for the score (original sounds, no samples, deterministic by seed): the gambus (a plucked
 * double course, Karplus–Strong, through a small skin-and-wood body), the rebana (frame drum: open `dum`, edge `tak`),
 * the gong (tetawak: beating inharmonic partials), the seruling (bamboo flute: one legato line with breath and
 * vibrato), the gambang (wooden bars, from synth.mjs) and a low bowed drone. Each adds into an output buffer.
 */
import { Biquad, SAMPLE_RATE, mallet, pinkNoise } from './synth.mjs';

const TAU = 2 * Math.PI;

/**
 * Frequency of a MIDI note.
 * @param {number} note 69 = A4
 */
export const midiHz = (note) => 440 * 2 ** ((note - 69) / 12);

/**
 * One plucked string (Karplus–Strong with an allpass for exact tuning), added into `out`.
 * @param {Float32Array} out
 * @param {number} start sample
 * @param {number} frequency Hz
 * @param {number} seconds until the string is damped
 * @param {number} gain
 * @param {() => number} random
 * @param {object} [options]
 * @param {number} [options.brightness=0.6] 0..1 (plectrum attack)
 * @param {number} [options.decay=3] seconds to −60 dB while ringing
 * @param {number} [options.release=0.07] damping time at the end
 */
function string(
  out,
  start,
  frequency,
  seconds,
  gain,
  random,
  { brightness = 0.6, decay = 3, release = 0.07 } = {},
) {
  const n = Math.min(out.length - start, Math.round((seconds + release) * SAMPLE_RATE));
  if (n <= 0 || start < 0) return;
  const period = SAMPLE_RATE / frequency;
  const length = Math.max(2, Math.floor(period - 0.6));
  const fraction = period - 0.5 - length;
  const c = (1 - fraction) / (1 + fraction);
  const line = new Float32Array(length);
  const a = 0.12 + brightness * 0.8;
  let lp = 0;
  for (let i = 0; i < length; i++) {
    lp += a * (random() * 2 - 1 - lp);
    line[i] = lp;
  }
  // Plucked near the bridge: a comb on the excitation.
  const position = Math.max(1, Math.round(length * 0.16));
  for (let i = length - 1; i >= position; i--) line[i] -= line[i - position];
  const loss = 10 ** (-3 / (decay * frequency));
  const releaseSamples = Math.max(1, Math.round(release * SAMPLE_RATE));
  const held = Math.round(seconds * SAMPLE_RATE);
  let index = 0;
  let previous = 0;
  let apIn = 0;
  let apOut = 0;
  for (let i = 0; i < n; i++) {
    const x = line[index];
    const average = 0.5 * (x + previous);
    previous = x;
    const y = c * average + apIn - c * apOut;
    apIn = average;
    apOut = y;
    line[index] = y * loss;
    index = index + 1 === length ? 0 : index + 1;
    const damp = i < held ? 1 : 1 - (i - held) / releaseSamples;
    out[start + i] += x * gain * damp;
  }
}

/**
 * A gambus note: two strings of a course, a hair apart. Long notes are sustained with a tremolo of fast re-plucks
 * (the oud-family way of holding a note).
 * @param {Float32Array} out
 * @param {number} start sample
 * @param {number} note MIDI
 * @param {number} seconds
 * @param {number} gain
 * @param {() => number} random
 * @param {{ tremolo?: number, brightness?: number }} [options] tremolo: re-pluck interval in seconds (0 = none)
 */
export function gambus(out, start, note, seconds, gain, random, { tremolo = 0, brightness = 0.62 } = {}) {
  const frequency = midiHz(note);
  const plucks = tremolo > 0 ? Math.max(1, Math.floor(seconds / tremolo)) : 1;
  const each = plucks > 1 ? tremolo : seconds;
  for (let p = 0; p < plucks; p++) {
    const at = start + Math.round(p * each * SAMPLE_RATE);
    const g = gain * (p === 0 ? 1 : 0.42 + 0.12 * (p % 2));
    const last = p === plucks - 1;
    const hold = last ? seconds - p * each : each;
    for (const detune of [0.9988, 1.0012]) {
      string(out, at, frequency * detune, hold, g * 0.5, random, {
        brightness: p === 0 ? brightness : brightness * 0.75,
        decay: 2.6,
        release: last ? 0.08 : 0.03,
      });
    }
  }
}

/**
 * The gambus body: a skin-faced resonance and a wooden box (applied once to a whole gambus track).
 * @param {Float32Array} track
 * @returns {Float32Array}
 */
export function gambusBody(track) {
  const stages = [
    new Biquad('highpass', 85, 0.7),
    new Biquad('peak', 260, 1.4, 4),
    new Biquad('peak', 1250, 1.8, 5),
    new Biquad('peak', 3200, 2, -3),
    new Biquad('lowpass', 7000, 0.7),
  ];
  for (const stage of stages) for (let i = 0; i < track.length; i++) track[i] = stage.process(track[i]);
  return track;
}

/**
 * Rebana open stroke (`dum`): a pitched membrane thump that drops in pitch.
 * @param {Float32Array} out
 * @param {number} start sample
 * @param {number} gain
 * @param {() => number} random
 * @param {number} [pitch=1]
 */
export function rebanaDum(out, start, gain, random, pitch = 1) {
  const n = Math.min(out.length - start, Math.round(0.7 * SAMPLE_RATE));
  const base = 92 * pitch;
  const slapFilter = new Biquad('lowpass', 900, 0.7);
  let phase = 0;
  let upper = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = base * (1 + 0.45 * Math.exp(-t / 0.025));
    phase += (TAU * f) / SAMPLE_RATE;
    upper += (TAU * f * 1.58) / SAMPLE_RATE;
    const body = Math.sin(phase) * Math.exp(-t / 0.2) + Math.sin(upper) * 0.25 * Math.exp(-t / 0.07);
    const slap = slapFilter.process(random() * 2 - 1) * Math.exp(-t / 0.012) * 0.6;
    out[start + i] += (body + slap) * gain * Math.min(1, t / 0.0015);
  }
}

/**
 * Rebana edge stroke (`tak`): a bright slap with a short ring.
 * @param {Float32Array} out
 * @param {number} start sample
 * @param {number} gain
 * @param {() => number} random
 * @param {number} [pitch=1]
 */
export function rebanaTak(out, start, gain, random, pitch = 1) {
  const n = Math.min(out.length - start, Math.round(0.3 * SAMPLE_RATE));
  const band = new Biquad('bandpass', 2300 * pitch, 1.2);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const slap = band.process(random() * 2 - 1) * Math.exp(-t / 0.022) * 2.2;
    const ring =
      (Math.sin(TAU * 410 * pitch * t) * 0.3 + Math.sin(TAU * 860 * pitch * t) * 0.14) * Math.exp(-t / 0.055);
    out[start + i] += (slap + ring) * gain * Math.min(1, t / 0.0008);
  }
}

/**
 * Gong (tetawak): a low fundamental beating against its neighbour, a few inharmonic partials and a soft mallet.
 * @param {Float32Array} out
 * @param {number} start sample
 * @param {number} note MIDI
 * @param {number} gain
 * @param {() => number} random
 * @param {number} [decay=5] seconds (fundamental, e-folding)
 */
export function gong(out, start, note, gain, random, decay = 5) {
  const frequency = midiHz(note);
  const n = Math.min(out.length - start, Math.round(decay * 1.6 * SAMPLE_RATE));
  const partials = [
    [1, 1, 1],
    [1.0042, 0.55, 0.9],
    [2.015, 0.3, 0.55],
    [2.74, 0.16, 0.35],
    [3.93, 0.09, 0.25],
    [5.12, 0.05, 0.18],
  ];
  const phases = partials.map(() => random() * TAU);
  const thump = new Biquad('lowpass', 220, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // The pitch sags a little as the gong settles.
    const bend = 1 - 0.006 * (1 - Math.exp(-t / 1.2));
    let v = 0;
    for (let k = 0; k < partials.length; k++) {
      const [ratio, amp, scale] = partials[k];
      v += Math.sin(TAU * frequency * ratio * bend * t + phases[k]) * amp * Math.exp(-t / (decay * scale));
    }
    const strike = thump.process(random() * 2 - 1) * Math.exp(-t / 0.03) * 0.8;
    out[start + i] += (v * Math.min(1, t / 0.008) + strike) * gain;
  }
}

/**
 * Bonang (a bronze kettle gong of the gamelan Melayu): a clear fundamental beating gently against its twin, bright
 * upper partials that die fast, and a soft padded mallet. It cannot sustain, so long notes are struck again.
 * @param {Float32Array} out
 * @param {number} start sample
 * @param {number} note MIDI
 * @param {number} gain
 */
export function bonang(out, start, note, gain) {
  if (start < 0 || start >= out.length) return;
  const frequency = midiHz(note);
  const n = Math.min(out.length - start, Math.round(1.8 * SAMPLE_RATE));
  const partials = [
    [1, 1, 1.3],
    [1.0035, 0.5, 1.2],
    [2.02, 0.42, 0.55],
    [2.76, 0.26, 0.4],
    [4.07, 0.1, 0.22],
  ];
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const [ratio, amp, decay] of partials)
      v += Math.sin(TAU * frequency * ratio * t) * amp * Math.exp(-t / decay);
    out[start + i] += v * gain * Math.min(1, t / 0.002);
  }
}

/**
 * Gambang note (wooden bar), re-exported for the score.
 * @param {Float32Array} out
 * @param {number} start sample
 * @param {number} note MIDI
 * @param {number} gain
 */
export function gambang(out, start, note, gain) {
  if (start < 0 || start >= out.length) return;
  mallet(Math.round(1.2 * SAMPLE_RATE), midiHz(note), gain, out, start);
}

/**
 * Seruling: one legato line. Notes that touch are slurred (the pitch glides, the breath does not stop); vibrato
 * grows on held notes; breath noise follows the pitch; a soft chiff starts each tongued note.
 * @param {Float32Array} out
 * @param {Array<{ start: number, seconds: number, note: number, gain: number }>} notes seconds, MIDI
 * @param {() => number} random
 * @param {{ vibrato?: number, breath?: number }} [options]
 */
export function seruling(out, notes, random, { vibrato = 0.007, breath = 0.1 } = {}) {
  if (!notes.length) return;
  const pink = pinkNoise(random);
  const breathBand = new Biquad('bandpass', 1000, 1.5);
  const chiffBand = new Biquad('bandpass', 3000, 1.2);
  const first = Math.max(0, Math.round(notes[0].start * SAMPLE_RATE));
  const lastNote = notes.at(-1);
  const end = Math.min(out.length, Math.round((lastNote.start + lastNote.seconds + 0.4) * SAMPLE_RATE));
  const attackK = 1 - Math.exp(-1 / (0.04 * SAMPLE_RATE));
  const releaseK = 1 - Math.exp(-1 / (0.09 * SAMPLE_RATE));
  const glideK = 1 - Math.exp(-1 / (0.035 * SAMPLE_RATE));
  let k = 0;
  let frequency = midiHz(notes[0].note);
  let amp = 0;
  let phase = 0;
  let vibPhase = 0;
  let chiffAt = -1;
  for (let i = first; i < end; i++) {
    const t = i / SAMPLE_RATE;
    if (k < notes.length - 1 && t >= notes[k + 1].start) {
      const previousEnd = notes[k].start + notes[k].seconds;
      k++;
      if (notes[k].start - previousEnd > 0.02) chiffAt = t;
    }
    if (k === 0 && chiffAt < 0) chiffAt = notes[0].start;
    const note = notes[k];
    const local = t - note.start;
    const next = notes[k + 1];
    const slurred = next && next.start - (note.start + note.seconds) <= 0.02;
    const target = local >= 0 && (t < note.start + note.seconds || slurred) ? note.gain : 0;
    amp += (target - amp) * (target > amp ? attackK : releaseK);
    frequency += (midiHz(note.note) - frequency) * glideK;
    const depth = vibrato * Math.min(1, Math.max(0, (local - 0.25) / 0.45));
    vibPhase += (TAU * 5.2) / SAMPLE_RATE;
    phase += (TAU * frequency * (1 + depth * Math.sin(vibPhase))) / SAMPLE_RATE;
    if (i % 64 === 0) breathBand.set('bandpass', frequency * 2, 1.4);
    const tone = Math.sin(phase) + 0.2 * Math.sin(2 * phase + 0.3) + 0.06 * Math.sin(3 * phase + 1.1);
    const noise = pink();
    const air = breathBand.process(noise) * breath * 5;
    const sinceChiff = t - chiffAt;
    const chiff =
      sinceChiff >= 0 && sinceChiff < 0.06
        ? chiffBand.process(noise) * Math.exp(-sinceChiff / 0.015) * 0.5
        : 0;
    out[i] += (tone * 0.8 + air) * amp + chiff * amp;
  }
}

/**
 * Low bowed drone: detuned saws per note through a slowly breathing low-pass, faded in and out (equal power).
 * @param {Float32Array} out
 * @param {number} from sample
 * @param {number} to sample
 * @param {number[]} notes MIDI
 * @param {number} gain
 * @param {() => number} random
 * @param {{ cutoff?: number, attack?: number, release?: number, breathe?: number }} [options]
 */
export function drone(
  out,
  from,
  to,
  notes,
  gain,
  random,
  { cutoff = 650, attack = 0.8, release = 1.2, breathe = 0.12 } = {},
) {
  const end = Math.min(out.length, to + Math.round(release * SAMPLE_RATE));
  const voices = notes.flatMap((note) =>
    [0.997, 1.003].map((detune) => ({ step: (midiHz(note) * detune) / SAMPLE_RATE, phase: random() })),
  );
  const filter = new Biquad('lowpass', cutoff, 0.9);
  const lfoPhase = random() * TAU;
  const scale = gain / voices.length;
  for (let i = Math.max(0, from); i < end; i++) {
    const t = (i - from) / SAMPLE_RATE;
    let v = 0;
    for (const voice of voices) {
      voice.phase += voice.step;
      if (voice.phase >= 1) voice.phase -= 1;
      v += voice.phase * 2 - 1;
    }
    if (i % 128 === 0)
      filter.set('lowpass', cutoff * (1 + 0.35 * Math.sin(TAU * breathe * t + lfoPhase)), 0.9);
    // Equal-power fades: a release overlapping an attack of the same length keeps the level (chord changes, and a
    // loop's wrapped tail over its head).
    const fadeIn = Math.sin(Math.min(1, t / attack) * Math.PI * 0.5);
    const fadeOut = i < to ? 1 : Math.cos(Math.min(1, (i - to) / (release * SAMPLE_RATE)) * Math.PI * 0.5);
    out[i] += filter.process(v) * scale * fadeIn * fadeOut;
  }
}
