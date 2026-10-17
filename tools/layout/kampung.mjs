/**
 * Kampung Berembang — Chapter 1, Bunyi Pertama (GDD "The first 10 minutes" 3:15–10:00, missions 1.1–1.4) and the
 * epilogue: a stilt village on the mudflats of the river's south bank at dusk.
 *
 * Heights: water 0 at low tide (it rises in 1.3); walkways (jambatan, titian) top 1.0; the waterfront deck and the
 * jetty 1.2; house floors 3.4 so their stairs land on the walkways; eaves 5.6, ridges 7.28. The old jetty, the boss
 * arena and the climb sit above the 1.3 high tide. The mud under the village is under water: falling in respawns.
 *
 * Beats, west to east:
 * - 3:15 Home: Bayu wakes in the back room of the family house at the west end.
 * - 3:30 1.1 Lumba ke Jeti: the race to Mak Som's stall at the jetty root. Run (a straight jambatan), jump (missing
 *   planks), mantle (the fish-drying platform), wall-run (along the boat shed; Adi shows the way, a titian detour
 *   exists).
 * - 5:00 1.2 Cahaya dari Hikayat: Tok Wan's hikayat in his pondok on the jetty head; Kelip's call travels over the
 *   river to the berembang grove on the far bank; the display goes dark row by row; the first fight on the jetty head.
 * - 1.3 Jejak Adi: a chain of waterfront roofs from a side serambi by the deck to the old jetty while the tide floods
 *   the walkways.
 * - 1.4 Pelita Air: the old jetty (missing modules) to the boss arena, a titian to the island, and a timber climb
 *   around the tallest berembang to the Pelita.
 */
import { terrainHeight } from '../../src/world/terrainHeight.js';
import { FLOOR, Layout, RIDGE, rng } from './lib.mjs';

const WATER = 0;
const MUD = -0.9;
const WALK = 1.0;
const DECK = 1.2;
const HOUSE_Y = WALK;
const FLOOR_TOP = HOUSE_Y + FLOOR;
const RIDGE_TOP = HOUSE_Y + RIDGE;
const OLD = 2.4;
const JAMBATAN_HALF = 1.05;
const TITIAN_HALF = 0.35;

const TERRAIN = {
  center: [0, -40],
  size: [360, 260],
  res: 112,
  base: MUD,
  seed: 5,
  noise: 0.25,
  islands: [
    { x: 0, z: 100, rx: 240, rz: 62, h: 1.2 }, // the land behind the village
    { x: 0, z: -138, rx: 250, rz: 42, h: 0.35 }, // the far bank: mangrove mud
    { x: 76, z: -62, rx: 13, rz: 11, h: 0.9 }, // Pelita Air island
  ],
};

const groundAt = (x, z) => terrainHeight(TERRAIN, x, z);

/**
 * A house facing a walkway that runs along X at z = `zw`, with a titian spur from its stairs to the walkway.
 * @param {Layout} L
 * @param {object} o
 * @param {number} o.x
 * @param {number} o.zw walkway centre line
 * @param {-1|1} o.side −1 north of the walkway, +1 south
 * @param {number} [o.half] walkway half width
 * @param {number} [o.depth=2]
 * @param {boolean} [o.veranda=false]
 * @param {number} o.seed
 */
function streetHouse(L, { x, zw, side, half = JAMBATAN_HALF, depth = 2, veranda = false, seed }) {
  const edge = zw + side * half;
  const foot = edge + side * 3; // one titian segment between the walkway and the stairs
  const front = foot + side * (2.7 + (veranda ? 3 : 0));
  L.house({ x, z: front, y: HOUSE_Y, yaw: side < 0 ? 180 : 0, depth, veranda, ground: MUD, seed });
  L.boardwalk([
    [x, foot],
    [x, edge],
  ]);
}

