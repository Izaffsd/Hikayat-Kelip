#!/usr/bin/env node
/**
 * `npm run assets` — regenerates every shipped asset headless (docs/ASSETS.md §1):
 *   1. checks the toolchain (Blender 5.2, ffmpeg, ktx),
 *   2. runs each Blender job in tools/assets.config.json → build-cache/raw/*.glb (+ previews),
 *   3. optimises each output (tools/optimize-glb.mjs) → public/assets/<group>/<name>.<hash>.glb,
 *   4. removes stale hashed versions and writes src/data/generated/assets.json.
 *
 * Options: --only <jobId>[,<jobId>]   run selected jobs (the manifest keeps other entries)
 *          --skip-blender            only re-optimise existing raw outputs
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLENDER_DEFAULT = 'C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe';
const RAW_DIR = path.join(ROOT, 'build-cache', 'raw');
const PREVIEW_DIR = path.join(ROOT, 'build-cache', 'previews');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');
const MANIFEST = path.join(ROOT, 'src', 'data', 'generated', 'assets.json');

// Large temporary files (Blender, KTX encoding) must not land on drive C: (DECISIONS D-008).
const TMP = process.platform === 'win32' && existsSync('D:\\dev\\.cache') ? 'D:\\dev\\.cache\\tmp' : null;
if (TMP) {
  mkdirSync(TMP, { recursive: true });
  process.env.TEMP = TMP;
  process.env.TMP = TMP;
}

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
 * First line of a tool's version output, or null when the tool is missing.
 * @param {string} command
 * @param {string[]} args
 * @returns {string|null}
 */
function version(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false });
  if (result.status !== 0 || !result.stdout) return null;
  return result.stdout.split(/\r?\n/).find((line) => line.trim()) ?? null;
}

/**
 * Parses `--key value` options.
 * @returns {Record<string, string|boolean>}
 */
function parseArgs() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
    else out[key] = true;
  }
  return out;
}

/**
 * Runs a Blender script headless and fails loudly on errors.
 * @param {string} blender
 * @param {object} job
 */
function runBlenderJob(blender, job) {
  const started = Date.now();
  const result = spawnSync(
    blender,
    [
      '--background',
      '--factory-startup',
      '--python',
      path.join(ROOT, job.script),
      '--',
      '--out',
      RAW_DIR,
      '--previews',
      PREVIEW_DIR,
    ],
    { encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024, env: process.env },
  );
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const failed = result.status !== 0 || /Traceback \(most recent call last\)/.test(output);
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('HK_') || (failed && line.trim())) console.log(`  ${line}`);
  }
  if (failed) throw new Error(`Blender job ${job.id} failed (exit ${result.status})`);
  console.log(`  ${job.id}: Blender ${((Date.now() - started) / 1000).toFixed(1)} s`);
}

/**
 * Lists collider nodes in an optimised GLB (sanity check that pruning kept them).
 * @param {import('@gltf-transform/core').Document} document
 * @returns {number}
 */
function countColliders(document) {
  return document
    .getRoot()
    .listNodes()
    .filter((node) => node.getExtras()?.hk_collider === 'box').length;
}

async function main() {
  const args = parseArgs();
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
  for (const [name, line] of Object.entries(tools)) {
    console.log(`${name.padEnd(8)} ${line ?? 'MISSING'}`);
    if (!line) {
      console.error(`${name} is missing; see docs/PROGRESS.md "Installed versions".`);
      process.exit(1);
    }
  }

  const config = JSON.parse(readFileSync(path.join(ROOT, 'tools', 'assets.config.json'), 'utf8'));
  const only = typeof args.only === 'string' ? new Set(args.only.split(',')) : null;
  const jobs = config.blender.filter((job) => !only || only.has(job.id));
  if (only && jobs.length === 0) throw new Error(`No job matches --only ${args.only}`);

  const { optimizeGlb, createIO } = await import('./optimize-glb.mjs');
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { assets: {} };
  const report = [];

  for (const job of jobs) {
    console.log(`\n[${job.id}]`);
    if (!args['skip-blender']) runBlenderJob(blender, job);
    for (const output of job.outputs) {
      const raw = path.join(RAW_DIR, output.file);
      if (!existsSync(raw)) throw new Error(`Missing raw output ${raw}`);
      const base = path.basename(output.file, '.glb');
      const temp = path.join(ROOT, 'build-cache', 'opt', output.file);
      const { inputBytes, outputBytes } = await optimizeGlb(raw, temp, {
        textureSize: output.textureSize ?? 512,
      });
      const bytes = readFileSync(temp);
      const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
      const groupDir = path.join(PUBLIC_ASSETS, output.group);
      mkdirSync(groupDir, { recursive: true });
      for (const old of readdirSync(groupDir)) {
        if (old.startsWith(`${base}.`) && old.endsWith('.glb')) rmSync(path.join(groupDir, old));
      }
      const fileName = `${base}.${hash}.glb`;
      writeFileSync(path.join(groupDir, fileName), bytes);
      const io = await createIO();
      const colliders = countColliders(await io.readBinary(new Uint8Array(bytes)));
      manifest.assets[`${output.group}/${base}`] = {
        url: `/assets/${output.group}/${fileName}`,
        bytes: bytes.byteLength,
        type: 'glb',
      };
      report.push({
        asset: `${output.group}/${base}`,
        rawKB: Math.round(inputBytes / 1024),
        shippedKB: Math.round(outputBytes / 1024),
        colliders,
      });
    }
  }

  const sorted = Object.fromEntries(Object.entries(manifest.assets).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(path.dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify({ assets: sorted }, null, 2)}\n`);
  console.log('');
  console.table(report);
  const totalKB = Object.values(sorted).reduce((sum, entry) => sum + entry.bytes, 0) / 1024;
  console.log(`Manifest: ${Object.keys(sorted).length} assets, ${totalKB.toFixed(0)} KB shipped.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
