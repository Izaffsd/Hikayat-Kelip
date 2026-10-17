import { EV } from '../core/events.js';
import { insideTrigger } from '../world/triggers.js';

/**
 * Starts the region's fights from layout triggers and restarts them after a defeat (TECHNICAL §6.3: "defeat in
 * combat restarts the encounter in < 2 s"). With a story running, missions start encounters; in free roam
 * (`?scene=`) the layout triggers do.
 */
export class Encounters {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../ai/EnemyDirector.js').EnemyDirector} options.director
   * @param {import('./CombatSystem.js').CombatSystem} options.combat
   * @param {import('../player/Traversal.js').Traversal} options.traversal
   * @param {Record<string, object>} options.defs data/encounters.json
   * @param {string} options.regionId
   * @param {World|null} options.world
   * @param {boolean} [options.autoStart=true] start fights from their layout triggers (free roam; missions start
   *   them otherwise)
   */
  constructor({ bus, director, combat, traversal, defs, regionId, world, autoStart = true }) {
    Object.assign(this, { bus, director, combat, traversal, world, autoStart });
    this.defs = Object.entries(defs)
      .filter(([id, def]) => id !== 'comment' && def.region === regionId)
      .map(([id, def]) => ({ id, ...def }));
    /** @type {Set<string>} */
    this.cleared = new Set();
    this.active = null;
    this._restartIn = 0;
    this._off = [
      bus.on(EV.ENCOUNTER_CLEARED, ({ id }) => {
        this.cleared.add(id);
        this.active = null;
      }),
      bus.on(EV.PLAYER_DEFEATED, () => this._defeated()),
    ];
  }

  /**
   * Starts an encounter by id (missions, tests).
   * @param {string} id
   */
  start(id) {
    const def = this.defs.find((d) => d.id === id);
    if (!def) throw new Error(`Encounters: "${id}" is not in this region`);
    this.active = def;
    this.director.start({ id: def.id, arena: def.arena, spawns: def.spawns });
  }

  /**
   * One fixed tick.
   * @param {number} dt
   * @param {{ x: number, y: number, z: number }} feet
   */
  fixedUpdate(dt, feet) {
    if (this._restartIn > 0) {
      this._restartIn -= dt;
      if (this._restartIn <= 0) this._restart();
      return;
    }
    if (this.active || !this.world || !this.autoStart) return;
    for (const def of this.defs) {
      if (!def.trigger || this.cleared.has(def.id)) continue;
      const trigger = this.world.triggers.find((t) => t.id === def.trigger);
      if (trigger && insideTrigger(trigger, feet)) {
        this.start(def.id);
        return;
      }
    }
  }

  dispose() {
    for (const off of this._off) off();
  }

  _defeated() {
    if (!this.active || this._restartIn > 0) return;
    this.bus.emit(EV.PLAYER_FELL, { reason: 'defeated' });
    this._restartIn = 0.7;
  }

  _restart() {
    const def = this.active;
    const [x, y, z] = def.start;
    this.combat.reset();
    this.traversal.respawnAt({ x, y, z });
    this.director.start({ id: def.id, arena: def.arena, spawns: def.spawns });
  }
}
