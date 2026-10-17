import { EV } from '../core/events.js';
import { FocusNavigator } from './FocusNavigator.js';

/** Seconds a destructive button waits for its confirming second press. */
const CONFIRM_SECONDS = 3;
/** Ignore a "back" that arrives right after opening (the same Escape that opened it). */
const OPEN_GRACE_MS = 300;

/**
 * The pause menu (GDD: pause opens map, journal and settings; design system §7): a rail of actions on the left —
 * Resume, the panels, Restart from checkpoint (press twice) — and the selected panel on the right. Works the same
 * with keyboard (arrows, Enter, Esc, Q/E for panels, Tab), gamepad (D-pad, A, B, LB/RB) and touch (tap). The game
 * is frozen behind it (Engine.setPaused); focus returns to the canvas on close.
 *
 * A panel is `{ id, label, element, render(), hasControls?() }`; panels re-render on open and on language changes.
 */
export class PauseMenu {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/I18n.js').I18n} options.i18n
   * @param {Array<{ id: string, label: string, element: HTMLElement, render: () => void, hasControls?: () => boolean }>}
   *   options.panels
   * @param {() => void} options.onResume
   * @param {() => void} options.onRestart
   * @param {() => boolean} options.canRestart whether there is a checkpoint to go back to
   */
  constructor({ root, bus, i18n, panels, onResume, onRestart, canRestart }) {
    Object.assign(this, { bus, i18n, panels, onResume, onRestart, canRestart });
    this.element = document.createElement('div');
    this.element.className = 'hk-pause';
    this.element.hidden = true;
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'hk-pause-title');
    this.element.innerHTML = `
      <div class="hk-pause__panel">
        <nav class="hk-pause__rail">
          <h2 class="hk-pause__title" id="hk-pause-title"></h2>
          <div class="hk-pause__actions"></div>
        </nav>
        <section class="hk-pause__detail" aria-live="polite"></section>
      </div>`;
    root.appendChild(this.element);
    this._title = this.element.querySelector('.hk-pause__title');
    this._rail = this.element.querySelector('.hk-pause__actions');
    this._detail = this.element.querySelector('.hk-pause__detail');
    this._buttons = new Map();
    this._addButton('resume', 'pause.resume', () => this.onResume());
    for (const panel of panels) {
      this._addButton(panel.id, panel.label, () => this.select(panel.id));
      panel.element.classList.add('hk-pause__section');
      this._detail.appendChild(panel.element);
    }
    this._addButton('restart', 'pause.restart', () => this._restart());
    this.current = panels[0]?.id ?? null;
    this.open = false;
    this._zone = 'rail';
    this._openedAt = 0;
    this._confirmUntil = 0;
    this.navigator = new FocusNavigator({
      bus,
      zone: () => (this._zone === 'rail' ? this._rail : (this._activePanel()?.element ?? null)),
      onSide: (direction) => this._side(direction),
      onBack: () => this._back(),
      onTab: (direction) => this._tab(direction),
    });
    this._off = [bus.on(EV.LANGUAGE_CHANGED, () => this.open && this._render())];
  }

  /**
   * Opens on a panel (default: the last one shown), focusing Resume.
   * @param {string|null} [panel]
   */
  show(panel = null) {
    if (panel) this.current = panel;
    if (!this.open) {
      this.open = true;
      this.element.hidden = false;
      this._openedAt = performance.now();
      this.navigator.enabled = true;
    }
    this._render();
    this._zone = 'rail';
    this._buttons.get('resume').focus();
  }

  /**
   * Shows a panel and moves into its controls (a rail button pressed, a tab switch).
   * @param {string} id
   */
  select(id) {
    this.current = id;
    this._render();
    if (!this._enterDetail()) {
      this._zone = 'rail';
      this._buttons.get(id)?.focus();
    }
  }

  /** Closes the menu (the engine resumes). */
  hide() {
    if (!this.open) return;
    this.open = false;
    this.navigator.enabled = false;
    this.element.hidden = true;
    this._confirmUntil = 0;
  }

  dispose() {
    for (const off of this._off) off();
    this.navigator.dispose();
    this.element.remove();
  }

  _addButton(id, label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hk-pause__action';
    button.dataset.id = id;
    button.dataset.label = label;
    button.addEventListener('click', action);
    this._rail.appendChild(button);
    this._buttons.set(id, button);
  }

  _activePanel() {
    return this.panels.find((p) => p.id === this.current) ?? null;
  }

  _render() {
    this._title.textContent = this.i18n.t('pause.title');
    for (const [id, button] of this._buttons) {
      button.textContent = this.i18n.t(
        id === 'restart' && this._confirming() ? 'pause.confirmRestart' : button.dataset.label,
      );
      button.setAttribute('aria-current', String(id === this.current));
    }
    const restart = this._buttons.get('restart');
    restart.disabled = !this.canRestart();
    for (const panel of this.panels) {
      const active = panel.id === this.current;
      panel.element.hidden = !active;
      if (active) panel.render();
    }
  }

  _confirming() {
    return performance.now() < this._confirmUntil;
  }

  _restart() {
    if (!this._confirming()) {
      this._confirmUntil = performance.now() + CONFIRM_SECONDS * 1000;
      this._render();
      setTimeout(() => this.open && this._render(), CONFIRM_SECONDS * 1000 + 20);
      return;
    }
    this._confirmUntil = 0;
    this.onRestart();
  }

  _enterDetail() {
    const panel = this._activePanel();
    if (!panel?.hasControls?.()) return false;
    this._zone = 'detail';
    this.navigator.focusFirst();
    return true;
  }

  _side(direction) {
    if (this._zone === 'rail' && direction > 0) return this._enterDetail();
    if (this._zone === 'detail' && direction < 0) {
      this._zone = 'rail';
      this._buttons.get(this.current)?.focus();
      return true;
    }
    return false;
  }

  _back() {
    if (performance.now() - this._openedAt < OPEN_GRACE_MS) return;
    if (this._zone === 'detail') {
      this._side(-1);
      return;
    }
    this.onResume();
  }

  _tab(direction) {
    if (!this.panels.length) return;
    const index = Math.max(
      0,
      this.panels.findIndex((p) => p.id === this.current),
    );
    const next = this.panels[(index + direction + this.panels.length) % this.panels.length];
    if (this._zone === 'detail') this.select(next.id);
    else {
      this.current = next.id;
      this._render();
      this._buttons.get(next.id)?.focus();
    }
  }
}
