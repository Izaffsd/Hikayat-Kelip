#!/usr/bin/env node
/**
 * `npm run assets` — regenerates every shipped asset headless (docs/ASSETS.md §1).
 * Phase 1: verifies the toolchain only. Phase 2 adds the Blender, gltf-transform and audio stages.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const BLENDER_DEFAULT = 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';

/**
 * Finds Blender: BLENDER env var, then PATH, then the default install path.
 * @returns {string|null}
 */
export function findBlender() {
  if (process.env.BLENDER && existsSync(process.env.BLENDER)) return process.env.BLENDER;
  const probe = spawnSync('blender', ['--version'], { encoding: 'utf8', shell: false });
  if (probe.status === 0) return 'blender';
  return existsSync(BLENDER_DEFAULT) ? BLENDER_DEFAULT : null;
}

/**
 * Runs a tool's version command and returns its first line (or null when missing).
 * @param {string} command
 * @param {string[]} args
 * @returns {string|null}
 */
function version(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.split(/\r?\n/).find((line) => line.trim()) ?? null;
}

const blender = findBlender();
if (!blender) {
  console.error(
    'Blender 5.2 was not found (PATH, BLENDER env var or the default path). Install it, then retry.',
  );
  process.exit(1);
}
const tools = {
  blender: version(blender, ['--background', '--factory-startup', '--version']),
  ffmpeg: version('ffmpeg', ['-hide_banner', '-version']),
  ktx: version('ktx', ['--version']),
};
let ok = true;
for (const [name, line] of Object.entries(tools)) {
  console.log(`${name.padEnd(8)} ${line ?? 'MISSING'}`);
  if (!line) ok = false;
}
if (!ok) {
  console.error('A required tool is missing; see docs/PROGRESS.md "Installed versions".');
  process.exit(1);
}
console.log('Toolchain OK. No asset scripts yet (the Blender and audio pipelines arrive in Phase 2).');
