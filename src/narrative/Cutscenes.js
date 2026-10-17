import { Vector3 } from 'three/webgpu';
import { EV } from '../core/events.js';

/** Seconds a skip button must be held (TECHNICAL §9). */
export const SKIP_HOLD_SECONDS = 0.6;

/**
 * Short authored scenes (TECHNICAL §9, "Timeline equivalent"): camera shots (cuts or moves between two framings),
 * dialogue lines and events at times, on real time. Hold jump, strike or pause for 0.6 s to skip; skipping still
 * applies every remaining event, so nothing a mission needs is missed. Scenes stay short (data tests: < 20 s in the
 * first ten minutes, < 30 s elsewhere).
 *
 * Definition: { id, duration, shots: [{ t, duration?, from: Point, to?: Point, look: Point, lookTo?: Point }],
 * lines: [{ t, id }], events: [{ t, ...action }] } where a Point is { at: 'marker:x'|'trigger:x'|'player'|[x,y,z],
 * offset?: [dx, dy, dz] }.
 */
export class Cutscenes {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/Input.js').Input} options.input
   * @param {{ override: { position: Vector3, target: Vector3 }|null }} options.camera camera system
   * @param {import('./Dialogue.js').Dialogue} options.dialogue
   * @param {(point: object) => { x: number, y: number, z: number }} options.resolve point resolver
   * @param {(actions: object[]) => Promise<void>} options.run runs mission actions
   */
  constructor({ bus, input, camera, dialogue, resolve, run }) {
    Object.assign(this, { bus, input, camera, dialogue, resolve, run });
    /** @type {null|{ def: object, t: number, line: number, event: number, hold: number, done: () => void }} */
    this.active = null;
    this._shot = { position: new Vector3(), target: new Vector3() };
    this._a = new Vector3();
    this._b = new Vector3();
  }

  /**
   * Plays a cutscene; resolves when it ends (played out or skipped).
   * @param {object} def
   * @returns {Promise<{ skipped: boolean }>}
   */
  play(def) {
    if (this.active) this._end(true);
    // Barks still playing would push the scene's own lines late.
    this.dialogue.clear();
    return new Promise((resolve) => {
      this.active = {
        def,
        t: 0,
        line: 0,
        event: 0,
        hold: 0,
        done: resolve,
        lines: [...(def.lines ?? [])].sort((a, b) => a.t - b.t),
        events: [...(def.events ?? [])].sort((a, b) => a.t - b.t),
        shots: [...(def.shots ?? [])].sort((a, b) => a.t - b.t),
      };
      this.bus.emit(EV.CUTSCENE_STARTED, { id: def.id });
      this._apply();
    });
  }

  /**
   * @param {number} dt real seconds
   */
  update(dt) {
    const c = this.active;
    if (!c) return;
    c.t += dt;
    while (c.line < c.lines.length && c.lines[c.line].t <= c.t) this.dialogue.say(c.lines[c.line++].id);
    while (c.event < c.events.length && c.events[c.event].t <= c.t) this._fire(c.events[c.event++]);
    this._apply();
    const holding = this.input.held('jump') || this.input.held('strike') || this.input.held('pause');
    const previous = c.hold;
    c.hold = holding ? c.hold + dt : 0;
    if (c.hold !== previous)
      this.bus.emit(EV.CUTSCENE_SKIP_PROGRESS, { progress: Math.min(1, c.hold / SKIP_HOLD_SECONDS) });
    if (c.hold >= SKIP_HOLD_SECONDS) this._end(true);
    else if (c.t >= c.def.duration) this._end(false);
  }

  _fire(event) {
    const { t: _t, ...action } = event;
    this.run([action]);
  }

  _apply() {
    const c = this.active;
    if (!c || !c.shots.length) return;
    let shot = c.shots[0];
    for (const s of c.shots) if (s.t <= c.t) shot = s;
    const u = shot.duration ? Math.min(1, Math.max(0, (c.t - shot.t) / shot.duration)) : 1;
    const k = u * u * (3 - 2 * u);
    const from = this.resolve(shot.from);
    this._a.set(from.x, from.y, from.z);
    if (shot.to) {
      const to = this.resolve(shot.to);
      this._b.set(to.x, to.y, to.z);
      this._a.lerp(this._b, k);
    }
    this._shot.position.copy(this._a);
    const look = this.resolve(shot.look);
    this._a.set(look.x, look.y, look.z);
    if (shot.lookTo) {
      const to = this.resolve(shot.lookTo);
      this._b.set(to.x, to.y, to.z);
      this._a.lerp(this._b, k);
    }
    this._shot.target.copy(this._a);
    this.camera.override = this._shot;
  }

  _end(skipped) {
    const c = this.active;
    this.active = null;
    if (skipped) {
      // Everything the scene would still have done happens now.
      while (c.event < c.events.length) this._fire(c.events[c.event++]);
      this.dialogue.clear();
    }
    this.camera.override = null;
    this.bus.emit(EV.CUTSCENE_SKIP_PROGRESS, { progress: 0 });
    this.bus.emit(EV.CUTSCENE_ENDED, { id: c.def.id, skipped });
    c.done({ skipped });
  }
}
