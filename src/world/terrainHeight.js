/**
 * Terrain height maths shared by the game (Terrain) and the layout tools (tools/layout), with no three.js imports so
 * Node can run it.
 */

/**
 * Deterministic 2D value noise in [0, 1) (layout-independent, no Math.random).
 * @param {number} x
 * @param {number} z
 * @param {number} seed
 * @returns {number}
 */
export function valueNoise(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const h = (i, j) => {
    const n = Math.sin((xi + i) * 127.1 + (zi + j) * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  return (h(0, 0) * (1 - u) + h(1, 0) * u) * (1 - v) + (h(0, 1) * (1 - u) + h(1, 1) * u) * v;
}

/**
 * Height of the terrain described by a region: a mudflat at `base` with island mounds (rotated ellipses whose cores
 * reach `h`) and a little noise.
 * @param {object} def region.terrain
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function terrainHeight(def, x, z) {
  let height = def.base;
  for (const island of def.islands) {
    const angle = ((island.rot ?? 0) * Math.PI) / 180;
    const dx = x - island.x;
    const dz = z - island.z;
    const lx = (dx * Math.cos(angle) + dz * Math.sin(angle)) / island.rx;
    const lz = (-dx * Math.sin(angle) + dz * Math.cos(angle)) / island.rz;
    const d = Math.hypot(lx, lz);
    const t = d >= 1 ? 0 : d <= 0.55 ? 1 : 1 - smooth01((d - 0.55) / 0.45);
    height = Math.max(height, def.base + (island.h - def.base) * t);
  }
  const bumps = (valueNoise(x * 0.18, z * 0.18, def.seed ?? 1) - 0.5) * (def.noise ?? 0.1);
  return height + bumps;
}

function smooth01(t) {
  return t * t * (3 - 2 * t);
}
