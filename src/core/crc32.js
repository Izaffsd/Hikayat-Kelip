/** Precomputed CRC-32 (IEEE 802.3) table. */
const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const encoder = new TextEncoder();

/**
 * CRC-32 of a byte array.
 * @param {Uint8Array} bytes
 * @returns {number} unsigned 32-bit checksum
 */
export function crc32Bytes(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * CRC-32 of a string's UTF-8 encoding.
 * @param {string} text
 * @returns {number}
 */
export function crc32(text) {
  return crc32Bytes(encoder.encode(text));
}
