import { AnimationMixer, LoopOnce, LoopRepeat } from 'three/webgpu';

/**
 * Data-driven animation state machine (TECHNICAL §5.4, the Animator Controller equivalent).
 *
 * - **Locomotion**: a 1D blend tree on speed. Locomotion clips share one normalised phase, so feet stay in step
 *   while blending, and the phase advances at a rate matched to the actual speed (no foot skating).
 * - **States**: named base states (`ground`, `air`, `jumpStart`, `land`, `slide`…) mapping to the locomotion tree or a
 *   clip, with cross-fade times; one-shot states move on to `then` when finished.
 * - **Action layer**: full-body one-shots (attacks, parries, hits, interactions) that fade over the base layer and
 *   cross-fade into each other (combo strings).
 *
 * Gameplay sets parameters (`setSpeed`, `setState`, `playAction`) and never touches clips directly. Weights always
 * sum to 1 so the bind pose never bleeds in. Root translation is stripped from clips: gameplay moves the body.
 */
export class Animator {
  /**
   * @param {import('three').Object3D} root object holding the skeleton
   * @param {Map<string, import('three').AnimationClip>} clips by name
   * @param {object} profile data/animation/<profile>.json
   */
  constructor(root, clips, profile) {
    this.profile = profile;
    this.mixer = new AnimationMixer(root);
    /** @type {Map<string, { action: import('three').AnimationAction, weight: number, target: number, rate: number }>} */
    this.tracks = new Map();
    this.clips = clips;
    this.locomotion = profile.locomotion.map((entry) => ({ ...entry, track: this._track(entry.clip) }));
    for (const entry of this.locomotion) entry.track.action.timeScale = 0; // phase driven manually
    this.phase = 0;
    this.speed = 0;
    /** @type {string} */
    this.state = profile.initialState ?? 'ground';
    this._stateTime = 0;
    /**
     * Action layer entries, newest last.
     * @type {Array<{ name: string, track: any, time: number, duration: number, rateIn: number, rateOut: number,
     *   weight: number, ending: boolean, interrupted: boolean, onEnd?: () => void }>}
     */
    this.actions = [];
    this._enterState(this.state, 0);
  }

  /**
   * Horizontal speed for the locomotion tree (m/s).
   * @param {number} speed
   */
  setSpeed(speed) {
    this.speed = speed;
  }

  /**
   * Switches the base state (no-op if already in it, unless `restart`).
   * @param {string} name
   * @param {boolean} [restart=false]
   */
  setState(name, restart = false) {
    if (name === this.state && !restart) return;
    const def = this.profile.states[name];
    if (!def) throw new Error(`Animator: unknown state "${name}"`);
    this._enterState(name, def.fade ?? this.profile.fade);
  }

  /**
   * Plays a full-body one-shot over the base layer; a playing action cross-fades into it.
   * @param {string} clipName
   * @param {object} [options]
   * @param {number} [options.fadeIn]
   * @param {number} [options.fadeOut]
   * @param {number} [options.timeScale=1]
   * @param {number} [options.duration] seconds to hold before fading out (default: clip length / timeScale)
   * @param {number} [options.startAt=0] start time within the clip (seconds)
   * @param {boolean} [options.loop=false]
   * @param {() => void} [options.onEnd] called when it finishes (not when interrupted)
   */
  playAction(clipName, { fadeIn, fadeOut, timeScale = 1, duration, startAt = 0, loop = false, onEnd } = {}) {
    const fade = Math.max(1e-3, fadeIn ?? this.profile.actionFade);
    for (const entry of this.actions) {
      if (!entry.ending) {
        entry.ending = true;
        entry.interrupted = true;
      }
      entry.rateOut = 1 / fade;
    }
    // Re-triggering the same clip: duplicate the action so the fade-out copy and the new one can overlap.
    const track = this._actionTrack(clipName);
    const action = track.action;
    action.reset();
    action.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
    action.clampWhenFinished = true;
    action.timeScale = timeScale;
    action.time = startAt;
    const length = duration ?? (action.getClip().duration - startAt) / timeScale;
    this.actions.push({
      name: clipName,
      track,
      time: 0,
      duration: loop ? Infinity : length,
      rateIn: 1 / fade,
      rateOut: 1 / Math.max(1e-3, fadeOut ?? this.profile.actionFade),
      weight: 0,
      ending: false,
      interrupted: false,
      onEnd,
    });
  }

  /**
   * Fades out the current action early (cancel).
   * @param {number} [fadeOut]
   */
  stopAction(fadeOut = this.profile.actionFade) {
    for (const entry of this.actions) {
      if (!entry.ending) {
        entry.ending = true;
        entry.interrupted = true;
      }
      entry.rateOut = 1 / Math.max(1e-3, fadeOut);
    }
  }

  /** Name of the newest non-ending action clip, or ''. */
  get actionName() {
    const last = this.actions[this.actions.length - 1];
    return last && !last.ending ? last.name : '';
  }

  /** Total weight of the action layer (0..1). */
  get actionWeight() {
    let sum = 0;
    for (const entry of this.actions) sum += entry.weight;
    return Math.min(1, sum);
  }

