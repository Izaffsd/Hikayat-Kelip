/**
 * Prologue — Malam Pemburuan (GDD "The first 10 minutes", 0:05–3:15): a storm night forty years ago over the
 * flooded Kampung Berembang. Young Wan sprints along stilt-house ridges (0:05), leaps off the tall house and glides
 * on the wau to a raised platform (0:30), fights shadow wisps there (1:00), chases the tiger's silhouette through
 * storm-wrecked houses with a wall-run over the water (2:00), and faces it on a jetty in the rain (3:00).
 *
 * The flood is at y = 1.5: boardwalks and the ground are under water, so the route is roofs, floors and raised decks.
 */
import { Layout, RIDGE, rng } from './lib.mjs';

const WATER = 1.5;

export function prologue() {
  const L = new Layout('prologue', {
    kits: ['kits/kampung_kit'],
    light: 'storm',
    weather: 'storm',
    water: { level: WATER, size: 900, deadly: true },
    terrain: { center: [90, 0], size: [420, 260], res: 96, base: -0.8, seed: 3, noise: 0.15, islands: [] },
  });
  const random = rng(1977);

  // --- 0:05 Ridge run: five houses end to end along +X (yaw 90 → length along +X, front door facing −X).
  const ridge = [
    { x: 0, lift: 0, depth: 2 },
    { x: 8.8, lift: 0.2, depth: 2 },
    { x: 17.4, lift: 0.5, depth: 2 },
    { x: 26.4, lift: 0.3, depth: 2 },
    { x: 35.0, lift: 0.8, depth: 3 },
    { x: 46.6, lift: 1.7, depth: 2 }, // the tall house: launch point for the glide
  ];
  ridge.forEach((h, i) => {
    L.house({
      x: h.x,
      z: 0,
      yaw: 90,
      depth: h.depth,
      lift: h.lift,
      stairs: false,
      damage: i % 2 ? 'damaged' : 'none',
      seed: 10 + i,
    });
  });
  L.marker('spawn', [1.6, RIDGE + 0.05, 0], 90);
  const launch = ridge[ridge.length - 1];
  L.trigger('p_glide_hint', [launch.x + 4.5, RIDGE + launch.lift, 0], { h: [2.5, 3, 2] });

  // --- 1:00 Arena: a raised platform of 4×4 floors (top 2.6) with lamps at the corners.
  const arena = { x: 88, z: -6 };
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) L.put('floor_3x3', arena.x + 1.5 + i * 3, 0.2, arena.z + 1.5 + j * 3);
  }
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++)
      if (i % 2 === 0 && j % 2 === 0) L.put('post', arena.x + i * 3, 0.2, arena.z + j * 3);
  }
  for (const [px, pz] of [
    [arena.x + 0.6, arena.z + 0.6],
    [arena.x + 11.4, arena.z + 0.6],
    [arena.x + 0.6, arena.z + 11.4],
    [arena.x + 11.4, arena.z + 11.4],
  ]) {
    L.put('pelita_post', px, 2.6, pz, random() * 360);
  }
  L.put('debris_planks', arena.x + 4, 2.6, arena.z + 8, 30);
  L.put('tempayan', arena.x + 10.6, 2.6, arena.z + 2.2);
  L.put('crate', arena.x + 1.6, 2.6, arena.z + 10.2, 15);
  L.trigger('p_arena', [arena.x + 6, 3.5, arena.z + 6], { h: [6.5, 3, 6.5] });
  L.marker('arena_center', [arena.x + 6, 2.6, arena.z + 6], 90);
  L.path('wisp_spawns', [
    [arena.x + 2, 4.2, arena.z - 6],
    [arena.x + 14, 4.0, arena.z - 3],
    [arena.x + 15, 4.4, arena.z + 14],
    [arena.x - 2, 4.1, arena.z + 13],
  ]);

  // --- 2:00 Chase: through a wrecked house (doors at both ends), across a sunken floor, along a wall over the
  // water (wall-run), over debris, onto a last roof and down to the jetty.
  const c1 = 103.2;
  L.house({
    x: c1,
    z: 0,
    yaw: 90,
    depth: 2,
    lift: -0.6,
    stairs: false,
    damage: 'damaged',
    seed: 41,
    walls: [
      'wall_door',
      'wall_door',
      'wall_planks_broken',
      'wall_window',
      'wall_planks',
      'wall_planks_broken',
    ],
  });
  L.put('debris_planks', c1 + 3, 1.8 + 1.05, 0, 90, 0, 8); // fallen planks at chest height: slide under
  L.box([c1 + 3, 1.8 + 1.35, 0], [0.25, 0.35, 1.4], { tags: 'slide_under' });
  // Sunken floor stepping stones.
  L.put('floor_broken', 112.5, -0.9, -0.6, 12, 4, -6);
  L.put('floor_3x3', 116.4, -0.7, 0.4, -8, 0, 3);
  // Wall-run wall: three walls on posts along +X at z = +2.6; the floor beneath ends, water below.
  for (let i = 0; i < 3; i++) {
    L.put('wall_planks', 121.5 + i * 3, -0.4, 2.6, 0);
    L.put('post', 120 + i * 3, -0.4, 2.6);
  }
  L.put('post', 129, -0.4, 2.6);
  L.put('floor_3x3', 132.5, -0.5, 1.2, 0);
  L.put('sampan', 137.2, WATER - 0.1, -1.0, 75);
  L.put('debris_planks', 140.4, WATER - 0.05, 0.6, 20);
  L.house({ x: 142.6, z: 0, yaw: 90, depth: 2, lift: -0.4, stairs: false, damage: 'wrecked', seed: 47 });
  L.trigger('p_chase_start', [arena.x + 12, 3.5, 0], { h: [1.5, 3, 6] });
  L.trigger('p_wallrun_hint', [119, 3, 1.6], { h: [2.5, 3, 2.5] });
  L.path('tiger', [
    [arena.x + 13, 2.6, 0],
    [c1 + 1, 1.9, 0],
    [c1 + 5.5, 1.9, 0],
    [116.4, 1.8, 0.4],
    [124, 1.9, 1.4],
    [132.5, 1.95, 1.2],
    [140.4, 1.6, 0.6],
    [145, 5.9, 0],
    [152, 2.0, 0],
    [172, 2.0, 0],
  ]);

  // --- 3:00 Standoff jetty: raised deck along +X (top 1.8), lamps, the tiger at its end.
  L.jetty(150, 0.6, 0, 90, 9, { pelita: 3 });
  L.trigger('p_standoff', [166, 2.6, 0], { h: [3, 2, 2] });
  L.marker('standoff_wan', [163, 1.8, 0], 90);
  L.marker('standoff_tiger', [175.5, 1.8, 0], -90);

  // --- Dressing: drowned houses, mangroves and nipah on both sides, sampans and debris on the water.
  const background = [
    [-6, -14, 0, 'damaged', -0.9],
    [12, 16, 180, 'wrecked', -1.4],
    [30, -18, 10, 'damaged', -0.6],
    [52, 17, 170, 'wrecked', -1.1],
    [70, -14, 5, 'damaged', -0.8],
    [76, 18, 185, 'damaged', -0.5],
    [118, -16, -5, 'wrecked', -1.2],
    [128, 17, 175, 'damaged', -0.7],
    [160, -15, 0, 'damaged', -1.0],
    [182, 14, 190, 'wrecked', -1.3],
  ];
  background.forEach(([x, z, yaw, damage, lift], i) =>
    L.house({ x, z, yaw, depth: 2, lift, damage, stairs: false, seed: 60 + i }),
  );
  for (let i = 0; i < 26; i++) {
    const x = -20 + random() * 220;
    const side = random() < 0.5 ? -1 : 1;
    const z = side * (24 + random() * 30);
    L.tree(x, z, {
      y: WATER - 1.6,
      kind: random() < 0.5 ? 'a' : 'b',
      yaw: random() * 360,
      scale: 0.9 + random() * 0.5,
      fireflies: random() < 0.25 ? 0.4 : 0,
      sync: false,
    });
  }
  for (let i = 0; i < 14; i++) {
    L.put(
      'nipah_clump',
      -10 + random() * 210,
      WATER - 0.9,
      (random() < 0.5 ? -1 : 1) * (12 + random() * 14),
      random() * 360,
    );
  }
  for (let i = 0; i < 6; i++)
    L.put('sampan', 20 + random() * 150, WATER - 0.12, (random() - 0.5) * 30, random() * 360);
  for (let i = 0; i < 10; i++)
    L.put('debris_planks', 10 + random() * 170, WATER - 0.08, (random() - 0.5) * 40, random() * 360);

  // Glide corridor guide: a few fireflies over the water toward the arena (Kelam has not taken them all).
  L.fireflies.push({ center: [70, 6, 0], radius: 10, height: 2, weight: 0.6, sync: false });
  L.lamp('pelita', [arena.x + 6, 3.6, arena.z + 6]);
  return L.toJSON();
}
