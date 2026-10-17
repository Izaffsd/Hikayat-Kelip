import { formatRaceTime } from '../../competitive/RaceTimer.js';

/**
 * Trials (pause → Ujian): each time trial with its medal and best time, and Start when it is unlocked (its mission
 * completed) and Bayu is in its region; otherwise it says why not.
 */
export class TrialsPanel {
  /**
   * @param {object} options
   * @param {import('../../core/I18n.js').I18n} options.i18n
   * @param {import('../../competitive/Trials.js').Trials} options.trials
   * @param {object} options.config data/trials.json
   * @param {(id: string) => void} options.onStart
   */
  constructor({ i18n, trials, config, onStart }) {
    Object.assign(this, { i18n, trials, config, onStart });
    this.id = 'trials';
    this.label = 'pause.trials';
    this.element = document.createElement('div');
    this.element.className = 'hk-trials';
    /** @type {Map<string, { name: HTMLElement, info: HTMLElement, button: HTMLButtonElement, medal: HTMLElement }>} */
    this.items = new Map();
    for (const id of Object.keys(config.trials)) {
      const item = document.createElement('div');
      item.className = 'hk-trial-item';
      item.innerHTML = `
        <span class="hk-medal" aria-hidden="true"></span>
        <div class="hk-trial-item__text"><h3 class="hk-trial-item__name"></h3><p class="hk-trial-item__info"></p></div>
        <button type="button" class="hk-trial__start"></button>`;
      const button = item.querySelector('button');
      button.addEventListener('click', () => this.onStart(id));
      this.element.appendChild(item);
      this.items.set(id, {
        name: item.querySelector('.hk-trial-item__name'),
        info: item.querySelector('.hk-trial-item__info'),
        medal: item.querySelector('.hk-medal'),
        button,
      });
    }
  }

  /** Whether any trial can be started (something to move into). */
  hasControls() {
    return [...this.items.values()].some(({ button }) => !button.disabled);
  }

  render() {
    const t = (key, params) => this.i18n.t(key, params);
    for (const [id, item] of this.items) {
      const def = this.config.trials[id];
      const { unlocked, here } = this.trials.status(id);
      const { best, medal } = this.trials.record(id);
      item.name.textContent = t(def.name);
      item.medal.className = `hk-medal${medal ? ` hk-medal--${medal}` : ''}`;
      let info;
      if (!unlocked) info = t('trial.locked');
      else if (!here) info = t('trial.elsewhere');
      else if (best !== null)
        info = `${t(`trial.medal.${medal ?? 'none'}`)} · ${t('trial.best', { time: formatRaceTime(best) })}`;
      else
        info = t('trial.medalsFor', {
          gold: formatRaceTime(def.medals.gold),
          silver: formatRaceTime(def.medals.silver),
          bronze: formatRaceTime(def.medals.bronze),
        });
      item.info.textContent = info;
      item.button.textContent = t('trial.start');
      item.button.disabled = !unlocked || !here;
    }
  }
}
