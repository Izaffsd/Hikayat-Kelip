import { afterEach, describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { EV } from '../../src/core/events.js';
import { Input } from '../../src/core/Input.js';
import { Time } from '../../src/core/Time.js';
import bindings from '../../src/data/input/bindings.json';
import tuning from '../../src/data/tuning/player.json';
import { CharacterController } from '../../src/physics/CharacterController.js';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld.js';
import { Traversal } from '../../src/player/Traversal.js';

/**
 * Movement lab: a real Rapier world built from boxes, the real CharacterController, Input and Traversal, driven
 * tick by tick with scripted input. Deterministic and headless, so movement feel regressions show up in `npm test`.
 */

const RECORDED = [
  EV.PLAYER_JUMPED,
  EV.PLAYER_LANDED,
  EV.PLAYER_RESPAWNED,
  EV.PLAYER_MANTLE,
  EV.PLAYER_LEDGE,
  EV.PLAYER_WALLRUN,
  EV.PLAYER_SLIDE,
  EV.PLAYER_GLIDE,
];

/** Floor everywhere with its top at y = 0 unless a test replaces it. */
const FLOOR = { c: [0, -0.5, 0], h: [60, 0.5, 60] };

const labs = [];
afterEach(() => {
  while (labs.length) labs.pop().physics.dispose();
});

/**
 * @param {Array<{ c: number[], h: number[], q?: number[] }>} boxes
 * @param {number[]} spawn feet position
 */
async function makeLab(boxes, spawn) {
  const physics = await PhysicsWorld.create();
  for (const box of boxes) {
    const rotation = box.q ? { x: box.q[0], y: box.q[1], z: box.q[2], w: box.q[3] } : undefined;
    physics.addStaticBox(
      { x: box.c[0], y: box.c[1], z: box.c[2] },
      { x: box.h[0], y: box.h[1], z: box.h[2] },
      { rotation },
    );
  }
  const time = new Time(60);
  const bus = new EventBus();
  const input = new Input({ bus, bindings });
  const cc = new CharacterController(physics, tuning, { x: spawn[0], y: spawn[1], z: spawn[2] });
  const traversal = new Traversal({ character: cc, tuning, input, time, bus, physics });
  const events = [];
  for (const type of RECORDED) bus.on(type, (payload) => events.push({ type, tick: time.tick, ...payload }));
  const intent = { x: 0, z: 0, magnitude: 0, sprintHeld: false };
  const lab = {
    physics,
    cc,
    traversal,
    events,
    /** World-space stick: direction (x, z), magnitude = length (≤ 1). */
    stick(x, z, sprint = false) {
      const len = Math.hypot(x, z);
      intent.x = len ? x / len : 0;
      intent.z = len ? z / len : 0;
      intent.magnitude = Math.min(1, len);
      intent.sprintHeld = sprint;
    },
    hold(action, down) {
      input.setVirtualButton(action, down);
    },
    tick(n = 1, each) {
      for (let i = 0; i < n; i++) {
        time.tick++;
        input.beginTick(time.tick);
        traversal.fixedUpdate(time.fixedDt, intent);
        physics.step(time.fixedDt);
        bus.flush();
        each?.();
      }
    },
    until(predicate, max = 600) {
      for (let i = 0; i < max && !predicate(); i++) lab.tick();
      return predicate();
    },
    get feet() {
      return { x: cc.position.x, y: cc.feetY, z: cc.position.z };
    },
    count(type, match = {}) {
      return events.filter((e) => e.type === type && Object.entries(match).every(([k, v]) => e[k] === v))
        .length;
    },
  };
  labs.push(lab);
  lab.tick(15); // settle onto the ground
  events.length = 0;
  return lab;
}

describe('ground movement', () => {
  it('never stalls on flat ground (regression: Rapier deflected or stopped grounded moves at random)', async () => {
    const lab = await makeLab([FLOOR], [0, 0.05, 0]);
    lab.stick(0, 1);
    const speeds = [];
    const steps = [];
    let lastZ = lab.feet.z;
    lab.tick(150, () => {
      speeds.push(lab.traversal.speed);
      steps.push((lab.feet.z - lastZ) * 60);
      lastZ = lab.feet.z;
    });
    expect(Math.min(...speeds.slice(15))).toBeGreaterThan(5.1);
    // Every tick actually moves the capsule (a stalled tick shows as a stutter step even when speed survives).
    expect(Math.min(...steps.slice(15))).toBeGreaterThan(5.0);
    expect(lab.count(EV.PLAYER_LANDED)).toBe(0);
    expect(lab.traversal.state).toBe('ground');
    expect(Math.abs(lab.feet.x)).toBeLessThan(0.01);
  });

  it('climbs a 40° ramp at speed and stays grounded', async () => {
    const angle = (40 * Math.PI) / 180;
    const q = [Math.sin(-angle / 2), 0, 0, Math.cos(-angle / 2)];
    const ramp = {
      c: [0, 4 * Math.sin(angle) - 0.15 * Math.cos(angle), 2 + 0.15 * Math.sin(angle) + 4 * Math.cos(angle)],
      h: [3, 0.15, 4],
      q,
    };
    const topY = 8 * Math.sin(angle);
    const landing = { c: [0, topY / 2, 2 + 8 * Math.cos(angle) + 2], h: [3, topY / 2, 2] };
    const lab = await makeLab([FLOOR, ramp, landing], [0, 0.05, 0]);
    lab.stick(0, 1);
    expect(lab.until(() => lab.feet.z > 9, 240)).toBe(true);
    expect(lab.feet.y).toBeCloseTo(topY, 1);
  });
});

describe('steps and mantles', () => {
  it.each([0.2, 0.3, 0.42])('walks up a %s m step without losing much speed', async (height) => {
    const step = { c: [0, height / 2, 14], h: [3, height / 2, 10] };
    const lab = await makeLab([FLOOR, step], [0, 0.05, 0]);
    lab.stick(0, 1);
    lab.tick(110);
    expect(lab.feet.y).toBeCloseTo(height, 1);
    expect(lab.feet.z).toBeGreaterThan(7);
    expect(lab.traversal.speed).toBeGreaterThan(4.5);
  });

  it('mantles onto a waist-high (1.0 m) platform automatically', async () => {
    const platform = { c: [0, 0.5, 19], h: [3, 0.5, 15] };
    const lab = await makeLab([FLOOR, platform], [0, 0.05, 0]);
    lab.stick(0, 1);
    expect(lab.until(() => lab.feet.z > 6, 150)).toBe(true);
    expect(lab.count(EV.PLAYER_MANTLE, { kind: 'mantle' })).toBe(1);
    expect(lab.traversal.state).toBe('ground');
    expect(lab.feet.y).toBeCloseTo(1.0, 1);
  });

  it('does not mantle a 1.6 m wall from the ground (that needs a jump and a grab)', async () => {
    const wall = { c: [0, 0.8, 9], h: [3, 0.8, 5] };
    const lab = await makeLab([FLOOR, wall], [0, 0.05, 0]);
    lab.stick(0, 1);
    lab.tick(120);
    expect(lab.count(EV.PLAYER_MANTLE)).toBe(0);
    expect(lab.feet.y).toBeLessThan(0.05);
    expect(lab.feet.z).toBeLessThan(4);
  });

  it('never climbs through a wall standing on the edge of a platform', async () => {
    const platform = { c: [0, 0.5, 9], h: [3, 0.5, 5] };
    const wallOnEdge = { c: [0, 2, 4.1], h: [3, 1, 0.1] };
    const lab = await makeLab([FLOOR, platform, wallOnEdge], [0, 0.05, 0]);
    lab.stick(0, 1);
    lab.tick(120);
    expect(lab.count(EV.PLAYER_MANTLE)).toBe(0);
    expect(lab.feet.y).toBeLessThan(0.05);
  });
});

describe('ledges', () => {
  it('jumps, grabs a 2.0 m ledge, hangs, then climbs up when pushing toward it', async () => {
    const wall = { c: [0, 1, 9], h: [3, 1, 5] };
    const lab = await makeLab([FLOOR, wall], [0, 0.05, 0]);
    lab.stick(0, 0.5);
    lab.tick(90); // walk up to the wall and keep pushing into it
    lab.hold('jump', true);
    lab.tick(1);
    lab.hold('jump', false);
    expect(lab.until(() => lab.traversal.state === 'hang', 40)).toBe(true);
    lab.stick(0, 0);
    lab.tick(20);
    expect(lab.traversal.state).toBe('hang');
    expect(lab.feet.y).toBeCloseTo(2.0 - tuning.ledge.hangDrop, 1);
    lab.stick(0, 1);
    expect(lab.until(() => lab.traversal.state === 'ground', 90)).toBe(true);
    expect(lab.feet.y).toBeCloseTo(2.0, 1);
    expect(lab.count(EV.PLAYER_MANTLE, { kind: 'climb' })).toBe(1);
  });

  it('lets go of a ledge when pulling away and does not re-grab at once', async () => {
    const wall = { c: [0, 1, 9], h: [3, 1, 5] };
    const lab = await makeLab([FLOOR, wall], [0, 0.05, 0]);
    lab.stick(0, 0.5);
    lab.tick(90);
    lab.hold('jump', true);
    lab.tick(1);
    lab.hold('jump', false);
    expect(lab.until(() => lab.traversal.state === 'hang', 40)).toBe(true);
    lab.stick(0, -1);
    lab.tick(1);
    lab.stick(0, 0);
    expect(lab.until(() => lab.traversal.state === 'ground', 90)).toBe(true);
    expect(lab.count(EV.PLAYER_LEDGE, { grabbed: true })).toBe(1);
    expect(lab.feet.y).toBeLessThan(0.05);
  });
});

describe('ledge magnet assist', () => {
  /** Runs at run speed and jumps at z = 2.8 off the end of a floor that stops at z = 3. */
  async function jumpGap(farStart, radius) {
    const near = { c: [0, -0.5, -7], h: [4, 0.5, 10] }; // top 0, z −17…3
    const far = { c: [0, -0.5, farStart + 10], h: [4, 0.5, 10] };
    const lab = await makeLab([near, far], [0, 0.05, -4]);
    lab.traversal.assist.magnetRadius = radius;
    // The air mantle would also rescue this jump; test the magnet on its own.
    lab.traversal.abilities = { has: (move) => move !== 'mantle' && move !== 'ledge' };
    lab.stick(0, 0.8);
    lab.until(() => lab.feet.z >= 2.8, 200);
    lab.hold('jump', true);
    lab.tick(1);
    lab.hold('jump', false);
    lab.until(() => lab.traversal.state === 'ground' || lab.feet.y < -2, 200);
    return lab;
  }

  it('turns a jump that falls just short of a platform into a landing', async () => {
    // Where does this jump land with floor everywhere ahead? Then move the far edge 0.55 m beyond that (more than
    // the capsule's rounded bottom can catch on its own).
    const probe = await jumpGap(3, 0);
    const landing = probe.feet.z;
    const missed = await jumpGap(landing + 0.55, 0);
    expect(missed.feet.y).toBeLessThan(-1);
    const helped = await jumpGap(landing + 0.55, 0.4);
    expect(helped.traversal.state).toBe('ground');
    helped.tick(30); // still pushing forward: steps fully onto the platform
    expect(helped.feet.y).toBeCloseTo(0, 1);
    expect(helped.feet.z).toBeGreaterThan(landing + 0.55);
  });
});

describe('wall-run', () => {
  it('runs along a wall across a gap and lands on the far side', async () => {
    const before = { c: [0, -0.5, -7], h: [6, 0.5, 10] }; // top 0, z −17…3
    const after = { c: [0, -0.5, 21], h: [6, 0.5, 10] }; // top 0, z 11…31
    const wall = { c: [1.3, 1.5, 7], h: [0.1, 2.5, 7] }; // x 1.2…1.4, z 0…14
    const lab = await makeLab([before, after, wall], [0.6, 0.05, -8]);
    lab.stick(0, 1, true);
    expect(lab.until(() => lab.feet.z > 2.2, 200)).toBe(true);
    lab.hold('jump', true);
    lab.tick(1);
    lab.hold('jump', false);
    expect(lab.until(() => lab.traversal.state === 'wallRun', 40)).toBe(true);
    expect(lab.until(() => lab.traversal.state === 'ground' && lab.feet.z > 11, 240)).toBe(true);
    expect(lab.count(EV.PLAYER_RESPAWNED)).toBe(0);
    expect(lab.count(EV.PLAYER_WALLRUN, { started: true })).toBe(1);
    expect(lab.feet.y).toBeCloseTo(0, 1);
  });

  it('does not wall-run from flat ground beside a wall', async () => {
    const wall = { c: [1.3, 1.5, 7], h: [0.1, 2.5, 7] };
    const lab = await makeLab([FLOOR, wall], [0.6, 0.05, -8]);
    lab.stick(0, 1, true);
    lab.until(() => lab.feet.z > 3, 200);
    lab.hold('jump', true);
    lab.tick(1);
    lab.hold('jump', false);
    lab.tick(60);
    expect(lab.count(EV.PLAYER_WALLRUN, { started: true })).toBe(0);
  });
});

describe('slide', () => {
  it('slides under a 1.0 m bar that blocks a standing run, then stands up', async () => {
    const bar = { c: [0, 1.3, 8], h: [3, 0.3, 0.5] }; // y 1.0…1.6, z 7.5…8.5
    const blocked = await makeLab([FLOOR, bar], [0, 0.05, 0]);
    blocked.stick(0, 1, true);
    blocked.tick(150);
    expect(blocked.feet.z).toBeLessThan(7.5);

    const lab = await makeLab([FLOOR, bar], [0, 0.05, 0]);
    lab.stick(0, 1, true);
    expect(lab.until(() => lab.feet.z > 3.5, 200)).toBe(true);
    lab.hold('slide', true);
    lab.tick(1);
    lab.hold('slide', false);
    expect(lab.traversal.state).toBe('slide');
    expect(lab.until(() => lab.traversal.state === 'ground' && lab.feet.z > 9, 180)).toBe(true);
    expect(lab.cc.crouched).toBe(false);
    expect(lab.count(EV.PLAYER_SLIDE, { started: true })).toBe(1);
  });

  it('keeps crawling while there is no headroom to stand', async () => {
    const tunnel = { c: [0, 1.3, 9], h: [3, 0.3, 3] }; // y 1.0…1.6, z 6…12: longer than a slide
    const lab = await makeLab([FLOOR, tunnel], [0, 0.05, 0]);
    lab.stick(0, 1, true);
    expect(lab.until(() => lab.feet.z > 3.5, 200)).toBe(true);
    lab.hold('slide', true);
    lab.tick(1);
    lab.hold('slide', false);
    expect(lab.until(() => lab.feet.z > 12.5, 400)).toBe(true);
    lab.tick(30);
    expect(lab.cc.crouched).toBe(false);
  });
});

describe('glide (the wau)', () => {
  it('opens when jump is held past the apex high above the ground and carries far', async () => {
    const tower = { c: [0, 5, 0], h: [3, 5, 5] }; // top 10, z −5…5
    const lab = await makeLab([FLOOR, tower], [0, 10.05, -3]);
    lab.stick(0, 1);
    expect(lab.until(() => lab.feet.z > 4, 120)).toBe(true);
    lab.hold('jump', true);
    expect(lab.until(() => lab.traversal.state === 'glide', 90)).toBe(true);
    expect(lab.until(() => lab.traversal.state === 'ground', 900)).toBe(true);
    lab.hold('jump', false);
    expect(lab.feet.z).toBeGreaterThan(25);
    expect(lab.count(EV.PLAYER_GLIDE, { open: true })).toBe(1);
  });

  it('stays closed for a held jump on flat ground', async () => {
    const lab = await makeLab([FLOOR], [0, 0.05, 0]);
    lab.stick(0, 1);
    lab.tick(30);
    lab.hold('jump', true);
    lab.tick(60);
    lab.hold('jump', false);
    expect(lab.count(EV.PLAYER_GLIDE)).toBe(0);
  });
});
