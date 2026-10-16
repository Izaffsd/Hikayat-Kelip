/**
 * @typedef {object} KeyValueStorage
 * @property {boolean} available false when the browser blocks persistent storage (memory only)
 * @property {(key: string) => string|null} get
 * @property {(key: string, value: string) => void} set throws on quota errors
 * @property {(key: string) => void} remove
 */

/**
 * Wraps `localStorage`, falling back to an in-memory map when it is unavailable
 * (private modes, disabled cookies, sandboxed iframes).
 * @param {Storage|null} [backing] defaults to `window.localStorage` when it works
 * @returns {KeyValueStorage}
 */
export function createStorage(backing) {
  const store = backing === undefined ? probeLocalStorage() : backing;
  if (store) {
    return {
      available: true,
      get: (key) => store.getItem(key),
      set: (key, value) => store.setItem(key, value),
      remove: (key) => store.removeItem(key),
    };
  }
  return createMemoryStorage();
}

/**
 * An in-memory storage (also used by tests).
 * @returns {KeyValueStorage}
 */
export function createMemoryStorage() {
  const map = new Map();
  return {
    available: false,
    get: (key) => (map.has(key) ? map.get(key) : null),
    set: (key, value) => {
      map.set(key, String(value));
    },
    remove: (key) => {
      map.delete(key);
    },
  };
}

/**
 * @returns {Storage|null}
 */
function probeLocalStorage() {
  try {
    const store = globalThis.localStorage;
    if (!store) return null;
    const probe = '__hk_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}
