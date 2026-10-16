import { describe, expect, it } from 'vitest';
import { approachAngle, moveTowards2D, wrapAngle } from '../../src/player/Traversal.js';
import { data } from '../../src/core/Data.js';

describe('movement maths', () => {
  it('wraps angles to [−π, π)', () => {
    expect(wrapAngle(0)).toBeCloseTo(0);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI, 5);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI, 5);
    expect(wrapAngle(Math.PI / 2 + 4 * Math.PI)).toBeCloseTo(Math.PI / 2);
    expect(wrapAngle(-Math.PI / 2 - 6 * Math.PI)).toBeCloseTo(-Math.PI / 2);
  });

  it('turns along the shortest arc and stops exactly on target', () => {
    const near = approachAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.05);
    expect(near).toBeCloseTo(Math.PI - 0.05); // crosses ±π instead of spinning the long way
    expect(approachAngle(0, 0.03, 0.05)).toBe(0.03);
  });

  it('moves a 2D velocity toward its target without overshooting', () => {
    const v = { x: 0, z: 0 };
    moveTowards2D(v, 10, 0, 3);
    expect(v).toEqual({ x: 3, z: 0 });
    moveTowards2D(v, 4, 0, 3);
    expect(v).toEqual({ x: 4, z: 0 });
  });
});

describe('player tuning sanity (GDD feel rules)', () => {
  const t = data('tuning/player');

  /**
   * Air time of a full (held) jump using the same per-tick rules as Traversal.fixedUpdate.
   * @returns {{ airTime: number, apex: number }}
   */
  function simulateHeldJump() {
    const dt = 1 / 60;
    let vy = Math.sqrt(2 * t.gravity * t.jump.height);
    let y = 0;
    let apex = 0;
    let time = 0;
    do {
      let scale = 1;
      if (vy < 0) scale = t.jump.fallGravityScale;
      else if (Math.abs(vy) < t.jump.apexThreshold) scale = t.jump.apexGravityScale;
      vy = Math.max(vy - t.gravity * scale * dt, -t.jump.maxFallSpeed);
      y += vy * dt;
      apex = Math.max(apex, y);
      time += dt;
    } while (y > 0);
    return { airTime: time, apex };
  }

  it('lets a run jump clear a 3 m gap and a sprint jump clear 4.5 m', () => {
    const { airTime, apex } = simulateHeldJump();
    expect(apex).toBeGreaterThan(t.jump.height * 0.95);
    expect(t.move.runSpeed * airTime).toBeGreaterThan(3);
    expect(t.move.sprintSpeed * airTime).toBeGreaterThan(4.5);
  });

  it('keeps coyote time and jump buffer in the forgiving 0.08–0.2 s range', () => {
    expect(t.jump.coyoteTime).toBeGreaterThanOrEqual(0.08);
    expect(t.jump.coyoteTime).toBeLessThanOrEqual(0.2);
    expect(t.jump.bufferTime).toBeGreaterThanOrEqual(0.08);
    expect(t.jump.bufferTime).toBeLessThanOrEqual(0.2);
  });

  it('climbs steps below the autostep limit and the 0.25 m stair rise', () => {
    expect(t.kcc.autostepMaxHeight).toBeGreaterThan(0.25);
    expect(t.kcc.maxSlopeClimbDeg).toBeLessThan(t.kcc.minSlopeSlideDeg);
  });
});
