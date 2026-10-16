/**
 * Procedural sound synthesis for Hikayat Kelip (original sounds, no samples, deterministic by seed).
 * Every generator returns a mono Float32Array at SAMPLE_RATE; loops are made seamless by crossfading
 * the tail into the head. Rendered to WAV here, then encoded to OGG by the audio pipeline.
 */

export const SAMPLE_RATE = 44100;

/**
 * Deterministic PRNG (mulberry32).
 * @param {number} seed
 * @returns {() => number} 0..1
 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * RBJ-cookbook biquad filter state.
 */
export class Biquad {
  /**
   * @param {'lowpass'|'highpass'|'bandpass'|'peak'} type
   * @param {number} frequency
   * @param {number} q
   * @param {number} [gainDb]
   */
  constructor(type, frequency, q = 0.707, gainDb = 0) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, frequency, q, gainDb);
  }

  set(type, frequency, q = 0.707, gainDb = 0) {
    const w = (2 * Math.PI * Math.min(frequency, SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0;
    let b1;
    let b2;
    let a0;
    let a1;
    let a2;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    } else if (type === 'bandpass') {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    } else {
      const A = 10 ** (gainDb / 40);
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Pink noise generator (Paul Kellet's refined filter). */
function pinkNoise(random) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  return () => {
    const white = random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    return out * 0.11;
  };
}

/**
 * Small Freeverb-style reverb (4 combs + 2 allpasses), mixed with the dry signal.
 * @param {Float32Array} input
 * @param {number} wet 0..1
 * @param {number} [room=0.82] feedback
 * @returns {Float32Array}
 */
export function reverb(input, wet, room = 0.82) {
  const combs = [1557, 1617, 1491, 1422].map((n) => ({ buf: new Float32Array(n), i: 0, store: 0 }));
  const allpasses = [556, 441].map((n) => ({ buf: new Float32Array(n), i: 0 }));
  const out = new Float32Array(input.length);
  const damp = 0.3;
  for (let s = 0; s < input.length; s++) {
    const x = input[s] * 0.25;
    let sum = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.store = y * (1 - damp) + c.store * damp;
      c.buf[c.i] = x + c.store * room;
      c.i = (c.i + 1) % c.buf.length;
      sum += y;
    }
    for (const a of allpasses) {
      const y = a.buf[a.i];
      a.buf[a.i] = sum + y * 0.5;
      a.i = (a.i + 1) % a.buf.length;
      sum = y - sum;
    }
    out[s] = input[s] * (1 - wet) + sum * wet;
  }
  return out;
}

/**
 * Makes a buffer loop seamlessly: renders `seconds` plus `fade` extra, then crossfades the extra tail
 * into the head (equal power) and trims to exactly `seconds`.
 * @param {(n: number) => Float32Array} render renders n samples
 * @param {number} seconds
 * @param {number} [fade=1]
 * @returns {Float32Array}
 */
export function seamless(render, seconds, fade = 1) {
  const length = Math.round(seconds * SAMPLE_RATE);
  const fadeLength = Math.round(fade * SAMPLE_RATE);
  const raw = render(length + fadeLength);
  const out = raw.slice(0, length);
  for (let i = 0; i < fadeLength; i++) {
    const t = i / fadeLength;
    out[i] = out[i] * Math.sin((t * Math.PI) / 2) + raw[length + i] * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));

/** Night in a mangrove kampung: cricket chirps, a soft cicada bed and occasional frogs (loop). */
function nightInsects(seed) {
  return seamless((n) => {
    const random = rng(seed);
    const out = new Float32Array(n);
    const chirpers = Array.from({ length: 7 }, () => ({
      freq: 4200 + random() * 1300,
      period: 0.7 + random() * 0.9,
      pulses: 3 + Math.floor(random() * 3),
      offset: random() * 2,
      gain: 0.04 + random() * 0.05,
    }));
    for (const c of chirpers) {
      for (let start = c.offset; start < n / SAMPLE_RATE; start += c.period * (0.85 + random() * 0.3)) {
        for (let p = 0; p < c.pulses; p++) {
          const t0 = start + p * 0.034;
          const s0 = Math.floor(t0 * SAMPLE_RATE);
          for (let i = 0; i < 0.022 * SAMPLE_RATE && s0 + i < n; i++) {
            const t = i / SAMPLE_RATE;
            out[s0 + i] += Math.sin(2 * Math.PI * c.freq * t) * Math.sin((Math.PI * t) / 0.022) * c.gain;
          }
        }
      }
    }
    const pink = pinkNoise(random);
    const band = new Biquad('bandpass', 6200, 3);
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * 118 * t);
      out[i] += band.process(pink()) * am * 0.05;
    }
    for (let k = 0; k < Math.floor(n / SAMPLE_RATE / 3); k++) {
      const s0 = Math.floor((1 + random() * (n / SAMPLE_RATE - 2)) * SAMPLE_RATE);
      const freq = 160 + random() * 60;
      for (let i = 0; i < 0.18 * SAMPLE_RATE && s0 + i < n; i++) {
        const t = i / SAMPLE_RATE;
        out[s0 + i] +=
          Math.sin(2 * Math.PI * freq * t + 3 * Math.sin(2 * Math.PI * 40 * t)) * env(t, 0.01, 0.05) * 0.12;
      }
    }
    return out;
  }, 12);
}

