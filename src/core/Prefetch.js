/**
 * Early downloads shared by the title script (main.js, before the engine chunk has even arrived) and the
 * AssetLoader: whoever asks first starts the one request; the loader later takes the bytes and the progress over.
 * Pillar 1 (control within 10 s): the models download while three.js and Rapier parse and start up.
 */

/** @type {Map<string, Download>} */
const downloads = new Map();

/**
 * @typedef {object} Download
 * @property {Promise<ArrayBuffer>} bytes
 * @property {number} received bytes so far
 * @property {((received: number) => void)|null} listener progress listener (the loader's)
 */

/**
 * Fetches a file as bytes, streaming so progress is reported as it arrives.
 * @param {typeof fetch} fetchImpl
 * @param {string} url
 * @param {(receivedBytes: number) => void} [onBytes]
 * @param {RequestInit} [init] e.g. `{ priority: 'low' }`
 * @returns {Promise<ArrayBuffer>}
 */
export async function streamBytes(fetchImpl, url, onBytes = () => {}, init = undefined) {
  const response = await (init ? fetchImpl(url, init) : fetchImpl(url));
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onBytes(buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onBytes(received);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

/**
 * Starts downloading `url` unless it already is.
 * @param {string} url
 * @param {typeof fetch} [fetchImpl]
 * @param {RequestInit} [init] request options (e.g. a fetch priority)
 */
export function download(url, fetchImpl = globalThis.fetch.bind(globalThis), init = undefined) {
  if (downloads.has(url)) return;
  /** @type {Download} */
  const record = { bytes: /** @type {any} */ (null), received: 0, listener: null };
  record.bytes = streamBytes(
    fetchImpl,
    url,
    (received) => {
      record.received = received;
      record.listener?.(received);
    },
    init,
  );
  record.bytes.catch(() => {}); // reported to whoever takes it
  downloads.set(url, record);
}

/**
 * Takes over a started download (once).
 * @param {string} url
 * @returns {Download|undefined}
 */
export function takeDownload(url) {
  const record = downloads.get(url);
  downloads.delete(url);
  return record;
}

/**
 * Whether a download for `url` was started and not yet taken.
 * @param {string} url
 */
export function isDownloading(url) {
  return downloads.has(url);
}

/**
 * Warms the HTTP cache with a file another loader fetches itself later (the Basis transcoder).
 * @param {string} url
 */
export function warm(url) {
  globalThis
    .fetch(url)
    .then((response) => response.arrayBuffer())
    .catch(() => {});
}
