import { EV } from '../core/events.js';

/**
 * Full-screen fade for respawns (TECHNICAL §5.3: fade out, respawn at the last safe ground, fade in — under 2 s,
 * no death screen). Pure CSS opacity on one element; the durations are design tokens, shortened under reduced
 * motion.
 */
export class ScreenFade {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root
   * @param {import('../core/EventBus.js').EventBus} options.bus
   */
  constructor({ root, bus }) {
    this.element = document.createElement('div');
    this.element.className = 'hk-fade';
    this.element.setAttribute('aria-hidden', 'true');
    root.appendChild(this.element);
    this._off = [
      bus.on(EV.PLAYER_FELL, () => this.element.classList.add('is-dark')),
      bus.on(EV.PLAYER_RESPAWNED, () => this.element.classList.remove('is-dark')),
    ];
  }

  dispose() {
    for (const off of this._off) off?.();
    this.element.remove();
  }
}
