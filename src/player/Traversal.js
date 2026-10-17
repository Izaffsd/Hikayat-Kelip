import { EV } from '../core/events.js';
import { LedgeProbe } from './LedgeProbe.js';

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

/** Everything allowed (tests and the sandbox when no Abilities are given). */
const ALL_MOVES = { has: () => true };

/** Centre and four points around the capsule's footprint (unit offsets) checked before recording safe ground. */
const FOOTPRINT = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Movement state machine for Bayu (TECHNICAL Ã‚Â§5.3).
 *
 * States: `ground`, `air`, scripted climbs (`step` up a short edge, `mantle` onto a waist-high one, `climb` from a
 * hang), `hang` (on a ledge), `wallRun`, `slide` and `glide` (the wau). The GDD feel rules are explicit: coyote time,
 * jump buffer, variable jump height, apex hang, heavier falls, momentum carried between moves, sprint that builds by
 * itself, automatic mantles and grabs (no button), and respawn at the last safe ground.
 *
 * Grounded moves never press into the floor: snap-to-ground follows slopes and steps down, because a downward push
 * makes Rapier's controller stall or deflect at random on flat ground. Short edges are climbed by our own step-up
 * (the edge probe) rather than Rapier's autostep, which proved unreliable.
 */
export class Traversal {
  /**
   * @param {object} options
   * @param {import('../physics/CharacterController.js').CharacterController} options.character
   * @param {object} options.tuning data/tuning/player.json
   * @param {import('../core/Input.js').Input} options.input
   * @param {import('../core/Time.js').Time} options.time
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../physics/PhysicsWorld.js').PhysicsWorld} [options.physics] enables edges, walls and slides
   * @param {{ has(move: string): boolean }} [options.abilities]
   * @param {(collider: any) => string[]} [options.tagsOf] kit tags of a collider (wall-run walls)
   */
  constructor({ character, tuning, input, time, bus, physics = null, abilities = ALL_MOVES, tagsOf = null }) {
    this.cc = character;
    this.tuning = tuning;
    this.input = input;
    this.time = time;
    this.bus = bus;
    this.abilities = abilities;
    this.tagsOf = tagsOf;
    this.probe = physics ? new LedgeProbe(physics, character) : null;
    /**
     * Movement assists (settings → Engine): ledge magnet radius in metres (0 = off) and whether waist-high edges are
     * climbed without pressing jump.
     */
    this.assist = { magnetRadius: 0, autoMantle: true };
    /** @type {'ground'|'air'|'step'|'mantle'|'climb'|'hang'|'wallRun'|'slide'|'glide'} */
    this.state = 'ground';
    this.velocity = { x: 0, y: 0, z: 0 };
    /** Facing yaw (radians); 0 faces +Z. */
    this.facing = 0;
    this.prevFacing = 0;
    /** Current horizontal speed (m/s). */
    this.speed = 0;
    this.sprinting = false;
    /** Wall side during a wall-run: Ã¢Ë†â€™1 wall on the left, +1 on the right, 0 none (avatar lean). */
    this.wallSide = 0;
    this._fullTiltTime = 0;
    this._lastGroundedTick = -1e9;
    this._jumping = false;
    this._jumpCutApplied = false;
    this._jumpTime = 0;
    this._safeTime = 0;
    this._grabCooldown = 0;
    this._wallCooldown = 0;
    this.lastSafe = { x: character.position.x, y: character.feetY, z: character.position.z };
    /** Water surface that respawns the player (GDD: falling into water respawns within 2 s); Ã¢Ë†â€™Ã¢Ë†Å¾ when none. */
    this.hazardWaterLevel = -Infinity;
    this._coyoteTicks = time.secondsToTicks(tuning.jump.coyoteTime);
    this._bufferTicks = time.secondsToTicks(tuning.jump.bufferTime);
    this._jumpVelocity = Math.sqrt(2 * tuning.gravity * tuning.jump.height);
    this._feet = { x: 0, y: 0, z: 0 };
    /** Scripted climb in progress. */
    this._script = {
      kind: '',
      t: 0,
      duration: 1,
      fromX: 0,
      fromY: 0,
      fromZ: 0,
      toX: 0,
      toY: 0,
      toZ: 0,
      riseEnd: 0.6,
      exitX: 0,
      exitZ: 0,
      exitSpeed: 0,
    };
    /** Ledge being held. */
    this.hang = {
      x: 0,
      y: 0,
      z: 0,
      normalX: 0,
      normalZ: 1,
      topY: 0,
      standX: 0,
      standY: 0,
      standZ: 0,
      hold: 0,
    };
    /** Wall being run along. */
    this.wall = { side: 0, normalX: 0, normalZ: 0, tangentX: 0, tangentZ: 1, speed: 0, time: 0 };
    this._slide = { time: 0, air: 0, dirX: 0, dirZ: 1, speed: 0 };
    this._glide = { heading: 0, speed: 0 };
  }

