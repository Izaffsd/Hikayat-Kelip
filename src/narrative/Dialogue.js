import { EV } from '../core/events.js';

/**
 * Spoken lines (TECHNICAL §9): each line has a speaker and its Bahasa Melayu and English text (data/dialogue/*.json);
 * the current language picks one. Lines play one after another as subtitles; barks never block control, and in the
 * first ten minutes nothing must be read to proceed (GDD). A line's time comes from its data or its length.
 */
export class Dialogue {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {{ language: string }} options.i18n
   * @param {{ speakers: Record<string, Record<string, string>>, lines: Record<string, object> }} options.data merged
   */
  constructor({ bus, i18n, data }) {
    this.bus = bus;
    this.i18n = i18n;
    this.speakers = data.speakers ?? {};
    this.lines = data.lines ?? {};
    /** @type {string[]} */
    this.queue = [];
    /** @type {{ id: string, left: number }|null} */
    this.current = null;
  }

  /** Whether a line is showing or waiting. */
  get busy() {
    return this.current !== null || this.queue.length > 0;
  }

  /**
   * Queues lines (a bark is one line; a conversation several).
   * @param {...string} ids
   */
  say(...ids) {
    for (const id of ids) {
      if (!this.lines[id]) throw new Error(`Dialogue: unknown line "${id}"`);
      this.queue.push(id);
    }
    if (!this.current) this._next();
  }

  /** Ends the current line early (a tap in a conversation). */
  skip() {
    if (this.current) this.current.left = 0;
  }

  /** Drops everything (cutscene skip, region change). */
  clear() {
    this.queue.length = 0;
    if (this.current) {
      this.current = null;
      this.bus.emit(EV.DIALOGUE_CLEAR, {});
    }
  }

  /**
   * @param {number} dt real seconds
   */
  update(dt) {
    if (!this.current) return;
    this.current.left -= dt;
    if (this.current.left > 0) return;
    this.current = null;
    if (this.queue.length) this._next();
    else this.bus.emit(EV.DIALOGUE_CLEAR, {});
  }

  /**
   * Text of a line in the current language (BM or EN).
   * @param {string} id
   * @returns {string}
   */
  text(id) {
    const line = this.lines[id];
    return line[this.i18n.language] ?? line.en ?? '';
  }

  /**
   * How long a line stays up: its own `seconds`, or reading time for its longest translation.
   * @param {string} id
   * @returns {number}
   */
  seconds(id) {
    const line = this.lines[id];
    if (line.seconds) return line.seconds;
    const longest = Math.max((line.bm ?? '').length, (line.en ?? '').length);
    return Math.max(1.8, 0.9 + longest * 0.06);
  }

  _next() {
    const id = this.queue.shift();
    const line = this.lines[id];
    const seconds = this.seconds(id);
    this.current = { id, left: seconds };
    const speaker =
      this.speakers[line.speaker]?.[this.i18n.language] ?? this.speakers[line.speaker]?.en ?? '';
    this.bus.emit(EV.DIALOGUE_LINE, { id, speaker, text: this.text(id), seconds });
  }
}
