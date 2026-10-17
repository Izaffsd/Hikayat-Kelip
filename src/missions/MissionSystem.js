import { EV } from '../core/events.js';
import { insideTrigger } from '../world/triggers.js';

/**
 * Missions as data (TECHNICAL §9; data/missions/<id>.json). A mission is a list of steps; each step runs `on.start`
 * actions, shows its objective, waits for its `until` condition, runs `on.done` actions and moves on. The mission's
 * `end` actions run last (usually the next mission). Saving: a mission's first step and every step marked
 * `checkpoint` save progress when they begin, so a reload resumes there, and the next mission's first step is the
 * autosave between missions.
 *
 * Starting: the mission's region is entered if play is elsewhere, its ability set and player model (`avatar`)
 * applied and its `setup` actions
 * run (lighting, tide: the state any of its steps needs); a fresh start then runs `start`, a resume at a step runs
 * that step's `on.resume` instead.
 *
 * Conditions: { trigger }, { encounter } (cleared), { event, match? }, { seconds }, { cutscene } (ended),
 * { interact: marker, radius? } (context button nearby), { flag, value? }, { dialogue: 'done' }, { all: [...] },
 * { any: [...] }.
 *
 * Actions (run in order; a cutscene or a region change is awaited): say, conversation, cutscene, encounter, flag,
 * add, journal, page, cahaya, ability, light, water, teleport, region, kelipWave, prompt, autosave, next, wait,
 * waitFor ('dialogue': until the queued lines have been spoken).
 * Engine-side effects go through `host.actions`; any other key names a host action, called as (value, action).
 */
export class MissionSystem {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../narrative/StoryState.js').StoryState} options.story
   * @param {import('../narrative/Dialogue.js').Dialogue} options.dialogue
   * @param {import('../narrative/Cutscenes.js').Cutscenes|null} options.cutscenes
   * @param {import('../core/Input.js').Input} options.input
   * @param {Record<string, object>} options.missions by id
   * @param {Record<string, object>} [options.scenes] cutscene definitions by id
   * @param {object} options.host { world(): World|null, region(): string|null, feet(): {x,y,z},
   *   actions: Record<string, Function> }
   * @param {number} [options.bufferTicks=9] how long an interact press waits for its tick (the input buffer)
   */
  constructor({ bus, story, dialogue, cutscenes, input, missions, scenes = {}, host, bufferTicks = 9 }) {
    Object.assign(this, { bus, story, dialogue, cutscenes, input, missions, scenes, host, bufferTicks });
    /** @type {object|null} */
    this.mission = null;
    this.stepIndex = -1;
    /** Seconds in the current step. */
    this.stepTime = 0;
    this._busy = false;
    this._seen = [];
    this._cleared = new Set();
    this._ended = new Set();
    this._off = [
      bus.on(EV.ENCOUNTER_CLEARED, ({ id }) => this._cleared.add(id)),
      bus.on(EV.CUTSCENE_ENDED, ({ id }) => this._ended.add(id)),
      bus.on(EV.REGION_READY, () => this._points.clear()),
    ];
    this._listening = new Map();
    /** Resolved marker/trigger points of the current world (no allocation per tick). */
    this._points = new Map();
  }

  /** The running step or null. */
  get step() {
    return this.mission?.steps[this.stepIndex] ?? null;
  }

  /** Where Kelip's call points: the step's guide (marker or trigger), or null. */
  get guideTarget() {
    const guide = this.step?.guide;
    return guide ? this._cached(guide) : null;
  }

  /**
   * Starts a mission, optionally at a step (resuming from a checkpoint).
   * @param {string} id
   * @param {string|null} [stepId]
   */
  async start(id, stepId = null) {
    const mission = this.missions[id];
    if (!mission) throw new Error(`MissionSystem: unknown mission "${id}"`);
    const index = stepId ? mission.steps.findIndex((s) => s.id === stepId) : 0;
    if (index < 0) throw new Error(`MissionSystem: mission "${id}" has no step "${stepId}"`);
    this.mission = mission;
    this.stepIndex = -1;
    this._busy = true;
    this.bus.emit(EV.MISSION_STARTED, { id });
    const a = this.host.actions;
    if (mission.region && this.host.region?.() !== mission.region) {
      await a.region(mission.region, mission.spawn ?? 'spawn');
      if (this.mission !== mission) return;
    }
    if (mission.abilities) a.abilities?.(mission.abilities);
    if (mission.avatar) await a.avatar?.(mission.avatar);
    await this.run(mission.setup);
    await this.run(index === 0 ? mission.start : mission.steps[index].on?.resume);
    if (this.mission !== mission) return;
    await this._enter(index);
  }

