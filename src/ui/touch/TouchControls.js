import { EV } from '../../core/events.js';
import { iconSvg } from './icons.js';

/**
 * On-screen controls for phones in landscape (GDD "Mobile landscape design"), built on Pointer Events
 * so several thumbs work at once. Shown while the active input device is touch.
 */
export class TouchControls {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root #touch-root
   * @param {import('../../core/Input.js').Input} options.input
   * @param {import('../../core/EventBus.js').EventBus} options.bus
   * @param {import('../../core/I18n.js').I18n} options.i18n
   * @param {import('../../core/Settings.js').Settings} options.settings
   * @param {object} options.layout data/ui/touchLayout.json
   * @param {boolean} options.startVisible
   */
  constructor({ root, input, bus, i18n, settings, layout, startVisible }) {
    this.root = root;
    this.input = input;
    this.bus = bus;
    this.i18n = i18n;
    this.settings = settings;
    this.layout = layout;
    this._joyPointer = -1;
    this._joyOrigin = { x: 0, y: 0 };
    /** @type {Map<number, { x: number, y: number }>} look pointers → last position */
    this._lookPointers = new Map();

    root.classList.add('hk-touch');
    root.innerHTML = `
      <div class="hk-touch__zone hk-touch__zone--left" data-zone="move"></div>
      <div class="hk-touch__zone hk-touch__zone--right" data-zone="look"></div>
      <div class="hk-touch__joystick" aria-hidden="true"><div class="hk-touch__knob"></div></div>`;
    this.joystick = /** @type {HTMLElement} */ (root.querySelector('.hk-touch__joystick'));
    this.knob = /** @type {HTMLElement} */ (root.querySelector('.hk-touch__knob'));
    /** @type {HTMLButtonElement[]} */
    this.buttons = [];
    for (const spec of layout.buttons) this._createButton(spec);

    this._bindZones();
    this.applySettings();
    this.setVisible(startVisible);

    bus.on(EV.INPUT_DEVICE_CHANGED, ({ device }) => this.setVisible(device === 'touch'));
    bus.on(EV.SETTINGS_CHANGED, ({ path }) => {
      if (path === '*' || path.startsWith('touch.')) this.applySettings();
    });
    bus.on(EV.LANGUAGE_CHANGED, () => this._relabel());
    // Pinch-zoom gestures would fight the controls (iOS ignores user-scalable=no).
    document.addEventListener('gesturestart', (event) => event.preventDefault());
  }

  /**
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.visible = visible;
    this.root.classList.toggle('is-active', visible);
    if (!visible) this._resetAll();
  }

  /** Applies size and opacity settings. */
  applySettings() {
    this.root.style.setProperty('--touch-scale', String(this.settings.get('touch.size')));
    this.root.style.setProperty('--touch-opacity', String(this.settings.get('touch.opacity')));
  }

  /**
   * @param {{ action: string, anchor: string, x: number, y: number, size: number, icon: string, label: string }} spec
   */
  _createButton(spec) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `hk-touch__btn hk-touch__btn--${spec.action}`;
    button.dataset.action = spec.action;
    button.dataset.label = spec.label;
    button.setAttribute('aria-label', this.i18n.t(spec.label));
    button.innerHTML = iconSvg(/** @type {any} */ (spec.icon));
    const [vertical, horizontal] = spec.anchor.split('-');
    button.style.setProperty('--size', `${spec.size}px`);
    button.style.setProperty(`--${horizontal}`, `${spec.x}px`);
    button.style.setProperty(`--${vertical}`, `${spec.y}px`);
    button.classList.add(`is-${vertical}`, `is-${horizontal}`);

    const release = (event) => {
      if (!button.classList.contains('is-pressed')) return;
      if (event?.pointerId !== undefined && button.dataset.pointer !== String(event.pointerId)) return;
      button.classList.remove('is-pressed');
      delete button.dataset.pointer;
      this.input.setVirtualButton(spec.action, false);
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);
      button.dataset.pointer = String(event.pointerId);
      button.classList.add('is-pressed');
      this.input.setVirtualButton(spec.action, true);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    this.root.appendChild(button);
    this.buttons.push(button);
  }

  _bindZones() {
    const moveZone = /** @type {HTMLElement} */ (this.root.querySelector('[data-zone="move"]'));
    const lookZone = /** @type {HTMLElement} */ (this.root.querySelector('[data-zone="look"]'));
    const joy = this.layout.joystick;

    moveZone.addEventListener('pointerdown', (event) => {
      if (this._joyPointer !== -1) return;
      event.preventDefault();
      moveZone.setPointerCapture(event.pointerId);
      this._joyPointer = event.pointerId;
      this._joyOrigin.x = event.clientX;
      this._joyOrigin.y = event.clientY;
      this.joystick.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      this.joystick.classList.add('is-visible');
      this.knob.style.transform = 'translate(-50%, -50%)';
      this.input.setVirtualMove(0, 0);
    });
    moveZone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this._joyPointer) return;
      const scale = this.settings.get('touch.size');
      const radius = joy.radius * scale;
      let dx = event.clientX - this._joyOrigin.x;
      let dy = event.clientY - this._joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      let mx = dx / radius;
      let my = -dy / radius;
      if (Math.hypot(mx, my) < joy.deadzone) mx = my = 0;
      this.input.setVirtualMove(mx, my);
    });
    const endMove = (event) => {
      if (event.pointerId !== this._joyPointer) return;
      this._joyPointer = -1;
      this.joystick.classList.remove('is-visible');
      this.input.setVirtualMove(0, 0);
    };
    moveZone.addEventListener('pointerup', endMove);
    moveZone.addEventListener('pointercancel', endMove);
    moveZone.addEventListener('lostpointercapture', endMove);

    lookZone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      lookZone.setPointerCapture(event.pointerId);
      this._lookPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    lookZone.addEventListener('pointermove', (event) => {
      const last = this._lookPointers.get(event.pointerId);
      if (!last) return;
      const scale = this.layout.lookSensitivityScale;
      this.input.addTouchLook((event.clientX - last.x) * scale, (event.clientY - last.y) * scale);
      last.x = event.clientX;
      last.y = event.clientY;
    });
    const endLook = (event) => this._lookPointers.delete(event.pointerId);
    lookZone.addEventListener('pointerup', endLook);
    lookZone.addEventListener('pointercancel', endLook);
    lookZone.addEventListener('lostpointercapture', endLook);
  }

  _relabel() {
    for (const button of this.buttons) button.setAttribute('aria-label', this.i18n.t(button.dataset.label));
  }

  _resetAll() {
    for (const button of this.buttons) {
      if (button.classList.contains('is-pressed')) {
        button.classList.remove('is-pressed');
        this.input.setVirtualButton(button.dataset.action, false);
      }
    }
    this._joyPointer = -1;
    this._lookPointers.clear();
    this.joystick.classList.remove('is-visible');
    this.input.setVirtualMove(0, 0);
  }
}
