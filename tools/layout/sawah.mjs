/**
 * Sawah Emas — Chapter 2, Wau Bulan (GDD missions 2.1–2.4): golden rice terraces climbing a hill to the Pelita Bumi,
 * a village of stilt houses on the dry valley floor, the harvested field where the kite festival is held, paddies
 * crossed by rope swings at night, a scarecrow field, and a wide paddy by the river where Pak Mail is fought.
 *
 * Heights: the river 0 (deadly: falling in respawns); the valley floor ~0.7; terraces step 1 m up the hill to the crown
 * at ~12.7 m, where the Pelita Bumi stands (visible from the arrival path: the region's landmark).
 *
 * Beats, west to east:
 * - Arrival: the path from Kampung Berembang comes in along the river at the west end, into the village.
 * - 2.1 Pesta Wau: the festival field east of the village (stalls, kites on stands, bunting, haystacks); the race
 *   runs out over the paddies and back (M2 adds its course).
 * - 2.2 Bendang Berbisik: the lower west paddies at night, bamboo poles carrying rope swings over the channels.
 * - 2.3 Bayang Belang: the scarecrow terraces on the hill's east flank.
 * - 2.4 Pelita Bumi: Pak Mail's house at the foot of the hill, the flood paddy by the river (the boss arena), then the
 *   climb up the terraces to the Pelita Bumi on the crown.
 */
import { terrainHeight } from '../../src/world/terrainHeight.js';
import { Layout, rng } from './lib.mjs';

const WATER = 0;
const VALLEY = 0.7;
const STEP = 1.0;

const HILL = {
  x: 70,
  z: -40,
  rx: 85,
  rz: 62,
  base: VALLEY,
  h: VALLEY + 12 * STEP,
  step: STEP,
  bank: 1.3,
  top: 0.1,
};
const WEST_PADDIES = {
  x: -15,
  z: -70,
  rx: 42,
  rz: 26,
  base: VALLEY,
  h: VALLEY + 3 * STEP,
  step: STEP,
  bank: 1.3,
  top: 0.25,
};
const FLOOD_PADDY = { x: 112, z: 52, rx: 30, rz: 22, base: 0.5, h: 0.5, step: STEP, bank: 1.2, top: 0.9 };

const TERRAIN = {
  center: [20, -5],
  size: [360, 270],
  res: 180,
  base: -0.8,
  seed: 11,
  noise: 0.18,
  palette: {
    wetMud: '#4a4228',
    mud: '#7a6640',
    earth: '#94844e',
    grass: '#7a9a3e',
    bund: '#7a9a40',
    bank: '#5a7a34',
    paddy: '#1f2a20',
    dry: [0.02, 0.25],
    high: [0.15, 0.6],
  },
  islands: [{ x: 10, z: -10, rx: 240, rz: 132, h: VALLEY }],
  terraces: [HILL, WEST_PADDIES, FLOOD_PADDY],
};

const groundAt = (x, z) => terrainHeight(TERRAIN, x, z);

/** Rice in the paddies (src/world/Rice.js): ripe gold at the tips over green stems. */
const RICE = {
  spacing: 0.95,
  height: [0.8, 1.1],
  chunk: 24,
  blades: 5,
  base: '#3b5524',
  mid: '#8a9636',
  tip: '#dcb64c',
  wind: 0.12,
  seed: 7,
};

