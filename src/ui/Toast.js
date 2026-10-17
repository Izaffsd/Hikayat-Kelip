import { EV } from '../core/events.js';

/** Seconds a toast stays (design system / UX guidance: 3–5 s, never persistent). */
const TOAST_SECONDS = 4;

/**
 * Short notices at the top right, under the pause button (achievements, Cahaya, the journal, a trial unlocked):
 * one at a time from a queue, each for a few seconds, announced politely to screen readers. Never needed to play.
 */
export class Toast {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/I18n.js').I18n} options.i18n
   */
  constructor({ root, bus, i18n }) {
    this.i18n = i18n;
    this.element = document.createElement('div');
    this.element.className = 'hk-toast';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
    this.element.innerHTML = `<p class="hk-toast__kicker"></p><p class="hk-toast__title"></p><p class="hk-toast__body"></p>`;
    root.appendChild(this.element);
    this._kicker = this.element.querySelector('.hk-toast__kicker');
    this._title = this.element.querySelector('.hk-toast__title');
    this._body = this.element.querySelector('.hk-toast__body');
    /** @type {Array<{ title: string, body?: string, kind?: string, params?: object }>} */
    this.queue = [];
    this._left = 0;
    this._off = [bus.on(EV.TOAST, (toast) => this.queue.push(toast))];
  }

  /**
   * @param {number} dt real seconds
   */
  update(dt) {
    if (this._left > 0) {
      this._left -= Math.min(dt, 0.1);
      if (this._left <= 0) this.element.classList.remove('is-visible');
      return;
    }
    // A short gap between toasts so each one reads as new.
    if (this._left > -0.35) {
      this._left -= Math.min(dt, 0.1);
      return;
    }
    const next = this.queue.shift();
    if (!next) return;
    const t = (key) => this.i18n.t(key, next.params);
    this._kicker.textContent = next.kind ? t(`toast.kind.${next.kind}`) : '';
    this._kicker.hidden = !next.kind;
    this._title.textContent = t(next.title);
    this._body.textContent = next.body ? t(next.body) : '';
    this._body.hidden = !next.body;
    this.element.dataset.kind = next.kind ?? '';
    this.element.classList.add('is-visible');
    this._left = TOAST_SECONDS;
  }

  dispose() {
    for (const off of this._off) off();
    this.element.remove();
  }
}
