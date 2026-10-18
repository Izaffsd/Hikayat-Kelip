/**
 * The score (TECHNICAL §10, GDD "Music system"): original music, synthesised from tools/audio/instruments.mjs.
 * Every stem of every region shares one tempo, one bar length and one 8-bar progression in D minor, so the
 * MusicSystem can layer and crossfade them on bar lines. Tok Wan's theme is a simple folk melody; it comes in on the
 * seruling (story) and on the gambus (Kampung Berembang, "solo gambus, soft rebana").
 *
 * A stem is rendered with a tail past its loop end (gongs and reverb still ringing), and the tail is added back into
 * its head, so it loops without a seam. Stingers are one-shots for story moments.
 */
import { SAMPLE_RATE, bell, reverb, rng } from './synth.mjs';
import {
  bonang,
  drone,
  gambang,
  gambus,
  gambusBody,
  gong,
  rebanaDum,
  rebanaTak,
  seruling,
} from './instruments.mjs';

export const BPM = 80;
export const BEATS_PER_BAR = 4;
const BEAT = 60 / BPM;
const BAR = BEAT * BEATS_PER_BAR;
/** Seconds rendered past a loop's end and wrapped into its head. */
const TAIL = 7;

/**
 * Tok Wan's theme (original): [beats, MIDI note], 8 bars of 4/4 over Dm | C | B♭ | C | Dm | F | C | Dm.
 * D F G A. G | F E D E— | F A C D. C | A G F G— | A D C A G | F G A F E | D F E C E | D———
 */
export const THEME = Object.freeze([
  [1, 62],
  [0.5, 65],
  [0.5, 67],
  [1.5, 69],
  [0.5, 67],
  [1, 65],
  [0.5, 64],
  [0.5, 62],
  [2, 64],
  [1, 65],
  [0.5, 69],
  [0.5, 72],
  [1.5, 74],
  [0.5, 72],
  [1, 69],
  [0.5, 67],
  [0.5, 65],
  [2, 67],
  [1, 69],
  [1, 74],
  [0.5, 72],
  [0.5, 69],
  [1, 67],
  [1, 65],
  [0.5, 67],
  [0.5, 69],
  [1, 65],
  [1, 64],
  [1, 62],
  [0.5, 65],
  [0.5, 64],
  [1, 60],
  [1, 64],
  [4, 62],
]);

/** Chord tones per bar (MIDI), low to high: Dm | C | B♭ | C | Dm | F | C | Dm. */
const CHORDS = [
  [50, 57, 62, 65],
  [48, 55, 60, 64],
  [46, 53, 58, 62],
  [48, 55, 60, 64],
  [50, 57, 62, 65],
  [53, 60, 65, 69],
  [48, 55, 60, 64],
  [50, 57, 62, 65],
];

/**
 * Sample index of a bar and beat (both from 0).
 * @param {number} bar
 * @param {number} [beat=0]
 */
const at = (bar, beat = 0) => Math.round((bar * BAR + beat * BEAT) * SAMPLE_RATE);

/** A few milliseconds of human timing, always late (a note on beat 1 must not start before the loop does). */
const nudge = (random, ms = 8) => Math.round(random() * ms * 0.001 * SAMPLE_RATE);

/**
 * The theme's notes from `startBar`, as { beat, beats, note } (beat counted from bar 0).
 * @param {number} [transpose=0] semitones
 * @param {number} [startBar=0]
 * @param {number} [bars=8] how many bars of the theme
 */
function themeNotes(transpose = 0, startBar = 0, bars = 8) {
  const notes = [];
  let beat = 0;
  for (const [beats, note] of THEME) {
    if (beat >= bars * BEATS_PER_BAR) break;
    notes.push({ beat: startBar * BEATS_PER_BAR + beat, beats, note: note + transpose });
    beat += beats;
  }
  return notes;
}

/**
 * Renders a seamless loop of `bars` bars.
 * @param {number} bars
 * @param {(out: Float32Array) => void} draw adds the dry parts (may run past the loop end into the tail)
 * @param {number} wet reverb mix
 * @param {number} [room=0.84]
 * @returns {Float32Array}
 */
