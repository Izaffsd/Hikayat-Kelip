import { EV } from './events.js';

/** Gameplay actions (read per fixed tick). */
export const GAME_ACTIONS = Object.freeze([
  'jump',
  'sprint',
  'slide',
  'strike',
  'heavy',
  'langkah',
  'tangkis',
  'context',
  'kelip',
  'lockon',
  'recenter',
  'pause',
  'journal',
  'moveForward',
  'moveBack',
  'moveLeft',
  'moveRight',
]);

/** Menu navigation actions (delivered immediately on the bus, with key repeat). */
export const UI_ACTIONS = Object.freeze([
  'uiUp',
  'uiDown',
  'uiLeft',
  'uiRight',
  'uiConfirm',
  'uiBack',
  'uiTabLeft',
  'uiTabRight',
]);

const REPEATING_UI = new Set(['uiUp', 'uiDown', 'uiLeft', 'uiRight']);
const NEVER = -1e9;

/**
 * State of one gameplay action.
 */
class ActionState {
  constructor() {
    this.down = false;
    this.pressedTick = NEVER;
    this.releasedTick = NEVER;
    this.consumedTick = NEVER;
    /** @type {Set<string>} sources currently holding the action (key codes, pad buttons, touch) */
    this.sources = new Set();
  }
}

/**
 * Action-based input across keyboard + mouse, gamepads and touch.
 *
 * Device events are queued and applied at the start of the next fixed tick (`beginTick`), stamped with
 * that tick, so gameplay reads presses deterministically ("pressed within the last N ticks") and a
 * press + release that both happen between two ticks is still seen as a press.
 */
export class Input {
  /**
   * @param {object} options
   * @param {import('./EventBus.js').EventBus} options.bus
   * @param {object} options.bindings data/input/bindings.json
   * @param {{ keyboard?: object|null, gamepad?: object|null }} [options.overrides] remapped actions from settings
   */
  constructor({ bus, bindings, overrides }) {
    this.bus = bus;
    this.config = bindings;
    /** @type {Map<string, ActionState>} */
    this.actions = new Map(GAME_ACTIONS.map((name) => [name, new ActionState()]));
    /** Current fixed tick (set by beginTick). */
    this.tick = 0;
    /** @type {'keyboard'|'gamepad'|'touch'} */
    this.device = 'keyboard';
    /** Whether gameplay input is accepted (false while menus are open or the game is paused). */
    this.gameplayEnabled = true;

    /** Analog move from each source, combined by largest magnitude. */
    this._padMove = { x: 0, y: 0 };
    this._touchMove = { x: 0, y: 0 };
    /** Right stick (analog, -1..1). */
    this.lookStick = { x: 0, y: 0 };
    /** Accumulated pointer deltas in CSS pixels since the last `consumeLook`. */
    this._mouseLook = { x: 0, y: 0 };
    this._touchLook = { x: 0, y: 0 };

    /** @type {Array<string|boolean>} pending pairs of action, pressed */
    this._pending = [];
    /** @type {Map<string, string[]>} device code → game actions */
    this._keyToGame = new Map();
    /** @type {Map<string, string[]>} device code → ui actions */
    this._keyToUi = new Map();
    /** @type {Map<number, string[]>} gamepad button index → game actions */
    this._padToGame = new Map();
    /** @type {Map<number, string[]>} gamepad button index → ui actions */
    this._padToUi = new Map();
    /** @type {Map<number, Uint8Array>} previous button state per gamepad index */
    this._padPrev = new Map();
    this._uiStickPrev = { x: 0, y: 0 };
    /** @type {Map<string, number>} held repeating UI actions → seconds until next repeat */
    this._uiRepeat = new Map();
    /**
     * Mouse buttons pressed while gameplay input was closed (the click on the title that starts the game): their
     * mousedown, which can reach the canvas after gameplay opens, is ignored until they are released.
     * @type {Set<number>}
     */
    this._staleMouse = new Set();
    this._listeners = [];

    this.setBindings(overrides);
  }

