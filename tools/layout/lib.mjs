/**
 * Layout authoring helpers (TECHNICAL §4.1): region layouts are written as small programs that place kit pieces
 * (houses, jetties, boardwalks, trees), gameplay markers, paths and triggers, and emit `src/data/regions/<id>.json`.
 *
 * Coordinates are three.js world space: x east, y up, z south; yaw in degrees, 0 = facing +Z. Kit facts
 * (tools/blender/kits/kampung.py): floors top at +2.4 above their origin, walls 2.2 m high and face +Z outward,
 * roofs ridge along Z with eaves ±2 m, stairs top at z = 0 descending toward +Z, jetty decks top at +1.2,
 * boardwalks top at +1.0, modules are 3 m.
 */

export const FLOOR = 2.4;
export const RIDGE = 2.4 + 2.2 + 2.0 * Math.tan((40 * Math.PI) / 180);

const round = (v) => Math.round(v * 1000) / 1000;

/** Deterministic PRNG. */
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

export class Layout {
  /**
   * @param {string} id
   * @param {object} base region settings (kits, light, weather, water, terrain …)
   */
  constructor(id, base) {
    this.id = id;
    this.base = base;
    this.placements = [];
    this.boxes = [];
    this.markers = {};
    this.paths = {};
    this.triggers = [];
    this.fireflies = [];
    this.lamps = [];
    this.groups = {};
  }

  /** Places one kit piece. */
  put(piece, x, y, z, yaw = 0, pitch = 0, roll = 0, scale = 1) {
    const entry = [piece, round(x), round(y), round(z)];
    if (yaw || pitch || roll || scale !== 1) entry.push(round(yaw));
    if (pitch || roll || scale !== 1) entry.push(round(pitch), round(roll));
    if (scale !== 1) entry.push(round(scale));
    this.placements.push(entry);
    return this;
  }

  /**
   * Returns a placer that maps local coordinates (house/structure frame) to the world.
   * @param {number} ox origin x
   * @param {number} oy origin y
   * @param {number} oz origin z
   * @param {number} yaw degrees
   */
  frame(ox, oy, oz, yaw) {
    const r = (yaw * Math.PI) / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
    const toWorld = (lx, ly, lz) => [ox + lx * c + lz * s, oy + ly, oz - lx * s + lz * c];
    const put = (piece, lx, ly, lz, lyaw = 0, pitch = 0, roll = 0, scale = 1) => {
      const [x, y, z] = toWorld(lx, ly, lz);
      this.put(piece, x, y, z, lyaw + yaw, pitch, roll, scale);
    };
    return { put, toWorld };
  }

  /**
   * A stilt house: `depth` 3 m modules along its local +Z (ridge along that axis), 3 m wide, origin at the middle
   * of the front edge on the ground. Front faces local −Z.
   * @param {object} o
   * @param {number} o.x
   * @param {number} o.z
   * @param {number} [o.y=0] ground height under the house
   * @param {number} [o.yaw=0]
   * @param {number} [o.depth=2]
   * @param {boolean} [o.stairs=true] front stairs
   * @param {boolean} [o.veranda=false] open front floor with railings
   * @param {boolean} [o.roof=true]
   * @param {number} [o.lift=0] extra height (raised houses, flood)
   * @param {'none'|'damaged'|'wrecked'} [o.damage='none'] prologue storm damage
   * @param {number} [o.seed=1]
   * @param {string[]} [o.walls] override wall pieces in order: front, back, left×depth, right×depth
   * @param {number} [o.ground] mud height: stilts continue down to it (houses raised above the boardwalks)
   */
  house({
    x,
    z,
    y = 0,
    yaw = 0,
    depth = 2,
    stairs = true,
    veranda = false,
    roof = true,
    lift = 0,
    damage = 'none',
    seed = 1,
    walls,
    ground,
  }) {
    const random = rng(seed);
    const f = this.frame(x, y + lift, z, yaw);
    const len = depth * 3;
    const broken = (p) => damage !== 'none' && random() < (damage === 'wrecked' ? 0.55 : 0.25) * p;
    const stilt = (lx, lz) => {
      if (ground === undefined) return;
      for (let bottom = y + lift - 0.6, ly = -3; bottom > ground; bottom -= 3, ly -= 3)
        f.put('post', lx, ly, lz);
    };
    for (let j = 0; j <= depth; j++) {
      for (const sx of [-1.5, 1.5]) {
        f.put(broken(0.6) ? 'post_snapped' : 'post', sx, 0, j * 3);
        stilt(sx, j * 3);
      }
    }
    for (let j = 0; j < depth; j++) f.put(broken(0.8) ? 'floor_broken' : 'floor_3x3', 0, 0, 1.5 + j * 3);
    const pickWall = (i) =>
      walls?.[i] ??
      (broken(1)
        ? 'wall_planks_broken'
        : ['wall_planks', 'wall_window', 'wall_weave'][Math.floor(random() * 3)]);
    let w = 0;
    f.put(walls?.[w] ?? 'wall_door', 0, 0, 0, 180);
    w++;
    f.put(pickWall(w++), 0, 0, len, 0);
    for (let j = 0; j < depth; j++) f.put(pickWall(w++), -1.5, 0, 1.5 + j * 3, -90);
    for (let j = 0; j < depth; j++) f.put(pickWall(w++), 1.5, 0, 1.5 + j * 3, 90);
    if (roof) {
      for (let j = 0; j < depth; j++) {
        const wreck = damage !== 'none' && j === depth - 1 && random() < (damage === 'wrecked' ? 0.8 : 0.35);
        f.put(wreck ? 'roof_broken' : 'roof_gable_3', 0, 0, 1.5 + j * 3);
      }
      f.put('gable_end', 0, 0, 0, 180);
      f.put('gable_end', 0, 0, len, 0);
    }
    if (veranda) {
      f.put('floor_3x3', 0, 0, -1.5);
      for (const sx of [-1.5, 1.5]) {
        f.put('post', sx, 0, -3);
        stilt(sx, -3);
      }
      f.put('railing_3', -1.5, 0, -1.5, 90);
      f.put('railing_3', 1.5, 0, -1.5, 90);
      if (stairs) f.put('stairs', 0, 0, -3, 180);
    } else if (stairs) {
      f.put('stairs', 0, 0, 0, 180);
    }
    return f;
  }