function renderLoop(bars, draw, wet, room = 0.84) {
  const length = Math.round(bars * BAR * SAMPLE_RATE);
  const full = new Float32Array(length + Math.round(TAIL * SAMPLE_RATE));
  draw(full);
  const mixed = reverb(full, wet, room);
  const out = mixed.slice(0, length);
  for (let i = length; i < mixed.length; i++) out[(i - length) % length] += mixed[i];
  return out;
}

/**
 * Adds `track` into `out` at `gain`.
 * @param {Float32Array} out
 * @param {Float32Array} track
 * @param {number} gain
 */
function mix(out, track, gain) {
  for (let i = 0; i < out.length; i++) out[i] += track[i] * gain;
}

/** Bass on the gambus's low course: the bar's root on beat 1, again on beat 3. */
function gambusBass(track, bars, random, gain) {
  for (let bar = 0; bar < bars; bar++) {
    const root = CHORDS[bar % 8][0];
    gambus(track, at(bar, 0) + nudge(random), root, BEAT * 1.9, gain, random, { brightness: 0.4 });
    gambus(track, at(bar, 2) + nudge(random), root, BEAT * 1.9, gain * 0.7, random, { brightness: 0.4 });
  }
}

/**
 * Kampung Berembang, explore (16 bars): solo gambus plays the theme, then answers it with arpeggios and the theme's
 * head; soft rebana underneath.
 * @param {number} seed
 */
function kampungGambus(seed) {
  const random = rng(seed);
  return renderLoop(
    16,
    (out) => {
      const track = new Float32Array(out.length);
      for (const n of themeNotes(0, 0)) {
        const start = at(0, n.beat) + nudge(random);
        if (n.beats >= 1.5 && random() < 0.7) {
          // A grace note from above leans into long notes.
          gambus(track, start - Math.round(0.06 * SAMPLE_RATE), n.note + 2, 0.06, 0.3, random);
        }
        gambus(track, start, n.note, n.beats * BEAT * 0.97, 0.55 * (0.9 + random() * 0.2), random, {
          tremolo: n.beats >= 2 ? 0.094 : 0,
        });
      }
      const pattern = [0, 1, 2, 1, 3, 1, 2, 1];
      for (let bar = 8; bar < 16; bar++) {
        if (bar === 12 || bar === 13) continue;
        const chord = CHORDS[bar % 8].map((note) => note + 12);
        const eighths = bar === 15 ? 2 : 8;
        for (let e = 0; e < eighths; e++) {
          const note = chord[pattern[e]];
          gambus(track, at(bar, e * 0.5) + nudge(random), note, BEAT * 0.55, e % 2 ? 0.26 : 0.36, random, {
            brightness: 0.5,
          });
        }
        if (bar === 15) gambus(track, at(bar, 1), 62, BEAT * 2.8, 0.45, random, { tremolo: 0.094 });
      }
      for (const n of themeNotes(0, 12, 2)) {
        gambus(track, at(0, n.beat) + nudge(random), n.note, n.beats * BEAT * 0.97, 0.5, random, {
          tremolo: n.beats >= 2 ? 0.094 : 0,
        });
      }
      gambusBass(track, 16, random, 0.24);
      mix(out, gambusBody(track), 1);
      for (let bar = 0; bar < 16; bar++) {
        rebanaDum(out, at(bar, 0) + nudge(random, 5), 0.2, random);
        rebanaTak(out, at(bar, 2) + nudge(random, 5), 0.14, random);
        rebanaTak(out, at(bar, 3.5) + nudge(random, 5), 0.06, random);
        if (bar % 4 === 3) {
          rebanaTak(out, at(bar, 3) + nudge(random, 5), 0.1, random);
          rebanaDum(out, at(bar, 3.75) + nudge(random, 5), 0.16, random, 1.1);
        }
      }
    },
    0.28,
  );
}

/**
 * Danger (8 bars): a low drone with a rubbing E♭, a slow heartbeat on the rebana, gongs marking the cycle and a
 * high gambang note that will not resolve.
 * @param {number} seed
 */
