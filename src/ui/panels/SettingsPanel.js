/** Seconds the reset button waits for its confirming second press. */
const CONFIRM_SECONDS = 3;

/**
 * Settings (pause → Tetapan), built from `data/ui/settingsMenu.json`: one stepper row per setting — a single focus
 * stop that left/right (keyboard, D-pad) or a tap on its arrows changes; a tap elsewhere on the row or confirm
 * steps forward and wraps. Each change is written through `Settings.set` (the game reacts to SETTINGS_CHANGED) and
 * persisted. Rows are built once and only their texts refresh, so focus survives a change of language.
 */
export class SettingsPanel {
  /**
   * @param {object} options
   * @param {import('../../core/Settings.js').Settings} options.settings
   * @param {import('../../core/I18n.js').I18n} options.i18n
   * @param {object} options.menu data/ui/settingsMenu.json
   * @param {boolean} options.touch whether touch rows are shown
   */
  constructor({ settings, i18n, menu, touch }) {
    Object.assign(this, { settings, i18n, menu });
    this.id = 'settings';
    this.label = 'pause.settings';
    this.element = document.createElement('div');
    this.element.className = 'hk-settings';
    /** @type {Array<{ row: object, button: HTMLButtonElement, label: HTMLElement, value: HTMLElement }>} */
    this.rows = [];
    /** @type {Array<{ section: object, heading: HTMLElement }>} */
    this.headings = [];
    for (const section of menu.sections) {
      const heading = document.createElement('h3');
      heading.className = 'hk-settings__heading';
      this.element.appendChild(heading);
      this.headings.push({ section, heading });
      for (const row of section.rows) {
        if (row.touch && !touch) continue;
        this.rows.push(this._createRow(row));
      }
    }
    this.resetButton = document.createElement('button');
    this.resetButton.type = 'button';
    this.resetButton.className = 'hk-settings__reset';
    this.resetButton.addEventListener('click', () => this._reset());
    this.element.appendChild(this.resetButton);
    this._confirmUntil = 0;
  }

  /** Whether the panel has controls to move into. */
  hasControls() {
    return this.rows.length > 0;
  }

  /** Refreshes every text and value (on open, after a change, on a language change). */
  render() {
    const t = (key) => this.i18n.t(key);
    for (const { section, heading } of this.headings) heading.textContent = t(section.label);
    for (const entry of this.rows) this._renderRow(entry);
    this.resetButton.textContent = t(
      performance.now() < this._confirmUntil ? 'settings.confirmReset' : 'settings.reset',
    );
  }

  _createRow(row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hk-setting';
    button.dataset.step = '';
    button.dataset.path = row.path;
    button.innerHTML = `
      <span class="hk-setting__label"></span>
      <span class="hk-setting__control">
        <span class="hk-setting__arrow" data-dir="-1" aria-hidden="true">‹</span>
        <span class="hk-setting__value"></span>
        <span class="hk-setting__arrow" data-dir="1" aria-hidden="true">›</span>
      </span>`;
    const entry = {
      row,
      button,
      label: button.querySelector('.hk-setting__label'),
      value: button.querySelector('.hk-setting__value'),
    };
    button.addEventListener('hk-step', (event) => this._step(entry, event.detail, false));
    button.addEventListener('click', (event) => {
      const arrow = /** @type {HTMLElement} */ (event.target).closest?.('[data-dir]');
      this._step(entry, arrow ? Number(arrow.dataset.dir) : 1, !arrow);
    });
    this.element.appendChild(button);
    return entry;
  }

  _options(row) {
    if (!row.options) return null;
    return typeof row.options === 'string' ? this.menu.optionSets[row.options] : row.options;
  }

  _renderRow({ row, button, label, value }) {
    const t = (key) => this.i18n.t(key);
    const current = this.settings.get(row.path);
    const options = this._options(row);
    let text;
    if (options) {
      const option = options.find(([v]) => v === current) ?? options[0];
      text = t(option[1]);
    } else {
      text = row.format === 'percent' ? `${Math.round(current * 100)}%` : Number(current).toFixed(1);
    }
    label.textContent = t(row.label);
    value.textContent = text;
    button.setAttribute('aria-label', `${t(row.label)}: ${text}`);
    button.setAttribute('aria-description', t('settings.stepHint'));
  }

  /**
   * Moves a setting one step. Arrows and left/right stop at the ends; a tap or confirm on the row wraps around.
   * @param {object} entry
   * @param {number} direction -1 | 1
   * @param {boolean} wrap
   */
  _step(entry, direction, wrap) {
    const { row } = entry;
    const current = this.settings.get(row.path);
    const options = this._options(row);
    let next;
    if (options) {
      const index = Math.max(
        0,
        options.findIndex(([v]) => v === current),
      );
      let to = index + direction;
      if (wrap) to = (to + options.length) % options.length;
      next = options[Math.min(options.length - 1, Math.max(0, to))][0];
    } else {
      const [min, max, step] = row.range;
      let value = Math.round((Number(current) + direction * step) / step) * step;
      if (wrap && value > max + 1e-6) value = min;
      next = Math.round(Math.min(max, Math.max(min, value)) * 100) / 100;
    }
    if (next === current) return;
    this.settings.set(row.path, next);
    this._renderRow(entry);
  }

  _reset() {
    if (performance.now() >= this._confirmUntil) {
      this._confirmUntil = performance.now() + CONFIRM_SECONDS * 1000;
      this.render();
      setTimeout(() => this.render(), CONFIRM_SECONDS * 1000 + 20);
      return;
    }
    this._confirmUntil = 0;
    this.settings.reset();
    this.render();
  }
}
