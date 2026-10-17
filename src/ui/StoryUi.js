import { EV } from '../core/events.js';

/** Readable labels for keyboard codes. */
const KEY_LABELS = {
  Space: 'Space',
  ShiftLeft: 'Shift',
  ControlLeft: 'Ctrl',
  Mouse0: 'LMB',
  Mouse1: 'MMB',
  Mouse2: 'RMB',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  Tab: 'Tab',
};

/** Seconds the objective stays up after a Kelip call. */
const OBJECTIVE_SECONDS = 4.5;
/** Seconds a prompt stays up at most (it also goes once the action is used). */
const PROMPT_SECONDS = 7;
/** Seconds a chapter title card stays up. */
const TITLE_SECONDS = 3.6;

/**
 * The story's on-screen layer (TECHNICAL §9, §11): subtitles (speaker and line, announced politely to screen
 * readers, honouring the subtitle settings), the objective — shown only after a Kelip call —, first-time prompts with
 * the key or button of the device in use (they fade once the action is used), chapter title cards, the hold-to-skip
 * ring and letterbox bars during cutscenes. Nothing here has to be read to keep playing (GDD: first ten minutes).
 */
export class StoryUi {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/I18n.js').I18n} options.i18n
   * @param {import('../core/Input.js').Input} options.input
   * @param {{ get(path: string): any }} options.settings
   */
  constructor({ root, bus, i18n, input, settings }) {
    Object.assign(this, { i18n, input, settings });
    this.element = document.createElement('div');
    this.element.className = 'hk-story';
    this.element.innerHTML = `
      <div class="hk-letterbox" aria-hidden="true"><span></span><span></span></div>
      <p class="hk-objective" aria-hidden="true"></p>
      <p class="hk-prompt" aria-hidden="true"><kbd></kbd><span></span></p>
      <div class="hk-subtitle" role="status" aria-live="polite"><span class="hk-subtitle__speaker"></span><span class="hk-subtitle__text"></span></div>
      <div class="hk-title-card" role="status"><p class="hk-title-card__kicker"></p><h2 class="hk-title-card__title"></h2></div>
      <div class="hk-skip" aria-hidden="true"><span class="hk-skip__ring"></span><span class="hk-skip__label"></span></div>`;
    root.appendChild(this.element);
    const $ = (selector) => this.element.querySelector(selector);
    this._letterbox = $('.hk-letterbox');
    this._objective = $('.hk-objective');
    this._prompt = $('.hk-prompt');
    this._promptKey = $('.hk-prompt kbd');
    this._promptText = $('.hk-prompt span');
    this._subtitle = $('.hk-subtitle');
    this._speaker = $('.hk-subtitle__speaker');
    this._line = $('.hk-subtitle__text');
    this._skip = $('.hk-skip');
    this._skipRing = $('.hk-skip__ring');
    this._skipLabel = $('.hk-skip__label');
    this._titleCard = $('.hk-title-card');
    this._titleKicker = $('.hk-title-card__kicker');
    this._titleText = $('.hk-title-card__title');
    this._objectiveKey = null;
    this._objectiveTimer = 0;
    this._promptAction = null;
    this._promptKeyText = null;
    this._promptTimer = 0;
    this._titleTimer = 0;
    this._off = [
      bus.on(EV.DIALOGUE_LINE, ({ speaker, text }) => this._showLine(speaker, text)),
      bus.on(EV.DIALOGUE_CLEAR, () => this._subtitle.classList.remove('is-visible')),
      bus.on(EV.MISSION_STEP, ({ objective }) => {
        this._objectiveKey = objective;
        if (!objective) this._hideObjective();
      }),
      bus.on(EV.KELIP_CALLED, () => this._showObjective()),
      bus.on(EV.PROMPT, ({ action, text }) => this._setPrompt(action, text)),
      bus.on(EV.TITLE_CARD, ({ kicker, title }) => this._showTitle(kicker, title)),
      bus.on(EV.CUTSCENE_STARTED, () => this._letterbox.classList.add('is-on')),
      bus.on(EV.CUTSCENE_ENDED, () => this._letterbox.classList.remove('is-on')),
      bus.on(EV.CUTSCENE_SKIP_PROGRESS, ({ progress }) => this._setSkip(progress)),
      bus.on(EV.INPUT_DEVICE_CHANGED, () => this._refreshPrompt()),
      bus.on(EV.LANGUAGE_CHANGED, () => this._refreshPrompt()),
    ];
  }

