/**
 * The living title (GDD "The first 10 minutes", 0:00): fireflies over a dark river, one tap or key to
 * start. The static markup is in index.html so it paints before any script; this module animates the
 * fireflies on a 2D canvas, shows load progress and turns the first gesture into "start".
 *
 * The first gesture is also the audio-unlock gesture, so `onGesture` runs synchronously inside the
 * DOM event handler (browsers only allow audio to start there).
 */
export class TitleScreen {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root #title
   * @param {import('../core/I18n.js').I18n} options.i18n
   * @param {import('../core/Platform.js').PlatformInfo} options.platform
   */
  constructor({ root, i18n, platform }) {
    this.root = root;
    this.i18n = i18n;
    this.platform = platform;
    this.canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('#title-canvas'));
    this.ctx = this.canvas.getContext('2d');
    this.startEl = /** @type {HTMLElement} */ (root.querySelector('#title-start'));
    this.progressEl = /** @type {HTMLElement} */ (root.querySelector('#title-progress'));
    this.progressBar = /** @type {HTMLElement} */ (this.progressEl.firstElementChild);
    /** Called synchronously inside the first user gesture (audio unlock). */
    this.onGesture = () => {};
    /** Called when the game should start (gesture received and engine ready). */
    this.onStart = () => {};
    this.ready = false;
    this.progress = 0;
    this._wantsStart = false;
    this._started = false;
    this._raf = 0;
    this._flies = [];
    this._sprite = makeGlowSprite();
    this._cleanup = [];
    this._lastPadPressed = false;
  }

  /** Shows the prompt, binds the start gesture and begins the firefly animation. */
  show() {
    this._renderPrompt();
    this._resize();
    this._spawnFlies();
    const onGesture = (event) => {
      if (event.type === 'keydown' && (event.repeat || event.key === 'F3' || event.ctrlKey || event.metaKey))
        return;
      this._gesture();
    };
    const resize = () => this._resize();
    this.root.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    window.addEventListener('resize', resize);
    this._cleanup.push(
      () => this.root.removeEventListener('pointerdown', onGesture),
      () => window.removeEventListener('keydown', onGesture),
      () => window.removeEventListener('resize', resize),
    );
    const frame = (now) => {
      this._raf = requestAnimationFrame(frame);
      this._pollGamepads();
      this._draw(now / 1000);
    };
    this._raf = requestAnimationFrame(frame);
  }

  /**
   * Updates the loading bar.
   * @param {number} fraction 0..1
   */
  setProgress(fraction) {
    this.progressEl.classList.remove('is-indeterminate');
    this.progress = Math.max(this.progress, Math.min(1, fraction));
    this.progressBar.style.transform = `scaleX(${this.progress.toFixed(3)})`;
    this.progressEl.setAttribute('aria-valuenow', String(Math.round(this.progress * 100)));
    if (this._wantsStart && !this.ready) this._renderPrompt();
  }

  /** Marks the engine as ready; starts immediately if the player already tapped. */
  setReady() {
    this.ready = true;
    this.setProgress(1);
    this.root.classList.add('is-ready');
    this._renderPrompt();
    if (this._wantsStart) this._begin();
  }

  /** Re-renders texts after a language change. */
  refreshText() {
    this._renderPrompt();
    this.progressEl.setAttribute('aria-label', this.i18n.t('title.loading'));
  }

  /** Stops the animation and removes listeners. */
  dispose() {
    cancelAnimationFrame(this._raf);
    for (const off of this._cleanup) off();
    this._cleanup = [];
  }

  _gesture() {
    if (this._wantsStart) return;
    this._wantsStart = true;
    this.onGesture();
    if (this.ready) this._begin();
    else this._renderPrompt();
  }

  _begin() {
    if (this._started) return;
    this._started = true;
    this.onStart();
    this.root.classList.add('is-leaving');
    const finish = () => {
      this.dispose();
      this.root.hidden = true;
    };
    this.root.addEventListener('transitionend', finish, { once: true });
    setTimeout(finish, 900);
  }

  _renderPrompt() {
    if (this._wantsStart && !this.ready) {
      this.startEl.textContent = `${this.i18n.t('title.loading')} ${Math.round(this.progress * 100)}%`;
      return;
    }
    this.startEl.textContent = this.i18n.t(this.platform.isTouch ? 'title.startTouch' : 'title.startDesktop');
  }

  _pollGamepads() {
    const pads = navigator.getGamepads?.();
    let pressed = false;
    if (pads) {
      for (const pad of pads) {
        if (!pad) continue;
        for (const button of pad.buttons) {
          if (button.pressed) {
            pressed = true;
            break;
          }
        }
      }
    }
    if (pressed && !this._lastPadPressed) this._gesture();
    this._lastPadPressed = pressed;
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this._flies.length) this._spawnFlies();
  }

  _spawnFlies() {
    const count = Math.round(Math.min(110, Math.max(50, (this.width * this.height) / 9000)));
    const flies = [];
    let seed = 1337;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < count; i++) {
      flies.push({
        x: random(),
        // Concentrated along the mangrove treeline (44%–63% of the height), a few above.
        y: 0.42 + Math.pow(random(), 1.6) * 0.2 - (random() < 0.15 ? random() * 0.22 : 0),
        size: 5 + random() * 9,
        phase: random() * Math.PI * 2,
        drift: 0.004 + random() * 0.01,
        wobble: random() * Math.PI * 2,
      });
    }
    this._flies = flies;
  }

  /**
   * @param {number} t seconds
   */
  _draw(t) {
    const { ctx, width: w, height: h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const still = this.platform.prefersReducedMotion;
    const horizon = h * 0.63;
    for (const fly of this._flies) {
      const x = (fly.x + (still ? 0 : Math.sin(t * fly.drift * 6 + fly.wobble) * 0.012)) * w;
      const y = fly.y * h + (still ? 0 : Math.cos(t * 0.7 + fly.wobble) * 4);
      // Synchronized blinking wave travelling along the river, with a little individual flicker.
      const wave = Math.max(0, Math.sin(t * 2 * Math.PI * 0.45 - fly.x * 7 + fly.phase * 0.15));
      const alpha = 0.12 + 0.88 * wave * wave * wave * (0.85 + 0.15 * Math.sin(t * 9 + fly.phase));
      const size = fly.size * (0.8 + 0.4 * wave);
      ctx.globalAlpha = alpha;
      ctx.drawImage(this._sprite, x - size, y - size, size * 2, size * 2);
      if (y < horizon) {
        ctx.globalAlpha = alpha * 0.28;
        const ry = horizon + (horizon - y) * 0.55;
        ctx.drawImage(this._sprite, x - size * 0.9, ry - size * 0.6, size * 1.8, size * 1.2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

/**
 * A small radial glow used for every firefly (drawn many times per frame, created once).
 * @returns {HTMLCanvasElement}
 */
function makeGlowSprite() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(246, 255, 208, 1)');
  g.addColorStop(0.18, 'rgba(216, 240, 106, 0.9)');
  g.addColorStop(0.45, 'rgba(216, 240, 106, 0.25)');
  g.addColorStop(1, 'rgba(216, 240, 106, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
