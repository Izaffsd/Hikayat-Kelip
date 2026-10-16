/**
 * Optimises a raw GLB from Blender for shipping (docs/ASSETS.md §1):
 * dedup → prune (keeping collider empties and extras) → weld → resample → KTX2 textures
 * (ETC1S for colour, UASTC for data) → Meshopt geometry/animation compression with quantization.
 *
 * Usage: node tools/optimize-glb.mjs <in.glb> <out.glb> [--texture-size 512]
 * Requires KTX-Software (`ktx`/`toktx`) on PATH.
 */
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, weld } from '@gltf-transform/functions';
import { Mode, toktx } from '@gltf-transform/cli';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const COLOR_SLOTS = /^(baseColorTexture|emissiveTexture)$/;
const DATA_SLOTS = /^(normalTexture|occlusionTexture|metallicRoughnessTexture)$/;

/**
 * Creates a NodeIO with every extension and the Meshopt codec registered.
 * @returns {Promise<NodeIO>}
 */
export async function createIO() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
}

/**
 * Optimises one GLB.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {object} [options]
 * @param {number} [options.textureSize=512] maximum texture dimension
 * @param {number} [options.quality=160] ETC1S quality (1–255)
 * @param {boolean} [options.keepAttributes=false] keep vertex attributes no material uses (e.g. custom `_SWAY`)
 * @returns {Promise<{ inputBytes: number, outputBytes: number }>}
 */
export async function optimizeGlb(
  inputPath,
  outputPath,
  { textureSize = 512, quality = 160, keepAttributes = false } = {},
) {
  const io = await createIO();
  const document = await io.read(inputPath);
  const resize = /** @type {[number, number]} */ ([textureSize, textureSize]);
  await document.transform(
    dedup(),
    prune({ keepLeaves: true, keepExtras: true, keepAttributes }),
    weld(),
    resample(),
    toktx({ encoder: sharp, mode: Mode.ETC1S, slots: COLOR_SLOTS, quality, compression: 2, resize }),
    toktx({ encoder: sharp, mode: Mode.UASTC, slots: DATA_SLOTS, rdo: true, zstd: 18, resize }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const bytes = await io.writeBinary(document);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  return { inputBytes: (await stat(inputPath)).size, outputBytes: bytes.byteLength };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('usage: node tools/optimize-glb.mjs <in.glb> <out.glb> [--texture-size 512]');
    process.exit(1);
  }
  const sizeIndex = process.argv.indexOf('--texture-size');
  const textureSize = sizeIndex > 0 ? Number(process.argv[sizeIndex + 1]) : 512;
  const { inputBytes, outputBytes } = await optimizeGlb(input, output, { textureSize });
  console.log(
    `${path.basename(input)}: ${(inputBytes / 1024).toFixed(0)} KB -> ${(outputBytes / 1024).toFixed(0)} KB`,
  );
}