export function sawah() {
  const L = new Layout('sawah', {
    kits: ['kits/kampung_kit', 'kits/sawah_kit'],
    light: 'golden',
    weather: 'clear',
    water: { level: WATER, size: 900, deadly: true },
    terrain: TERRAIN,
    rice: RICE,
  });
  const random = rng(2002);
  const put = (piece, x, z, yaw = 0, { lift = 0, scale = 1 } = {}) =>
    L.put(piece, x, groundAt(x, z) + lift, z, yaw, 0, 0, scale);

  // --- The village (west): stilt houses round a yard, a rice barn, palms and pelita posts.
  const houses = [
    { x: -118, z: 22, yaw: 90 },
    { x: -112, z: -4, yaw: 75 },
    { x: -96, z: 34, yaw: 180 },
    { x: -86, z: 6, yaw: 120, veranda: true },
    { x: -100, z: -24, yaw: 30 },
    { x: -72, z: 30, yaw: 200 },
  ];
  houses.forEach((h, i) => L.house({ ...h, y: groundAt(h.x, h.z), depth: 2, seed: 40 + i }));
  put('jelapang', -78, -8, 15);
  put('jelapang', -124, 44, 80);
  for (const [x, z] of [
    [-130, 8],
    [-108, 52],
    [-80, 52],
    [-66, 4],
    [-92, -40],
    [-126, -20],
  ])
    put('kelapa', x, z, random() * 360);
  put('pokok_hujan', -92, 16, 30);
  for (const [x, z] of [
    [-104, 12],
    [-90, 26],
    [-80, 14],
  ])
    put('pelita_post', x, z, random() * 360);
  for (const [x, z, yaw] of [
    [-60, 40, 90],
    [-60, 37, 90],
    [-60, 34, 90],
  ])
    put('pagar_buluh', x, z, yaw);
  put('timbunan_jerami', -70, -16);
  put('net_rack', -108, 30, 40);
  put('washing_line', -94, 2, 70);
  L.marker('spawn', [-138, groundAt(-138, 30) + 0.2, 30], 90);
  L.marker('village', [-96, groundAt(-96, 10) + 0.2, 10], 90);

  // --- The festival field (2.1): stalls in a ring, kites on stands, bunting, haystacks, a rain tree for shade.
  const FEST = { x: -30, z: 48 };
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = FEST.x + Math.cos(a) * 26;
    const z = FEST.z + Math.sin(a) * 18;
    put('stall_gerai', x, z, (Math.atan2(FEST.x - x, FEST.z - z) * 180) / Math.PI);
  }
  ['wau_stand_green', 'wau_stand_blue', 'wau_stand_maroon', 'wau_stand_blue', 'wau_stand_green'].forEach(
    (kite, k) => put(kite, FEST.x - 12 + k * 6, FEST.z - 10, 0),
  );
  for (let k = 0; k < 4; k++) put('bunting_6', FEST.x - 9 + k * 6.2, FEST.z + 14, 0);
  for (const [x, z] of [
    [-58, 70],
    [-6, 74],
    [8, 30],
    [-52, 22],
  ])
    put('timbunan_jerami', x, z, random() * 360);
  put('pokok_hujan', -2, 62, 120, { scale: 1.1 });
  put('pokok_hujan', -62, 56, 250);
  L.marker('festival', [FEST.x, groundAt(FEST.x, FEST.z) + 0.2, FEST.z], 0);

  // --- The west paddies (2.2): bamboo poles in pairs across the field channels (rope swings hang between them).
  const poles = [
    [-44, -66],
    [-34, -60],
    [-24, -74],
    [-12, -66],
    [-2, -78],
    [10, -70],
    [16, -58],
    [-30, -84],
  ];
  for (const [x, z] of poles) put('tiang_buluh', x, z, random() * 360);
  put('pondok_sawah', -20, -56, 160);
  put('pondok_sawah', 4, -86, 20);
  put('pintu_air', -40, -48, 0);
  put('titian_sawah', -52, -60, 90);
  L.marker('west_paddies', [-50, groundAt(-50, -40) + 0.2, -40], 160);

  // --- The terrace hill: field huts on the lower steps, scarecrows across the east flank (2.3), the Pelita Bumi.
  for (const [x, z, yaw] of [
    [40, -10, 200],
    [100, -18, 250],
    [52, -78, 30],
    [92, -70, 300],
  ])
    put('pondok_sawah', x, z, yaw);
  for (let k = 0; k < 12; k++) {
    const a = -0.9 + (k / 11) * 1.4;
    const r = 34 + (k % 3) * 12;
    const x = HILL.x + Math.cos(a) * r * 1.2;
    const z = HILL.z + Math.sin(a) * r;
    put(k % 2 ? 'orang_orang_a' : 'orang_orang_b', x, z, random() * 360);
  }
  put('pelita_bumi', HILL.x, HILL.z, 0);
  L.marker('pelita_bumi', [HILL.x + 3, groundAt(HILL.x + 3, HILL.z) + 0.2, HILL.z], -90);
  L.marker('scarecrows', [HILL.x + 40, groundAt(HILL.x + 40, HILL.z - 4) + 0.2, HILL.z - 4], -90);
  L.lamp('pelita', [HILL.x, groundAt(HILL.x, HILL.z) + 1.6, HILL.z]);

  // --- Pak Mail's house at the foot of the hill and the flood paddy by the river (2.4).
  L.house({ x: 76, z: 24, y: groundAt(76, 24), yaw: 200, depth: 2, veranda: true, seed: 61 });
  put('jelapang', 90, 30, 110);
  put('pintu_air', 96, 46, 60);
  put('titian_sawah', 140, 40, 30);
  L.marker('mail_house', [76, groundAt(76, 20) + 0.2, 20], 20);
  L.marker('arena', [FLOOD_PADDY.x, groundAt(FLOOD_PADDY.x, FLOOD_PADDY.z) + 0.2, FLOOD_PADDY.z], 0);

  // --- Palms along the river, rain trees on the valley edges.
  for (let k = 0; k < 22; k++) {
    const x = -150 + k * 14 + (random() - 0.5) * 6;
    const z = 104 + (random() - 0.5) * 10;
    if (groundAt(x, z) > WATER + 0.3) put('kelapa', x, z, random() * 360, { scale: 0.85 + random() * 0.3 });
  }
  for (const [x, z] of [
    [-140, -60],
    [150, -40],
    [140, -100],
    [-40, -110],
    [30, 88],
  ])
    put('pokok_hujan', x, z, random() * 360);

  // A few fireflies stay by the Pelita Bumi even by day; more come out over the west paddies at night (2.2).
  L.fireflies.push(
    {
      center: [HILL.x, groundAt(HILL.x, HILL.z) + 3, HILL.z],
      radius: 6,
      height: 3,
      weight: 0.5,
      sync: false,
    },
    { center: [-15, VALLEY + 3 * STEP + 2.5, -70], radius: 26, height: 3, weight: 0.8, sync: false },
  );

  L.trigger('s_festival', [FEST.x, groundAt(FEST.x, FEST.z) + 1, FEST.z], { r: 22 });
  return L.toJSON();
}
