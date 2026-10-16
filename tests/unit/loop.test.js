import { describe, expect, it } from 'vitest';
import { Loop } from '../../src/core/Loop.js';
import { Time } from '../../src/core/Time.js';

// Frame times are slightly above 1/60 s so tick counts are exact despite floating-point rounding.
const FRAME_60 = 16.7;

function makeLoop(options = {}) {
  const time = new Time(60);
  const log = { fixed: 0, frames: 0, starts: 0 };
  const loop = new Loop({
    time,
    onFrameStart: () => log.starts++,
    onFixed: () => log.fixed++,
    onFrame: () => log.frames++,
    ...options,
  });
  return { time, loop, log };
}

describe('Loop (fixed step + interpolation)', () => {
  it('runs one tick per 60 Hz frame and keeps alpha in [0,1)', () => {
    const { time, loop, log } = makeLoop();
    loop.step(0);
    for (let i = 1; i <= 60; i++) loop.step(i * FRAME_60);
    expect(log.fixed).toBe(60);
    expect(time.tick).toBe(60);
    expect(log.starts).toBe(61);
    expect(time.alpha).toBeGreaterThanOrEqual(0);
    expect(time.alpha).toBeLessThan(1);
  });

  it('runs two ticks per frame at 30 FPS and none on some frames at 120 FPS', () => {
    const a = makeLoop();
    a.loop.step(0);
    a.loop.step(33.4);
    expect(a.loop.lastSteps).toBe(2);

    const b = makeLoop();
    b.loop.step(0);
    const counts = [];
    for (let i = 1; i <= 4; i++) {
      b.loop.step(i * 8.4);
      counts.push(b.loop.lastSteps);
    }
    expect(counts.reduce((s, n) => s + n, 0)).toBe(2);
    expect(counts).toContain(0);
  });

  it('caps steps per frame and clamps long frames', () => {
    const { loop, log } = makeLoop({ maxSteps: 5, maxFrameDt: 0.25 });
    loop.step(0);
    loop.step(5000); // a 5 s hitch is clamped to 0.25 s = 15 ticks, capped at 5
    expect(log.fixed).toBe(5);
    expect(loop.droppedFrames).toBe(1);
  });

  it('time scale slows the simulation, hit-stop freezes it', () => {
    const { time, loop } = makeLoop();
    time.setScale('slowmo', 0.5);
    loop.step(0);
    for (let i = 1; i <= 60; i++) loop.step(i * FRAME_60);
    expect(time.tick).toBe(30);

    time.setScale('slowmo', 1);
    time.hitStop(0.1);
    const before = time.tick;
    loop.step(61 * FRAME_60);
    loop.step(62 * FRAME_60);
    expect(time.tick).toBe(before);
    expect(time.hitStopRemaining).toBeGreaterThan(0);
  });

  it('combines named time scales multiplicatively', () => {
    const time = new Time();
    time.setScale('assist', 0.8);
    time.setScale('slowmo', 0.5);
    expect(time.scale).toBeCloseTo(0.4);
    time.setScale('assist', 1);
    expect(time.scale).toBeCloseTo(0.5);
  });

  it('a 30 FPS cap renders every other 60 Hz vsync but simulates every tick', () => {
    const { time, loop, log } = makeLoop();
    loop.setFpsCap(30);
    loop.step(0);
    for (let i = 1; i <= 60; i++) loop.step(i * FRAME_60);
    expect(log.frames).toBe(31); // first frame + 30 rendered
    expect(time.tick).toBe(60);
  });

  it('converts between seconds and ticks', () => {
    const time = new Time(60);
    expect(time.secondsToTicks(0.15)).toBe(9);
    expect(time.ticksToSeconds(30)).toBeCloseTo(0.5);
  });
});