export function kampung() {
  const L = new Layout('kampung', {
    kits: ['kits/kampung_kit'],
    light: 'dusk',
    weather: 'clear',
    water: { level: WATER, size: 900, deadly: true },
    terrain: TERRAIN,
  });
  const random = rng(1984);

  // --- 3:15 Home: front (door, veranda, stairs) facing east; Bayu's room is the back module.
  L.house({
    x: -80,
    z: 4,
    y: HOUSE_Y,
    yaw: -90,
    depth: 3,
    veranda: true,
    ground: MUD,
    seed: 101,
    walls: [
      'wall_door',
      'wall_planks',
      'wall_window',
      'wall_weave',
      'wall_window',
      'wall_weave',
      'wall_window',
      'wall_planks',
    ],
  });
  L.put('tempayan', -76.6, WALK, 6.2);
  L.lamp('pelita', [-85, FLOOR_TOP + 1.5, 3.0]);
  L.marker('spawn', [-87.2, FLOOR_TOP + 0.05, 4.4], 90);

  // --- 3:30 Lumba ke Jeti.
  const R = {
    start: [-74.3, 4],
    gapA: [-48, 4],
    gapB: [-46, 4],
    bend: [-30, 4],
    platformW: [-20, -6],
    platformE: [-14, -6],
    junction: [4, -6],
    wallrunFoot: [4, -13.5],
  };
  L.jambatan([R.start, R.gapA], WALK); // run
  // Missing planks: a 2 m gap over the water, the old legs still standing (jump).
  for (const dz of [-0.9, 0.9]) L.put('post', -47, -1.6, 4 + dz);
  L.put('debris_planks', -47.2, WATER - 0.05, 5.8, 70);
  L.jambatan([R.gapB, R.bend, R.platformW], WALK);
  // Fish-drying platform one metre above the walkway (mantle), racks along its sides.
  L.deck(-20, -9, 2, 2, 2.0, { ground: MUD });
  L.put('net_rack', -17, 2.0, -8.3);
  L.put('net_rack', -17, 2.0, -3.7, 180);
  L.put('tempayan', -19.3, 2.0, -3.6);
  L.put('tempayan', -14.8, 2.0, -8.4);
  L.jambatan([R.platformE, R.junction, R.wallrunFoot], WALK);
  // The long way round: a titian to the deck.
  L.boardwalk([
    [-4, -6 - JAMBATAN_HALF],
    [-4, -19],
  ]);
  // Boat shed beside the gap to the waterfront: its west wall is the wall-run.
  L.house({
    x: 7.1,
    z: -12,
    y: WALK - FLOOR,
    yaw: 180,
    depth: 2,
    stairs: false,
    ground: MUD,
    seed: 131,
    walls: ['wall_door', 'wall_planks', 'wall_planks', 'wall_planks', 'wall_planks', 'wall_planks'],
  });
  L.put('sampan', 10.4, WATER - 0.1, -15.5, 4);

  // --- Waterfront deck at the jetty root: Mak Som's stall, crates, lamps. The race finishes across it.
  L.deck(-7, -28, 6, 3, DECK, { ground: MUD });
  L.put('stall_gerai', 2, DECK, -24.5);
  L.put('crate', 4.2, DECK, -25.6, 20);
  L.put('crate', 4.6, DECK, -26.5, -10);
  L.put('tempayan', -0.4, DECK, -26.4);
  L.put('net_rack', -4.5, DECK, -27.2);
  for (const [x, z] of [
    [-6.6, -19.4],
    [10.6, -19.4],
    [-6.6, -27.6],
    [10.6, -27.6],
  ]) {
    L.put('pelita_post', x, DECK, z, random() * 360);
  }
  L.lamp('pelita', [2, DECK + 1.7, -24.5]);
  L.put('sampan', -9.2, WATER - 0.1, -23.5, 92);

  // --- 5:00 The long jetty and Tok Wan's pondok on its head (the hikayat on a low table), facing the grove.
  L.jetty(2, WATER, -28, 180, 11, { pelita: 3 });
  L.deck(-2.5, -70, 3, 3, DECK, { ground: MUD });
  L.pondok(2, -65.5, DECK, 90);
  L.put('crate', 2, DECK, -65.5);
  L.put('pelita_post', -2.1, DECK, -69.6, 30);
  L.put('pelita_post', 6.1, DECK, -69.6, 200);
  L.put('sampan', 5.2, WATER - 0.1, -41, 8);
  L.put('sampan', -1.4, WATER - 0.1, -50, 176);

  // --- 1.3 Jejak Adi: four waterfront houses end to end (ridges along X, 2.5 m gaps). The first has a side serambi
  // reached by stairs from the deck; its eave is the first climb.
  const chainA = [
    { x: 14, depth: 2 },
    { x: 22.5, depth: 2 },
    { x: 31, depth: 3 },
    { x: 42.5, depth: 2 },
  ];
  chainA.forEach((h, i) =>
    L.house({
      x: h.x,
      z: -25,
      y: HOUSE_Y,
      yaw: 90,
      depth: h.depth,
      stairs: false,
      ground: MUD,
      seed: 140 + i,
    }),
  );
  L.deck(14, -23.5, 2, 1, FLOOR_TOP, { ground: MUD });
  L.stairs(14, FLOOR_TOP, -22, 90);
  L.put('pondok_kelip', 19.3, FLOOR_TOP, -21.1); // a Cahaya spot on the way up

  // A second row behind it (village density; more roofs to read and use).
  [
    { x: 14, depth: 2 },
    { x: 22.5, depth: 3 },
    { x: 35, depth: 2 },
  ].forEach((h, i) =>
    L.house({
      x: h.x,
      z: -13,
      y: HOUSE_Y,
      yaw: 90,
      depth: h.depth,
      stairs: false,
      ground: MUD,
      seed: 150 + i,
    }),
  );

  // --- 1.4 Pelita Air: the old jetty (two modules gone) from its root platform to the boss arena.
  L.deck(50, -28, 2, 2, OLD, { ground: MUD });
  L.put('pelita_post', 50.4, OLD, -22.4, 40);
  L.jetty(53, OLD - 1.2, -28, 180, 9, { skip: [2, 5], pelita: 4 });
  L.put('debris_planks', 52.4, WATER - 0.05, -35.6, 15);
  L.put('debris_planks', 54.1, WATER - 0.05, -44.2, 160);
  L.deck(47, -67, 4, 4, OLD, {
    ground: MUD,
    broken: [
      [1, 2],
      [2, 1],
    ],
  });
  for (const [x, z] of [
    [47.6, -55.6],
    [58.4, -55.6],
    [47.6, -66.4],
    [58.4, -66.4],
  ]) {
    L.put('pelita_post', x, OLD, z, random() * 360);
  }
  L.put('crate', 49.6, OLD, -63.8, 25);
  L.put('tempayan', 57.2, OLD, -57.4);
  // To the island, then the timber climb around the tallest berembang (one platform per side, 2.4 m apart).
  L.boardwalk([
    [59, -61],
    [68.3, -61],
  ]);
  // The tallest berembang towers over everything so it reads from Bayu's veranda (GDD: a landmark visible from the
  // start, reached by the end).
  const TREE = { x: 77, z: -62 };
  L.tree(TREE.x, TREE.z, { y: groundAt(TREE.x, TREE.z) - 0.1, kind: 'a', scale: 4.2, fireflies: 3 });
  L.stairs(71, FLOOR_TOP, -61, 90);
  L.deck(71, -63.5, 1, 1, FLOOR_TOP, { ground: 0.6 });
  L.deck(75.5, -68, 1, 1, 5.8, { ground: 0.6 });
  L.deck(80, -63.5, 1, 1, 8.2, { ground: 0.6 });
  L.deck(75.5, -59, 1, 1, 10.6, { ground: 0.6 });
  L.deck(71, -63.5, 1, 1, 13.0, { ground: 0.6 });
  L.put('pondok_kelip', 70.2, groundAt(70.2, -56.5), -56.5);

  // --- Village: houses along the walkways, spurs to their stairs.
  for (const [x, depth, veranda] of [
    [-69, 2, false],
    [-60, 3, true],
    [-52, 2, false],
    [-41, 2, false],
    [-34, 2, true],
  ]) {
    streetHouse(L, { x, zw: 4, side: -1, depth, veranda, seed: 200 + x });
  }
  for (const [x, depth, veranda] of [
    [-70, 2, false],
    [-61, 3, false],
    [-52, 2, true],
    [-42, 2, false],
    [-33, 3, false],
  ]) {
    streetHouse(L, { x, zw: 4, side: 1, depth, veranda, seed: 300 + x });
  }
  streetHouse(L, { x: -10, zw: -6, side: 1, depth: 2, seed: 410 });
  streetHouse(L, { x: -1, zw: -6, side: 1, depth: 2, veranda: true, seed: 411 });
  streetHouse(L, { x: -11, zw: -6, side: -1, depth: 2, seed: 412 });
  // East: a titian from the junction with houses on its south side, a back titian and a link between them.
  L.boardwalk([
    [5.5, -6],
    [48, -6],
    [48, 12],
    [-26, 12],
    [-26, 1.6],
  ]);
  for (const [x, depth] of [
    [16, 2],
    [26, 3],
    [36, 2],
    [45.5, 2],
  ]) {
    streetHouse(L, { x, zw: -6, side: 1, half: TITIAN_HALF, depth, seed: 500 + x });
  }
  for (const [x, depth, veranda] of [
    [-22, 2, false],
    [-12, 3, false],
    [-2, 2, true],
    [8, 2, false],
    [18, 3, false],
    [28, 2, true],
    [38, 2, false],
  ]) {
    streetHouse(L, { x, zw: 12, side: 1, half: TITIAN_HALF, depth, veranda, seed: 600 + x });
  }
  for (const [x, z, yaw] of [
    [-64.4, 9.6, 90],
    [-27.4, 18.2, 0],
    [31.2, 1.4, 90],
  ]) {
    L.put('washing_line', x, WALK, z, yaw);
  }
  for (const [x, z, yaw] of [
    [-50, 13.6, 80],
    [-23.5, -12, 20],
    [24, 15.5, 100],
    [58, -14, 40],
  ]) {
    L.put('sampan', x, WATER - 0.1, z, yaw);
  }

  // --- 7:00 The berembang grove across the river: three rows that blaze in synchrony, then go dark row by row.
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 11; i++) {
      const x = -36 + i * 8 + (random() - 0.5) * 3;
      const z = -100 - row * 7 + (random() - 0.5) * 2.5;
      L.tree(x, z, {
        y: groundAt(x, z) - 0.1,
        kind: (i + row) % 2 ? 'a' : 'b',
        yaw: random() * 360,
        scale: 1.0 + random() * 0.4,
        fireflies: 1.4 - row * 0.2,
      });
    }
  }
  // The rest of the far bank: scattered colonies, then a dark forest edge.
  for (let i = 0; i < 26; i++) {
    const west = i % 2 === 0;
    const x = west ? -150 + random() * 105 : 52 + random() * 100;
    const z = -99 - random() * 24;
    L.tree(x, z, {
      y: groundAt(x, z) - 0.1,
      kind: random() < 0.5 ? 'a' : 'b',
      yaw: random() * 360,
      scale: 0.9 + random() * 0.5,
      fireflies: random() < 0.4 ? 0.3 : 0,
      sync: false,
    });
  }
  for (let i = 0; i < 30; i++) {
    const x = -160 + random() * 320;
    const z = -122 - random() * 30;
    L.tree(x, z, {
      y: groundAt(x, z) - 0.1,
      kind: random() < 0.5 ? 'a' : 'b',
      yaw: random() * 360,
      scale: 1.1 + random() * 0.6,
      fireflies: 0,
    });
  }
  // Village mangroves.
  for (const [x, z] of [
    [-93, 13],
    [-96, -7],
    [-57, 23],
    [-36, -15],
    [-24, 22],
    [12, 22.5],
    [42, 22],
    [62, 4],
    [20, -37],
    [62, -40],
  ]) {
    L.tree(x, z, {
      y: groundAt(x, z) - 0.1,
      kind: random() < 0.5 ? 'a' : 'b',
      yaw: random() * 360,
      scale: 0.85 + random() * 0.35,
      fireflies: 0.2,
      sync: false,
    });
  }
  // The shore behind the village: nipah at the waterline, a line of old trees on the land.
  for (let i = 0; i < 18; i++) {
    const x = -120 + random() * 210;
    const z = 39 + random() * 5;
    L.put('nipah_clump', x, groundAt(x, z) - 0.2, z, random() * 360);
  }
  for (let i = 0; i < 16; i++) {
    const x = -130 + i * 15 + (random() - 0.5) * 8;
    const z = 47 + random() * 12;
    L.tree(x, z, {
      y: groundAt(x, z) - 0.1,
      kind: random() < 0.5 ? 'a' : 'b',
      yaw: random() * 360,
      scale: 1.2 + random() * 0.5,
      fireflies: 0,
    });
  }
  for (let i = 0; i < 14; i++) {
    const x = -80 + random() * 200;
    const z = -95 - random() * 4;
    L.put('nipah_clump', x, groundAt(x, z) - 0.2, z, random() * 360);
  }
  for (const [x, z] of [
    [68, -66],
    [84, -56],
    [86, -68],
    [72, -70],
  ]) {
    L.put('nipah_clump', x, groundAt(x, z) - 0.2, z, random() * 360);
  }
  // Kelip's call corridor: a few fireflies over the water between the jetty head and the grove.
  L.fireflies.push({ center: [2, 3, -78], radius: 4, height: 1.5, weight: 0.35, sync: false });
  L.fireflies.push({ center: [3, 3.5, -88], radius: 5, height: 1.5, weight: 0.35, sync: false });

  // --- Markers, paths and triggers for the missions.
  L.marker('mak_som', [2, DECK, -22.6], 0);
  L.marker('adi_dare', [-72.5, WALK, 4.6], -90);
  L.marker('race_start', [-73.4, WALK, 3.6], 90);
  L.marker('race_adi', [-73.4, WALK, 4.5], 90);
  L.marker('race_finish', [2, DECK, -21], 180);
  L.marker('hikayat', [2, DECK + 0.55, -65.5], 180);
  L.marker('display_view', [2, DECK, -68.8], 180);
  L.marker('jetty_fight', [2, DECK, -64], 180);
  L.marker('rooftop_start', [8, DECK, -22], 90);
  L.marker('old_jetty', [53, OLD, -25], 180);
  L.marker('boss_center', [53, OLD, -61], 180);
  L.marker('boss_adi', [53, OLD, -64.5], 0);
  L.marker('tree_base', [68.5, WALK, -61], 90);
  L.marker('pelita_air', [72.5, 13.0, -62], 90);
  L.path('race_adi', [
    [-73.4, WALK, 4.5],
    [-49, WALK, 4.3],
    [-45, WALK, 4.3],
    [-30.5, WALK, 3.6],
    [-20.6, WALK, -5.6],
    [-19.4, 2.0, -6],
    [-14.6, 2.0, -6],
    [-13, WALK, -6],
    [3.6, WALK, -6.4],
    [4.6, WALK, -13.2],
    [5.1, 2.1, -16],
    [4.6, DECK, -19.6],
    [2.6, DECK, -21.2],
  ]);
  L.path('race_gates', [
    [-45, WALK, 4],
    [-17, 2.0, -6],
    [4, WALK, -8],
    [2, DECK, -21],
  ]);
  L.path('kelip_call', [
    [2, 2.6, -66],
    [2, 3, -78],
    [3, 3.5, -88],
    [6, 6, -101],
  ]);
  L.path('tendrils_jetty', [
    [-4, WATER, -63],
    [8, WATER, -66],
    [-3.5, WATER, -71],
    [7.5, WATER, -71.5],
    [2, WATER, -73],
  ]);
  L.path('adi_flee', [
    [6, DECK, -69],
    [14, WATER, -64],
    [30, WATER, -52],
    [46, WATER, -48],
    [62, WATER, -56],
    [70, 0.9, -58],
  ]);
  L.path(
    'adi_rooftops',
    [
      [15, 20, 22.5, 28.5, 31, 40, 42.5, 48.5].map((x) => [x, RIDGE_TOP, -25]),
      [
        [53, OLD, -25],
        [53, OLD, -55],
      ],
    ].flat(),
  );
  L.trigger('k_leave_room', [-80.5, FLOOR_TOP + 1, 4], { h: [0.6, 1.2, 1.2] });
  L.trigger('k_race_ready', [-73, WALK + 1, 4], { r: 2.5 });
  L.trigger('k_gate_1', [-45, WALK + 1, 4], { h: [1, 2, 2] });
  L.trigger('k_gate_2', [-17, 3, -6], { h: [1, 2, 3] });
  L.trigger('k_gate_3', [4, WALK + 1, -8], { h: [1.5, 2, 1] });
  L.trigger('k_wallrun_hint', [4, WALK + 1, -11], { h: [1.5, 2, 1.5] });
  L.trigger('k_finish', [2, DECK + 1, -21], { h: [9, 2, 2] });
  L.trigger('k_pondok', [2, DECK + 1, -65.5], { r: 4 });
  L.trigger('k_rooftops', [17, FLOOR_TOP + 1, -22], { h: [3, 1.5, 1.5] });
  L.trigger('k_old_jetty', [53, OLD + 1, -25], { h: [3, 2, 3] });
  L.trigger('k_arena', [53, OLD + 1.5, -61], { h: [6, 3, 6] });
  L.trigger('k_tree_top', [72.5, 14, -62], { r: 2.5 });
  return L.toJSON();
}