  /**
   * One fixed tick of movement.
   * @param {number} dt
   * @param {{ x: number, z: number, magnitude: number, sprintHeld: boolean }} intent
   */
  fixedUpdate(dt, intent) {
    this.prevFacing = this.facing;
    this._grabCooldown = Math.max(0, this._grabCooldown - dt);
    this._wallCooldown = Math.max(0, this._wallCooldown - dt);
    switch (this.state) {
      case 'step':
      case 'mantle':
      case 'climb':
        this._updateScript(dt);
        break;
      case 'hang':
        this._updateHang(dt, intent);
        break;
      case 'wallRun':
        this._updateWallRun(dt, intent);
        break;
      case 'slide':
        this._updateSlide(dt, intent);
        break;
      case 'glide':
        this._updateGlide(dt, intent);
        break;
      case 'respawn':
        this._updateFalling(dt);
        return;
      default:
        this._updateFree(dt, intent);
    }
    this._trackSafeGround(dt);
    if (this.cc.feetY < this.tuning.respawn.killHeight) this._fall('fell');
    else if (this.cc.feetY < this.hazardWaterLevel - this.tuning.respawn.waterDepth) this._fall('water');
  }

  /**
   * Fell into a hazard: keep falling briefly while the screen fades (TECHNICAL §5.3), then respawn.
   * @param {'water'|'fell'} reason
   */
  _fall(reason) {
    if (this.state === 'glide') this.bus.emit(EV.PLAYER_GLIDE, { open: false });
    if (this.state === 'wallRun') this.bus.emit(EV.PLAYER_WALLRUN, { started: false, side: this.wall.side });
    this.state = 'respawn';
    this._fallTime = 0;
    this._fallReason = reason;
    this.wallSide = 0;
    this.bus.emit(EV.PLAYER_FELL, { reason });
  }

  _updateFalling(dt) {
    const v = this.velocity;
    this._fallTime += dt;
    v.x *= 0.9;
    v.z *= 0.9;
    v.y = Math.max(-6, v.y - this.tuning.gravity * dt);
    this.cc.move(v.x * dt, v.y * dt, v.z * dt);
    this.speed = Math.hypot(v.x, v.z);
    if (this._fallTime >= this.tuning.respawn.fadeOut) this.respawn(this._fallReason);
  }

  // ---------------------------------------------------------------------------------------------- ground and air

