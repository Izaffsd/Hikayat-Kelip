/**
 * Which traversal moves Bayu (or young Wan) may use (TECHNICAL §5.3: abilities gate states by chapter). Sets come
 * from `data/abilities.json`; story progress grants more later. Run and jump are always available.
 */
export class Abilities {
  /**
   * @param {object} config data/abilities.json
   * @param {string} [setName='all']
   */
  constructor(config, setName = 'all') {
    this.config = config;
    /** @type {Set<string>} */
    this.granted = new Set();
    this.useSet(setName);
  }

  /**
   * Replaces the granted moves with a named set.
   * @param {string} setName
   */
  useSet(setName) {
    const moves = this.config.sets[setName];
    if (!moves) throw new Error(`Abilities: unknown set "${setName}"`);
    this.granted = new Set(moves);
    this.setName = setName;
  }

  /**
   * The set a region starts with.
   * @param {string} regionId
   * @returns {string}
   */
  setForRegion(regionId) {
    return this.config.regions[regionId] ?? 'all';
  }

  /**
   * @param {string} move
   * @returns {boolean}
   */
  has(move) {
    return this.granted.has(move);
  }

  /**
   * Grants one move (story unlocks).
   * @param {string} move
   */
  grant(move) {
    this.granted.add(move);
  }
}