  /**
   * One fixed tick: checks the running step's condition.
   * @param {number} dt
   */
  fixedUpdate(dt) {
    const step = this.step;
    if (!step || this._busy) return;
    this.stepTime += dt;
    if (this._met(step.until)) this._complete();
  }

  dispose() {
    for (const off of this._off) off();
    for (const off of this._listening.values()) off();
  }

  /**
   * Runs actions in order (awaiting cutscenes, region changes and waits).
   * @param {object[]} actions
   */
  async run(actions) {
    for (const action of actions ?? []) await this._do(action);
  }

  async _enter(index) {
    const mission = this.mission;
    this.stepIndex = index;
    this.stepTime = 0;
    this._seen.length = 0;
    const step = mission.steps[index];
    this._listen(step.until);
    this._busy = true;
    this.story.setPosition(mission.chapter, mission.id, step.id);
    this.bus.emit(EV.MISSION_STEP, { mission: mission.id, step: step.id, objective: step.objective ?? null });
    if (step.checkpoint || index === 0) this._checkpoint(step);
    await this.run(step.on?.start);
    if (this.mission === mission && this.stepIndex === index) this._busy = false;
  }

  async _complete() {
    const mission = this.mission;
    const step = this.step;
    this._busy = true;
    await this.run(step.on?.done);
    if (this.mission !== mission) return; // an action started another mission
    if (this.stepIndex + 1 < mission.steps.length) {
      await this._enter(this.stepIndex + 1);
      return;
    }
    this.stepIndex = mission.steps.length;
    this.story.completeMission(mission.id);
    this.bus.emit(EV.MISSION_COMPLETED, { id: mission.id });
    this.bus.emit(EV.MISSION_STEP, { mission: mission.id, step: null, objective: null });
    await this.run(mission.end);
    if (this.mission === mission) this.mission = null;
    this._busy = false;
  }

  _checkpoint(step) {
    this.host.actions.autosave?.({ mission: this.mission.id, step: step.id });
    this.bus.emit(EV.CHECKPOINT, { mission: this.mission.id, step: step.id });
  }

  /** Subscribes to the events a condition waits for (cleared on the next step). */
  _listen(until) {
    for (const off of this._listening.values()) off();
    this._listening.clear();
    const visit = (condition) => {
      if (!condition) return;
      if (condition.event && !this._listening.has(condition.event)) {
        this._listening.set(
          condition.event,
          this.bus.on(condition.event, (payload) => this._seen.push({ type: condition.event, payload })),
        );
      }
      for (const inner of condition.all ?? condition.any ?? []) visit(inner);
    };
    visit(until);
  }

  _met(c) {
    if (!c) return true;
    if (c.all) return c.all.every((inner) => this._met(inner));
    if (c.any) return c.any.some((inner) => this._met(inner));
    if (c.trigger) {
      const world = this.host.world();
      const trigger = world?.triggers.find((t) => t.id === c.trigger);
      return !!trigger && insideTrigger(trigger, this.host.feet());
    }
    if (c.encounter) return this._cleared.has(c.encounter);
    if (c.event) {
      return this._seen.some(
        ({ type, payload }) =>
          type === c.event && Object.entries(c.match ?? {}).every(([key, value]) => payload?.[key] === value),
      );
    }
    if (c.seconds !== undefined) return this.stepTime >= c.seconds;
    if (c.cutscene) return this._ended.has(c.cutscene);
    if (c.interact) {
      const p = this._cached(c.interact.includes(':') ? c.interact : `marker:${c.interact}`);
      const feet = this.host.feet();
      const near = Math.hypot(p.x - feet.x, p.y - feet.y, p.z - feet.z) <= (c.radius ?? 2);
      // Buffered like every other press, so a quick tap is never lost between ticks.
      if (near && this.input.pressedWithin('context', this.bufferTicks)) {
        this.input.consume('context');
        return true;
      }
      return false;
    }
    if (c.flag) return c.value === undefined ? !!this.story.get(c.flag) : this.story.get(c.flag) === c.value;
    if (c.dialogue === 'done') return !this.dialogue.busy;
    return false;
  }

