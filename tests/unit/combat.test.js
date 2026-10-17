import { afterEach, describe, expect, it } from 'vitest';
import { EnemyDirector } from '../../src/ai/EnemyDirector.js';
import { CombatSystem } from '../../src/combat/CombatSystem.js';
import { EventBus } from '../../src/core/EventBus.js';
import { EV } from '../../src/core/events.js';
import { Input } from '../../src/core/Input.js';
import { Time } from '../../src/core/Time.js';
import archetypes from '../../src/data/combat/enemies.json';
import moves from '../../src/data/combat/moves.json';
import bindings from '../../src/data/input/bindings.json';
import tuning from '../../src/data/tuning/player.json';
import { CharacterController } from '../../src/physics/CharacterController.js';
import { PhysicsWorld } from '../../src/physics/PhysicsWorld.js';
import { Traversal } from '../../src/player/Traversal.js';

/**
 * Combat lab: real physics, Traversal, Input and CombatSystem with the EnemyDirector, ticked like the engine.
 * Test archetypes strike at known ticks so the perfect windows can be checked to the tick.
 */

const FLOOR = { c: [0, -0.5, 0], h: [30, 0.5, 30] };
const ARENA = { cx: 0, cz: 0, hx: 12, hz: 12, y: 0 };
const RECORDED = Object.values(EV).filter(
  (type) =>
    type.startsWith('player:') ||
    type.startsWith('enemy:') ||
    type.startsWith('combat:') ||
    type.startsWith('encounter:'),
);

/** A cursed fighter that winds up as soon as it reaches its orbit and then waits a long time. */
const STRIKER = {
  kind: 'cursed',
  corruption: 999,
  radius: 0.4,
  height: 1.7,
  speed: 2,
  orbit: 1.5,
  poiseMax: 0,
  attack: { windup: 0.5, active: 0.2, recover: 3, damage: 20, reach: 1.9, lunge: 0, cooldown: [0, 0] },
  hitStunSeconds: 0.3,
  staggerSeconds: 1.2,
  freeSeconds: 1,
};
/** Stands still and never attacks. */
const DUMMY = { ...STRIKER, corruption: 30, attack: { ...STRIKER.attack, cooldown: [999, 999] } };

const labs = [];
afterEach(() => {
  while (labs.length) labs.pop().physics.dispose();
});

async function makeLab({
  boxes = [FLOOR],
  spawn = [0, 0.05, 0],
  settings = {},
  abilities = null,
  tokens = 2,
} = {}) {
  const physics = await PhysicsWorld.create();
  for (const box of boxes) {
    physics.addStaticBox(
      { x: box.c[0], y: box.c[1], z: box.c[2] },
      { x: box.h[0], y: box.h[1], z: box.h[2] },
    );
  }
  const time = new Time(60);
  const bus = new EventBus();
  const input = new Input({ bus, bindings });
  const cc = new CharacterController(physics, tuning, { x: spawn[0], y: spawn[1], z: spawn[2] });
  const all = { has: () => true };
  const traversal = new Traversal({
    character: cc,
    tuning,
    input,
    time,
    bus,
    physics,
    abilities: abilities ?? all,
  });
  const director = new EnemyDirector({
    bus,
    archetypes: { ...archetypes, striker: STRIKER, dummy: DUMMY },
    tokens,
  });
  const store = {
    'assists.difficulty': 'normal',
    'assists.widerParry': false,
    'assists.autoLockOn': false,
    ...settings,
  };
  const combat = new CombatSystem({
    traversal,
    character: cc,
    input,
    time,
    bus,
    data: moves,
    abilities: abilities ?? all,
    director,
    settings: { get: (path) => store[path] },
  });
  const events = [];
  for (const type of RECORDED) bus.on(type, (payload) => events.push({ type, tick: time.tick, ...payload }));
  const intent = { x: 0, z: 0, magnitude: 0, sprintHeld: false };
  const player = {
    get feet() {
      return { x: cc.position.x, y: cc.feetY, z: cc.position.z };
    },
    get dodgeOrigin() {
      return combat.dodgeOrigin;
    },
    radius: cc.radius,
    receiveStrike: (enemy) => combat.receiveStrike(enemy),
  };
  const lab = {
    physics,
    time,
    traversal,
    combat,
    director,
    events,
    stick(x, z) {
      const len = Math.hypot(x, z);
      intent.x = len ? x / len : 0;
      intent.z = len ? z / len : 0;
      intent.magnitude = Math.min(1, len);
    },
    press(action) {
      input.setVirtualButton(action, true);
      lab.tick(1);
      input.setVirtualButton(action, false);
    },
    hold(action, down) {
      input.setVirtualButton(action, down);
    },
    tick(n = 1, each) {
      for (let i = 0; i < n; i++) {
        time.tick++;
        time.gameTime += time.fixedDt;
        input.beginTick(time.tick);
        combat.fixedUpdate(time.fixedDt, intent);
        traversal.fixedUpdate(time.fixedDt, intent);
        physics.step(time.fixedDt);
        director.fixedUpdate(time.fixedDt, player);
        bus.flush();
        each?.();
      }
    },
    until(predicate, max = 600) {
      for (let i = 0; i < max && !predicate(); i++) lab.tick();
      return predicate();
    },
    count(type, match = {}) {
      return events.filter((e) => e.type === type && Object.entries(match).every(([k, v]) => e[k] === v))
        .length;
    },
    last(type) {
      return events.filter((e) => e.type === type).at(-1);
    },
  };
  labs.push(lab);
  lab.tick(15);
  events.length = 0;
  return lab;
}

