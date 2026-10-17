import { describe, expect, it } from 'vitest';
import { PathMover } from '../../src/ai/PathMover.js';
import { RaceTimer, formatRaceTime } from '../../src/competitive/RaceTimer.js';
import { EventBus } from '../../src/core/EventBus.js';
import { EV } from '../../src/core/events.js';
import { createDefaultSave } from '../../src/core/saveSchema.js';

const PATH = [
  { x: 0, y: 1, z: 0 },
  { x: 0, y: 1, z: 10 },
  { x: 0, y: 3, z: 14 },
  { x: 0, y: 3, z: 20 },
];

describe('PathMover', () => {
  it('walks the ground length of a path and leaps where it steps up', () => {
    const mover = new PathMover({ leapHeight: 1, leapMinRise: 0.6 });
    mover.setPath(PATH);
    expect(mover.length).toBeCloseTo(20, 5);
    const p = { x: 0, y: 0, z: 0 };
    mover.advance(5, p);
    expect(p).toMatchObject({ x: 0, y: 1, z: 5 });
    expect(mover.lift).toBe(0);
    mover.advance(7, p); // halfway up the 2 m step: on the arc
    expect(p.z).toBeCloseTo(12, 5);
    expect(mover.lift).toBeCloseTo(1, 5);
    expect(p.y).toBeCloseTo(3, 5); // 2 + the arc's top
    mover.advance(100, p);
    expect(mover.done).toBe(true);
    expect(p).toMatchObject({ x: 0, y: 3, z: 20 });
  });

  it('keeps a lead: bolts when the player closes in, waits when he falls behind', () => {
    const mover = new PathMover({ leapHeight: 1, leapMinRise: 0.6 });
    mover.setPath(PATH);
    mover.s = 12;
    const lead = { lead: 6, leadMax: 12, runSpeed: 6, catchUpSpeed: 9 };
    expect(mover.leadSpeed({ x: 0, z: 10 }, lead)).toBe(9); // 2 m behind
    expect(mover.leadSpeed({ x: 0, z: 7 }, lead)).toBe(6); // 5 m behind
    expect(mover.leadSpeed({ x: 0, z: 0 }, lead)).toBe(0); // 12 m behind: waits
    expect(mover.leadSpeed({ x: 0, z: 3 }, lead)).toBeCloseTo(3, 5); // 9 m: slowing
  });
});

describe('RaceTimer', () => {
  it('times a race on game ticks, keeps the best time and reports records', () => {
    const bus = new EventBus();
    const doc = createDefaultSave(0);
    const results = [];
    bus.on(EV.RACE_FINISHED, (r) => results.push(r));
    const timer = new RaceTimer({ bus, doc });
    timer.start('1.1');
    for (let i = 0; i < 60 * 15; i++) timer.fixedUpdate(1 / 60);
    expect(timer.finish(true)).toMatchObject({ id: '1.1', seconds: 15, won: true, best: 15, record: true });
    timer.start('1.1');
    for (let i = 0; i < 60 * 16; i++) timer.fixedUpdate(1 / 60);
    expect(timer.finish(false)).toMatchObject({ seconds: 16, won: false, best: 15, record: false });
    expect(doc.missions.best['1.1']).toBe(15);
    expect(results).toHaveLength(2);
    expect(timer.finish(true)).toBeNull(); // not running
  });

  it('formats m:ss.cc', () => {
    expect(formatRaceTime(0)).toBe('0:00.00');
    expect(formatRaceTime(14.567)).toBe('0:14.57');
    expect(formatRaceTime(75.2)).toBe('1:15.20');
  });
});
