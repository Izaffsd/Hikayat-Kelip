import { EV } from '../core/events.js';

/**
 * Achievements (data/achievements.json): earned once, kept in the save with the time earned, announced with a
 * toast. Missions award them with an action; game rules award the rest.
 */
export class Achievements {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {object} options.config data/achievements.json
   * @param {{ progression: { achievements: Record<string, number> } }} options.doc save document
   * @param {() => number} [options.now]
   */
  constructor({ bus, config, doc, now = () => Date.now() }) {
    Object.assign(this, { bus, config, doc, now });
  }

  /**
   * @param {string} id
   * @returns {boolean} whether it was newly earned
   */
  unlock(id) {
    const def = this.config.achievements[id];
    if (!def) throw new Error(`Achievements: unknown "${id}"`);
    const earned = this.doc.progression.achievements;
    if (earned[id]) return false;
    earned[id] = this.now();
    this.bus.emit(EV.ACHIEVEMENT, { id });
    this.bus.emit(EV.TOAST, { title: def.title, body: def.body, kind: 'achievement' });
    return true;
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return !!this.doc.progression.achievements[id];
  }
}