/** Starts an encounter with one enemy of `archetype` 1.5 m in front (+Z) and returns it. */
function face(lab, archetype, distance = 1.5) {
  lab.director.start({ id: 'test', arena: ARENA, spawns: [{ archetype, x: 0, z: distance }] });
  lab.traversal.facing = 0;
  return lab.director.enemies[0];
}

/** Waits for the enemy's wind-up and returns the tick its strike lands (first active tick). */
function impactTick(lab) {
  expect(lab.until(() => lab.count(EV.ENEMY_TELEGRAPH) > 0, 240)).toBe(true);
  const telegraph = lab.last(EV.ENEMY_TELEGRAPH);
  return telegraph.tick + Math.round(telegraph.seconds * 60);
}

describe('strikes', () => {
  it('chains three strikes when each is pressed during the previous one', async () => {
    const lab = await makeLab();
    lab.press('strike');
    lab.tick(8);
    lab.press('strike');
    lab.tick(8);
    lab.press('strike');
    lab.tick(60);
    const order = lab.events.filter((e) => e.type === EV.PLAYER_ATTACK).map((e) => e.move);
    expect(order).toEqual(['strike_1', 'strike_2', 'strike_3']);
    expect(lab.combat.state).toBe('idle');
    expect(lab.traversal.state).toBe('ground');
  });

  it('hits an enemy in front once per swing, with hit-stop and Semangat', async () => {
    const lab = await makeLab();
    const dummy = face(lab, 'dummy');
    lab.tick(50);
    lab.press('strike');
    lab.until(() => lab.count(EV.ENEMY_HIT) > 0, 30);
    expect(lab.count(EV.ENEMY_HIT)).toBe(1);
    expect(lab.time.hitStopRemaining).toBeGreaterThan(0);
    lab.tick(30);
    expect(lab.count(EV.ENEMY_HIT)).toBe(1);
    expect(dummy.vitality).toBe(DUMMY.corruption - moves.player.moves.strike_1.damage);
    expect(lab.combat.semangat).toBeGreaterThan(0);
  });
});

describe('tangkis (parry)', () => {
  it('a press within the perfect window before impact staggers the attacker', async () => {
    const lab = await makeLab();
    const striker = face(lab, 'striker');
    const impact = impactTick(lab);
    lab.tick(impact - lab.time.tick - 5 - 1);
    lab.press('tangkis');
    lab.tick(12);
    expect(lab.count(EV.PLAYER_PARRY, { perfect: true })).toBe(1);
    expect(striker.state).toBe('stagger');
    expect(lab.combat.health).toBe(moves.health.max);
  });

  it('a press earlier than the window only blocks (chip damage)', async () => {
    const lab = await makeLab();
    const striker = face(lab, 'striker');
    const impact = impactTick(lab);
    lab.tick(impact - lab.time.tick - 18 - 1);
    lab.press('tangkis');
    lab.hold('tangkis', true);
    lab.tick(24);
    lab.hold('tangkis', false);
    expect(lab.count(EV.PLAYER_PARRY, { perfect: false })).toBe(1);
    expect(striker.state).not.toBe('stagger');
    expect(lab.combat.health).toBe(moves.health.max - STRIKER.attack.damage * moves.tangkis.chip);
  });

  it('the touch assist widens the perfect window', async () => {
    const lab = await makeLab({ settings: { 'assists.widerParry': true } });
    face(lab, 'striker');
    const impact = impactTick(lab);
    // 0.15 s + 0.08 s ≈ 14 ticks: 12 ticks early is still perfect with the assist.
    lab.tick(impact - lab.time.tick - 12 - 1);
    lab.press('tangkis');
    lab.tick(20);
    expect(lab.count(EV.PLAYER_PARRY, { perfect: true })).toBe(1);
  });
});

