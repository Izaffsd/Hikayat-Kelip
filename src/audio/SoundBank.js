/**
 * @typedef {object} SoundRegion
 * @property {any} buffer the bank's decoded AudioBuffer
 * @property {number} offset seconds into the buffer
 * @property {number} duration seconds
 * @property {string} bus mixer bus
 * @property {boolean} loop whether the region loops seamlessly (ambience beds, music stems)
 */

/**
 * The decoded sound banks (manifest `audio/<bank>`, built by tools/audio): each bank is one buffer holding every
 * variant of its sounds as [offset, duration] regions. A play picks a variant at random, never the one that played
 * last, so footsteps and hits do not machine-gun.
 */
export class SoundBank {
  /**
   * @param {() => number} [random]
   */
  constructor(random = Math.random) {
    this.random = random;
    /** @type {Map<string, { entry: object, buffer: any }>} */
    this.banks = new Map();
    /** @type {Map<string, { bank: string, buffer: any, regions: number[][], bus: string, loop: boolean }>} */
    this._sounds = new Map();
    /** @type {Map<string, number>} sound → last variant */
    this._last = new Map();
    /** @type {SoundRegion} reused result */
    this._pick = { buffer: null, offset: 0, duration: 0, bus: 'sfx', loop: false };
  }

  /**
   * Registers a decoded bank.
   * @param {string} id e.g. 'sfx'
   * @param {{ bus: string, loop?: boolean, loops?: string[], sounds: Record<string, number[][]> }} entry manifest entry
   * @param {any} buffer decoded AudioBuffer
   */
  add(id, entry, buffer) {
    this.remove(id);
    this.banks.set(id, { entry, buffer });
    for (const [sound, regions] of Object.entries(entry.sounds)) {
      const loop = entry.loop === true || (entry.loops?.includes(sound) ?? false);
      this._sounds.set(sound, { bank: id, buffer, regions, bus: entry.bus, loop });
    }
  }

  /**
   * Drops a bank and its sounds (region change).
   * @param {string} id
   */
  remove(id) {
    if (!this.banks.has(id)) return;
    for (const [sound, value] of this._sounds) if (value.bank === id) this._sounds.delete(sound);
    this.banks.delete(id);
  }

  /**
   * @param {string} id bank
   * @returns {boolean}
   */
  hasBank(id) {
    return this.banks.has(id);
  }

  /**
   * @param {string} sound
   * @returns {boolean}
   */
  has(sound) {
    return this._sounds.has(sound);
  }

  /**
   * Picks a variant of a sound. The result object is reused: read it before the next pick.
   * @param {string} sound
   * @param {number} [variant=-1] a fixed variant, or −1 for a random one
   * @returns {SoundRegion|null}
   */
  pick(sound, variant = -1) {
    const entry = this._sounds.get(sound);
    if (!entry) return null;
    const count = entry.regions.length;
    let index = variant;
    if (index < 0 || index >= count) {
      const last = this._last.get(sound) ?? -1;
      index = Math.floor(this.random() * count);
      if (count > 1 && index === last) index = (index + 1 + Math.floor(this.random() * (count - 1))) % count;
    }
    this._last.set(sound, index);
    const [offset, duration] = entry.regions[index];
    const pick = this._pick;
    pick.buffer = entry.buffer;
    pick.offset = offset;
    pick.duration = duration;
    pick.bus = entry.bus;
    pick.loop = entry.loop;
    return pick;
  }
}
