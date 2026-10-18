/**
 * Terrain height maths shared by the game (Terrain, Terraces, Rice) and the layout tools (tools/layout), with no
 * three.js imports so Node can run it.
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
 * Elliptical distance of (x, z) in a shape's frame (0 at its centre, 1 on its rim) and the ray metric: metres per unit
 * of elliptical distance along the ray from the centre through the point.
 * @param {{ x: number, z: number, rx: number, rz: number, rot?: number }} shape
 * @param {number} x
 * @param {number} z
 * @param {{ d: number, metric: number }} out
 * @returns {{ d: number, metric: number }}
 */
export function fieldCoords(shape, x, z, out) {
  const angle = ((shape.rot ?? 0) * Math.PI) / 180;
  const dx = x - shape.x;
  const dz = z - shape.z;
  const lx = (dx * Math.cos(angle) + dz * Math.sin(angle)) / shape.rx;
  const lz = (-dx * Math.sin(angle) + dz * Math.cos(angle)) / shape.rz;
  const d = Math.hypot(lx, lz);
  const c = d > 1e-9 ? lx / d : 1;
  const s = d > 1e-9 ? lz / d : 0;
  out.d = d;
  out.metric = Math.hypot(shape.rx * c, shape.rz * s);
  return out;
}

const coords = { d: 0, metric: 1 };

/**
 * Where a terrace field's paddies end and its skirt begins, as an elliptical distance (the skirt is `skirt` metres
 * wide along the field's shorter axis).
 * @param {object} terrace
 * @returns {number}
 */
export function paddyEdge(terrace) {
  return 1 - Math.min(0.3, (terrace.skirt ?? 4) / Math.min(terrace.rx, terrace.rz));
}

/**
 * The crown's radius (elliptical distance): the flat top, never past the paddy edge (a flat field is all crown).
 * @param {object} terrace
 * @returns {number}
 */
export function crownRadius(terrace) {
  return terrace.h - terrace.base <= 0
    ? paddyEdge(terrace)
    : Math.min(terrace.top ?? 0.12, paddyEdge(terrace));
}

/**
 * A ramp from 0 to 1 that is straight in the middle and eases in and out over `k` of its length: its steepest point
 * is 1 / (1 - k) of the average slope (smoothstep's is 1.5).
 * @param {number} u 0..1
 * @param {number} [k=0.2]
 * @returns {number}
 */
export function softRamp(u, k = 0.2) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const m = 1 / (1 - k);
  if (u < k) return (m / (2 * k)) * u * u;
  if (u > 1 - k) return 1 - (m / (2 * k)) * (1 - u) * (1 - u);
  return m * (u - k / 2);
}

/** The bund (the little earth wall on a paddy's outer lip) and the water's margins, in metres. */
export const BUND = Object.freeze({ width: 0.45, height: 0.14, waterFade: 0.15, bankMargin: 0.1 });

/**
 * One level's breakpoints along a ray, in "u" (the position within a level: 1 at the top of the bank above, 0 at
 * the lip): the bank's share, where the water is full (between `waterBottom` and `waterTop`) and the bund's width.
 * Banks and bunds keep a fixed width on the ground.
 * @param {object} terrace
 * @param {number} metric metres per unit of elliptical distance along the ray
 * @param {object} [out]
 * @returns {{ perMetre: number, bankShare: number, waterTop: number, waterBottom: number, bund: number }}
 */
export function terraceBreaks(terrace, metric, out = {}) {
  const climb = terrace.h - terrace.base;
  const span = paddyEdge(terrace) - crownRadius(terrace);
  // u per metre along the ray: the hillside climbs `climb` over `span` (in d), i.e. span × metric metres.
  const perMetre = climb > 0 && span > 0 ? climb / (span * metric) / terrace.step : 0;
  out.perMetre = perMetre;
  out.bankShare = Math.min(0.9, (terrace.bank ?? 1.2) * perMetre);
  out.waterTop = Math.max(0, 1 - out.bankShare - BUND.bankMargin * perMetre);
  out.bund = Math.min(0.4, BUND.width * perMetre);
  out.waterBottom = Math.min(0.5, (BUND.width + BUND.waterFade) * perMetre);
  return out;
}

const breaks = { perMetre: 0, bankShare: 0, waterTop: 0, waterBottom: 0, bund: 0 };

/**
 * A terrace field's height and paddy-water mask at elliptical distance `d` along a ray whose metric is `metric`: a
 * flat crown, then plateaus every `step` metres down to the paddy edge, each with a bund on its lip and water from the
 * bund to the foot of the bank above, then a skirt that sinks below the ground around the field (never a cliff).
 * @param {object} terrace { base, h, step, bank?, top?, paddy?, crown?: 'dry'|'paddy', skirt?, skirtDrop? }
 * @param {number} d
 * @param {number} metric
 * @param {{ height: number, paddy: number }} out
 * @returns {boolean} whether d is on the field
 */