function kampungDanger(seed) {
  const random = rng(seed);
  return renderLoop(
    8,
    (out) => {
      const length = at(8);
      drone(out, 0, length, [38, 45], 0.55, random, { cutoff: 520, attack: 1.4, release: 1.4 });
      for (const bar of [3, 7])
        drone(out, at(bar), at(bar + 1), [51], 0.2, random, { cutoff: 900, attack: 1.2, release: 1.6 });
      for (let bar = 0; bar < 8; bar++) {
        for (const beat of [0, 2]) {
          rebanaDum(out, at(bar, beat), 0.5, random, 0.82);
          rebanaDum(out, at(bar, beat + 0.33), 0.3, random, 0.78);
        }
      }
      gong(out, at(0), 38, 0.55, random, 6);
      gong(out, at(4), 45, 0.3, random, 4);
      [86, 87, 86, 87].forEach((note, k) => gambang(out, at(1 + k * 2, 2) + nudge(random), note, 0.1));
    },
    0.35,
  );
}

/**
 * Silat combat (8 bars): a driving rebana pattern on sixteenths, a gambang ostinato on the chords, gambus bass and
 * the theme's head as a call, gongs on the cycle.
 * @param {number} seed
 */
function silatCombat(seed) {
  const random = rng(seed);
  const sixteenth = 0.25;
  return renderLoop(
    8,
    (out) => {
      const dums = [
        [0, 0.6],
        [3, 0.4],
        [8, 0.55],
        [11, 0.4],
      ];
      const taks = [
        [4, 0.38],
        [6, 0.3],
        [12, 0.38],
        [14, 0.3],
        [15, 0.22],
        [2, 0.1],
        [10, 0.1],
      ];
      for (let bar = 0; bar < 8; bar++) {
        for (const [step, gain] of dums) {
          if (bar === 7 && step > 8) continue;
          rebanaDum(out, at(bar, step * sixteenth) + nudge(random, 4), gain, random);
        }
        if (bar === 7) {
          for (let step = 8; step < 16; step++)
            rebanaTak(out, at(bar, step * sixteenth) + nudge(random, 3), 0.18 + (step - 8) * 0.035, random);
        } else {
          for (const [step, gain] of taks)
            rebanaTak(out, at(bar, step * sixteenth) + nudge(random, 4), gain, random);
        }
        const chord = CHORDS[bar].map((note) => note + 12);
        [0, 1, 2, 1, 3, 1, 2, 1].forEach((index, e) =>
          gambang(out, at(bar, e * 0.5) + nudge(random, 4), chord[index], e % 2 ? 0.14 : 0.2),
        );
      }
      const track = new Float32Array(out.length);
      for (let bar = 0; bar < 8; bar++) {
        const root = CHORDS[bar][0];
        gambus(track, at(bar, 0), root, BEAT * 0.9, 0.5, random, { brightness: 0.45 });
        gambus(track, at(bar, 1.5), root, BEAT * 0.45, 0.32, random, { brightness: 0.45 });
        gambus(track, at(bar, 3), root + 7, BEAT * 0.9, 0.34, random, { brightness: 0.45 });
      }
      for (const bar of [0, 4]) {
        [62, 65, 67, 69].forEach((note, e) =>
          gambus(track, at(bar, 2 + e * 0.5), note + 12, BEAT * 0.48, 0.42, random, { brightness: 0.75 }),
        );
      }
      mix(out, gambusBody(track), 1);
      gong(out, at(0), 38, 0.55, random, 4);
      gong(out, at(4), 38, 0.4, random, 4);
    },
    0.22,
  );
}

/**
 * Story (8 bars): the seruling sings Tok Wan's theme an octave up over a soft drone of the chords, a gong at the
 * start of the cycle and quiet gambang bells.
 * @param {number} seed
 */
