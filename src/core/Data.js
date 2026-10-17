/**
 * Read-only access to the JSON data in `src/data` (the ScriptableObject equivalent).
 * Small, always-needed files are bundled eagerly; large per-chapter files (dialogue, missions, region layouts)
 * are loaded on demand with `loadData`, so the first play only downloads what the prologue needs.
 */

const eagerFiles = import.meta.glob(
  ['../data/**/*.json', '!../data/dialogue/**', '!../data/missions/**', '!../data/regions/**'],
  { eager: true, import: 'default' },
);
const lazyFiles = import.meta.glob(
  ['../data/dialogue/**/*.json', '../data/missions/**/*.json', '../data/regions/**/*.json'],
  { import: 'default' },
);

/** @type {Map<string, any>} */
const table = new Map();
for (const [path, value] of Object.entries(eagerFiles)) {
  table.set(toKey(path), deepFreeze(value));
}

/**
 * Returns a bundled data file by key, e.g. `data('tuning/player')`.
 * @param {string} key path under src/data without the .json extension
 * @returns {any} deeply frozen data
 */
export function data(key) {
  const value = table.get(key);
  if (value === undefined) throw new Error(`Unknown data file: ${key}`);
  return value;
}

/**
 * Whether a bundled data file exists.
 * @param {string} key
 * @returns {boolean}
 */
export function hasData(key) {
  return table.has(key);
}

/**
 * Loads an on-demand data file (dialogue, missions) and caches it.
 * @param {string} key e.g. 'dialogue/en/ch1'
 * @returns {Promise<any>}
 */
export async function loadData(key) {
  const cached = table.get(key);
  if (cached !== undefined) return cached;
  const loader = lazyFiles[`../data/${key}.json`];
  if (!loader) throw new Error(`Unknown data file: ${key}`);
  const value = deepFreeze(await loader());
  table.set(key, value);
  return value;
}

/**
 * Keys of all bundled data files (used by tests).
 * @returns {string[]}
 */
export function dataKeys() {
  return [...table.keys()];
}

/**
 * @param {string} path
 * @returns {string}
 */
function toKey(path) {
  return path.replace('../data/', '').replace(/\.json$/, '');
}

/**
 * Freezes an object graph so tuning values cannot be mutated by accident.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(/** @type {any} */ (value)[key]);
  }
  return value;
}