  _updateFree(dt, intent) {
    const { move, jump, gravity } = this.tuning;
    const v = this.velocity;
    const tick = this.time.tick;
    const wasGrounded = this.cc.grounded;

    // --- Horizontal: target speed from stick magnitude; sprint builds after sustained full tilt.
    let targetSpeed = 0;
    if (intent.magnitude > 0.05) {
      if (intent.magnitude < move.stickRunThreshold) {
        targetSpeed = move.walkSpeed * (intent.magnitude / move.stickRunThreshold);
        this._fullTiltTime = 0;
      } else {
        targetSpeed = move.runSpeed;
        this._fullTiltTime = intent.magnitude >= move.stickSprintThreshold ? this._fullTiltTime + dt : 0;
        if (intent.sprintHeld || this._fullTiltTime >= move.sprintBuildTime) targetSpeed = move.sprintSpeed;
      }
    } else {
      this._fullTiltTime = 0;
    }
    this.sprinting = targetSpeed >= move.sprintSpeed;
    const currentSpeed = Math.hypot(v.x, v.z);
    let accel;
    if (wasGrounded) accel = targetSpeed > currentSpeed ? move.groundAccel : move.groundDecel;
    else accel = intent.magnitude > 0.05 ? move.airAccel : move.airDecel;
    // In the air, never brake below the carried speed just because the stick asks for less (momentum carry).
    const target =
      !wasGrounded && targetSpeed < currentSpeed && intent.magnitude > 0.05 ? currentSpeed : targetSpeed;
    moveTowards2D(v, intent.x * target, intent.z * target, accel * dt);

    // --- Facing turns toward the movement direction.
    if (intent.magnitude > 0.05) {
      const desired = Math.atan2(intent.x, intent.z);
      this.facing = approachAngle(this.facing, desired, move.turnSpeedDeg * DEG * dt);
    }

    // --- Slide: langkah (or the slide key) while running fast.
    if (wasGrounded && this._wantsSlide()) {
      this._startSlide();
      return;
    }

    // --- Vertical: coyote time, jump buffer, variable height, apex hang, fall gravity.
    if (wasGrounded) {
      this._lastGroundedTick = tick;
      if (v.y < 0) v.y = jump.groundStickVelocity;
      this._jumping = false;
    }
    const canJump = wasGrounded || (!this._jumping && tick - this._lastGroundedTick <= this._coyoteTicks);
    if (canJump && this.input.pressedWithin('jump', this._bufferTicks)) {
      this._jump(!wasGrounded);
    } else if (this._jumping) {
      this._jumpTime += dt;
    }
    const cutAllowed = this._jumpTime >= jump.minJumpTime;
    if (this._jumping && v.y > 0 && cutAllowed && !this._jumpCutApplied && !this.input.held('jump')) {
      v.y *= jump.releaseCut;
      this._jumpCutApplied = true;
    }
    let gravityScale = 1;
    if (v.y < 0) gravityScale = jump.fallGravityScale;
    else if (Math.abs(v.y) < jump.apexThreshold && this.input.held('jump'))
      gravityScale = jump.apexGravityScale;
    if (!wasGrounded || v.y > 0) v.y -= gravity * gravityScale * dt;
    if (v.y < -jump.maxFallSpeed) v.y = -jump.maxFallSpeed;

    // --- The wau: hold jump in the air (GDD touch layout).
    if (!wasGrounded && this._wantsGlide()) {
      this._startGlide();
      return;
    }

    // --- Move through Rapier and reconcile velocity with what actually happened.
    const desiredX = v.x * dt;
    const desiredZ = v.z * dt;
    const vyBefore = v.y;
    const moved = this.cc.move(desiredX, wasGrounded && v.y <= 0 ? 0 : v.y * dt, desiredZ);
    const desiredLen = Math.hypot(desiredX, desiredZ);
    if (desiredLen > 1e-5 && this.cc.hitWall && Math.hypot(moved.x, moved.z) / desiredLen < 0.98) {
      // Blocked by a wall: maybe it is an edge to step or mantle onto; otherwise drop only the velocity pushing
      // into it, so the player slides along walls and does not keep building speed into them.
      if (wasGrounded && this._tryGroundEdge(intent)) return;
      const n = this.cc.wallNormal;
      const into = v.x * n.x + v.z * n.z;
      if (into < 0) {
        v.x -= n.x * into;
        v.z -= n.z * into;
      }
    }
    if (this.cc.hitCeiling && v.y > 0) v.y = 0;
    this.speed = Math.hypot(v.x, v.z);

    const grounded = this.cc.grounded;
    if (grounded && !wasGrounded) this.bus.emit(EV.PLAYER_LANDED, { speed: Math.max(0, -vyBefore) });
    this.state = grounded ? 'ground' : 'air';
    if (!grounded && (this._tryAirEdge(intent) || this._tryWallRun(intent))) return;
    if (!grounded) this._ledgeMagnet();
  }

  /**
   * Ledge magnet (TECHNICAL §5.3, GDD "assist, don't punish"): when the landing 0.25 s ahead would miss, nudge the
   * jump toward the nearest walkable spot within the assist radius.
   */
  _ledgeMagnet() {
    const radius = this.assist.magnetRadius;
    const t = this.tuning.magnet;
    const v = this.velocity;
    if (!this.probe || radius <= 0 || v.y > -1 || this.time.tick % t.everyTicks !== 0) return;
    const feet = this._currentFeet();
    const g = this.tuning.gravity * this.tuning.jump.fallGravityScale;
    const top = feet.y + 0.3;
    // Walk the arc over the window: if it meets walkable ground, it lands and needs no help. Otherwise find where it
    // first drops below the ground right beside it: that is the miss to correct.
    let missTime = 0;
    let px = 0;
    let pz = 0;
    let py = 0;
    for (let tau = 0.05; tau <= t.window + 1e-6; tau += 0.05) {
      px = feet.x + v.x * tau;
      pz = feet.z + v.z * tau;
      py = feet.y + v.y * tau - 0.5 * g * tau * tau;
      const ground = this.probe.groundAt(px, top, pz, Math.max(0.5, top - py + 0.3));
      if (!Number.isNaN(ground) && py <= ground + 0.08) return; // lands on it
      if (Number.isNaN(ground) && py < feet.y - 0.05) {
        missTime = tau;
        break;
      }
    }
    if (!missTime) return;
    // Look as far as the radius plus the capsule's own (its rounded bottom catches an edge it overhangs), but move
    // the landing by at most the radius.
    const reach = radius + this.cc.radius;
    const length = Math.max(0.5, top - py + 0.4);
    let bestX = 0;
    let bestZ = 0;
    let best = Infinity;
    for (const ring of [0.5, 1]) {
      for (let k = 0; k < 8; k++) {
        const angle = (k * Math.PI) / 4;
        const x = px + Math.cos(angle) * reach * ring;
        const z = pz + Math.sin(angle) * reach * ring;
        const ground = this.probe.groundAt(x, top, z, length);
        if (Number.isNaN(ground) || ground < py - 0.4) continue;
        const d = Math.hypot(x - px, z - pz);
        if (d < best) {
          best = d;
          bestX = x;
          bestZ = z;
        }
      }
      if (best < Infinity) break;
    }
    if (best === Infinity) return;
    const shift = Math.min(best, radius);
    let dvx = (((bestX - px) / best) * shift) / missTime;
    let dvz = (((bestZ - pz) / best) * shift) / missTime;
    const len = Math.hypot(dvx, dvz);
    if (len > t.maxPush) {
      dvx *= t.maxPush / len;
      dvz *= t.maxPush / len;
    }
    v.x += dvx;
    v.z += dvz;
  }