describe('langkah (dodge)', () => {
  it('a perfect step slows time and opens the counter', async () => {
    const lab = await makeLab();
    face(lab, 'striker');
    const impact = impactTick(lab);
    lab.tick(impact - lab.time.tick - 4 - 1);
    lab.stick(1, 0);
    lab.press('langkah');
    lab.stick(0, 0);
    lab.tick(8);
    expect(lab.count(EV.PLAYER_DODGE, { perfect: true })).toBe(1);
    expect(lab.time.scale).toBeCloseTo(moves.langkah.slowMoScale, 5);
    expect(lab.combat.health).toBe(moves.health.max);
    lab.until(() => lab.combat.state === 'idle', 30);
    lab.press('strike');
    expect(lab.last(EV.PLAYER_ATTACK).move).toBe('counter');
    lab.combat.frameUpdate(1);
    expect(lab.time.scale).toBe(1);
  });

  it('without a defence the strike connects: damage and hit stun', async () => {
    const lab = await makeLab();
    face(lab, 'striker');
    const impact = impactTick(lab);
    lab.tick(impact - lab.time.tick + 6);
    expect(lab.count(EV.PLAYER_HIT)).toBe(1);
    expect(lab.combat.health).toBe(moves.health.max - STRIKER.attack.damage);
    expect(lab.combat.state === 'hit' || lab.combat.state === 'idle').toBe(true);
  });

  it('with minHealth 1 (the prologue) a hit lands but never defeats', async () => {
    const lab = await makeLab();
    lab.combat.minHealth = 1;
    lab.combat.health = 2;
    face(lab, 'striker');
    const impact = impactTick(lab);
    lab.tick(impact - lab.time.tick + 6);
    expect(lab.count(EV.PLAYER_HIT)).toBe(1);
    expect(lab.combat.health).toBe(1);
    expect(lab.count(EV.PLAYER_DEFEATED)).toBe(0);
  });

  it('never steps off the edge of a narrow deck', async () => {
    const deck = { c: [0, -0.5, 0], h: [1.2, 0.5, 6] }; // 2.4 m wide
    const lab = await makeLab({ boxes: [deck] });
    for (let i = 0; i < 4; i++) {
      lab.stick(1, 0);
      lab.press('langkah');
      lab.stick(0, 0);
      lab.tick(30);
    }
    expect(lab.traversal.state).toBe('ground');
    expect(Math.abs(lab.combat.cc.position.x)).toBeLessThan(1.2);
    expect(lab.combat.cc.feetY).toBeGreaterThan(-0.05);
  });
});

describe('encounters', () => {
  it('only two enemies hold attack tokens at once (normal difficulty)', async () => {
    const lab = await makeLab();
    const spawns = [0, 1, 2, 3, 4].map((i) => ({
      archetype: 'brawler',
      x: Math.sin(i * 1.26) * 4,
      z: Math.cos(i * 1.26) * 4,
    }));
    lab.director.start({ id: 'crowd', arena: ARENA, spawns });
    let most = 0;
    lab.tick(900, () => {
      most = Math.max(most, lab.director.enemies.filter((e) => e.hasToken).length);
      lab.combat.health = moves.health.max; // keep the fight going
    });
    expect(most).toBe(2);
  });

  it('frees a cursed villager at zero corruption (never killed) and clears the encounter', async () => {
    const lab = await makeLab();
    face(lab, 'dummy');
    lab.tick(50);
    for (let i = 0; i < 8 && lab.count(EV.ENEMY_DEFEATED) === 0; i++) {
      lab.press('strike');
      lab.tick(40);
    }
    expect(lab.count(EV.ENEMY_DEFEATED, { kind: 'cursed' })).toBe(1);
    lab.tick(Math.ceil(DUMMY.freeSeconds * 60) + 2);
    expect(lab.count(EV.ENEMY_REMOVED)).toBe(1);
    expect(lab.count(EV.ENCOUNTER_CLEARED)).toBe(1);
  });

  it('a wisp dissolves when its health runs out', async () => {
    const lab = await makeLab();
    // A wisp that stays close (real ones orbit out of reach and dive in; the player chases them).
    lab.director.archetypes.closeWisp = { ...archetypes.wisp, orbit: 1.2, speed: 0.6 };
    lab.director.start({ id: 'wisps', arena: ARENA, spawns: [{ archetype: 'closeWisp', x: 0, z: 1.4 }] });
    const wisp = lab.director.enemies[0];
    wisp.cooldown = 99;
    lab.tick(40);
    for (let i = 0; i < 6 && lab.count(EV.ENEMY_DEFEATED) === 0; i++) {
      lab.traversal.facing = Math.atan2(
        wisp.position.x - lab.combat.cc.position.x,
        wisp.position.z - lab.combat.cc.position.z,
      );
      lab.press('strike');
      lab.tick(30);
    }
    expect(lab.count(EV.ENEMY_DEFEATED, { kind: 'wisp' })).toBe(1);
  });

  it('Cursed Adi enters phase two below half corruption: flurries and a dash', async () => {
    const lab = await makeLab();
    lab.director.start({ id: 'boss', arena: ARENA, spawns: [{ archetype: 'adi', x: 0, z: 1.6 }] });
    const adi = lab.director.enemies[0];
    lab.tick(40);
    adi.vitality = adi.vitalityMax * 0.52;
    adi.cooldown = 99;
    adi._enter('circle');
    lab.traversal.facing = Math.atan2(adi.position.x, adi.position.z - lab.combat.cc.position.z);
    lab.press('heavy');
    lab.tick(40);
    expect(lab.count(EV.ENEMY_PHASE, { phase: 1 })).toBe(1);
    expect(adi.attackDef.flurry).toBe(3);
    expect(adi.def.phases[1].dash).toBeDefined();
  });
});