  /**
   * A straight jetty of `n` 3 m deck modules from (x, z) along yaw, deck top at y + 1.2. `skip` lists missing
   * modules (gaps to jump).
   */
  jetty(x, y, z, yaw, n, { pelita = 0, bollards = true, skip = [] } = {}) {
    const f = this.frame(x, y, z, yaw);
    for (let i = 0; i < n; i++) {
      if (skip.includes(i)) continue;
      f.put('jetty_3', 0, 0, 1.5 + i * 3);
      if (bollards && i % 2 === 1) f.put('bollard', 0.9, 1.2, 1.5 + i * 3);
      if (pelita && i % pelita === pelita - 1) f.put('pelita_post', -0.95, 1.2, 1.5 + i * 3, 90);
    }
    return f;
  }

  /**
   * Boardwalk segments (0.7 m wide, top at y + 1.0) along a polyline. Each leg is covered end to end by 3 m
   * segments that overlap slightly when the length is not a multiple of 3 (never a gap).
   * @param {Array<[number, number]>} points [x, z] corners
   * @param {number} [y=0]
   */
  boardwalk(points, y = 0) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const yaw = (Math.atan2(bx - ax, bz - az) * 180) / Math.PI;
      const count = Math.max(1, Math.ceil(length / 3 - 0.05));
      for (let k = 0; k < count; k++) {
        // Centres from 1.5 m in to 1.5 m short of the end, so the first and last segments end flush.
        const t = count === 1 ? 0.5 : (1.5 + ((length - 3) * k) / (count - 1)) / length;
        this.put('boardwalk_3', ax + (bx - ax) * t, y, az + (bz - az) * t, yaw, 0, 0);
      }
    }
  }

  /**
   * A jambatan: the village's main walkway, 2.1 m wide (jetty deck modules), top at `top`, along a polyline. Legs are
   * covered end to end like `boardwalk`; interior corners get a 3 m pad just under the deck so turns have no gaps.
   * @param {Array<[number, number]>} points [x, z] corners
   * @param {number} top deck height
   */
  jambatan(points, top) {
    const y = top - 1.2;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i];
      const [bx, bz] = points[i + 1];
      const length = Math.hypot(bx - ax, bz - az);
      const yaw = (Math.atan2(bx - ax, bz - az) * 180) / Math.PI;
      const count = Math.max(1, Math.ceil(length / 3 - 0.05));
      for (let k = 0; k < count; k++) {
        const t = count === 1 ? 0.5 : (1.5 + ((length - 3) * k) / (count - 1)) / length;
        this.put('jetty_3', ax + (bx - ax) * t, y, az + (bz - az) * t, yaw);
      }
      if (i > 0) this.put('floor_3x3', ax, top - 0.04 - FLOOR, az, yaw);
    }
  }

  /**
   * A deck of `nx × nz` 3 m floor modules with its top at `top`, posts at every other module corner continued
   * down to the mud. Origin = the deck's minimum-x/minimum-z corner (world axes, no yaw).
   * @param {number} x0
   * @param {number} z0
   * @param {number} nx
   * @param {number} nz
   * @param {number} top
   * @param {object} [o]
   * @param {number} [o.ground=-1] mud height
   * @param {Array<[number, number]>} [o.broken] module indices [i, j] that use the broken floor
   * @param {Array<[number, number]>} [o.holes] module indices left out
   */
  deck(x0, z0, nx, nz, top, { ground = -1, broken = [], holes = [] } = {}) {
    const y = top - FLOOR;
    const has = (list, i, j) => list.some(([a, b]) => a === i && b === j);
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        if (has(holes, i, j)) continue;
        this.put(has(broken, i, j) ? 'floor_broken' : 'floor_3x3', x0 + 1.5 + i * 3, y, z0 + 1.5 + j * 3);
      }
    }
    for (let i = 0; i <= nx; i++) {
      for (let j = 0; j <= nz; j++) {
        if ((i % 2 && i !== nx) || (j % 2 && j !== nz)) continue;
        this.stilt(x0 + i * 3, y, z0 + j * 3, ground);
      }
    }
  }

  /** A post whose top is at y + 2.4, continued down to the ground with more posts. */
  stilt(x, y, z, ground = -1) {
    // A post spans oy − 0.6 … oy + 2.4.
    for (let oy = y; ; oy -= 3) {
      this.put('post', x, oy, z);
      if (oy - 0.6 <= ground) break;
    }
  }

  /**
   * An open shelter (pondok): four posts and a 3 m gabled roof over a deck whose top is at `top`.
   * @param {number} x centre
   * @param {number} z centre
   * @param {number} top floor height under it
   * @param {number} [yaw=0] ridge direction (0 = along Z)
   */
  pondok(x, z, top, yaw = 0) {
    const f = this.frame(x, top - FLOOR, z, yaw);
    for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) f.put('post', sx, 2.2, sz);
    f.put('roof_gable_3', 0, 0, 0);
    f.put('gable_end', 0, 0, -1.5, 180);
    f.put('gable_end', 0, 0, 1.5, 0);
  }

  /**
   * Stairs whose top edge is at (x, top, z), rising toward `yaw` (degrees; the stairs descend the opposite way).
   */
  stairs(x, top, z, yaw) {
    this.put('stairs', x, top - FLOOR, z, yaw + 180);
  }

  /**
   * A berembang tree with breathing roots and a firefly colony in its crown.
   */
  tree(x, z, { y = 0, kind = 'a', yaw = 0, scale = 1, fireflies = 1, sync = true } = {}) {
    this.put(`berembang_${kind}`, x, y, z, yaw, 0, 0, scale);
    this.put('akar_napas', x, y, z, yaw * 1.7);
    if (fireflies > 0) {
      const crown = (kind === 'a' ? 6.4 : 5.2) * scale;
      this.fireflies.push({
        center: [round(x), round(y + crown), round(z)],
        radius: 2.6 * scale,
        height: 2.2 * scale,
        weight: fireflies,
        sync,
      });
    }
  }

  /** Invisible collider box (world limits, extra steps): centre and half extents. */
  box(c, h, { yaw = 0, tags, camera = true } = {}) {
    this.boxes.push({
      c: c.map(round),
      h: h.map(round),
      ...(yaw ? { yaw } : {}),
      ...(tags ? { tags } : {}),
      ...(camera ? {} : { camera: false }),
    });
  }

  marker(name, p, yaw = 0) {
    this.markers[name] = { p: p.map(round), yaw };
  }

  path(name, points) {
    this.paths[name] = points.map((p) => p.map(round));
  }

  trigger(id, c, { h, r } = {}) {
    this.triggers.push({ id, c: c.map(round), ...(h ? { h: h.map(round) } : {}), ...(r ? { r } : {}) });
  }

  lamp(kind, p) {
    this.lamps.push({ kind, p: p.map(round) });
  }

  /** The region JSON. */
  toJSON() {
    return {
      id: this.id,
      ...this.base,
      placements: this.placements,
      boxes: this.boxes,
      markers: this.markers,
      paths: this.paths,
      triggers: this.triggers,
      fireflies: this.fireflies,
      lamps: this.lamps,
    };
  }
}
