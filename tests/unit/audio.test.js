import { describe, expect, it } from 'vitest';
import { matches } from '../../src/audio/AudioDirector.js';
import { Foley } from '../../src/audio/Foley.js';
import { Ramp, nextBoundary, resolveMusicState } from '../../src/audio/MusicSystem.js';
import { VoicePool } from '../../src/audio/Sfx.js';
import { SoundBank } from '../../src/audio/SoundBank.js';
import { data } from '../../src/core/Data.js';
import { EV } from '../../src/core/events.js';

const SOUNDS = data('audio/sounds');
const REGIONS = data('audio/regions');
const MANIFEST = data('generated/assets').assets;

/** Deterministic random for tests. */
function sequence(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('SoundBank', () => {
  const entry = {
    bus: 'sfx',
    sounds: {
      step: [
        [0, 0.2],
        [0.3, 0.2],
        [0.6, 0.2],
      ],
      one: [[1, 0.5]],
    },
  };

  it('never picks the same variant twice in a row', () => {
    const bank = new SoundBank(sequence([0, 0, 0.5, 0.5, 0.9, 0.9]));
    bank.add('sfx', entry, 'buffer');
    let last = -1;
    for (let i = 0; i < 12; i++) {
      const offset = bank.pick('step').offset;
      expect(offset).not.toBe(last);
      last = offset;
    }
  });

  it('plays a fixed variant, single-variant sounds, and forgets removed banks', () => {
    const bank = new SoundBank(() => 0);
    bank.add('sfx', entry, 'buffer');
    expect(bank.pick('step', 2)).toMatchObject({ offset: 0.6, duration: 0.2, bus: 'sfx', buffer: 'buffer' });
    expect(bank.pick('one').offset).toBe(1);
    expect(bank.pick('one').offset).toBe(1);
    expect(bank.pick('missing')).toBeNull();
    bank.remove('sfx');
    expect(bank.has('step')).toBe(false);
    expect(bank.hasBank('sfx')).toBe(false);
  });

  it('marks loop beds and music stems as loops', () => {
    const bank = new SoundBank();
    bank.add('amb', { bus: 'ambience', loop: true, sounds: { amb: [[0, 12]] } }, 'a');
    bank.add(
      'music',
      { bus: 'music', loops: ['explore'], sounds: { explore: [[0.1, 24]], sting: [[24.3, 3]] } },
      'm',
    );
    expect(bank.pick('amb').loop).toBe(true);
    expect(bank.pick('explore').loop).toBe(true);
    expect(bank.pick('sting').loop).toBe(false);
  });
});

describe('VoicePool', () => {
  it('admits while there is room, then steals the oldest of the lowest priority', () => {
    const pool = new VoicePool(3);
    const voices = [
      { priority: 2, started: 0 },
      { priority: 1, started: 1 },
      { priority: 1, started: 2 },
    ];
    for (const voice of voices) {
      expect(pool.admit(1).ok).toBe(true);
      pool.add(voice);
    }
    expect(pool.admit(1)).toEqual({ ok: true, evict: voices[1] });
    expect(pool.admit(3).evict).toBe(voices[1]);
    pool.remove(voices[1]);
    pool.remove(voices[2]);
    pool.add({ priority: 3, started: 3 });
    pool.add({ priority: 3, started: 4 });
    // Every voice now outranks a priority-1 sound: it does not play.
    expect(pool.admit(1)).toEqual({ ok: false, evict: null });
  });
});

describe('MusicSystem timing', () => {
  it('lands changes on the next beat or bar of the stems grid', () => {
    expect(nextBoundary(10, 10, 3)).toBe(10);
    expect(nextBoundary(9, 10, 3)).toBe(10);
    expect(nextBoundary(10.01, 10, 3)).toBe(13);
    expect(nextBoundary(13, 10, 3)).toBe(13);
    expect(nextBoundary(14.5, 10, 0.75)).toBeCloseTo(14.5);
    expect(nextBoundary(14.6, 10, 0.75)).toBeCloseTo(15.25);
  });

  it('chooses cutscene, then fight, then mission, then the default', () => {
    const states = { explore: {}, combat: {}, danger: {}, story: {}, silence: {} };
    expect(resolveMusicState(null, false, null, states, 'explore')).toBe('explore');
    expect(resolveMusicState(null, false, 'danger', states, 'explore')).toBe('danger');
    expect(resolveMusicState(null, true, 'danger', states, 'explore')).toBe('combat');
    expect(resolveMusicState('story', true, null, states, 'explore')).toBe('story');
    expect(resolveMusicState('silence', false, null, states, 'explore')).toBe('silence');
    // A state the region does not have is skipped.
    expect(resolveMusicState(null, false, 'night', states, 'explore')).toBe('explore');
  });

  it('a ramp holds until its start, then moves linearly; rescheduling starts from the current level', () => {
    const ramp = new Ramp(0);
    ramp.schedule(null, 0, 3, 1, 2);
    expect(ramp.valueAt(2)).toBe(0);
    expect(ramp.valueAt(4)).toBeCloseTo(0.5);
    expect(ramp.valueAt(9)).toBe(1);
    ramp.schedule(null, 4, 6, 0.2, 1);
    expect(ramp.valueAt(5)).toBeCloseTo(0.5);
    expect(ramp.valueAt(6.5)).toBeCloseTo(0.35);
    expect(ramp.valueAt(8)).toBeCloseTo(0.2);
  });
});

describe('Foley', () => {
  const make = (surface = 'wood') => {
    const played = [];
    const foley = new Foley({
      play: (id, options) => played.push({ id, ...options }),
      surfaceAt: () => surface,
      tuning: SOUNDS.foley,
      random: () => 0.5,
    });
    return { foley, played };
  };
  const run = (foley, seconds, state, speed) => {
    for (let t = 0; t < seconds; t += 1 / 60) foley.fixedUpdate(1 / 60, state, speed);
  };

  it('steps by distance: longer strides when running, none standing or in the air', () => {
    const t = SOUNDS.foley;
    const walk = make();
    run(walk.foley, 10, 'ground', t.walkSpeed);
    const run_ = make();
    run(run_.foley, 10, 'ground', t.runSpeed);
    expect(walk.played.length).toBeGreaterThan(25);
    expect(walk.played.length).toBeCloseTo((10 * t.walkSpeed) / t.strideWalk, -1);
    expect(run_.played.length).toBeCloseTo((10 * t.runSpeed) / t.strideRun, -1);
    expect(run_.played[0].gain).toBeGreaterThan(walk.played[0].gain);
    const still = make();
    run(still.foley, 5, 'ground', 0.2);
    run(still.foley, 5, 'air', 6);
    expect(still.played).toHaveLength(0);
  });

  it('the first step comes quickly after starting to move', () => {
    const { foley, played } = make();
    run(foley, 0.2, 'ground', SOUNDS.foley.runSpeed);
    expect(played.length).toBe(1);
  });

  it('plays the surface underfoot; wall-runs step on wood', () => {
    for (const surface of ['wood', 'thatch', 'mud', 'water']) {
      const { foley, played } = make(surface);
      run(foley, 2, 'ground', 5);
      expect(played[0].id).toBe(SOUNDS.foley.steps[surface]);
    }
    const { foley, played } = make('mud');
    run(foley, 2, 'wallRun', 7);
    expect(played[0].id).toBe('step_wood');
  });

  it('lands by impact speed and surface', () => {
    const t = SOUNDS.foley;
    const { foley, played } = make('mud');
    foley.land(t.landMinSpeed - 0.5);
    expect(played).toHaveLength(0);
    foley.land(t.landMinSpeed + 1);
    expect(played.at(-1).id).toBe(t.land.mud);
    foley.land(t.landHeavySpeed + 1);
    expect(played.at(-1).id).toBe(t.landHeavy);
    expect(played.at(-1).gain).toBeGreaterThan(played.at(-2).gain);
  });
});

describe('sound rules', () => {
  it('match values, lists and ranges', () => {
    expect(matches({ perfect: true }, { perfect: true })).toBe(true);
    expect(matches({ perfect: true }, { perfect: false })).toBe(false);
    expect(matches({ move: ['heavy', 'finisher'] }, { move: 'finisher' })).toBe(true);
    expect(matches({ move: ['heavy', 'finisher'] }, { move: 'strike_1' })).toBe(false);
    expect(matches({ damage: { min: 20 } }, { damage: 24 })).toBe(true);
    expect(matches({ damage: { min: 20 } }, { damage: 10 })).toBe(false);
    expect(matches({ damage: { min: 20 } }, {})).toBe(false);
  });
});

describe('audio data', () => {
  const builtSounds = new Map();
  for (const [key, entry] of Object.entries(MANIFEST)) {
    if (!key.startsWith('audio/')) continue;
    for (const sound of Object.keys(entry.sounds)) builtSounds.set(sound, key.slice('audio/'.length));
  }
  const banks = (region) => {
    const r = REGIONS.regions[region];
    return new Set([
      ...REGIONS.global,
      ...(r?.banks ?? []),
      ...Object.values(r?.ambience ?? {}).flatMap(Object.keys),
      ...(r?.music ? [r.music.bank] : []),
    ]);
  };

  it('every event the map listens to exists', () => {
    const events = new Set(Object.values(EV));
    for (const event of Object.keys(SOUNDS.events)) expect(events, event).toContain(event);
  });

  it('every sound the map, foley, glide, thunder and Kelip use is built, in a global bank', () => {
    const named = [
      ...Object.values(SOUNDS.events).flatMap((rules) => rules.map((rule) => rule.sound)),
      ...Object.values(SOUNDS.foley.steps),
      ...Object.values(SOUNDS.foley.land),
      SOUNDS.foley.landHeavy,
      SOUNDS.glide.sound,
      SOUNDS.glide.open,
      SOUNDS.kelip.sound,
    ];
    for (const sound of named) {
      expect(builtSounds.has(sound), sound).toBe(true);
      expect(REGIONS.global, `${sound} is in a global bank`).toContain(builtSounds.get(sound));
    }
    // Thunder and the tiger come with the prologue's own banks.
    expect(banks('prologue')).toContain(builtSounds.get(SOUNDS.thunder.sound));
    for (const sound of ['tiger_roar', 'tiger_growl', 'paw'])
      expect(banks('prologue')).toContain(builtSounds.get(sound));
  });

  it('regions name built banks; music states mix stems their bank has; stems are whole bars', () => {
    for (const [id, region] of Object.entries(REGIONS.regions)) {
      for (const bank of banks(id)) expect(MANIFEST[`audio/${bank}`], `${id}: ${bank}`).toBeDefined();
      const music = MANIFEST[`audio/${region.music.bank}`];
      expect(music.loops.length).toBeGreaterThan(0);
      expect(Object.keys(region.music.states)).toContain(region.music.default);
      for (const [state, mix] of Object.entries(region.music.states)) {
        for (const stem of Object.keys(mix)) expect(music.loops, `${id}.${state}: ${stem}`).toContain(stem);
      }
      const bar = (60 / music.music.bpm) * music.music.beatsPerBar;
      for (const stem of music.loops) {
        const [, seconds] = music.sounds[stem][0];
        expect(Math.abs(seconds / bar - Math.round(seconds / bar)), `${id}.${stem}`).toBeLessThan(1e-6);
      }
    }
  });

  it('the stingers the music plays exist in the score of the regions that use them', () => {
    expect(builtSounds.get('sting_win')).toBe(REGIONS.regions.kampung.music.bank);
  });

  it('prologue audio stays under 2 MB (TECHNICAL §10)', () => {
    let bytes = 0;
    for (const bank of banks('prologue')) bytes += MANIFEST[`audio/${bank}`].bytes;
    expect(bytes).toBeLessThan(2 * 1024 * 1024);
  });
});
