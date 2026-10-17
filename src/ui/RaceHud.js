import { EV } from '../core/events.js';
import { formatRaceTime } from '../competitive/RaceTimer.js';

/** Seconds the result stays on screen. */
const RESULT_SECONDS = 4;

/**
 * The race clock at the top centre while a race runs (GDD 3:30: "a visible timer"), then the result — won or lost
 * against the rival, the time and the best time — fading after a few seconds. Text is the device-independent
 * information; the clock is announced to screen readers only at the result.
 */
export class RaceHud {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/I18n.js').I18n} options.i18n
   * @param {import('../competitive/RaceTimer.js').RaceTimer} options.timer
   */
  constructor({ root, bus, i18n, timer }) {
    Object.assign(this, { i18n, timer });
    this.element = document.createElement('div');
    this.element.className = 'hk-race';
    this.element.innerHTML = `
      <p class="hk-race__clock" aria-hidden="true"></p>
      <div class="hk-race__result" role="status"><p class="hk-race__verdict"></p><p class="hk-race__times"></p></div>`;
    root.appendChild(this.element);
    this._clock = this.element.querySelector('.hk-race__clock');
    this._result = this.element.querySelector('.hk-race__result');
    this._verdict = this.element.querySelector('.hk-race__verdict');
    this._times = this.element.querySelector('.hk-race__times');
    this._shown = '';
    this._resultTimer = 0;
    this._off = [
      bus.on(EV.RACE_STARTED, () => {
        this._result.classList.remove('is-visible');
        this._clock.classList.add('is-visible');
      }),
      bus.on(EV.RACE_FINISHED, (result) => this._finish(result)),
    ];
  }

  /**
   * @param {number} dt real seconds
   */
  update(dt) {
    if (this.timer.running) {
      const text = formatRaceTime(this.timer.seconds);
      if (text !== this._shown) {
        this._clock.textContent = text;
        this._shown = text;
      }
    }
    if (this._resultTimer > 0) {
      this._resultTimer -= Math.min(dt, 0.1);
      if (this._resultTimer <= 0) {
        this._result.classList.remove('is-visible');
        this._clock.classList.remove('is-visible');
      }
    }
  }

  dispose() {
    for (const off of this._off) off();
    this.element.remove();
  }

  _finish({ seconds, won, best, record, cancelled }) {
    if (cancelled) {
      this._clock.classList.remove('is-visible');
      return;
    }
    const t = (key, params) => this.i18n.t(key, params);
    this._clock.textContent = formatRaceTime(seconds);
    this._verdict.textContent = t(won ? 'race.won' : 'race.lost');
    this._times.textContent = record
      ? t('race.newBest', { time: formatRaceTime(seconds) })
      : t('race.time', { time: formatRaceTime(seconds), best: formatRaceTime(best) });
    this._result.classList.add('is-visible');
    this._resultTimer = RESULT_SECONDS;
  }
}
