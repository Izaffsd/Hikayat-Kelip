/**
 * Compact text codes for exporting and importing saves: UTF-8 JSON → deflate-raw → base64url,
 * prefixed with a format tag. Uses the browser's CompressionStream (also available in Node 18+).
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Compresses bytes with deflate-raw.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Decompresses deflate-raw bytes.
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array>}
 */
export async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Base64url without padding.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function toBase64Url(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, /** @type {any} */ (bytes.subarray(i, i + chunk)));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes base64url (with or without padding).
 * @param {string} text
 * @returns {Uint8Array}
 */
export function fromBase64Url(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encodes a JSON-serialisable value as a tagged text code.
 * @param {string} tag short format tag, e.g. 'HK1'
 * @param {unknown} value
 * @returns {Promise<string>}
 */
export async function encodeCode(tag, value) {
  const compressed = await deflate(encoder.encode(JSON.stringify(value)));
  return `${tag}.${toBase64Url(compressed)}`;
}

/**
 * Decodes a tagged text code. Throws when the tag does not match or the payload is damaged.
 * @param {string} tag
 * @param {string} code
 * @returns {Promise<any>}
 */
export async function decodeCode(tag, code) {
  const trimmed = code.trim();
  const prefix = `${tag}.`;
  if (!trimmed.startsWith(prefix)) throw new Error('Unrecognised code format');
  const bytes = await inflate(fromBase64Url(trimmed.slice(prefix.length)));
  return JSON.parse(decoder.decode(bytes));
}
