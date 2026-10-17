import { EV } from '../core/events.js';

/**
 * Full-screen fade for respawns (TECHNICAL §5.3: fade out, respawn at the last safe ground, fade in — under 2 s,
 * no death screen), region changes and the story's cuts to black. Pure CSS opacity on one element; the durations
 * are design tokens, shortened under reduced motion.
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
    const set = (dark) => this.element.classList.toggle('is-dark', dark);
    this._off = [
      bus.on(EV.PLAYER_FELL, () => set(true)),
      bus.on(EV.PLAYER_RESPAWNED, () => {
        // A respawn behind a story fade (cut to black, region change) keeps the screen dark.
        if (!this._held) set(false);
      }),
      bus.on(EV.SCREEN_FADE, ({ dark }) => {
        this._held = dark;
        set(dark);
      }),
      bus.on(EV.REGION_CHANGE, () => {
        this._held = true;
        set(true);
      }),
      bus.on(EV.REGION_READY, () => {
        this._held = false;
        set(false);
      }),
    ];
    this._held = false;
  }

  /** Whether the screen is (going) dark. */
  get dark() {
    return this.element.classList.contains('is-dark');
  }

  dispose() {
    for (const off of this._off) off?.();
    this.element.remove();
  }
}
