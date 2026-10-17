import { formatRaceTime } from '../competitive/RaceTimer.js';
import { EV } from '../core/events.js';
import { FocusNavigator, clickFeedback } from './FocusNavigator.js';

/**
 * A time trial on screen (design system §7: Timer/ghost delta, Results card): the 3-2-1 countdown, the clock with
 * the difference to the best run (ahead in firefly green, behind in amber — always with its sign), and the results
 * card: the medal with its name, the time, the best time, and Retry (focused) / Exit, by keyboard, gamepad or touch.
 */
export class TrialHud {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/I18n.js').I18n} options.i18n
   * @param {import('../competitive/Trials.js').Trials} options.trials
   * @param {(open: boolean) => void} options.onResults the results card opened or closed (menus own input then)
   */
  constructor({ root, bus, i18n, trials, onResults }) {
    Object.assign(this, { i18n, trials, onResults });
    this.element = document.createElement('div');
    this.element.className = 'hk-trial';
    this.element.innerHTML = `
      <p class="hk-trial__count" aria-live="assertive"></p>
      <div class="hk-trial__bar" aria-hidden="true">
        <span class="hk-race__clock hk-trial__clock"></span>
        <span class="hk-trial__delta"></span>
      </div>
      <div class="hk-results" role="dialog" aria-modal="true" aria-labelledby="hk-results-title" hidden>
        <h2 class="hk-results__title" id="hk-results-title"></h2>
        <p class="hk-results__medal"><span class="hk-medal" aria-hidden="true"></span><span class="hk-results__medal-name"></span></p>
        <p class="hk-results__time"></p>
        <p class="hk-results__best"></p>
        <div class="hk-results__actions">
          <button type="button" class="hk-results__button hk-results__button--primary" data-action="retry"></button>
          <button type="button" class="hk-results__button" data-action="exit"></button>
        </div>
      </div>`;
    root.appendChild(this.element);
    const $ = (s) => this.element.querySelector(s);
    this._count = $('.hk-trial__count');
    this._bar = $('.hk-trial__bar');
    this._clock = $('.hk-trial__clock');
    this._delta = $('.hk-trial__delta');
    this._results = $('.hk-results');
    this._title = $('.hk-results__title');
    this._medal = $('.hk-medal');
    this._medalName = $('.hk-results__medal-name');
    this._time = $('.hk-results__time');
    this._best = $('.hk-results__best');
    this._retry = $('[data-action="retry"]');
    this._exit = $('[data-action="exit"]');
    clickFeedback(this._results, bus);
    this._retry.addEventListener('click', () => this._close(() => this.trials.restart()));
    this._exit.addEventListener('click', () => this._close(() => this.trials.exit()));
    this.navigator = new FocusNavigator({
      bus,
      zone: () => this._results,
      onSide: (direction) => {
        (direction < 0 ? this._retry : this._exit).focus();
        return true;
      },
      onBack: () => this._exit.click(),
    });
    this._countTimer = 0;
    this._shownClock = '';
    this._shownDelta = '';
    this._off = [
      bus.on(EV.TRIAL_STARTED, () => {
        this._bar.classList.add('is-visible');
        this._clock.textContent = formatRaceTime(0);
        this._delta.textContent = '';
      }),
      bus.on(EV.TRIAL_COUNTDOWN, ({ n }) => this._showCount(String(n))),
      bus.on(EV.TRIAL_GO, () => this._showCount(this.i18n.t('trial.go'))),
      bus.on(EV.TRIAL_FINISHED, (result) => this._showResults(result)),
      bus.on(EV.TRIAL_EXITED, () => this._bar.classList.remove('is-visible')),
    ];
  }

  /**
   * @param {number} dt real seconds
   */
  update(dt) {
    if (this._countTimer > 0) {
      this._countTimer -= Math.min(dt, 0.1);
      if (this._countTimer <= 0) this._count.classList.remove('is-visible');
    }
    const a = this.trials.active;
    if (!a || a.phase !== 'run') return;
    const clock = formatRaceTime(a.t);
    if (clock !== this._shownClock) {
      this._clock.textContent = clock;
      this._shownClock = clock;
    }
    const delta = a.delta === null ? '' : `${a.delta <= 0 ? '−' : '+'}${Math.abs(a.delta).toFixed(2)}`;
    if (delta !== this._shownDelta) {
      this._delta.textContent = delta;
      this._delta.classList.toggle('is-ahead', a.delta !== null && a.delta <= 0);
      this._shownDelta = delta;
    }
  }

  dispose() {
    for (const off of this._off) off();
    this.navigator.dispose();
    this.element.remove();
  }

  _showCount(text) {
    this._count.textContent = text;
    this._count.classList.add('is-visible');
    this._countTimer = 0.8;
  }

  _showResults({ seconds, medal, best, record, newMedal }) {
    const t = (key, params) => this.i18n.t(key, params);
    // The clock stops on the official time.
    this._clock.textContent = formatRaceTime(seconds);
    this._shownClock = this._clock.textContent;
    this._title.textContent = t(record ? 'trial.newBest' : 'trial.finished');
    this._medal.className = `hk-medal${medal ? ` hk-medal--${medal}` : ''}`;
    this._medalName.textContent =
      t(medal ? `trial.medal.${medal}` : 'trial.medal.none') + (newMedal ? ` · ${t('trial.newMedal')}` : '');
    this._time.textContent = t('trial.time', { time: formatRaceTime(seconds) });
    this._best.textContent = t('trial.best', { time: formatRaceTime(best) });
    this._retry.textContent = t('trial.retry');
    this._exit.textContent = t('trial.exit');
    this._results.hidden = false;
    this.navigator.enabled = true;
    this.onResults(true);
    this._retry.focus();
  }

  _close(then) {
    this._results.hidden = true;
    this.navigator.enabled = false;
    this.onResults(false);
    then();
  }
}