  _jump(coyote) {
    const v = this.velocity;
    const buffered = !this.input.pressed('jump');
    v.y = this._jumpVelocity;
    this._jumping = true;
    this._jumpCutApplied = false;
    this._jumpTime = 0;
    this.input.consume('jump');
    this.bus.emit(EV.PLAYER_JUMPED, { coyote, buffered });
  }

  _currentFeet() {
    this._feet.x = this.cc.position.x;
    this._feet.y = this.cc.feetY;
    this._feet.z = this.cc.position.z;
    return this._feet;
  }

  // ---------------------------------------------------------------------------------------------- edges

  /** Grounded and blocked: a short edge is stepped up, a waist-high one mantled (when pushing toward it). */
  _tryGroundEdge(intent) {
    if (!this.probe || intent.magnitude < 0.3) return false;
    const manual = !this.assist.autoMantle;
    const n = this.cc.wallNormal;
    if (-(intent.x * n.x + intent.z * n.z) < this.tuning.mantle.approachDot) return false;
    const t = this.tuning;
    const canMantle = this.abilities.has('mantle');
    const edge = this.probe.find(this._currentFeet(), -n.x, -n.z, {
      minHeight: 0.05,
      maxHeight: canMantle ? t.mantle.maxHeight : t.step.maxHeight,
      reach: t.mantle.reach,
      minDepth: t.mantle.minDepth,
      inward: t.mantle.inward,
    });
    if (!edge) return false;
    if (edge.height <= t.step.maxHeight) {
      this._startScript('step', edge, t.step.baseTime + edge.height * t.step.timePerMetre, 0.95, 0.75);
    } else if (manual) {
      return false; // auto-mantle off: jump at the edge and the air mantle takes it
    } else {
      this._startScript(
        'mantle',
        edge,
        t.mantle.baseTime + edge.height * t.mantle.timePerMetre,
        t.mantle.keepSpeed,
        0.6,
      );
    }
    return true;
  }

  /** Airborne and moving toward something: grab a ledge, or vault onto a lower top. */
  _tryAirEdge(intent) {
    if (!this.probe || this._grabCooldown > 0) return false;
    const t = this.tuning;
    const canLedge = this.abilities.has('ledge');
    const canMantle = this.abilities.has('mantle');
    if (!canLedge && !canMantle) return false;
    const v = this.velocity;
    if (v.y > t.ledge.grabMaxRise) return false;
    let dirX;
    let dirZ;
    const speed = Math.hypot(v.x, v.z);
    if (intent.magnitude > 0.3) {
      dirX = intent.x;
      dirZ = intent.z;
    } else if (speed > 1) {
      dirX = v.x / speed;
      dirZ = v.z / speed;
    } else {
      return false;
    }
    const edge = this.probe.find(this._currentFeet(), dirX, dirZ, {
      minHeight: canMantle ? t.mantle.airMinHeight : t.ledge.minHeight,
      maxHeight: canLedge ? t.ledge.maxHeight : t.mantle.maxHeight,
      reach: t.ledge.reach,
      minDepth: t.ledge.minDepth,
      inward: t.ledge.inward,
    });
    if (!edge) return false;
    if (edge.height >= t.ledge.minHeight) return canLedge && this._startHang(edge);
    if (!canMantle) return false;
    const duration = t.mantle.baseTime + Math.max(0, edge.height) * t.mantle.timePerMetre;
    this._startScript('mantle', edge, duration, t.mantle.keepSpeed, 0.6);
    return true;
  }