/** Gentle water lapping against posts and boats (loop). */
function waterLapping(seed) {
  return seamless((n) => {
    const random = rng(seed);
    const pink = pinkNoise(random);
    const low = new Biquad('lowpass', 520, 0.9);
    const glug = new Biquad('bandpass', 1100, 4);
    const out = new Float32Array(n);
    const laps = [];
    for (let t = 0; t < n / SAMPLE_RATE; t += 0.35 + random() * 0.6)
      laps.push({ t, len: 0.3 + random() * 0.5, g: 0.5 + random() * 0.6 });
    let lapIndex = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      while (lapIndex < laps.length - 1 && laps[lapIndex + 1].t <= t) lapIndex++;
      const lap = laps[lapIndex];
      const u = (t - lap.t) / lap.len;
      const shape = u >= 0 && u <= 1 ? Math.sin(Math.PI * u) ** 2 * lap.g : 0;
      const noise = pink();
      out[i] = low.process(noise) * (0.25 + shape) * 0.9 + glug.process(noise) * shape * 0.35;
    }
    return out;
  }, 10);
}

/** Heavy storm rain on attap roofs and water (loop). */
function rainStorm(seed) {
  return seamless((n) => {
    const random = rng(seed);
    const pink = pinkNoise(random);
    const hp = new Biquad('highpass', 420, 0.7);
    const lp = new Biquad('lowpass', 8200, 0.7);
    const rumble = new Biquad('lowpass', 140, 0.8);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = pink();
      out[i] = lp.process(hp.process(p)) * 0.55 + rumble.process(p) * 0.35;
      if (random() < 0.004) {
        const len = Math.floor((0.004 + random() * 0.01) * SAMPLE_RATE);
        const g = 0.15 + random() * 0.25;
        for (let k = 0; k < len && i + k < n; k++)
          out[i + k] += (random() * 2 - 1) * g * Math.exp(-k / (len * 0.3));
      }
    }
    return out;
  }, 8);
}

/** Storm wind with gusts (loop). */
function windStorm(seed) {
  return seamless(
    (n) => {
      const random = rng(seed);
      const pink = pinkNoise(random);
      const band = new Biquad('bandpass', 400, 1.2);
      const out = new Float32Array(n);
      const gust = rng(seed + 1);
      let target = 0.5;
      let level = 0.5;
      for (let i = 0; i < n; i++) {
        if (i % 4410 === 0) target = 0.3 + gust() * 0.9;
        level += (target - level) * 0.0004;
        if (i % 64 === 0) band.set('bandpass', 220 + level * 700, 1.1);
        out[i] = band.process(pink()) * level * 1.6;
      }
      return out;
    },
    10,
    1.5,
  );
}

/** Thunder: a crack, then a long rolling rumble (one-shot). */
function thunder(seed) {
  const random = rng(seed);
  const n = Math.round(5.5 * SAMPLE_RATE);
  const pink = pinkNoise(random);
  const crack = new Biquad('highpass', 900, 0.7);
  const low = new Biquad('lowpass', 180, 0.9);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const p = pink();
    const crackEnv = env(t, 0.004, 0.09);
    const rollEnv = env(t, 0.12, 1.6) * (0.75 + 0.25 * Math.sin(2 * Math.PI * (1.3 + random() * 0.02) * t));
    out[i] = crack.process(p) * crackEnv * 1.2 + low.process(p) * rollEnv * 2.2;
  }
  return reverb(out, 0.25);
}

