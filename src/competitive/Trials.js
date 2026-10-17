import { PathMover } from '../ai/PathMover.js';
import { EV } from '../core/events.js';
import { insideTrigger } from '../world/triggers.js';
import { GhostRecorder, GhostTrack } from './Ghost.js';
import { GhostRunner } from './GhostRunner.js';

/** Medals from best to worst. */
export const MEDALS = ['gold', 'silver', 'bronze'];

/**
 * Time trials (GDD pillar 5 "always one more try"; data/trials.json): a countdown holds Bayu at the start, the clock
 * runs on game ticks until he is inside the finish, and the run is recorded as a ghost. The best run's ghost runs
 * beside him with a live delta; the result gives a medal and keeps the best time, ghost and medal in the save. The
 * context button restarts at once; Retry and Exit end the results.
 */
export class Trials {
  /**
   * @param {object} options
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {object} options.config data/trials.json
   * @param {object} options.doc save document (competitive, missions)
   * @param {object} options.host engine side: world(), region(), feet(), facing(), place(p, yaw), save(),
   *   input, playerGltf(), clips, profile, scene, camera
   */
  constructor({ bus, config, doc, host }) {
    Object.assign(this, { bus, config, doc, host });
    /** @type {null|{ id: string, def: object, phase: 'countdown'|'run'|'done', t: number, shown: number,
     *   finish: object, track: GhostTrack|null, delta: number|null }} */
    this.active = null;
    /** Whether Bayu is held still (countdown, results). */
    this.holding = false;
    this._recorder = new GhostRecorder(config.ghostHz);
    this._mover = new PathMover({ leapHeight: 0, leapMinRise: Infinity });
    this._ghost = null;
  }

  /**
   * Whether a trial is unlocked (its mission completed) and can start here.
   * @param {string} id
   * @returns {{ unlocked: boolean, here: boolean }}
   */
  status(id) {
    const def = this.config.trials[id];
    return {
      unlocked: this.doc.missions.completed[def.unlock] === true,
      here: this.host.region() === def.region && !!this.host.world(),
    };
  }

  /**
   * Best time, medal and whether a ghost exists.
   * @param {string} id
   * @returns {{ best: number|null, medal: string|null }}
   */
  record(id) {
    return {
      best: this.doc.competitive.ghosts[id]?.time ?? null,
      medal: this.doc.competitive.medals[id] ?? null,
    };
  }

  /**
   * Starts (or restarts) a trial: Bayu at the start, the countdown, the best run's ghost.
   * @param {string} id
   */
  start(id) {
    const def = this.config.trials[id];
    if (!def) throw new Error(`Trials: unknown trial "${id}"`);
    const world = this.host.world();
    const marker = world.markers[def.start.replace(/^marker:/, '')];
    const finish = world.triggers.find((t) => t.id === def.finish);
    const line = world.paths[def.line];
    if (!marker || !finish || !line) throw new Error(`Trials: "${id}" does not fit this region`);
    this.host.place(marker.p, marker.yaw);
    this._mover.setPath(line);
    const saved = this.doc.competitive.ghosts[id];
    const track = saved ? new GhostTrack(saved, (p) => this._mover.project(p)) : null;
    this.active = { id, def, phase: 'countdown', t: 0, shown: 0, finish, track, delta: null };
    this.holding = true;
    this._recorder.begin();
    if (track) this._ghostRunner()?.setVisible(true);
    else this._ghost?.setVisible(false);
    this.bus.emit(EV.TRIAL_STARTED, { id, best: saved?.time ?? null });
  }

  /** Restarts the running trial at once. */
  restart() {
    if (this.active) this.start(this.active.id);
  }

  /** Leaves the trial. */
  exit() {
    const id = this.active?.id;
    if (!id) return;
    this.active = null;
    this.holding = false;
    this._ghost?.setVisible(false);
    this.bus.emit(EV.TRIAL_EXITED, { id });
  }

  /**
   * One fixed tick.
   * @param {number} dt
   */
  fixedUpdate(dt) {
    const a = this.active;
    if (!a || a.phase === 'done') return;
    if (a.phase === 'countdown') {
      a.t += dt;
      const left = Math.ceil(this.config.countdown - a.t);
      if (left !== a.shown && left > 0) {
        a.shown = left;
        this.bus.emit(EV.TRIAL_COUNTDOWN, { n: left });
      }
      if (a.t >= this.config.countdown) {
        a.phase = 'run';
        a.t = 0;
        this.holding = false;
        this.bus.emit(EV.TRIAL_GO, { id: a.id });
      }
      return;
    }
    const input = this.host.input;
    if (input.pressed('context')) {
      input.consume('context');
      this.restart();
      return;
    }
    a.t += dt;
    const feet = this.host.feet();
    this._recorder.sample(a.t, feet, this.host.facing());
    if (a.track) {
      const ghostTime = a.track.timeAt(this._mover.project(feet));
      a.delta = Number.isFinite(ghostTime) ? a.t - ghostTime : null;
    }
    if (insideTrigger(a.finish, feet)) this._finish();
  }

  /**
   * Per frame: the ghost runs alongside.
   * @param {number} dt animation seconds
   */
  frameUpdate(dt) {
    const a = this.active;
    if (!a?.track || !this._ghost?.visible) return;
    const t = a.phase === 'countdown' ? 0 : a.t;
    this._ghost.update(a.track, t, a.phase === 'run' ? dt : 0, this.host.camera);
  }

  dispose() {
    this._ghost?.dispose();
  }

  _finish() {
    const a = this.active;
    a.phase = 'done';
    this.holding = true;
    const seconds = Math.round(a.t * 100) / 100;
    const medals = a.def.medals;
    const medal = MEDALS.find((m) => seconds <= medals[m]) ?? null;
    const competitive = this.doc.competitive;
    const previous = competitive.ghosts[a.id];
    const record = !previous || seconds < previous.time;
    if (record) competitive.ghosts[a.id] = this._recorder.finish(seconds);
    const before = competitive.medals[a.id] ?? null;
    const better = medal && (!before || MEDALS.indexOf(medal) < MEDALS.indexOf(before));
    if (better) competitive.medals[a.id] = medal;
    this.host.save();
    this.bus.emit(EV.TRIAL_FINISHED, {
      id: a.id,
      seconds,
      medal,
      best: competitive.ghosts[a.id].time,
      record,
      newMedal: !!better,
      medals,
    });
  }

  /** The ghost's avatar (built on first use; none without a player model, e.g. headless). */
  _ghostRunner() {
    if (!this._ghost) {
      const gltf = this.host.playerGltf();
      if (!gltf) return null;
      this._ghost = new GhostRunner({
        gltf,
        clips: this.host.clips,
        profile: this.host.profile,
        parent: this.host.scene,
      });
    }
    return this._ghost;
  }
}