function themeSeruling(seed) {
  const random = rng(seed);
  return renderLoop(
    8,
    (out) => {
      const notes = themeNotes(12, 0).map((n, i, all) => {
        const next = all[i + 1];
        // Breathe at the ends of bars 2, 4 and 6.
        const breath = next && next.beat % 8 === 0 ? 0.14 : 0;
        const phrase = n.beat < 16 ? 0.3 : 0.36;
        return {
          start: n.beat * BEAT,
          seconds: n.beats * BEAT - breath,
          note: n.note,
          gain: phrase * (0.92 + random() * 0.1),
        };
      });
      seruling(out, notes, random, { vibrato: 0.008, breath: 0.09 });
      for (let bar = 0; bar < 8; bar++) {
        const chord = CHORDS[bar];
        drone(out, at(bar), at(bar + 1), [chord[0], chord[1]], 0.16, random, {
          cutoff: 800,
          attack: 0.8,
          release: 0.8,
        });
        gambang(out, at(bar, 0) + nudge(random), chord[3] + 12, 0.07);
        gambang(out, at(bar, 2) + nudge(random), chord[2] + 12, 0.05);
      }
      gong(out, at(0), 38, 0.35, random, 6);
    },
    0.4,
    0.86,
  );
}

/**
 * The prologue's storm (8 bars): a running rebana pulse, the low drone with its E♭, gongs, and the gambus's low
 * course in tremolo on the roots.
 * @param {number} seed
 */
function prologueStorm(seed) {
  const random = rng(seed);
  return renderLoop(
    8,
    (out) => {
      drone(out, 0, at(8), [38, 45], 0.5, random, { cutoff: 480, attack: 1.4, release: 1.4 });
      for (const bar of [3, 7])
        drone(out, at(bar), at(bar + 1), [51], 0.18, random, { cutoff: 900, attack: 1, release: 1.4 });
      for (let bar = 0; bar < 8; bar++) {
        for (let beat = 0; beat < 4; beat++) {
          rebanaDum(out, at(bar, beat) + nudge(random, 4), beat % 2 ? 0.38 : 0.5, random, 0.9);
          rebanaTak(out, at(bar, beat + 0.5) + nudge(random, 4), 0.2, random);
          rebanaTak(out, at(bar, beat + 0.75) + nudge(random, 4), 0.08, random);
        }
      }
      const track = new Float32Array(out.length);
      for (let bar = 0; bar < 8; bar++) {
        gambus(track, at(bar, bar % 2 ? 2 : 0), CHORDS[bar][0], BEAT * 1.9, 0.32, random, {
          tremolo: 0.094,
          brightness: 0.5,
        });
      }
      mix(out, gambusBody(track), 1);
      gong(out, at(0), 38, 0.55, random, 6);
      gong(out, at(4), 38, 0.4, random, 5);
    },
    0.3,
  );
}

/**
 * Sawah Emas, explore (16 bars; GDD: light gamelan Melayu, flute): the theme on the bonang an octave up over a
 * gambang lilting through the chords, then an interlocking pair of bonang lines on the chords while the seruling
 * answers with the theme's opening; a light gendang (rebana) dance and small gongs on the cycle.
 * @param {number} seed
 */
function sawahGamelan(seed) {
  const random = rng(seed);
  return renderLoop(
    16,
    (out) => {
      for (const n of themeNotes(12, 0)) {
        bonang(out, at(0, n.beat) + nudge(random), n.note, 0.3);
        // A bonang cannot hold a note: long ones are struck again, softer.
        if (n.beats >= 1.5) bonang(out, at(0, n.beat + n.beats / 2) + nudge(random), n.note, 0.15);
      }
      const lilt = [0, 2, 1, 2, 3, 2, 1, 2];
      for (let bar = 0; bar < 16; bar++) {
        const chord = CHORDS[bar % 8].map((note) => note + 12);
        lilt.forEach((index, e) =>
          gambang(out, at(bar, e * 0.5) + nudge(random, 4), chord[index], e % 2 ? 0.05 : 0.08),
        );
      }
      for (let bar = 8; bar < 16; bar++) {
        const chord = CHORDS[bar % 8].map((note) => note + 24);
        for (let s16 = 0; s16 < 16; s16++) {
          // Two parts that fill each other's gaps (imbal-like): one on the even sixteenths, one on the odd.
          const part = s16 % 2 ? [3, 1, 2, 1] : [0, 2, 1, 2];
          const note = chord[part[(s16 >> 1) % 4]];
          bonang(out, at(bar, s16 * 0.25) + nudge(random, 3), note, s16 % 2 ? 0.08 : 0.11);
        }
      }
      const answer = themeNotes(12, 8, 4).map((n) => ({
        start: n.beat * BEAT,
        seconds: n.beats * BEAT - 0.05,
        note: n.note,
        gain: 0.24 * (0.92 + random() * 0.1),
      }));
      seruling(out, answer, random, { vibrato: 0.007, breath: 0.08 });
      for (let bar = 0; bar < 16; bar++) {
        rebanaDum(out, at(bar, 0) + nudge(random, 4), 0.26, random, 1.1);
        rebanaTak(out, at(bar, 1.5) + nudge(random, 4), 0.12, random, 1.1);
        rebanaTak(out, at(bar, 2.5) + nudge(random, 4), 0.1, random, 1.1);
        rebanaDum(out, at(bar, 3) + nudge(random, 4), 0.18, random, 1.15);
        rebanaDum(out, at(bar, 3.5) + nudge(random, 4), 0.12, random, 1.15);
      }
      gong(out, at(0), 45, 0.3, random, 4);
      gong(out, at(8), 45, 0.24, random, 4);
    },
    0.3,
  );
}