/** Inharmonic bell partials (small chimes). */
function bell(n, frequency, decay, gain, out, startSample = 0) {
  const partials = [
    [1, 1],
    [2.76, 0.45],
    [5.4, 0.25],
    [8.93, 0.12],
  ];
  for (let i = 0; i < n && startSample + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const [ratio, amp] of partials)
      v += Math.sin(2 * Math.PI * frequency * ratio * t) * amp * Math.exp(-t / (decay / ratio ** 0.5));
    out[startSample + i] += v * gain * Math.min(1, t / 0.003);
  }
}

/** A single firefly twinkle. */
function kelipTwinkle(seed) {
  const random = rng(seed);
  const n = Math.round(0.9 * SAMPLE_RATE);
  const out = new Float32Array(n);
  bell(n, 1900 + random() * 900, 0.22, 0.35, out);
  bell(n, 2600 + random() * 1200, 0.15, 0.18, out, Math.round(0.05 * SAMPLE_RATE));
  return reverb(out, 0.35);
}

/** Kelip's call: a wave of twinkles rising across a soft shimmer bed. */
function kelipCall(seed) {
  const random = rng(seed);
  const n = Math.round(2.2 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pink = pinkNoise(random);
  const air = new Biquad('bandpass', 5200, 1.5);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    out[i] += air.process(pink()) * Math.sin((Math.PI * t) / 2.2) * 0.12;
  }
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19];
  for (let k = 0; k < 12; k++) {
    const note = scale[Math.min(scale.length - 1, Math.floor(k * 0.75))];
    const freq = 880 * 2 ** (note / 12) * (1 + (random() - 0.5) * 0.01);
    bell(Math.round(0.8 * SAMPLE_RATE), freq, 0.3, 0.16, out, Math.round((0.05 + k * 0.11) * SAMPLE_RATE));
  }
  return reverb(out, 0.45);
}

