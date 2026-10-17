import { EV } from '../core/events.js';

/**
 * Turns story progress into short notices (toasts): Cahaya gained, a new journal line, a page of the hikayat
 * returned, a trial unlocked by finishing its mission.
 */
export class Notices {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {object} options.trials data/trials.json
   */
  constructor({ bus, trials }) {
    const toast = (payload) => bus.emit(EV.TOAST, payload);
    this._off = [
      bus.on(EV.CAHAYA_CHANGED, () => toast({ title: 'toast.cahaya', kind: 'cahaya' })),
      bus.on(EV.JOURNAL_ADDED, () => toast({ title: 'toast.journal', kind: 'journal' })),
      bus.on(EV.PAGE_RETURNED, ({ page }) =>
        toast({ title: 'toast.page', kind: 'page', params: { n: page } }),
      ),
      bus.on(EV.MISSION_COMPLETED, ({ id }) => {
        for (const def of Object.values(trials.trials)) {
          if (def.unlock === id) toast({ title: def.name, body: 'toast.trialUnlocked', kind: 'trial' });
        }
      }),
    ];
  }

  dispose() {
    for (const off of this._off) off();
  }
}
