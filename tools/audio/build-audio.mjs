/**
 * Audio pipeline (docs/ASSETS.md §1 and §9), run by `npm run assets`. Builds the sound banks in tools/audio/sounds.json:
 *   1. one-shots come from licensed packs in the raw library (decoded with ffmpeg; the licence must be allowed) or
 *      from tools/audio/synth.mjs (original sounds, seeded),
 *   2. each variant is filtered, trimmed, faded and normalised (peak for one-shots, RMS for loops), then gained,
 *   3. a bank's variants are joined with silent gaps and encoded once to mono OGG Vorbis (bit-exact, so the content
 *      hash is stable), published as public/assets/audio/<bank>.<hash>.ogg,
 *   4. returns manifest entries with each sound's [offset, duration] regions and rewrites the generated audio section
 *      of CREDITS.md.
 * A music bank (`stems`) packs a region's looping stems (tools/audio/music.mjs), each normalised to one level and then
 * mixed by its `gain`, each written between copies of its own tail and head so the loop seam is encoded in context.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BEATS_PER_BAR, BPM, STEM_GENERATORS, STING_GENERATORS } from './music.mjs';
import { Biquad, GENERATORS, LOOP_GENERATORS, SAMPLE_RATE, encodeWav } from './synth.mjs';

/** One-shot generators: sound effects and the score's stingers. */
const ONE_SHOTS = { ...GENERATORS, ...STING_GENERATORS };

/** Only these licences may enter a shipped bank (BUILD_PROMPT: never CC BY-NC or GPL). */
export const ALLOWED_LICENSES = Object.freeze(['CC0-1.0']);
const LICENSE_NAMES = { 'CC0-1.0': 'CC0 1.0' };

/** Silence between variants; longer than a Vorbis long-block overlap, so neighbours never bleed into a region. */
const GAP_SECONDS = 0.06;
const PEAK_DB = -1;
const LOOP_RMS_DB = -20;
/** Every stem is normalised to this level; its `gain` then sets the mix. */
const STEM_RMS_DB = -20;
/** Wrap-around context written on both sides of a stem (longer than a Vorbis block, so the seam decodes clean). */
const STEM_PAD_SECONDS = 0.1;
const TRIM_HEAD_DB = -40;
const TRIM_TAIL_DB = -60;
const CREDITS_START = '<!-- audio-credits:start -->';
const CREDITS_END = '<!-- audio-credits:end -->';

const dbToGain = (db) => 10 ** (db / 20);
const round5 = (seconds) => Math.round(seconds * 1e5) / 1e5;
const round7 = (seconds) => Math.round(seconds * 1e7) / 1e7;

/**
 * Decodes an audio file to mono float PCM at SAMPLE_RATE.
 * @param {string} file
 * @returns {Float32Array}
 */