/** A great light rekindled: warm low swell, flame whoomp, and bright shimmer. */
function pelitaRelight(seed) {
  const random = rng(seed);
  const n = Math.round(3.6 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pink = pinkNoise(random);
  const flame = new Biquad('lowpass', 300, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const swell = Math.sin(Math.min(1, t / 1.8) * Math.PI * 0.5) * Math.exp(-Math.max(0, t - 1.8) / 0.9);
    const chord = [110, 165, 220, 277.2].reduce(
      (s, f, k) => s + Math.sin(2 * Math.PI * f * t + k) * (0.32 / (k + 1)),
      0,
    );
    out[i] += chord * swell * 0.55 + flame.process(pink()) * env(t, 0.25, 0.5) * 0.9;
  }
  for (let k = 0; k < 8; k++)
    bell(
      Math.round(1.2 * SAMPLE_RATE),
      1320 * 2 ** ([0, 4, 7, 12][k % 4] / 12),
      0.6,
      0.1,
      out,
      Math.round((1.1 + k * 0.09) * SAMPLE_RATE),
    );
  return reverb(out, 0.4);
}

/** Air whoosh of a swing or dodge. */
function whoosh(seed, heavy) {
  const random = rng(seed);
  const length = heavy ? 0.46 : 0.3;
  const n = Math.round(length * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pink = pinkNoise(random);
  const band = new Biquad('bandpass', 600, 1.4);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    if (i % 32 === 0)
      band.set('bandpass', (heavy ? 300 : 500) + Math.sin(Math.PI * t) * (heavy ? 1100 : 1900), 1.3);
    out[i] = band.process(pink()) * Math.sin(Math.PI * t) ** 1.5 * (heavy ? 2.6 : 2.0);
  }
  return out;
}

/** Wind rushing past the wau while gliding (loop). */
function glideWind(seed) {
  return seamless(
    (n) => {
      const random = rng(seed);
      const pink = pinkNoise(random);
      const band = new Biquad('bandpass', 900, 0.8);
      const flutter = rng(seed + 3);
      const out = new Float32Array(n);
      let f = 0;
      for (let i = 0; i < n; i++) {
        if (i % 2205 === 0) f = flutter();
        out[i] =
          band.process(pink()) * (0.8 + 0.2 * Math.sin(2 * Math.PI * (6 + f * 3) * (i / SAMPLE_RATE))) * 1.4;
      }
      return out;
    },
    4,
    0.8,
  );
}

/** Splash into water. */
function splash(seed) {
  const random = rng(seed);
  const n = Math.round(0.9 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pink = pinkNoise(random);
  const lp = new Biquad('lowpass', 2400, 0.8);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    out[i] = lp.process(pink()) * env(t, 0.006, 0.18) * 2.4;
  }
  for (let b = 0; b < 9; b++) {
    const start = Math.round((0.08 + random() * 0.5) * SAMPLE_RATE);
    const f0 = 500 + random() * 700;
    for (let i = 0; i < 0.06 * SAMPLE_RATE && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      out[start + i] += Math.sin(2 * Math.PI * (f0 + 2400 * t) * t) * env(t, 0.002, 0.02) * 0.18;
    }
  }
  return out;
}

/** A shadow wisp dissolving into motes that become fireflies. */
function wispDissolve(seed) {
  const random = rng(seed);
  const n = Math.round(1.2 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pink = pinkNoise(random);
  const band = new Biquad('bandpass', 1800, 2);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    if (i % 64 === 0) band.set('bandpass', 1800 - 1200 * Math.min(1, t / 0.6), 2);
    out[i] = band.process(pink()) * env(t, 0.05, 0.25) * 1.6;
    out[i] += Math.sin(2 * Math.PI * (420 - 180 * t) * t) * env(t, 0.02, 0.2) * 0.12;
  }
  for (let k = 0; k < 3; k++)
    bell(
      Math.round(0.6 * SAMPLE_RATE),
      2200 + k * 500,
      0.18,
      0.12,
      out,
      Math.round((0.35 + k * 0.12) * SAMPLE_RATE),
    );
  return reverb(out, 0.3);
}

/** Bright double chime for a perfect tangkis or langkah. */
function perfectChime(seed) {
  const random = rng(seed);
  const n = Math.round(1.0 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const base = 1046.5 * (1 + (random() - 0.5) * 0.01);
  bell(n, base, 0.35, 0.3, out);
  bell(n, base * 1.5, 0.3, 0.22, out, Math.round(0.06 * SAMPLE_RATE));
  return reverb(out, 0.3);
}

/** A foot splashing in shallow water. */
function stepWater(seed) {
  const random = rng(seed);
  const n = Math.round(0.32 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pink = pinkNoise(random);
  const lp = new Biquad('lowpass', 1600 + random() * 800, 0.9);
  const hp = new Biquad('highpass', 120, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    out[i] = hp.process(lp.process(pink())) * env(t, 0.004, 0.05) * 2.2;
  }
  for (let b = 0; b < 3; b++) {
    const start = Math.round((0.02 + random() * 0.12) * SAMPLE_RATE);
    const f0 = 700 + random() * 900;
    for (let i = 0; i < 0.04 * SAMPLE_RATE && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      out[start + i] += Math.sin(2 * Math.PI * (f0 + 3000 * t) * t) * env(t, 0.002, 0.012) * 0.12;
    }
  }
  return out;
}

/** Sliding along wooden planks: a gritty scrape over a low body. */
function slideScrape(seed) {
  const random = rng(seed);
  const n = Math.round(0.7 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pink = pinkNoise(random);
  const band = new Biquad('bandpass', 900, 0.9);
  const body = new Biquad('lowpass', 260, 0.8);
  let grain = 1;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    if (i % 220 === 0) grain = 0.55 + random() * 0.45;
    const shape = Math.min(1, t / 0.03) * Math.min(1, (0.7 - t) / 0.25);
    const p = pink();
    out[i] = (band.process(p) * grain * 1.8 + body.process(p) * 0.6) * shape;
  }
  return out;
}

/** Enemy attack tell: a bright rising shimmer that cuts through a fight (paired with the glow and the pose). */
function tellCue(seed) {
  const random = rng(seed);
  const n = Math.round(0.5 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const detune = 1.007 + random() * 0.003;
  let phase = 0;
  let phaseUpper = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const frequency = 620 * 2 ** (Math.min(t, 0.3) / 0.3);
    phase += (2 * Math.PI * frequency) / SAMPLE_RATE;
    phaseUpper += (2 * Math.PI * frequency * 2 * detune) / SAMPLE_RATE;
    const shape = Math.min(1, t / 0.12) ** 2 * Math.exp(-Math.max(0, t - 0.3) / 0.06);
    out[i] = (Math.sin(phase) * 0.6 + Math.sin(phaseUpper) * 0.3 + Math.sin(phase * 3.01) * 0.12) * shape;
  }
  return reverb(out, 0.2);
}

/** A cursed villager freed: the ink lifts and a warm, rising arpeggio answers. */
function freedChime(seed) {
  const random = rng(seed);
  const n = Math.round(2.4 * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const swell = Math.sin(Math.min(1, t / 0.9) * Math.PI * 0.5) * Math.exp(-Math.max(0, t - 0.9) / 0.6);
    out[i] =
      [196, 246.9, 293.7].reduce((s, f, k) => s + Math.sin(2 * Math.PI * f * t + k * 1.7), 0) * swell * 0.12;
  }
  [0, 2, 4, 7, 9, 12].forEach((note, k) => {
    const frequency = 587.3 * 2 ** (note / 12) * (1 + (random() - 0.5) * 0.004);
    bell(
      Math.round(1.2 * SAMPLE_RATE),
      frequency,
      0.45,
      0.14,
      out,
      Math.round((0.15 + k * 0.13) * SAMPLE_RATE),
    );
  });
  return reverb(out, 0.4);
}

/** A pondok kelip lantern waking: a soft bloom of air and three high bells. */
function pondokAwaken(seed) {
  const random = rng(seed);
  const n = Math.round(1.8 * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pink = pinkNoise(random);
  const air = new Biquad('bandpass', 3000, 1.2);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const bloom = env(t, 0.35, 0.45);
    const tone = Math.sin(2 * Math.PI * 330 * t) * 0.18 + Math.sin(2 * Math.PI * 495 * t) * 0.1;
    out[i] = tone * bloom + air.process(pink()) * bloom * 0.25;
  }
  [0, 7, 12].forEach((note, k) => {
    bell(
      Math.round(SAMPLE_RATE),
      1320 * 2 ** (note / 12),
      0.4,
      0.12,
      out,
      Math.round((0.25 + k * 0.1) * SAMPLE_RATE),
    );
  });
  return reverb(out, 0.35);
}

/** Wooden bar (gambang-like) mallet tone: bar modes at 1, 3.93 and 9.5 times the fundamental. */
function mallet(n, frequency, gain, out, startSample = 0) {
  const modes = [
    [1, 1, 0.5],
    [3.93, 0.35, 0.12],
    [9.5, 0.12, 0.04],
  ];
  for (let i = 0; i < n && startSample + i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const [ratio, amp, decay] of modes)
      v += Math.sin(2 * Math.PI * frequency * ratio * t) * amp * Math.exp(-t / decay);
    out[startSample + i] += v * gain * Math.min(1, t / 0.002);
  }
}

/** Race countdown beat (3, 2, 1). */
function gambangTick(seed) {
  const random = rng(seed);
  const out = new Float32Array(Math.round(0.8 * SAMPLE_RATE));
  mallet(out.length, 587.3 * (1 + (random() - 0.5) * 0.002), 0.5, out);
  return reverb(out, 0.25);
}

/** Race start: a bright three-note gambang chord. */
function gambangGo(seed) {
  const random = rng(seed);
  const out = new Float32Array(Math.round(1.5 * SAMPLE_RATE));
  [880, 1108.7, 1318.5].forEach((frequency, k) => {
    mallet(
      out.length,
      frequency * (1 + (random() - 0.5) * 0.002),
      0.35,
      out,
      Math.round(k * 0.02 * SAMPLE_RATE),
    );
  });
  return reverb(out, 0.3);
}

/** Registry of generators by name: (seed) => Float32Array. */
export const GENERATORS = Object.freeze({
  nightInsects,
  waterLapping,
  rainStorm,
  windStorm,
  thunder,
  kelipTwinkle,
  kelipCall,
  pelitaRelight,
  whooshLight: (seed) => whoosh(seed, false),
  whooshHeavy: (seed) => whoosh(seed, true),
  glideWind,
  splash,
  wispDissolve,
  perfectChime,
  stepWater,
  slideScrape,
  tellCue,
  freedChime,
  pondokAwaken,
  gambangTick,
  gambangGo,
});

/** Generators that produce seamless loops (exact length; the pipeline must not trim, fade or filter them). */
export const LOOP_GENERATORS = Object.freeze([
  'nightInsects',
  'waterLapping',
  'rainStorm',
  'windStorm',
  'glideWind',
]);

/**
 * Encodes mono float samples as 16-bit PCM WAV.
 * @param {Float32Array} samples
 * @returns {Buffer}
 */
export function encodeWav(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(samples[i] * scale * 32767))),
      44 + i * 2,
    );
  }
  return buffer;
}
