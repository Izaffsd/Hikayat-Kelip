import { describe, expect, it } from 'vitest';
import { data } from '../../src/core/Data.js';
import { TerraceField } from '../../src/world/Terraces.js';
import {
  BUND,
  fieldCoords,
  groundUnderFields,
  paddyEdge,
  terraceProfile,
  terrainSample,
} from '../../src/world/terrainHeight.js';

const PLAYER = data('tuning/player');
const sawah = (await import('../../src/data/regions/sawah.json')).default;
const kampung = (await import('../../src/data/regions/kampung.json')).default;

/** Steepest slope (degrees) along a ray from a field's centre outward. */
function steepest(def, terrace, angle, step = 0.05) {
  let worst = 0;
  const reach = Math.max(terrace.rx, terrace.rz) * 1.05;
  let prev = terrainSample(def, terrace.x, terrace.z).height;
  for (let t = step; t < reach; t += step) {
    const h = terrainSample(def, terrace.x + Math.cos(angle) * t, terrace.z + Math.sin(angle) * t).height;
    worst = Math.max(worst, (Math.atan(Math.abs(h - prev) / step) * 180) / Math.PI);
    prev = h;
  }
  return worst;
}

describe('terraces (Sawah Emas)', () => {
  const def = sawah.terrain;

  it('every bank and skirt is walkable (under the controller climb limit)', () => {
    for (const terrace of def.terraces) {
      for (let k = 0; k < 16; k++) {
        const slope = steepest(def, terrace, (k / 16) * Math.PI * 2);
        expect(slope, `field at ${terrace.x},${terrace.z}, ray ${k}`).toBeLessThan(
          PLAYER.kcc.maxSlopeClimbDeg,
        );
      }
    }
  });

  it('each plateau holds water between its bund and the foot of the bank above', () => {
    const hill = def.terraces[0];
    const levels = new Map();
    for (let t = 0; t < hill.rx * paddyEdge(hill); t += 0.05) {
      const s = terrainSample(def, hill.x + t, hill.z);
      if (s.paddy > 0.99) levels.set(Math.round((s.height - hill.base) / hill.step), true);
    }
    // Every level below the crown has water along this ray.
    const count = Math.round((hill.h - hill.base) / hill.step);
    for (let k = 0; k < count; k++) expect(levels.has(k), `level ${k}`).toBe(true);
  });

  it('a bund rises on each lip and water stands level', () => {
    const hill = def.terraces[0];
    const out = { height: 0, paddy: 0 };
    let bundTop = -Infinity;
    let water = null;
    const coords = { d: 0, metric: 1 };
    for (let t = hill.rx * 0.5; t < hill.rx * 0.5 + 8; t += 0.02) {
      fieldCoords(hill, hill.x + t, hill.z, coords);
      terraceProfile(hill, coords.d, coords.metric, out);
      const level = hill.base + Math.floor((out.height - hill.base + 1e-6) / hill.step) * hill.step;
      if (out.paddy > 0.99) {
        water ??= out.height;
        expect(out.height).toBeCloseTo(level, 6);
      } else bundTop = Math.max(bundTop, out.height - level);
    }
    expect(water).not.toBeNull();
    expect(bundTop).toBeGreaterThan(BUND.height * 0.9);
  });

  it('the ring mesh follows the shared profile (no NaN, heights match at its vertices)', () => {
    for (const terrace of def.terraces) {
      const geometry = TerraceField.geometry(terrace, 2);
      const position = geometry.attributes.position;
      const paddy = geometry.attributes.paddy;
      const coords = { d: 0, metric: 1 };
      const out = { height: 0, paddy: 0 };
      for (let i = 0; i < position.count; i += 37) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        expect(Number.isFinite(x + y + z)).toBe(true);
        fieldCoords(terrace, x, z, coords);
        terraceProfile(terrace, Math.min(coords.d, 0.9999), coords.metric, out);
        expect(y, `vertex ${i}`).toBeCloseTo(out.height, 3);
        expect(paddy.getX(i)).toBeGreaterThanOrEqual(-1);
      }
      expect(geometry.index.count % 3).toBe(0);
      geometry.dispose();
    }
  });

  it('the ground grid under a field stays below it (fields are their own meshes)', () => {
    for (const terrace of def.terraces) {
      for (const [dx, dz] of [
        [0, 0],
        [terrace.rx * 0.5, 0],
        [0, terrace.rz * 0.7],
        [-terrace.rx * 0.8, 0],
      ]) {
        const x = terrace.x + dx;
        const z = terrace.z + dz;
        expect(groundUnderFields(def, x, z)).toBeLessThan(terrainSample(def, x, z).height - 0.5);
      }
    }
  });

  it('a region without terraces keeps its old ground exactly (Kampung Berembang)', () => {
    const k = kampung.terrain;
    for (const [x, z] of [
      [0, 0],
      [-80, 4],
      [76, -62],
      [30, -120],
    ]) {
      const a = terrainSample(k, x, z).height;
      const b = terrainSample(k, x, z, { height: 0, paddy: 0 }, false).height;
      expect(a).toBe(b);
    }
  });
});
