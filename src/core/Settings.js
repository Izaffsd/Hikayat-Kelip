import { EV } from './events.js';

const STORAGE_KEY = 'hk.settings';
const SETTINGS_VERSION = 1;

/**
 * Player settings: defaults from `data/settings.defaults.json`, overridden by stored values,
 * persisted under their own key (independent of save progress). Values may be the string 'auto',
 * resolved per device by `resolve()`.
 */
export class Settings {
  /**
   * @param {object} options
   * @param {import('./storage.js').KeyValueStorage} options.storage
   * @param {object} options.defaults
   * @param {import('./EventBus.js').EventBus} [options.bus]
   * @param {Record<string, (platform: any) => unknown>} [options.autoResolvers] resolvers for 'auto' values by path
   * @param {any} [options.platform]
   */
  constructor({ storage, defaults, bus, autoResolvers = {}, platform = {} }) {
    this.storage = storage;
    this.defaults = defaults;
    this.bus = bus;
    this.autoResolvers = autoResolvers;
    this.platform = platform;
    this.values = structuredClone(defaults);
    this._saveTimer = 0;
  }

  /**
   * Loads stored values over the defaults. Unknown keys are kept (forward compatibility);
   * values whose type does not match the default are ignored.
   */
  load() {
    const raw = this.storage.get(STORAGE_KEY);
    if (!raw) return;
    try {
      const stored = JSON.parse(raw);
      if (stored && typeof stored === 'object' && stored.values) {
        this.values = mergeTyped(structuredClone(this.defaults), stored.values);
      }
    } catch {
      // Corrupt settings: fall back to defaults; they are rewritten on the next change.
    }
  }

  /**
   * Reads a value by dotted path (raw, may be 'auto').
   * @param {string} path e.g. 'graphics.preset'
   * @returns {any}
   */
  get(path) {
    return readPath(this.values, path);
  }

  /**
   * Reads a value with 'auto' resolved for this device.
   * @param {string} path
   * @returns {any}
   */
  resolve(path) {
    const value = this.get(path);
    if (value !== 'auto') return value;
    const resolver = this.autoResolvers[path];
    return resolver ? resolver(this.platform) : value;
  }

  /**
   * Writes a value by dotted path, persists it (debounced) and emits SETTINGS_CHANGED.
   * @param {string} path
   * @param {any} value
   */
  set(path, value) {
    const fallback = readPath(this.defaults, path);
    const typed = fallback !== undefined && fallback !== null && fallback !== 'auto' && value !== 'auto';
    if (typed && typeof fallback !== typeof value) {
      throw new TypeError(`Setting ${path} expects ${typeof fallback}, got ${typeof value}`);
    }
    if (readPath(this.values, path) === value) return;
    writePath(this.values, path, value);
    this._scheduleSave();
    this.bus?.emit(EV.SETTINGS_CHANGED, { path, value });
  }

  /** Restores every default and persists. */
  reset() {
    this.values = structuredClone(this.defaults);
    this.persist();
    this.bus?.emit(EV.SETTINGS_CHANGED, { path: '*', value: null });
  }

  /** Writes immediately (also called on page hide). */
  persist() {
    clearTimeout(this._saveTimer);
    this._saveTimer = 0;
    try {
      this.storage.set(STORAGE_KEY, JSON.stringify({ version: SETTINGS_VERSION, values: this.values }));
    } catch (error) {
      console.warn('[Settings] could not persist settings', error);
    }
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.persist(), 300);
  }
}

/**
 * Copies values from `source` into `target` where the default type matches (or the default is null
 * or 'auto', or the value is 'auto'). Recurses into plain objects.
 * @param {any} target defaults clone
 * @param {any} source stored values
 * @returns {any}
 */
function mergeTyped(target, source) {
  for (const key of Object.keys(source)) {
    const incoming = source[key];
    const current = target[key];
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) mergeTyped(current, incoming);
    } else if (
      current === undefined ||
      current === null ||
      current === 'auto' ||
      incoming === 'auto' ||
      typeof current === typeof incoming
    ) {
      target[key] = incoming;
    }
  }
  return target;
}

/**
 * @param {any} root
 * @param {string} path
 * @returns {any}
 */
function readPath(root, path) {
  let node = root;
  for (const part of path.split('.')) {
    if (node === null || node === undefined) return undefined;
    node = node[part];
  }
  return node;
}

/**
 * @param {any} root
 * @param {string} path
 * @param {any} value
 */
function writePath(root, path, value) {
  const parts = path.split('.');
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (node[parts[i]] === null || typeof node[parts[i]] !== 'object') node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}