  /**
   * Rebuilds the device → action maps from defaults plus remapped overrides.
   * @param {{ keyboard?: object|null, gamepad?: object|null }} [overrides]
   */
  setBindings(overrides) {
    const keyboard = { ...this.config.keyboard, ...(overrides?.keyboard ?? {}) };
    const gamepad = { ...this.config.gamepad, ...(overrides?.gamepad ?? {}) };
    this._keyToGame = invert(keyboard);
    this._keyToUi = invert(this.config.ui.keyboard);
    const buttons = this.config.gamepadButtons;
    this._padToGame = toButtonMap(invert(gamepad), buttons);
    this._padToUi = toButtonMap(invert(this.config.ui.gamepad), buttons);
  }

  /**
   * The current binding codes for an action on a device (for prompts and the remapping screen).
   * @param {'keyboard'|'gamepad'} device
   * @param {string} action
   * @returns {string[]}
   */
  bindingsFor(device, action) {
    const map = device === 'keyboard' ? this._keyToGame : null;
    if (map) return [...map].filter(([, actions]) => actions.includes(action)).map(([code]) => code);
    const names = Object.entries(this.config.gamepadButtons);
    return [...this._padToGame]
      .filter(([, actions]) => actions.includes(action))
      .map(([index]) => names.find(([, i]) => i === index)?.[0] ?? String(index));
  }