function decode(file) {
  const result = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SAMPLE_RATE), 'pipe:1'],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  if (result.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${result.stderr}`);
  const bytes = result.stdout;
  return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

/**
 * Encodes mono float PCM to OGG Vorbis, bit-exact (no random stream serial, no encoder version tag).
 * @param {Float32Array} samples
 * @param {number} quality libvorbis -q:a
 * @param {string} output
 */
function encodeOgg(samples, quality, output) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-y',
      '-f',
      'f32le',
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      '1',
      '-i',
      'pipe:0',
      '-c:a',
      'libvorbis',
      '-q:a',
      String(quality),
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      output,
    ],
    {
      input: Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength),
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.status !== 0) throw new Error(`ffmpeg could not encode ${output}: ${result.stderr}`);
}

/** @param {Float32Array} samples */
function peakOf(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  return peak;
}

/** @param {Float32Array} samples */
function rmsOf(samples) {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

/**
 * Removes leading and trailing near-silence (relative to the sound's peak) and fades the edges.
 * @param {Float32Array} samples
 * @param {number} [maxLength] seconds
 * @returns {Float32Array}
 */
function trimAndFade(samples, maxLength) {
  const peak = peakOf(samples);
  if (peak === 0) throw new Error('sound is silent');
  const head = peak * dbToGain(TRIM_HEAD_DB);
  const tail = peak * dbToGain(TRIM_TAIL_DB);
  let start = 0;
  while (Math.abs(samples[start]) < head) start++;
  let end = samples.length - 1;
  while (end > start && Math.abs(samples[end]) < tail) end--;
  // A tail still ringing at the buffer's end (reverb, long decays) gets a longer fade than a clean trim.
  const ringing = end >= samples.length - 1 - Math.round(0.005 * SAMPLE_RATE);
  start = Math.max(0, start - Math.round(0.002 * SAMPLE_RATE));
  end = Math.min(samples.length, end + 1);
  const cut = maxLength && end > start + Math.round(maxLength * SAMPLE_RATE);
  if (cut) end = start + Math.round(maxLength * SAMPLE_RATE);
  const out = samples.slice(start, end);
  const fadeIn = Math.min(out.length, Math.round(0.001 * SAMPLE_RATE));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fadeSeconds = cut ? 0.03 : ringing ? Math.min(0.15, (out.length / SAMPLE_RATE) * 0.2) : 0.01;
  const fadeOut = Math.min(out.length, Math.round(fadeSeconds * SAMPLE_RATE));
  for (let i = 0; i < fadeOut; i++) out[out.length - 1 - i] *= (i / fadeOut) ** 2;
  return out;
}

/**
 * @param {Float32Array} samples
 * @param {number} gain linear
 */
function scale(samples, gain) {
  for (let i = 0; i < samples.length; i++) samples[i] *= gain;
  return samples;
}

/**
 * @param {Float32Array} samples
 * @param {{ lowpass?: number, highpass?: number }} spec
 */
function filter(samples, spec) {
  const stages = [];
  if (spec.highpass) stages.push(new Biquad('highpass', spec.highpass, 0.707));
  if (spec.lowpass) stages.push(new Biquad('lowpass', spec.lowpass, 0.707));
  for (const stage of stages) for (let i = 0; i < samples.length; i++) samples[i] = stage.process(samples[i]);
  return samples;
}

/**
 * Renders every variant of a one-shot sound.
 * @returns {{ variants: Float32Array[], files: string[] }}
 */
function renderSound(id, spec, sources, rawDir) {
  let raw;
  let files = [];
  if (spec.synth) {
    const generate = ONE_SHOTS[spec.synth];
    if (!generate) throw new Error(`${id}: unknown synth "${spec.synth}"`);
    if (LOOP_GENERATORS.includes(spec.synth))
      throw new Error(`${id}: ${spec.synth} is a loop; use a loop bank`);
    raw = (spec.seeds ?? [1]).map((seed) => generate(seed));
  } else {
    const source = sources[spec.source];
    if (!source) throw new Error(`${id}: unknown source "${spec.source}"`);
    if (!ALLOWED_LICENSES.includes(source.license)) {
      throw new Error(`${id}: licence ${source.license} of ${spec.source} is not allowed`);
    }
    files = spec.files;
    raw = files.map((file) => {
      const full = path.join(rawDir, source.dir, file);
      if (!existsSync(full)) {
        throw new Error(
          `${id}: missing ${full}. Download ${source.title} (${source.url}) into ${source.dir}.`,
        );
      }
      return decode(full);
    });
  }
  const variants = raw.map((samples) => {
    const shaped = trimAndFade(filter(samples, spec), spec.maxLength);
    return scale(shaped, (dbToGain(PEAK_DB) / peakOf(shaped)) * dbToGain(spec.gain ?? 0));
  });
  return { variants, files };
}

/**
 * Renders a seamless loop: RMS-normalised, never trimmed or filtered (that would break the seam).
 * @returns {Float32Array}
 */
function renderLoop(id, spec) {
  if (!LOOP_GENERATORS.includes(spec.synth)) throw new Error(`${id}: ${spec.synth} is not a loop generator`);
  const samples = GENERATORS[spec.synth](spec.seed ?? 1);
  const gain = dbToGain(LOOP_RMS_DB) / rmsOf(samples);
  const limited = Math.min(gain * dbToGain(spec.gain ?? 0), dbToGain(PEAK_DB) / peakOf(samples));
  return scale(samples, limited);
}

/**
 * Renders a music bank's stems: each an exact number of bars, normalised to STEM_RMS_DB, then its own `gain`, limited
 * to the peak ceiling.
 * @param {string} id bank id
 * @param {Record<string, { synth: string, seed?: number, gain?: number }>} stems
 * @returns {[string, Float32Array[], { loop: true }][]}
 */
function renderStems(id, stems) {
  const barSamples = (60 / BPM) * BEATS_PER_BAR * SAMPLE_RATE;
  const rendered = Object.entries(stems).map(([stem, spec]) => {
    const generate = STEM_GENERATORS[spec.synth];
    if (!generate) throw new Error(`${id}.${stem}: unknown stem "${spec.synth}"`);
    const samples = generate(spec.seed ?? 1);
    const bars = samples.length / barSamples;
    if (Math.abs(bars - Math.round(bars)) > 1e-6)
      throw new Error(`${id}.${stem}: not a whole number of bars`);
    return { stem, spec, samples };
  });
  return rendered.map(({ stem, spec, samples }) => {
    const gain = Math.min(
      (dbToGain(STEM_RMS_DB) / rmsOf(samples)) * dbToGain(spec.gain ?? 0),
      dbToGain(PEAK_DB) / peakOf(samples),
    );
    return [stem, [scale(samples, gain)], { loop: true }];
  });
}

/**
 * Joins variants with silent gaps. A looping sound is written between copies of its own tail and head, so its seam
 * is encoded (and decoded) exactly as it will play.
 * @param {[string, Float32Array[], { loop?: boolean }?][]} sounds
 * @returns {{ samples: Float32Array, regions: Record<string, number[][]> }}
 */
function assemble(sounds) {
  const gap = Math.round(GAP_SECONDS * SAMPLE_RATE);
  const pad = Math.round(STEM_PAD_SECONDS * SAMPLE_RATE);
  const padOf = (options) => (options?.loop ? pad : 0);
  const total = sounds.reduce(
    (sum, [, variants, options]) =>
      sum + variants.reduce((s, v) => s + v.length + 2 * padOf(options) + gap, 0),
    -gap,
  );
  const samples = new Float32Array(total);
  const regions = {};
  let cursor = 0;
  for (const [id, variants, options] of sounds) {
    regions[id] = [];
    const context = padOf(options);
    for (const variant of variants) {
      if (context) samples.set(variant.subarray(variant.length - context), cursor);
      samples.set(variant, cursor + context);
      if (context) samples.set(variant.subarray(0, context), cursor + context + variant.length);
      const round = options?.loop ? round7 : round5;
      regions[id].push([round((cursor + context) / SAMPLE_RATE), round(variant.length / SAMPLE_RATE)]);
      cursor += variant.length + 2 * context + gap;
    }
  }
  return { samples, regions };
}

/**
 * Compacts numbered file names: footstep_wood_000..004.ogg → footstep_wood_000–004.
 * @param {string[]} files
 */
function compactNames(files) {
  const groups = new Map();
  for (const file of files) {
    const stem = file.replace(/\.[^.]+$/, '');
    const match = stem.match(/^(.*?)(\d+)$/);
    const prefix = match ? match[1] : stem;
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(match ? match[2] : '');
  }
  return [...groups]
    .map(([prefix, numbers]) => {
      const values = numbers.map(Number);
      const consecutive = numbers.every((n, i) => n !== '' && (i === 0 || values[i] === values[i - 1] + 1));
      if (numbers.length > 1 && consecutive) return `${prefix}${numbers[0]}–${numbers.at(-1)}`;
      return numbers.map((n) => `${prefix}${n}`).join(', ');
    })
    .join(', ');
}

/**
 * Rewrites the generated audio section of CREDITS.md (one row per bank and source pack).
 * @param {string} creditsPath
 * @param {{ bank: string, source: object, files: string[] }[]} uses
 */
function writeCredits(creditsPath, uses) {
  const rows = uses.map(
    ({ bank, source, files }) =>
      `| \`public/assets/audio/${bank}.*.ogg\` from ${compactNames(files)} (trimmed, filtered, normalised) | ` +
      `${source.title} | ${source.author} | ${LICENSE_NAMES[source.license]} | ${source.url} |`,
  );
  const section = [
    CREDITS_START,
    '## Audio',
    '',
    'Generated by `npm run assets` (tools/audio/build-audio.mjs). Every sound not listed here is original, synthesised',
    'by `tools/audio/synth.mjs`.',
    '',
    '| File(s) | Source | Author | License | Link |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    CREDITS_END,
  ].join('\n');
  const text = readFileSync(creditsPath, 'utf8');
  const start = text.indexOf(CREDITS_START);
  const end = text.indexOf(CREDITS_END);
  let next;
  if (start >= 0 && end > start) {
    next = text.slice(0, start) + section + text.slice(end + CREDITS_END.length);
  } else {
    const anchor = text.indexOf('## Development tools');
    next =
      anchor >= 0
        ? `${text.slice(0, anchor)}${section}\n\n${text.slice(anchor)}`
        : `${text.trimEnd()}\n\n${section}\n`;
  }
  writeFileSync(creditsPath, next);
}