/** Stinger: wonder (the display begins): a rising gambang run into a shimmer of bells. */
function stingWonder(seed) {
  const random = rng(seed);
  const out = new Float32Array(Math.round(5 * SAMPLE_RATE));
  [62, 65, 67, 69, 72, 74, 77, 79, 81, 86].forEach((note, k) =>
    gambang(out, Math.round(k * 0.085 * SAMPLE_RATE), note, 0.22 + k * 0.012),
  );
  for (let k = 0; k < 6; k++) {
    bell(
      Math.round(2.4 * SAMPLE_RATE),
      1174.7 * 2 ** ([0, 7, 12, 3, 10, 15][k] / 12) * (1 + (random() - 0.5) * 0.004),
      0.9,
      0.07,
      out,
      Math.round((0.85 + k * 0.07) * SAMPLE_RATE),
    );
  }
  gong(out, Math.round(0.85 * SAMPLE_RATE), 45, 0.25, random, 3);
  return reverb(out, 0.45, 0.86);
}

/** Stinger: Kelam (the lights go out): a deep gong, a drone sinking onto a rubbing E♭ and a falling line. */
function stingKelam(seed) {
  const random = rng(seed);
  const out = new Float32Array(Math.round(7 * SAMPLE_RATE));
  gong(out, 0, 38, 0.7, random, 5);
  drone(out, Math.round(0.2 * SAMPLE_RATE), Math.round(4 * SAMPLE_RATE), [38, 39], 0.45, random, {
    cutoff: 420,
    attack: 1.6,
    release: 2.2,
  });
  [74, 72, 70, 69, 67, 63].forEach((note, k) =>
    gambang(out, Math.round((0.6 + k * 0.42) * SAMPLE_RATE), note, 0.16 - k * 0.015),
  );
  return reverb(out, 0.42, 0.86);
}

/** Stinger: a win (race, trial medal): a gambang flourish, a bright chord and the rebana answering. */
function stingWin(seed) {
  const random = rng(seed);
  const out = new Float32Array(Math.round(3.2 * SAMPLE_RATE));
  [62, 65, 67, 69, 72, 74].forEach((note, k) => gambang(out, Math.round(k * 0.07 * SAMPLE_RATE), note, 0.22));
  for (const note of [74, 81, 86]) gambang(out, Math.round(0.5 * SAMPLE_RATE), note, 0.24);
  rebanaDum(out, Math.round(0.5 * SAMPLE_RATE), 0.45, random);
  rebanaTak(out, Math.round(0.69 * SAMPLE_RATE), 0.3, random);
  rebanaDum(out, Math.round(0.875 * SAMPLE_RATE), 0.4, random);
  gong(out, Math.round(0.5 * SAMPLE_RATE), 45, 0.28, random, 2.5);
  return reverb(out, 0.3);
}

/** Stem generators by name: (seed) => Float32Array, an exact whole number of bars. */
export const STEM_GENERATORS = Object.freeze({
  kampungGambus,
  sawahGamelan,
  kampungDanger,
  silatCombat,
  themeSeruling,
  prologueStorm,
});

/** One-shot stingers by name: (seed) => Float32Array. */
export const STING_GENERATORS = Object.freeze({ stingWonder, stingKelam, stingWin });
