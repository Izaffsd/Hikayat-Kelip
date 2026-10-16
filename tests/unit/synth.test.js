import { describe, expect, it } from 'vitest';
import { GENERATORS, LOOP_GENERATORS, SAMPLE_RATE, encodeWav, seamless } from '../../tools/audio/synth.mjs';

describe('procedural sound synthesis', () => {
  it('is deterministic per seed and varies between seeds', () => {
    const a = GENERATORS.kelipTwinkle(1);
    const b = GENERATORS.kelipTwinkle(1);
    const c = GENERATORS.kelipTwinkle(2);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('seamless() joins the loop end to its start without a jump', () => {
    const frequency = 97.3;
    const render = (n) =>
      Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE));
    const loop = seamless(render, 1, 0.25);
    expect(loop.length).toBe(SAMPLE_RATE);
    const step = (2 * Math.PI * frequency) / SAMPLE_RATE;
    expect(Math.abs(loop[0] - loop[loop.length - 1])).toBeLessThanOrEqual(step * 1.01);
  });

  it('every loop generator is registered and renders finite samples', () => {
    for (const name of LOOP_GENERATORS) expect(GENERATORS[name], name).toBeTypeOf('function');
    const samples = GENERATORS.glideWind(1);
    expect(samples.length).toBe(4 * SAMPLE_RATE);
    expect(samples.every(Number.isFinite)).toBe(true);
  });

  it('encodes 16-bit mono WAV with a correct header', () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1]));
    expect(wav.toString('latin1', 0, 4)).toBe('RIFF');
    expect(wav.toString('latin1', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(SAMPLE_RATE);
    expect(wav.readUInt32LE(40)).toBe(8);
  });
});