/**
 * Builds every bank, publishes the OGG files and returns their manifest entries.
 * @param {object} options
 * @param {string} options.root repository root
 * @param {string} options.rawDir raw asset library (outside git)
 * @returns {Promise<{ entries: Record<string, object>, report: object[] }>}
 */
export async function buildAudio({ root, rawDir }) {
  const config = JSON.parse(readFileSync(path.join(root, 'tools', 'audio', 'sounds.json'), 'utf8'));
  const publicDir = path.join(root, 'public', 'assets', 'audio');
  const previewDir = path.join(root, 'build-cache', 'audio');
  mkdirSync(publicDir, { recursive: true });
  mkdirSync(previewDir, { recursive: true });

  const entries = {};
  const report = [];
  const credits = [];
  const published = new Set();
  for (const bank of config.banks) {
    const started = Date.now();
    let built;
    const uses = new Map();
    if (bank.loop) {
      const samples = renderLoop(bank.id, bank.loop);
      built = { samples, regions: { [bank.id]: [[0, round5(samples.length / SAMPLE_RATE)]] } };
    } else {
      const sounds = Object.entries(bank.sounds ?? {}).map(([id, spec]) => {
        const { variants, files } = renderSound(id, spec, config.sources, rawDir);
        if (files.length) uses.set(spec.source, [...(uses.get(spec.source) ?? []), ...files]);
        return [id, variants];
      });
      const stems = bank.stems ? renderStems(bank.id, bank.stems) : [];
      built = assemble([...stems, ...sounds]);
    }

    const temp = path.join(previewDir, `${bank.id}.ogg`);
    encodeOgg(built.samples, bank.quality ?? 3, temp);
    writeFileSync(path.join(previewDir, `${bank.id}.wav`), encodeWav(built.samples));
    const bytes = readFileSync(temp);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const fileName = `${bank.id}.${hash}.ogg`;
    writeFileSync(path.join(publicDir, fileName), bytes);
    published.add(fileName);

    entries[`audio/${bank.id}`] = {
      url: `/assets/audio/${fileName}`,
      bytes: bytes.byteLength,
      type: 'audio',
      bus: bank.bus,
      ...(bank.loop ? { loop: true } : {}),
      ...(bank.stems
        ? { music: { bpm: BPM, beatsPerBar: BEATS_PER_BAR }, loops: Object.keys(bank.stems) }
        : {}),
      sounds: built.regions,
    };
    for (const [sourceId, files] of uses)
      credits.push({ bank: bank.id, source: config.sources[sourceId], files });
    report.push({
      asset: `audio/${bank.id}`,
      sounds: Object.keys(built.regions).length,
      variants: Object.values(built.regions).reduce((sum, regions) => sum + regions.length, 0),
      seconds: round5(built.samples.length / SAMPLE_RATE).toFixed(1),
      shippedKB: Math.round(bytes.byteLength / 1024),
      buildS: ((Date.now() - started) / 1000).toFixed(1),
    });
  }

  for (const file of readdirSync(publicDir)) {
    if (!published.has(file)) rmSync(path.join(publicDir, file));
  }
  writeCredits(path.join(root, 'CREDITS.md'), credits);
  return { entries, report };
}
