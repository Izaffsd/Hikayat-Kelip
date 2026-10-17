import { EV } from '../core/events.js';

/**
 * The story's state (TECHNICAL §9): flags and counters, Tok Wan's journal lines, the hikayat's returned pages,
 * Cahaya, completed missions and where the story stands. It lives in the save document (`story`, `missions`,
 * `progression`), so saving is just writing the document.
 */
export class StoryState {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {object} options.doc save document (core/saveSchema.js), shared and mutated in place
   */
  constructor({ bus, doc }) {
    this.bus = bus;
    this.doc = doc;
  }

  /**
   * @param {string} name
   * @returns {any}
   */
  get(name) {
    return this.doc.story.flags[name];
  }

  /**
   * @param {string} name
   * @param {any} [value=true]
   */
  set(name, value = true) {
    if (this.doc.story.flags[name] === value) return;
    this.doc.story.flags[name] = value;
    this.bus.emit(EV.STORY_FLAG, { name, value });
  }

  /**
   * Adds to a numeric flag (counters: freed villagers, scrolls read).
   * @param {string} name
   * @param {number} [delta=1]
   * @returns {number}
   */
  add(name, delta = 1) {
    const value = (Number(this.doc.story.flags[name]) || 0) + delta;
    this.set(name, value);
    return value;
  }

  /**
   * @param {string} id dialogue/journal line id
   */
  addJournal(id) {
    if (this.doc.story.journal.includes(id)) return;
    this.doc.story.journal.push(id);
    this.bus.emit(EV.JOURNAL_ADDED, { id });
  }

  /**
   * @param {number} page
   */
  returnPage(page) {
    if (this.doc.story.pages.includes(page)) return;
    this.doc.story.pages.push(page);
    this.doc.story.pages.sort((a, b) => a - b);
    this.bus.emit(EV.PAGE_RETURNED, { page });
  }

  /**
   * @param {number} amount
   */
  addCahaya(amount) {
    this.doc.progression.cahaya += amount;
    this.bus.emit(EV.CAHAYA_CHANGED, { value: this.doc.progression.cahaya });
  }

  /**
   * Where the story stands (saved with every checkpoint).
   * @param {string} chapter
   * @param {string} mission
   * @param {string|null} step
   */
  setPosition(chapter, mission, step) {
    this.doc.story.chapter = chapter;
    this.doc.story.mission = mission;
    this.doc.story.step = step;
  }

  /**
   * @param {string} id
   */
  completeMission(id) {
    this.doc.missions.completed[id] = true;
  }

  /**
   * @param {string} id
   * @returns {boolean}
   */
  completed(id) {
    return this.doc.missions.completed[id] === true;
  }
}
