/**
 * Validation for anonymous telemetry batches (docs/TECHNICAL.md §2.7). Whitelists event types and
 * fields so nothing personal can be stored by accident. Shared by the function and unit tests.
 */

/** Accepted event types. */
export const EVENT_TYPES = new Set([
  'session_start',
  'mission_start',
  'mission_finish',
  'quit',
  'fps_summary',
]);

const finiteIn = (min, max) => (value) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Field validators; any other field rejects the batch. */
const FIELD_RULES = {
  t: finiteIn(0, 1e9),
  seconds: finiteIn(0, 1e7),
  mission: (value) => typeof value === 'string' && /^[A-Za-z0-9._-]{1,24}$/.test(value),
  backend: (value) => value === 'webgpu' || value === 'webgl2',
  preset: (value) => value === 'low' || value === 'medium' || value === 'high',
  device: (value) => value === 'touch' || value === 'desktop',
  lang: (value) => value === 'bm' || value === 'en',
  fpsAvg: finiteIn(0, 1000),
  fpsP5: finiteIn(0, 1000),
};

/**
 * Validates and normalises a telemetry batch.
 * @param {unknown} body parsed JSON
 * @returns {{ ok: true, session: string, build: string, events: object[] } | { ok: false, error: string }}
 */
export function validateBatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body' };
  const { session, build, events } = /** @type {any} */ (body);
  if (typeof session !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(session))
    return { ok: false, error: 'session' };
  if (typeof build !== 'string' || !/^[A-Za-z0-9._-]{1,32}$/.test(build))
    return { ok: false, error: 'build' };
  if (!Array.isArray(events) || events.length === 0 || events.length > 50)
    return { ok: false, error: 'events' };
  const clean = [];
  for (const event of events) {
    if (!event || typeof event !== 'object' || !EVENT_TYPES.has(event.type))
      return { ok: false, error: 'type' };
    const out = { type: event.type };
    for (const [key, value] of Object.entries(event)) {
      if (key === 'type') continue;
      const rule = FIELD_RULES[key];
      if (!rule || !rule(value)) return { ok: false, error: `field:${key}` };
      out[key] = value;
    }
    clean.push(out);
  }
  return { ok: true, session, build, events: clean };
}