  /**
   * Attaches DOM listeners.
   * @param {object} targets
   * @param {Window} targets.window
   * @param {HTMLElement} targets.canvas game canvas (mouse buttons, pointer lock)
   */
  attach({ window: win, canvas }) {
    this.canvas = canvas;
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      this._listeners.push(() => target.removeEventListener(type, handler, options));
    };
    listen(win, 'keydown', (event) => this._onKey(event, true));
    listen(win, 'keyup', (event) => this._onKey(event, false));
    listen(
      win,
      'pointerdown',
      (event) => {
        if (event.pointerType !== 'mouse') return;
        if (this.gameplayEnabled) this._staleMouse.delete(event.button);
        else this._staleMouse.add(event.button);
      },
      { capture: true },
    );
    listen(canvas, 'mousedown', (event) => this._onMouseButton(event, true));
    listen(win, 'mouseup', (event) => this._onMouseButton(event, false));
    listen(canvas, 'contextmenu', (event) => event.preventDefault());
    listen(win, 'mousemove', (event) => {
      if (win.document.pointerLockElement !== canvas) return;
      this._mouseLook.x += event.movementX;
      this._mouseLook.y += event.movementY;
      this._setDevice('keyboard');
    });
    listen(win, 'blur', () => this.releaseAll());
    listen(win.document, 'visibilitychange', () => {
      if (win.document.hidden) this.releaseAll();
    });
    listen(win, 'gamepadconnected', () => this._setDevice('gamepad'));
  }

  /** Removes DOM listeners. */
  detach() {
    for (const off of this._listeners) off();
    this._listeners = [];
  }

  /**
   * Requests pointer lock for mouse look (desktop, after a user gesture).
   */
  requestPointerLock() {
    if (!this.canvas || this.device === 'touch') return;
    const doc = this.canvas.ownerDocument;
    if (doc.pointerLockElement === this.canvas) return;
    const result = this.canvas.requestPointerLock?.();
    // Chrome returns a promise that rejects if the user exited lock too recently; that is expected.
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  /**
   * Per rendered frame, before fixed ticks: polls gamepads and runs UI key repeat.
   * @param {number} dt real seconds
   * @param {Navigator} [nav]
   */
  update(dt, nav = globalThis.navigator) {
    this._pollGamepads(nav);
    for (const [action, remaining] of this._uiRepeat) {
      const next = remaining - dt;
      if (next <= 0) {
        this.bus.emit(EV.UI_ACTION, { action, repeat: true });
        this._uiRepeat.set(action, next + this.config.analog.uiRepeatRate);
      } else {
        this._uiRepeat.set(action, next);
      }
    }
  }

  /**
   * Applies queued device events, stamped with `tick`. Called at the start of each fixed tick.
   * @param {number} tick
   */
  beginTick(tick) {
    this.tick = tick;
    const pending = this._pending;
    for (let i = 0; i < pending.length; i += 2) {
      const state = this.actions.get(/** @type {string} */ (pending[i]));
      if (!state) continue;
      if (pending[i + 1]) {
        if (!state.down) state.pressedTick = tick;
        state.down = true;
      } else if (state.down && state.sources.size === 0) {
        state.down = false;
        state.releasedTick = tick;
      }
    }
    pending.length = 0;
  }

  /**
   * True on the tick the action was pressed.
   * @param {string} action
   * @returns {boolean}
   */
  pressed(action) {
    const state = this.actions.get(action);
    return !!state && state.pressedTick === this.tick && state.consumedTick !== state.pressedTick;
  }

  /**
   * True on the tick the action was released.
   * @param {string} action
   * @returns {boolean}
   */
  released(action) {
    return this.actions.get(action)?.releasedTick === this.tick;
  }

  /**
   * True while the action is held.
   * @param {string} action
   * @returns {boolean}
   */
  held(action) {
    return this.actions.get(action)?.down ?? false;
  }

  /**
   * True if the action was pressed within the last `ticks` ticks and not yet consumed (input buffer).
   * @param {string} action
   * @param {number} ticks
   * @returns {boolean}
   */
  pressedWithin(action, ticks) {
    const state = this.actions.get(action);
    if (!state || state.consumedTick === state.pressedTick) return false;
    return this.tick - state.pressedTick <= ticks;
  }

  /**
   * Marks the latest press as used so buffers do not fire twice.
   * @param {string} action
   */
  consume(action) {
    const state = this.actions.get(action);
    if (state) state.consumedTick = state.pressedTick;
  }

  /**
   * Writes the combined move vector (x right, y forward, magnitude ≤ 1) into `out`.
   * @param {{ x: number, y: number }} out
   * @returns {{ x: number, y: number }}
   */
  getMove(out) {
    let kx = 0;
    let ky = 0;
    if (this.gameplayEnabled) {
      if (this.held('moveRight')) kx += 1;
      if (this.held('moveLeft')) kx -= 1;
      if (this.held('moveForward')) ky += 1;
      if (this.held('moveBack')) ky -= 1;
    }
    const kLen = Math.hypot(kx, ky);
    if (kLen > 1) {
      kx /= kLen;
      ky /= kLen;
    }
    let bestX = kx;
    let bestY = ky;
    let best = Math.min(kLen, 1);
    for (const source of [this._padMove, this._touchMove]) {
      const len = Math.hypot(source.x, source.y);
      if (len > best) {
        best = len;
        bestX = source.x;
        bestY = source.y;
      }
    }
    if (!this.gameplayEnabled) {
      bestX = 0;
      bestY = 0;
    }
    out.x = bestX;
    out.y = bestY;
    return out;
  }

  /**
   * Returns and clears the accumulated pointer look deltas (CSS pixels).
   * @param {{ mouseX: number, mouseY: number, touchX: number, touchY: number }} out
   * @returns {{ mouseX: number, mouseY: number, touchX: number, touchY: number }}
   */
  consumeLook(out) {
    out.mouseX = this._mouseLook.x;
    out.mouseY = this._mouseLook.y;
    out.touchX = this._touchLook.x;
    out.touchY = this._touchLook.y;
    this._mouseLook.x = this._mouseLook.y = this._touchLook.x = this._touchLook.y = 0;
    return out;
  }

  /**
   * Touch button state (from the on-screen controls).
   * @param {string} action
   * @param {boolean} down
   */
  setVirtualButton(action, down) {
    if (down) this._setDevice('touch');
    this._applySource(action, `t:${action}`, down);
  }

  /**
   * Touch joystick (x right, y forward, magnitude ≤ 1).
   * @param {number} x
   * @param {number} y
   */
  setVirtualMove(x, y) {
    if (x !== 0 || y !== 0) this._setDevice('touch');
    this._touchMove.x = x;
    this._touchMove.y = y;
  }

  /**
   * Adds a touch camera drag delta (CSS pixels).
   * @param {number} dx
   * @param {number} dy
   */
  addTouchLook(dx, dy) {
    if (dx !== 0 || dy !== 0) this._setDevice('touch');
    this._touchLook.x += dx;
    this._touchLook.y += dy;
  }

  /** Releases everything (focus loss, page hidden, pause). */
  releaseAll() {
    for (const [name, state] of this.actions) {
      if (state.down || state.sources.size) {
        state.sources.clear();
        this._pending.push(name, false);
      }
    }
    this._padMove.x = this._padMove.y = 0;
    this._touchMove.x = this._touchMove.y = 0;
    this.lookStick.x = this.lookStick.y = 0;
    this._mouseLook.x = this._mouseLook.y = 0;
    this._touchLook.x = this._touchLook.y = 0;
    this._uiRepeat.clear();
  }

  /**
   * @param {KeyboardEvent} event
   * @param {boolean} down
   */
  _onKey(event, down) {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
      return;
    const code = event.code;
    const game = this._keyToGame.get(code);
    const ui = this._keyToUi.get(code);
    // Menu keys never reach the browser; gameplay-only keys (Tab = lock-on) keep their default while a menu is
    // open, so Tab still moves focus there.
    if (ui || (game && this.gameplayEnabled)) event.preventDefault();
    this._setDevice('keyboard');
    if (event.repeat) return;
    if (game) for (const action of game) this._applySource(action, `k:${code}`, down);
    if (ui) for (const action of ui) this._uiEdge(action, down);
  }

  /**
   * @param {MouseEvent} event
   * @param {boolean} down
   */
  _onMouseButton(event, down) {
    if (this._staleMouse.has(event.button)) {
      if (!down) this._staleMouse.delete(event.button);
      return;
    }
    const code = `Mouse${event.button}`;
    const game = this._keyToGame.get(code);
    this._setDevice('keyboard');
    if (game) for (const action of game) this._applySource(action, `m:${code}`, down);
  }

  /**
   * Adds or removes one source holding an action and queues the edge.
   * @param {string} action
   * @param {string} source
   * @param {boolean} down
   */
  _applySource(action, source, down) {
    const state = this.actions.get(action);
    if (!state) return;
    if (down) {
      if (state.sources.has(source)) return;
      state.sources.add(source);
      if (this.gameplayEnabled || action === 'pause') this._pending.push(action, true);
    } else {
      if (!state.sources.delete(source)) return;
      if (state.sources.size === 0) this._pending.push(action, false);
    }
  }

  /**
   * UI edge: emits on press and starts/stops key repeat.
   * @param {string} action
   * @param {boolean} down
   */
  _uiEdge(action, down) {
    if (down) {
      this.bus.emit(EV.UI_ACTION, { action, repeat: false });
      if (REPEATING_UI.has(action)) this._uiRepeat.set(action, this.config.analog.uiRepeatDelay);
    } else {
      this._uiRepeat.delete(action);
    }
  }

  /**
   * @param {Navigator} nav
   */
  _pollGamepads(nav) {
    const pads = nav?.getGamepads?.();
    this._padMove.x = this._padMove.y = 0;
    this.lookStick.x = this.lookStick.y = 0;
    if (!pads) return;
    const { stickDeadzone, triggerThreshold, uiStickThreshold } = this.config.analog;
    for (const pad of pads) {
      if (!pad || !pad.connected || pad.mapping !== 'standard') continue;
      let prev = this._padPrev.get(pad.index);
      if (!prev) {
        prev = new Uint8Array(pad.buttons.length);
        this._padPrev.set(pad.index, prev);
      }
      for (let b = 0; b < pad.buttons.length; b++) {
        const button = pad.buttons[b];
        const isDown = button.pressed || button.value > triggerThreshold ? 1 : 0;
        if (isDown === prev[b]) continue;
        prev[b] = isDown;
        this._setDevice('gamepad');
        const game = this._padToGame.get(b);
        if (game) for (const action of game) this._applySource(action, `g${pad.index}:${b}`, isDown === 1);
        const ui = this._padToUi.get(b);
        if (ui) for (const action of ui) this._uiEdge(action, isDown === 1);
      }
      const lx = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, stickDeadzone);
      if (lx.len > 0) {
        this._setDevice('gamepad');
        if (lx.len > Math.hypot(this._padMove.x, this._padMove.y)) {
          this._padMove.x = lx.x;
          this._padMove.y = -lx.y;
        }
      }
      const rx = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, stickDeadzone);
      if (rx.len > 0) {
        this._setDevice('gamepad');
        this.lookStick.x = rx.x;
        this.lookStick.y = rx.y;
      }
      this._uiStick(pad.axes[0] ?? 0, pad.axes[1] ?? 0, uiStickThreshold);
    }
  }

  /**
   * Turns the left stick into UI navigation edges.
   * @param {number} x
   * @param {number} y
   * @param {number} threshold
   */
  _uiStick(x, y, threshold) {
    const sx = x > threshold ? 1 : x < -threshold ? -1 : 0;
    const sy = y > threshold ? 1 : y < -threshold ? -1 : 0;
    if (sx !== this._uiStickPrev.x) {
      if (this._uiStickPrev.x !== 0) this._uiEdge(this._uiStickPrev.x > 0 ? 'uiRight' : 'uiLeft', false);
      if (sx !== 0) this._uiEdge(sx > 0 ? 'uiRight' : 'uiLeft', true);
      this._uiStickPrev.x = sx;
    }
    if (sy !== this._uiStickPrev.y) {
      if (this._uiStickPrev.y !== 0) this._uiEdge(this._uiStickPrev.y > 0 ? 'uiDown' : 'uiUp', false);
      if (sy !== 0) this._uiEdge(sy > 0 ? 'uiDown' : 'uiUp', true);
      this._uiStickPrev.y = sy;
    }
  }

  /**
   * @param {'keyboard'|'gamepad'|'touch'} device
   */
  _setDevice(device) {
    if (this.device === device) return;
    this.device = device;
    this.bus.emit(EV.INPUT_DEVICE_CHANGED, { device });
  }
}