  /**
   * Resolves once `predicate` holds (checked every 50 ms; `waitFor` actions).
   * @param {() => boolean} predicate
   * @returns {Promise<void>}
   */
  _until(predicate) {
    return new Promise((resolve) => {
      const check = () => (predicate() ? resolve() : setTimeout(check, 50));
      check();
    });
  }

  /**
   * A fixed marker or trigger point of the current world, resolved once.
   * @param {string} at 'marker:x' | 'trigger:x'
   * @returns {{ x: number, y: number, z: number }}
   */
  _cached(at) {
    let p = this._points.get(at);
    if (!p) {
      p = this._point({ at });
      this._points.set(at, p);
    }
    return p;
  }

  /**
   * Resolves a point: { at: 'marker:x'|'trigger:x'|'player'|[x,y,z], offset? }.
   * @param {{ at: string|number[], offset?: number[] }} point
   * @returns {{ x: number, y: number, z: number }}
   */
  _point(point) {
    let p;
    const at = point.at;
    if (Array.isArray(at)) p = { x: at[0], y: at[1], z: at[2] };
    else if (at === 'player') {
      const feet = this.host.feet();
      p = { x: feet.x, y: feet.y, z: feet.z };
    } else {
      const [kind, name] = at.includes(':') ? at.split(':') : ['marker', at];
      const world = this.host.world();
      if (kind === 'trigger') {
        const trigger = world?.triggers.find((t) => t.id === name);
        if (!trigger) throw new Error(`MissionSystem: no trigger "${name}"`);
        p = { x: trigger.center.x, y: trigger.center.y, z: trigger.center.z };
      } else {
        const marker = world?.markers[name];
        if (!marker) throw new Error(`MissionSystem: no marker "${name}"`);
        p = { x: marker.p.x, y: marker.p.y, z: marker.p.z };
      }
    }
    if (point.offset) {
      p.x += point.offset[0];
      p.y += point.offset[1];
      p.z += point.offset[2];
    }
    return p;
  }

  async _do(action) {
    const a = this.host.actions;
    if (action.say) this.dialogue.say(...[action.say].flat());
    else if (action.conversation) this.dialogue.say(...action.conversation);
    else if (action.cutscene) {
      const def = this.scenes[action.cutscene];
      if (!def) throw new Error(`MissionSystem: unknown cutscene "${action.cutscene}"`);
      if (this.cutscenes) await this.cutscenes.play(def);
      else this._ended.add(action.cutscene);
    } else if (action.encounter) a.encounter(action.encounter);
    else if (action.flag) this.story.set(action.flag, action.value ?? true);
    else if (action.add) this.story.add(action.add, action.by ?? 1);
    else if (action.journal) this.story.addJournal(action.journal);
    else if (action.page !== undefined) this.story.returnPage(action.page);
    else if (action.cahaya) this.story.addCahaya(action.cahaya);
    else if (action.ability) a.ability(action.ability);
    else if (action.light) a.light(action.light, action.seconds ?? 0);
    else if (action.water !== undefined) a.water(action.water, action.seconds ?? 0);
    else if (action.teleport) {
      // Facing: the action's yaw (degrees), else the marker's own.
      const marker = typeof action.teleport === 'string' && action.teleport.startsWith('marker:');
      const yaw =
        action.yaw !== undefined
          ? (action.yaw * Math.PI) / 180
          : marker
            ? this.host.world()?.markers[action.teleport.slice(7)]?.yaw
            : undefined;
      a.teleport(this._point({ at: action.teleport, offset: action.offset }), yaw);
    } else if (action.region) await a.region(action.region, action.marker ?? 'spawn');
    else if (action.kelipWave) a.kelipWave(this._point({ at: action.kelipWave }));
    else if (action.prompt !== undefined) a.prompt(action.prompt, action.text ?? null);
    else if (action.autosave)
      a.autosave?.({ mission: this.mission?.id ?? null, step: this.step?.id ?? null });
    else if (action.next) await this.start(action.next);
    else if (action.wait) await new Promise((resolve) => setTimeout(resolve, action.wait * 1000));
    else if (action.waitFor === 'dialogue') await this._until(() => !this.dialogue.busy);
    else {
      // Engine-specific actions (Kelip rising, a rival's race, the tide…) are host actions named by their key.
      const key = Object.keys(action).find((name) => typeof a[name] === 'function');
      if (!key) throw new Error(`MissionSystem: unknown action ${JSON.stringify(action)}`);
      await a[key](action[key], action);
    }
  }
}
