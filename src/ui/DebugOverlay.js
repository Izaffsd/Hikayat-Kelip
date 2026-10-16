import { EV } from '../core/events.js';

const UPDATE_INTERVAL = 0.25;

/**
 * Developer overlay (F3 on PC, three-finger tap on touch, or `?debug=1`): FPS, frame time, draw calls,
 * triangles, physics bodies, memory, renderer backend, the WebGL2 toggle and an on-screen error log so
 * errors can be read on a phone. A small badge appears whenever an error is logged while it is hidden.
 */
export class DebugOverlay {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root container (ui-root)
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/Log.js').Log} options.log
   * @param {() => Record<string, string|number>} options.collect returns the stats to show
   * @param {(forceWebGL: boolean) => void} options.onToggleWebGL
   * @param {boolean} options.forceWebGL current state of the toggle
   */
  constructor({ root, bus, log, collect, onToggleWebGL, forceWebGL }) {
    this.bus = bus;
    this.log = log;
    this.collect = collect;
    this.visible = false;
    this._timer = 0;

    const panel = document.createElement('section');
    panel.className = 'hk-debug';
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Debug overlay');
    panel.innerHTML = `
      <div class="hk-debug__stats" aria-live="off"></div>
      <div class="hk-debug__actions">
        <button type="button" class="hk-debug__btn" data-act="webgl"></button>
        <button type="button" class="hk-debug__btn" data-act="copy">Copy log</button>
        <button type="button" class="hk-debug__btn" data-act="close" aria-label="Close debug overlay">Close</button>
      </div>
      <ol class="hk-debug__log"></ol>`;
    root.appendChild(panel);
    this.panel = panel;
    this.statsEl = /** @type {HTMLElement} */ (panel.querySelector('.hk-debug__stats'));
    this.logEl = /** @type {HTMLElement} */ (panel.querySelector('.hk-debug__log'));
    const webglButton = /** @type {HTMLButtonElement} */ (panel.querySelector('[data-act="webgl"]'));
    webglButton.textContent = forceWebGL ? 'Use WebGPU' : 'Force WebGL2';
    webglButton.addEventListener('click', () => onToggleWebGL(!forceWebGL));
    panel.querySelector('[data-act="copy"]').addEventListener('click', () => {
      navigator.clipboard?.writeText(this.log.toText()).catch(() => {});
    });
    panel.querySelector('[data-act="close"]').addEventListener('click', () => this.setVisible(false));

    const badge = document.createElement('button');
    badge.type = 'button';
    badge.className = 'hk-debug-badge';
    badge.hidden = true;
    badge.addEventListener('click', () => this.setVisible(true));
    root.appendChild(badge);
    this.badge = badge;

    for (const entry of log.entries) this._appendEntry(entry);
    log.subscribe((entry) => {
      this._appendEntry(entry);
      if (!this.visible && entry.level === 'error') {
        badge.hidden = false;
        badge.textContent = `${log.errorCount} error${log.errorCount === 1 ? '' : 's'}`;
      }
    });

    window.addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.setVisible(!this.visible);
      }
    });
    this._installThreeFingerTap();
  }

  /**
   * Shows or hides the overlay.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.visible = visible;
    this.panel.hidden = !visible;
    if (visible) {
      this.badge.hidden = true;
      this._timer = UPDATE_INTERVAL;
    }
    this.bus.emit(EV.DEBUG_TOGGLED, { visible });
  }

  /**
   * Refreshes the stats a few times per second (cheap DOM updates).
   * @param {number} dt real seconds
   */
  update(dt) {
    if (!this.visible) return;
    this._timer += dt;
    if (this._timer < UPDATE_INTERVAL) return;
    this._timer = 0;
    const stats = this.collect();
    let text = '';
    for (const [key, value] of Object.entries(stats)) text += `${key.padEnd(13)} ${value}\n`;
    this.statsEl.textContent = text;
  }

  /**
   * @param {{ time: number, level: string, message: string }} entry
   */
  _appendEntry(entry) {
    const item = document.createElement('li');
    item.className = `hk-debug__entry is-${entry.level}`;
    item.textContent = `${(entry.time / 1000).toFixed(1)}s ${entry.message}`;
    this.logEl.prepend(item);
    while (this.logEl.childElementCount > 40) this.logEl.lastElementChild?.remove();
  }

  _installThreeFingerTap() {
    const active = new Set();
    let firstDown = 0;
    window.addEventListener(
      'pointerdown',
      (event) => {
        if (event.pointerType !== 'touch') return;
        if (active.size === 0) firstDown = event.timeStamp;
        active.add(event.pointerId);
        if (active.size === 3 && event.timeStamp - firstDown < 350) this.setVisible(!this.visible);
      },
      true,
    );
    const lift = (event) => active.delete(event.pointerId);
    window.addEventListener('pointerup', lift, true);
    window.addEventListener('pointercancel', lift, true);
  }
}