  /**
   * Starts a scripted climb from the current feet to the edge's stand point: rise, then over the lip.
   * @param {'step'|'mantle'|'climb'} kind
   * @param {import('./LedgeProbe.js').Edge|object} edge
   * @param {number} duration
   * @param {number} keepSpeed fraction of the current speed kept when it ends
   * @param {number} riseEnd fraction of the duration spent rising
   */
  _startScript(kind, edge, duration, keepSpeed, riseEnd) {
    const s = this._script;
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.z);
    s.kind = kind;
    s.t = 0;
    s.duration = Math.max(0.04, duration);
    s.fromX = this.cc.position.x;
    s.fromY = this.cc.feetY;
    s.fromZ = this.cc.position.z;
    s.toX = edge.standX;
    s.toY = edge.standY + 0.02;
    s.toZ = edge.standZ;
    s.riseEnd = riseEnd;
    s.exitX = -edge.normalX;
    s.exitZ = -edge.normalZ;
    s.exitSpeed = speed * keepSpeed;
    if (kind !== 'step') this.facing = Math.atan2(-edge.normalX, -edge.normalZ);
    v.x = v.y = v.z = 0;
    this._jumping = false;
    this.state = kind;
    this.speed = kind === 'step' ? speed : 0;
    this.bus.emit(EV.PLAYER_MANTLE, { kind, height: s.toY - s.fromY, duration: s.duration });
  }

  _updateScript(dt) {
    const s = this._script;
    s.t += dt;
    const u = Math.min(1, s.t / s.duration);
    // Rise first (ease out), then move over the lip once the feet are near the top.
    const rise = 1 - (1 - Math.min(1, u / s.riseEnd)) ** 3;
    const over = smoothstep(s.riseEnd * 0.55, 1, u);
    const y = s.fromY + (s.toY - s.fromY) * rise;
    const x = s.fromX + (s.toX - s.fromX) * over;
    const z = s.fromZ + (s.toZ - s.fromZ) * over;
    this.cc.place(x, y, z);
    if (u < 1) return;
    // Settle onto the top so the next tick starts grounded, and carry momentum forward.
    this.cc.move(0, -0.08, 0);
    const v = this.velocity;
    v.x = s.exitX * s.exitSpeed;
    v.z = s.exitZ * s.exitSpeed;
    v.y = 0;
    this.speed = s.exitSpeed;
    this._lastGroundedTick = this.time.tick;
    this.state = this.cc.grounded ? 'ground' : 'air';
  }

  // ---------------------------------------------------------------------------------------------- ledge hang

  _startHang(edge) {
    const t = this.tuning.ledge;
    const x = edge.edgeX + edge.normalX * t.wallGap;
    const z = edge.edgeZ + edge.normalZ * t.wallGap;
    const y = edge.topY - t.hangDrop;
    if (!this.cc.fitsAt(x, y, z)) return false;
    const h = this.hang;
    h.x = x;
    h.y = y;
    h.z = z;
    h.normalX = edge.normalX;
    h.normalZ = edge.normalZ;
    h.topY = edge.topY;
    h.standX = edge.standX;
    h.standY = edge.standY;
    h.standZ = edge.standZ;
    h.hold = 0;
    this.cc.place(x, y, z);
    const v = this.velocity;
    v.x = v.y = v.z = 0;
    this.speed = 0;
    this._jumping = false;
    this.facing = Math.atan2(-edge.normalX, -edge.normalZ);
    this.state = 'hang';
    this.input.consume('jump');
    this.bus.emit(EV.PLAYER_LEDGE, { grabbed: true });
    return true;
  }

  _updateHang(dt, intent) {
    const t = this.tuning.ledge;
    const h = this.hang;
    this.cc.place(h.x, h.y, h.z);
    const toward = intent.magnitude > 0.3 ? -(intent.x * h.normalX + intent.z * h.normalZ) : 0;
    h.hold = toward > 0.6 ? h.hold + dt : 0;
    if (this.input.pressedWithin('jump', this._bufferTicks) || h.hold >= t.climbHoldTime) {
      this.input.consume('jump');
      if (this.cc.fitsAt(h.standX, h.standY + 0.15, h.standZ)) {
        this.bus.emit(EV.PLAYER_LEDGE, { grabbed: false });
        this._startScript('climb', h, t.climbTime, 0, 0.65);
        return;
      }
    }
    if (toward < -0.6 || this.input.pressed('langkah')) {
      const v = this.velocity;
      v.x = h.normalX * t.dropPush;
      v.z = h.normalZ * t.dropPush;
      v.y = 0;
      this._grabCooldown = t.regrabCooldown;
      this.state = 'air';
      this.bus.emit(EV.PLAYER_LEDGE, { grabbed: false });
    }
  }

  // ---------------------------------------------------------------------------------------------- wall-run

  _tryWallRun(intent) {
    if (!this.probe || !this.abilities.has('wallRun') || this._wallCooldown > 0) return false;
    const t = this.tuning.wallRun;
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.z);
    if (speed < t.minSpeed) return false;
    const dirX = v.x / speed;
    const dirZ = v.z / speed;
    const feet = this._currentFeet();
    const wall = this.probe.side(feet, dirX, dirZ, t.reach);
    if (!wall) return false;
    if (this.tagsOf) {
      const tags = this.tagsOf(wall.collider);
      if (tags.length && !tags.includes('wallrun')) return false;
    }
    const along = dirX * wall.normalX + dirZ * wall.normalZ;
    if (Math.abs(along) > Math.sin(t.maxApproachDeg * DEG)) return false;
    if (intent.magnitude > 0.3 && intent.x * wall.normalX + intent.z * wall.normalZ > t.detachDot)
      return false;
    if (this.probe.groundBelow(feet, t.minClearance) < t.minClearance) return false;
    const w = this.wall;
    let tx = dirX - wall.normalX * along;
    let tz = dirZ - wall.normalZ * along;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    w.side = wall.side;
    w.normalX = wall.normalX;
    w.normalZ = wall.normalZ;
    w.tangentX = tx;
    w.tangentZ = tz;
    w.speed = Math.max(speed, t.minSpeed) + t.speedBoost;
    w.time = 0;
    w.lastDistance = wall.distance;
    // A gentle arc whatever the entry: the jump's upward speed would rocket up the wall at near-zero gravity.
    v.y = t.rise;
    this._jumping = false;
    this.wallSide = wall.side;
    this.facing = Math.atan2(tx, tz);
    this.state = 'wallRun';
    this.bus.emit(EV.PLAYER_WALLRUN, { started: true, side: wall.side });
    return true;
  }

  _updateWallRun(dt, intent) {
    const t = this.tuning.wallRun;
    const w = this.wall;
    const v = this.velocity;
    w.time += dt;
    if (this.input.pressedWithin('jump', this._bufferTicks)) {
      this.input.consume('jump');
      v.x = w.tangentX * w.speed * 0.9 + w.normalX * t.jumpOffOut;
      v.z = w.tangentZ * w.speed * 0.9 + w.normalZ * t.jumpOffOut;
      v.y = t.jumpOffUp;
      this._jumping = true;
      this._jumpCutApplied = true;
      this._jumpTime = 0;
      this._endWallRun('air');
      this.facing = Math.atan2(v.x, v.z);
      this.bus.emit(EV.PLAYER_JUMPED, { coyote: false, buffered: false, wall: true });
      return;
    }
    const k = Math.min(1, w.time / t.maxDuration);
    const scale = t.gravityStart + (t.gravityEnd - t.gravityStart) * k * k;
    v.y -= this.tuning.gravity * scale * dt;
    v.x = w.tangentX * w.speed;
    v.z = w.tangentZ * w.speed;
    // Keep in contact: close the gap to the wall quickly, then lean into it slightly.
    const pull = Math.min(4, Math.max(0.6, (this._wallGap() - t.gap) * 12));
    const moved = this.cc.move((v.x - w.normalX * pull) * dt, v.y * dt, (v.z - w.normalZ * pull) * dt);
    if (this.cc.hitCeiling && v.y > 0) v.y = 0;
    this.speed = w.speed;
    if (this.cc.grounded) {
      this._endWallRun('ground');
      this.bus.emit(EV.PLAYER_LANDED, { speed: Math.max(0, -v.y) });
      return;
    }
    const along = Math.hypot(moved.x, moved.z) / Math.max(1e-5, w.speed * dt);
    const away = intent.magnitude > 0.3 && intent.x * w.normalX + intent.z * w.normalZ > t.detachDot;
    if (w.time >= t.maxDuration || along < 0.5 || away) {
      if (away) {
        v.x += w.normalX * 1.5;
        v.z += w.normalZ * 1.5;
      }
      this._endWallRun('air');
      return;
    }
    // Follow the wall (gentle curves); when it ends, keep flying.
    const wall = this.probe.side(this._currentFeet(), w.tangentX, w.tangentZ, t.reach + 0.25, w.side);
    if (!wall) {
      this._endWallRun('air');
      return;
    }
    w.normalX = wall.normalX;
    w.normalZ = wall.normalZ;
    const dot = w.tangentX * w.normalX + w.tangentZ * w.normalZ;
    let tx = w.tangentX - w.normalX * dot;
    let tz = w.tangentZ - w.normalZ * dot;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    w.tangentX = tx;
    w.tangentZ = tz;
    w.lastDistance = wall.distance;
    this.facing = Math.atan2(tx, tz);
  }

  _wallGap() {
    return (this.wall.lastDistance ?? this.cc.radius) - this.cc.radius;
  }

  _endWallRun(next) {
    this.state = next;
    this.wallSide = 0;
    this.wall.lastDistance = undefined;
    this._wallCooldown = this.tuning.wallRun.cooldown;
    this.bus.emit(EV.PLAYER_WALLRUN, { started: false, side: this.wall.side });
  }

  // ---------------------------------------------------------------------------------------------- slide

  _wantsSlide() {
    if (!this.abilities.has('slide') || this.speed < this.tuning.slide.minSpeed) return false;
    return this.input.pressed('slide') || this.input.pressed('langkah');
  }

  _startSlide() {
    const t = this.tuning.slide;
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.z) || 1;
    const s = this._slide;
    s.time = 0;
    s.air = 0;
    s.dirX = v.x / speed;
    s.dirZ = v.z / speed;
    s.speed = Math.max(speed, t.minSpeed) + t.startBoost;
    this.input.consume('slide');
    this.input.consume('langkah');
    this.cc.setCrouched(true, t.halfHeight);
    this.state = 'slide';
    this.bus.emit(EV.PLAYER_SLIDE, { started: true });
  }

  _updateSlide(dt, intent) {
    const t = this.tuning.slide;
    const s = this._slide;
    const v = this.velocity;
    s.time += dt;
    if (intent.magnitude > 0.3) {
      const heading = approachAngle(
        Math.atan2(s.dirX, s.dirZ),
        Math.atan2(intent.x, intent.z),
        t.turnDeg * DEG * dt,
      );
      s.dirX = Math.sin(heading);
      s.dirZ = Math.cos(heading);
    }
    s.speed = Math.max(0, s.speed - t.decel * dt);
    if (this.input.pressedWithin('jump', this._bufferTicks) && this.cc.canStand()) {
      this._standUp();
      v.x = s.dirX * s.speed * t.jumpBoost;
      v.z = s.dirZ * s.speed * t.jumpBoost;
      this.state = 'air';
      this._jump(false);
      return;
    }
    const grounded = this.cc.grounded;
    if (grounded) {
      s.air = 0;
      v.y = 0;
    } else {
      s.air += dt;
      v.y -= this.tuning.gravity * this.tuning.jump.fallGravityScale * dt;
    }
    v.x = s.dirX * s.speed;
    v.z = s.dirZ * s.speed;
    const moved = this.cc.move(v.x * dt, grounded && v.y <= 0 ? 0 : v.y * dt, v.z * dt);
    if (this.cc.hitWall && Math.hypot(moved.x, moved.z) < Math.hypot(v.x, v.z) * dt * 0.5) s.speed *= 0.5;
    this.speed = s.speed;
    this.facing = Math.atan2(s.dirX, s.dirZ);
    if (s.air > t.airGrace && this.cc.canStand()) {
      this._standUp();
      this.state = 'air';
      return;
    }
    const done = (s.time >= t.maxTime || s.speed <= t.endSpeed) && s.time >= t.minTime;
    if (!done) return;
    if (this.cc.canStand()) {
      this._standUp();
      this.state = this.cc.grounded ? 'ground' : 'air';
    } else {
      // Under something low: keep sliding (crawl speed) until there is room to stand.
      s.speed = Math.max(s.speed, t.crawlSpeed);
    }
  }

  _standUp() {
    this.cc.setCrouched(false);
    this.bus.emit(EV.PLAYER_SLIDE, { started: false });
  }

  // ---------------------------------------------------------------------------------------------- glide

  _wantsGlide() {
    if (!this.abilities.has('glide') || !this.input.held('jump')) return false;
    // Hold through the apex (falling), or press jump again in the air.
    if (this.velocity.y > -1 && !this.input.pressed('jump')) return false;
    if (!this.probe) return true;
    const minHeight = this.tuning.glide.minHeight;
    return this.probe.groundBelow(this._currentFeet(), minHeight) >= minHeight;
  }

  _startGlide() {
    const t = this.tuning.glide;
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.z);
    const g = this._glide;
    g.heading = speed > 0.5 ? Math.atan2(v.x, v.z) : this.facing;
    g.speed = Math.min(t.maxSpeed, Math.max(t.minSpeed, speed));
    v.y = Math.max(v.y, -t.sink);
    this.input.consume('jump');
    this._jumping = false;
    this.state = 'glide';
    this.bus.emit(EV.PLAYER_GLIDE, { open: true });
  }

  _updateGlide(dt, intent) {
    const t = this.tuning.glide;
    const g = this._glide;
    const v = this.velocity;
    if (!this.input.held('jump')) {
      this._closeGlide('air');
      return;
    }
    let along = 0;
    if (intent.magnitude > 0.2) {
      const desired = Math.atan2(intent.x, intent.z);
      const delta = wrapAngle(desired - g.heading);
      along = Math.cos(delta) * intent.magnitude;
      // Pulling straight back slows and lifts; it does not spin the wau round.
      if (Math.abs(delta) < 2.4)
        g.heading = approachAngle(g.heading, desired, t.turnDeg * DEG * dt * intent.magnitude);
    }
    let sink = t.sink;
    if (along > 0.5) {
      sink = t.diveSink;
      g.speed = Math.min(t.maxSpeed, g.speed + t.diveAccel * dt);
    } else if (along < -0.5) {
      sink = t.pullUpSink;
      const lost = Math.min(Math.max(0, g.speed - t.minSpeed), t.pullUpDecel * dt);
      g.speed -= lost;
      v.y += lost * t.liftFromSpeed;
    } else {
      const delta = t.cruise - g.speed;
      g.speed += Math.sign(delta) * Math.min(Math.abs(delta), t.accel * dt);
    }
    v.y = approach(v.y, -sink, t.gravity * dt);
    v.x = Math.sin(g.heading) * g.speed;
    v.z = Math.cos(g.heading) * g.speed;
    this.facing = g.heading;
    const moved = this.cc.move(v.x * dt, v.y * dt, v.z * dt);
    this.speed = g.speed;
    if (this.cc.grounded) {
      this.bus.emit(EV.PLAYER_LANDED, { speed: Math.max(0, -v.y) });
      v.y = 0;
      this._closeGlide('ground');
      return;
    }
    if (this.cc.hitWall && Math.hypot(moved.x, moved.z) < g.speed * dt * 0.5) {
      v.x *= 0.3;
      v.z *= 0.3;
      this._closeGlide('air');
    }
  }

  _closeGlide(next) {
    this.state = next;
    this.bus.emit(EV.PLAYER_GLIDE, { open: false });
  }

  // ---------------------------------------------------------------------------------------------- safety

  _trackSafeGround(dt) {
    if (
      (this.state === 'ground' || this.state === 'slide') &&
      this.cc.grounded &&
      this.cc.groundNormalY > 0.85
    ) {
      this._safeTime += dt;
      if (this._safeTime >= this.tuning.respawn.safeGroundTime && this._supported()) {
        this.lastSafe.x = this.cc.position.x;
        this.lastSafe.y = this.cc.feetY;
        this.lastSafe.z = this.cc.position.z;
      }
    } else {
      this._safeTime = 0;
    }
  }

  /** Whether the whole footprint stands on ground (not perched on an edge), so a respawn there is stable. */
  _supported() {
    if (!this.probe) return true;
    const feet = this._currentFeet();
    const r = this.cc.radius * 0.9;
    for (const [dx, dz] of FOOTPRINT) {
      const ground = this.probe.groundAt(feet.x + dx * r, feet.y + 0.3, feet.z + dz * r, 0.5);
      if (Number.isNaN(ground) || feet.y - ground > 0.2) return false;
    }
    return true;
  }

  /**
   * Returns the character to the last safe ground (GDD: under 2 s, no death screen).
   * @param {string} reason
   */
  respawn(reason) {
    if (this.state === 'glide') this.bus.emit(EV.PLAYER_GLIDE, { open: false });
    if (this.state === 'wallRun') this.bus.emit(EV.PLAYER_WALLRUN, { started: false, side: this.wall.side });
    if (this.cc.crouched) this._standUp();
    this.cc.teleport(this.lastSafe);
    this.velocity.x = this.velocity.y = this.velocity.z = 0;
    this.speed = 0;
    this.wallSide = 0;
    this._safeTime = 0;
    this._jumping = false;
    this.state = 'air';
    this.bus.emit(EV.PLAYER_RESPAWNED, { reason });
  }

  /**
   * Places the character at a point and makes it the safe ground (checkpoints, tests).
   * @param {{ x: number, y: number, z: number }} feet
   */
  respawnAt(feet) {
    this.lastSafe.x = feet.x;
    this.lastSafe.y = feet.y;
    this.lastSafe.z = feet.z;
    this.respawn('placed');
  }

  /**
   * Facing interpolated for rendering.
   * @param {number} alpha
   * @returns {number}
   */
  interpolatedFacing(alpha) {
    return this.prevFacing + wrapAngle(this.facing - this.prevFacing) * alpha;
  }
}

