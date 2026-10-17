import { EV } from '../core/events.js';

const FOCUSABLE = 'button:not([disabled]), [tabindex="0"]';

/**
 * Keyboard and gamepad navigation over real DOM focus (TECHNICAL §11): up/down move between the focusable controls
 * of the active zone in document order, left/right go to a stepper's handler (`data-step`) or between zones,
 * confirm clicks, back goes to the owner. Touch and mouse use the same buttons directly, so every control works with
 * all three. Focus rings come from `:focus-visible` (design system: always visible). Each response is announced as
 * UI_FEEDBACK (the click sounds); `clickFeedback` adds it for buttons pressed by touch or mouse.
 */
export class FocusNavigator {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {() => HTMLElement|null} options.zone the container whose controls up/down walk
   * @param {(direction: -1|1, element: HTMLElement|null) => boolean} [options.onSide] left/right not taken by a
   *   stepper; return true when handled
   * @param {() => void} [options.onBack]
   * @param {(direction: -1|1) => void} [options.onTab] tab left/right (Q/E, LB/RB)
   */
  constructor({ bus, zone, onSide = () => false, onBack = () => {}, onTab = () => {} }) {
    Object.assign(this, { bus, zone, onSide, onBack, onTab });
    this.enabled = false;
    this._off = bus.on(EV.UI_ACTION, ({ action }) => this.enabled && this._act(action));
  }

  /**
   * Focuses the first control of the zone (or `element`).
   * @param {HTMLElement|null} [element]
   */
  focusFirst(element = null) {
    const target = element ?? this._controls()[0];
    target?.focus({ preventScroll: false });
  }

  dispose() {
    this._off();
  }

  _controls() {
    const zone = this.zone();
    return zone ? [...zone.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null) : [];
  }

  _act(action) {
    const active = /** @type {HTMLElement|null} */ (document.activeElement);
    const controls = this._controls();
    const index = controls.indexOf(active);
    if (action === 'uiUp' || action === 'uiDown') {
      if (!controls.length) return;
      const step = action === 'uiUp' ? -1 : 1;
      const next = index < 0 ? 0 : (index + step + controls.length) % controls.length;
      controls[next].focus();
      controls[next].scrollIntoView({ block: 'nearest' });
      if (next !== index) this.bus.emit(EV.UI_FEEDBACK, { kind: 'move' });
    } else if (action === 'uiLeft' || action === 'uiRight') {
      const direction = action === 'uiLeft' ? -1 : 1;
      if (active?.dataset.step !== undefined && controls.includes(active)) {
        active.dispatchEvent(new CustomEvent('hk-step', { detail: direction }));
        this.bus.emit(EV.UI_FEEDBACK, { kind: 'step' });
        return;
      }
      if (!this.onSide(direction, index < 0 ? null : active) && index < 0) this.focusFirst();
    } else if (action === 'uiConfirm') {
      if (index >= 0) active.click();
      else this.focusFirst();
    } else if (action === 'uiBack') {
      this.bus.emit(EV.UI_FEEDBACK, { kind: 'back' });
      this.onBack();
    } else if (action === 'uiTabLeft' || action === 'uiTabRight') {
      this.bus.emit(EV.UI_FEEDBACK, { kind: 'move' });
      this.onTab(action === 'uiTabLeft' ? -1 : 1);
    }
  }
}

/**
 * Announces UI_FEEDBACK 'select' for every button pressed inside `element` (touch, mouse, or confirm on a focused one).
 * @param {HTMLElement} element
 * @param {import('../core/EventBus.js').EventBus} bus
 */
export function clickFeedback(element, bus) {
  element.addEventListener('click', (event) => {
    if (/** @type {HTMLElement} */ (event.target).closest?.('button'))
      bus.emit(EV.UI_FEEDBACK, { kind: 'select' });
  });
}
