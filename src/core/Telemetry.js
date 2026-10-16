/**
 * Anonymous, privacy-friendly event tracking (docs/TECHNICAL.md §2.7, DECISIONS D-017).
 * A random session id lives only in memory; no user id, no stored identifiers, no personal data.
 * Disabled in development, when the player turns it off, or when the browser sends Global Privacy Control.
 */
export class Telemetry {
  /**
   * @param {object} options
   * @param {boolean} options.enabled
   * @param {string} [options.endpoint='/api/event']
   * @param {string} [options.build] build identifier
   * @param {typeof fetch} [options.fetchImpl]
   * @param {(url: string, data: Blob) => boolean} [options.beacon]
   * @param {() => number} [options.clock] milliseconds since session start
   */
  constructor({
    enabled,
    endpoint = '/api/event',
    build = 'dev',
    fetchImpl = globalThis.fetch?.bind(globalThis),
    beacon = globalThis.navigator?.sendBeacon?.bind(globalThis.navigator),
    clock = () => performance.now(),
  }) {
    this.enabled = enabled;
    this.endpoint = endpoint;
    this.build = build;
    this.fetchImpl = fetchImpl;
    this.beacon = beacon;
    this.clock = clock;
    this.sessionId = globalThis.crypto?.randomUUID?.() ?? `s-${Math.random().toString(36).slice(2)}`;
    /** @type {object[]} */
    this.queue = [];
    this.maxQueue = 20;
  }

  /**
   * Records an event (type must be one the server accepts; see api/_lib/telemetry.js).
   * @param {string} type
   * @param {Record<string, string|number>} [data]
   */
  track(type, data = {}) {
    if (!this.enabled) return;
    this.queue.push({ type, t: Math.round(this.clock()), ...data });
    if (this.queue.length >= this.maxQueue) this.flush(false);
  }

  /**
   * Sends queued events. `useBeacon` is for page hide, when fetch may be cancelled.
   * @param {boolean} [useBeacon=false]
   */
  flush(useBeacon = false) {
    if (!this.enabled || this.queue.length === 0) return;
    const body = JSON.stringify({ session: this.sessionId, build: this.build, events: this.queue.splice(0) });
    try {
      if (useBeacon && this.beacon) {
        this.beacon(this.endpoint, new Blob([body], { type: 'application/json' }));
        return;
      }
      this.fetchImpl?.(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    } catch {
      // Telemetry must never affect the game.
    }
  }

  /**
   * Turns tracking on or off (settings toggle); disabling drops anything queued.
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.queue.length = 0;
  }
}

/**
 * Whether telemetry may run in this browser and build.
 * @param {object} options
 * @param {boolean} options.settingEnabled
 * @param {boolean} options.production
 * @param {Navigator} [options.nav]
 * @returns {boolean}
 */
export function telemetryAllowed({ settingEnabled, production, nav = globalThis.navigator }) {
  if (!production || !settingEnabled) return false;
  return !(/** @type {any} */ (nav)?.globalPrivacyControl === true);
}