export function terraceProfile(terrace, d, metric, out) {
  if (d >= 1) return false;
  const edge = paddyEdge(terrace);
  const wet = terrace.paddy !== false;
  if (d > edge) {
    out.height = terrace.base - smooth01((d - edge) / (1 - edge)) * (terrace.skirtDrop ?? 2);
    out.paddy = 0;
    return true;
  }
  const crown = crownRadius(terrace);
  const climb = terrace.h - terrace.base;
  if (d <= crown || climb <= 0) {
    out.height = terrace.h;
    out.paddy = wet && (terrace.crown === 'paddy' || climb <= 0) ? 1 : 0;
    return true;
  }
  terraceBreaks(terrace, metric, breaks);
  const raw = terrace.base + climb * (1 - (d - crown) / (edge - crown));
  const scaled = (raw - terrace.base) / terrace.step;
  const level = Math.floor(scaled);
  const u = scaled - level;
  const footOfBank = 1 - breaks.bankShare;
  const rise = u <= footOfBank ? 0 : softRamp((u - footOfBank) / breaks.bankShare);
  const bund = u < breaks.bund ? Math.sin((u / breaks.bund) * Math.PI) * BUND.height : 0;
  out.height = terrace.base + (level + rise) * terrace.step + bund;
  if (!wet) {
    out.paddy = 0;
    return true;
  }
  const fromBank =
    footOfBank > breaks.waterTop ? clamp01((footOfBank - u) / (footOfBank - breaks.waterTop)) : 0;
  const fromBund =
    breaks.waterBottom > breaks.bund ? clamp01((u - breaks.bund) / (breaks.waterBottom - breaks.bund)) : 0;
  out.paddy = Math.min(fromBank, fromBund);
  return true;
}

/** Scratch for one terrace field (terrainSample) and for terrainHeight's result. */
const field = { height: 0, paddy: 0 };
const sample = { height: 0, paddy: 0 };

/**
 * Height and paddy-water mask of the terrain at (x, z): a mudflat at `base` with island mounds (rotated ellipses
 * whose cores reach `h`), terrace fields (paddies stepping up a hillside), and a little noise.
 * @param {object} def region.terrain
 * @param {number} x
 * @param {number} z
 * @param {{ height: number, paddy: number }} [out]
 * @param {boolean} [withTerraces=true] false: the ground under the terrace fields (their own meshes cover it)
 * @returns {{ height: number, paddy: number }}
 */
export function terrainSample(def, x, z, out = { height: 0, paddy: 0 }, withTerraces = true) {
  let height = def.base;
  for (const island of def.islands ?? []) {
    const d = fieldCoords(island, x, z, coords).d;
    const t = d >= 1 ? 0 : d <= 0.55 ? 1 : 1 - smooth01((d - 0.55) / 0.45);
    height = Math.max(height, def.base + (island.h - def.base) * t);
  }
  // A little noise everywhere, fading out across each terrace field's skirt: fields are levelled (their meshes have
  // none), and the ground meets them without a step.
  let calm = 0;
  for (const terrace of def.terraces ?? []) {
    const d = fieldCoords(terrace, x, z, coords).d;
    if (d < 1) calm = Math.max(calm, smooth01(Math.min(1, (1 - d) / (1 - paddyEdge(terrace)))));
  }
  height += (valueNoise(x * 0.18, z * 0.18, def.seed ?? 1) - 0.5) * (def.noise ?? 0.1) * (1 - calm);
  let paddy = 0;
  if (withTerraces) {
    for (const terrace of def.terraces ?? []) {
      fieldCoords(terrace, x, z, coords);
      if (!terraceProfile(terrace, coords.d, coords.metric, field)) continue;
      if (field.height >= height) {
        height = field.height;
        paddy = field.paddy;
      }
    }
  }
  out.height = height;
  out.paddy = paddy;
  return out;
}

/**
 * Height of the ground grid at (x, z): the terrain without its terrace fields, sunk out of sight under them (each
 * field is its own mesh, Terraces.js).
 * @param {object} def region.terrain
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function groundUnderFields(def, x, z) {
  let height = terrainSample(def, x, z, sample, false).height;
  for (const terrace of def.terraces ?? []) {
    if (fieldCoords(terrace, x, z, coords).d < paddyEdge(terrace))
      height = Math.min(height, terrace.base - 1);
  }
  return height;
}

/**
 * Height of the terrain at (x, z) (see terrainSample).
 * @param {object} def region.terrain
 * @param {number} x
 * @param {number} z
 * @returns {number}
 */
export function terrainHeight(def, x, z) {
  return terrainSample(def, x, z, sample).height;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function smooth01(t) {
  return t * t * (3 - 2 * t);
}