/** Scratch result for radialDeadzone (avoids allocation per poll). */
const deadzoneResult = { x: 0, y: 0, len: 0 };

/**
 * Radial deadzone with rescaling so movement starts smoothly at the edge of the deadzone.
 * @param {number} x
 * @param {number} y
 * @param {number} deadzone
 * @returns {{ x: number, y: number, len: number }} shared scratch object
 */
export function radialDeadzone(x, y, deadzone) {
  const len = Math.hypot(x, y);
  if (len <= deadzone) {
    deadzoneResult.x = deadzoneResult.y = deadzoneResult.len = 0;
    return deadzoneResult;
  }
  const scaled = Math.min(1, (len - deadzone) / (1 - deadzone));
  deadzoneResult.x = (x / len) * scaled;
  deadzoneResult.y = (y / len) * scaled;
  deadzoneResult.len = scaled;
  return deadzoneResult;
}

/**
 * { action: [codes] } → Map(code → [actions])
 * @param {Record<string, string[]>} bindings
 * @returns {Map<string, string[]>}
 */
function invert(bindings) {
  const map = new Map();
  for (const [action, codes] of Object.entries(bindings)) {
    for (const code of codes) {
      const list = map.get(code);
      if (list) list.push(action);
      else map.set(code, [action]);
    }
  }
  return map;
}

/**
 * Converts button-name keys to standard-mapping indices.
 * @param {Map<string, string[]>} byName
 * @param {Record<string, number>} buttons
 * @returns {Map<number, string[]>}
 */
function toButtonMap(byName, buttons) {
  const map = new Map();
  for (const [name, actions] of byName) {
    const index = buttons[name];
    if (index !== undefined) map.set(index, actions);
  }
  return map;
}
