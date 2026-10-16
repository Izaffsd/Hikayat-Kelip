import { validateBatch } from './_lib/telemetry.js';

const MAX_BYTES = 16 * 1024;

/**
 * POST /api/event — anonymous telemetry (DECISIONS D-017). Until the Phase 6 database exists,
 * validated events are written to the function log only. No IP address or identifier is stored.
 * @param {Request} request
 * @returns {Promise<Response>}
 */
export async function POST(request) {
  if (process.env.TELEMETRY_ENABLED === 'false') return new Response(null, { status: 204 });
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) return new Response('Payload too large', { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response('Payload too large', { status: 413 });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const result = validateBatch(body);
  if (!result.ok) return new Response(`Invalid batch (${result.error})`, { status: 400 });
  console.log(
    JSON.stringify({
      kind: 'telemetry',
      at: new Date().toISOString(),
      session: result.session,
      build: result.build,
      events: result.events,
    }),
  );
  return new Response(null, { status: 204 });
}
