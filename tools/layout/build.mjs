#!/usr/bin/env node
/**
 * `npm run layouts` — regenerates every region layout in src/data/regions from the programs in tools/layout.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prologue } from './prologue.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'src', 'data', 'regions');
mkdirSync(OUT, { recursive: true });

for (const build of [prologue]) {
  const region = build();
  const file = path.join(OUT, `${region.id}.json`);
  writeFileSync(file, `${JSON.stringify(region)}\n`);
  const kinds = new Set(region.placements.map((p) => p[0]));
  console.log(
    `${region.id}: ${region.placements.length} placements (${kinds.size} piece types), ${region.boxes.length} boxes, ` +
      `${Object.keys(region.markers).length} markers, ${region.triggers.length} triggers, ` +
      `${region.fireflies.length} firefly groups → ${path.relative(ROOT, file)}`,
  );
}