  /**
   * Advances the mixer.
   * @param {number} dt
   */
  update(dt) {
    this._stateTime += dt;
    const def = this.profile.states[this.state];
    if (def.then && this._stateTime >= (def.maxTime ?? this._clipLength(def.clip) / (def.timeScale ?? 1))) {
      this._enterState(def.then, this.profile.states[def.then].fade ?? this.profile.fade);
    }

    // Locomotion: shared phase and blend weights by speed.
    const loco = this.locomotion;
    let lower = loco[0];
    let upper = loco[0];
    for (let i = 0; i < loco.length - 1; i++) {
      if (this.speed >= loco[i].at) {
        lower = loco[i];
        upper = loco[i + 1];
      }
    }
    const span = upper.at - lower.at;
    const t = span > 0 ? Math.min(1, Math.max(0, (this.speed - lower.at) / span)) : 0;
    this.phase = (this.phase + dt * (this._cycleRate(lower) * (1 - t) + this._cycleRate(upper) * t)) % 1;
    for (const entry of loco) entry.track.action.time = this.phase * entry.track.action.getClip().duration;

    // Base-layer targets.
    for (const track of this.tracks.values()) track.target = 0;
    if (!def.clip) {
      lower.track.target += 1 - t;
      upper.track.target += t;
    } else {
      this._track(def.clip).target = 1;
    }

    // Action layer: each entry fades in, holds, fades out; finished entries are removed.
    let actionSum = 0;
    for (let i = this.actions.length - 1; i >= 0; i--) {
      const entry = this.actions[i];
      entry.time += dt;
      if (!entry.ending && entry.time >= entry.duration) entry.ending = true;
      entry.weight = entry.ending
        ? Math.max(0, entry.weight - entry.rateOut * dt)
        : Math.min(1, entry.weight + entry.rateIn * dt);
      if (entry.ending && entry.weight <= 0) {
        this.actions.splice(i, 1);
        entry.track.action.setEffectiveWeight(0);
        if (!entry.interrupted) entry.onEnd?.();
        continue;
      }
      actionSum += entry.weight;
    }
    const actionScale = actionSum > 1 ? 1 / actionSum : 1;
    const actionWeight = Math.min(1, actionSum);

    // Smooth base weights, then normalise: base × (1 − action) + action = 1.
    let baseSum = 0;
    for (const track of this.tracks.values()) {
      if (track.isAction) continue;
      track.weight = approach(track.weight, track.target, track.rate * dt);
      baseSum += track.weight;
    }
    if (baseSum <= 1e-4) {
      for (const track of this.tracks.values()) if (!track.isAction) track.weight = track.target;
      baseSum = 1;
    }
    const baseScale = (1 - actionWeight) / baseSum;
    for (const track of this.tracks.values()) {
      if (!track.isAction) track.action.setEffectiveWeight(track.weight * baseScale);
    }
    for (const entry of this.actions) entry.track.action.setEffectiveWeight(entry.weight * actionScale);
    this.mixer.update(dt);
  }

  /** Stops every action and releases mixer caches. */
  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }

  _cycleRate(entry) {
    const duration = entry.track.action.getClip().duration;
    if (!entry.nativeSpeed) return 1 / duration;
    const scale = Math.min(
      entry.maxTimeScale ?? 1.6,
      Math.max(entry.minTimeScale ?? 0.6, this.speed / entry.nativeSpeed),
    );
    return scale / duration;
  }

  _enterState(name, fade) {
    this.state = name;
    this._stateTime = 0;
    const def = this.profile.states[name];
    const rate = 1 / Math.max(1e-3, fade);
    for (const track of this.tracks.values()) track.rate = rate;
    if (def.clip) {
      const track = this._track(def.clip);
      const action = track.action;
      action.reset();
      action.timeScale = def.timeScale ?? 1;
      action.setLoop(def.then ? LoopOnce : LoopRepeat, Infinity);
      action.clampWhenFinished = !!def.then;
      track.rate = rate;
    }
  }

  _clipLength(name) {
    return this._track(name).action.getClip().duration;
  }

  /** Base-layer track (one action per clip). */
  _track(name) {
    let track = this.tracks.get(name);
    if (track) return track;
    track = this._createTrack(name, name);
    this.tracks.set(name, track);
    return track;
  }

  /** Action-layer track: one pooled action per playing entry, so a clip can cross-fade into itself. */
  _actionTrack(name) {
    const busy = new Set(this.actions.map((entry) => entry.track));
    for (let i = 0; ; i++) {
      const key = `#action:${name}:${i}`;
      let track = this.tracks.get(key);
      if (!track) {
        track = this._createTrack(name, key);
        track.isAction = true;
        this.tracks.set(key, track);
      }
      if (!busy.has(track)) return track;
    }
  }

  _createTrack(clipName, key) {
    const clip = this.clips.get(clipName);
    if (!clip) throw new Error(`Animator: clip "${clipName}" is not loaded`);
    // A distinct clip object per pooled key gives a distinct AnimationAction from the mixer.
    const source = key === clipName ? clip : clip.clone();
    const action = this.mixer.clipAction(source);
    action.enabled = true;
    action.setEffectiveWeight(0);
    action.play();
    return { action, weight: 0, target: 0, rate: 1 / this.profile.fade, isAction: false };
  }
}

/**
 * Removes root translation tracks from clips (gameplay moves the body; TECHNICAL §5.4).
 * @param {import('three').AnimationClip[]} clips
 * @param {string[]} [rootBones=['root']]
 * @returns {Map<string, import('three').AnimationClip>} by name
 */
export function prepareClips(clips, rootBones = ['root']) {
  const out = new Map();
  for (const clip of clips) {
    const copy = clip.clone();
    copy.tracks = copy.tracks.filter((track) => !rootBones.some((bone) => track.name === `${bone}.position`));
    out.set(copy.name, copy);
  }
  return out;
}

/**
 * @param {number} value
 * @param {number} target
 * @param {number} maxDelta
 * @returns {number}
 */
function approach(value, target, maxDelta) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}