/**
 * Moves a 2D velocity (x, z) toward a target by at most `maxDelta`.
 * @param {{ x: number, z: number }} v
 * @param {number} tx
 * @param {number} tz
 * @param {number} maxDelta
 */
export function moveTowards2D(v, tx, tz, maxDelta) {
  const dx = tx - v.x;
  const dz = tz - v.z;
  const dist = Math.hypot(dx, dz);
  if (dist <= maxDelta || dist < 1e-6) {
    v.x = tx;
    v.z = tz;
    return;
  }
  v.x += (dx / dist) * maxDelta;
  v.z += (dz / dist) * maxDelta;
}

/**
 * Wraps an angle to [Ã¢Ë†â€™Ãâ‚¬, Ãâ‚¬).
 * @param {number} a
 * @returns {number}
 */
export function wrapAngle(a) {
  let r = (a + Math.PI) % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r - Math.PI;
}

/**
 * Rotates `current` toward `target` by at most `maxStep` along the shortest arc.
 * @param {number} current
 * @param {number} target
 * @param {number} maxStep
 * @returns {number}
 */
export function approachAngle(current, target, maxStep) {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

/**
 * @param {number} value
 * @param {number} target
 * @param {number} maxDelta
 * @returns {number}
 */
function approach(value, target, maxDelta) {
  if (Math.abs(target - value) <= maxDelta) return target;
  return value + Math.sign(target - value) * maxDelta;
}

/**
 * @param {number} a
 * @param {number} b
 * @param {number} x
 * @returns {number}
 */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