  /**
   * @param {number} dt real seconds
   */
  update(dt) {
    if (this._objectiveTimer > 0) {
      this._objectiveTimer -= dt;
      if (this._objectiveTimer <= 0) this._hideObjective();
    }
    if (this._promptAction) {
      this._promptTimer -= dt;
      // Used it (after a moment on screen, so a button already held does not hide it at once) or timed out.
      const used = PROMPT_SECONDS - this._promptTimer > 1 && this.input.held(this._promptAction);
      if (this._promptTimer <= 0 || used) this._setPrompt(null, null);
    }
    if (this._titleTimer > 0) {
      this._titleTimer -= dt;
      if (this._titleTimer <= 0) this._titleCard.classList.remove('is-visible');
    }
  }

  dispose() {
    for (const off of this._off) off();
    this.element.remove();
  }

  _showLine(speaker, text) {
    if (this.settings.get('subtitles') === false) return;
    this.element.style.setProperty(
      '--subtitle-scale',
      String(this.settings.get('accessibility.subtitleSize') ?? 1),
    );
    this._speaker.textContent = speaker;
    this._speaker.hidden = !speaker;
    this._line.textContent = text;
    this._subtitle.classList.add('is-visible');
  }

  _showObjective() {
    if (!this._objectiveKey) return;
    this._objective.textContent = this.i18n.t(this._objectiveKey);
    this._objective.classList.add('is-visible');
    this._objectiveTimer = OBJECTIVE_SECONDS;
  }

  _hideObjective() {
    this._objective.classList.remove('is-visible');
    this._objectiveTimer = 0;
  }

  _showTitle(kicker, title) {
    this._titleKicker.textContent = this.i18n.t(kicker);
    this._titleText.textContent = this.i18n.t(title);
    this._titleCard.classList.add('is-visible');
    this._titleTimer = TITLE_SECONDS;
  }

  _setPrompt(action, textKey) {
    this._promptAction = action;
    this._promptKeyText = textKey;
    this._promptTimer = PROMPT_SECONDS;
    this._refreshPrompt();
  }

  _refreshPrompt() {
    const action = this._promptAction;
    if (!action) {
      this._prompt.classList.remove('is-visible');
      return;
    }
    const label = this._label(action);
    const text = this._promptKeyText ? this.i18n.t(this._promptKeyText) : '';
    this._promptKey.textContent = label;
    // On touch the control's name is often the prompt itself ("Jump"): say it once.
    this._promptText.textContent = text === label ? '' : text;
    this._promptText.hidden = !this._promptText.textContent;
    this._prompt.classList.add('is-visible');
  }

  /** The key, button or touch control for an action on the device in use. */
  _label(action) {
    const device = this.input.device;
    if (device === 'touch') return this.i18n.t(`touch.${action}`);
    const code = this.input.bindingsFor(device === 'gamepad' ? 'gamepad' : 'keyboard', action)[0] ?? action;
    if (device === 'gamepad') return code;
    return KEY_LABELS[code] ?? code.replace(/^Key/, '').replace(/^Digit/, '');
  }

  _setSkip(progress) {
    this._skip.classList.toggle('is-visible', progress > 0);
    this._skipRing.style.setProperty('--progress', String(progress));
    this._skipLabel.textContent = this.i18n.t('ui.holdToSkip');
  }
}
