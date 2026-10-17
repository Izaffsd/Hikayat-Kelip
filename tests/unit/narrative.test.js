import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';
import { EV } from '../../src/core/events.js';
import { createDefaultSave } from '../../src/core/saveSchema.js';
import { MissionSystem } from '../../src/missions/MissionSystem.js';
import { Cutscenes, SKIP_HOLD_SECONDS } from '../../src/narrative/Cutscenes.js';
import { Dialogue } from '../../src/narrative/Dialogue.js';
import { StoryState } from '../../src/narrative/StoryState.js';

const DATA = {
  speakers: { maksom: { bm: 'Mak Som', en: 'Mak Som' }, adi: { bm: 'Adi', en: 'Adi' } },
  lines: {
    'a.1': { speaker: 'maksom', bm: 'Bayu! Turun ke jeti.', en: 'Bayu! Down to the jetty.', seconds: 2 },
    'a.2': { speaker: 'adi', bm: 'Jom lumba!', en: "Let's race!" },
    'j.1': {
      speaker: 'tokwan',
      bm: 'Cerita yang benar mesti dibaca kuat.',
      en: 'A true story must be read aloud.',
    },
  },
};

function record(bus, types) {
  const seen = [];
  for (const type of types) bus.on(type, (payload) => seen.push({ type, ...payload }));
  return seen;
}

/** Minimal input double: presses last one `tick()`; holds last until released. */
function fakeInput() {
  const pressed = new Set();
  const held = new Set();
  return {
    pressed: (a) => pressed.has(a),
    pressedWithin: (a) => pressed.has(a),
    consume: (a) => pressed.delete(a),
    held: (a) => held.has(a),
    press: (a) => pressed.add(a),
    hold: (a, down) => (down ? held.add(a) : held.delete(a)),
    clear: () => pressed.clear(),
  };
}

describe('Dialogue', () => {
  it('plays queued lines in order in the current language, each for its time', () => {
    const bus = new EventBus();
    const i18n = { language: 'bm' };
    const seen = record(bus, [EV.DIALOGUE_LINE, EV.DIALOGUE_CLEAR]);
    const dialogue = new Dialogue({ bus, i18n, data: DATA });
    dialogue.say('a.1', 'a.2');
    expect(seen[0]).toMatchObject({
      type: EV.DIALOGUE_LINE,
      id: 'a.1',
      speaker: 'Mak Som',
      text: 'Bayu! Turun ke jeti.',
      seconds: 2,
    });
    dialogue.update(1.9);
    expect(seen).toHaveLength(1);
    dialogue.update(0.2);
    expect(seen[1]).toMatchObject({ id: 'a.2', text: 'Jom lumba!' });
    expect(seen[1].seconds).toBeGreaterThanOrEqual(1.8);
    dialogue.update(5);
    expect(seen.at(-1).type).toBe(EV.DIALOGUE_CLEAR);
    expect(dialogue.busy).toBe(false);
  });

  it('rejects unknown lines (data typos fail loudly)', () => {
    const dialogue = new Dialogue({ bus: new EventBus(), i18n: { language: 'en' }, data: DATA });
    expect(() => dialogue.say('nope')).toThrow();
  });
});

describe('Cutscenes', () => {
  function rig() {
    const bus = new EventBus();
    const input = fakeInput();
    const camera = { override: null };
    const dialogue = new Dialogue({ bus, i18n: { language: 'en' }, data: DATA });
    const ran = [];
    const cutscenes = new Cutscenes({
      bus,
      input,
      camera,
      dialogue,
      resolve: (point) => ({ x: point.at[0], y: point.at[1], z: point.at[2] }),
      run: async (actions) => ran.push(...actions),
    });
    const def = {
      id: 'scene',
      duration: 4,
      shots: [
        { t: 0, duration: 2, from: { at: [0, 2, 5] }, to: { at: [0, 2, 3] }, look: { at: [0, 1, 0] } },
        { t: 2, from: { at: [5, 2, 0] }, look: { at: [0, 1, 0] } },
      ],
      lines: [{ t: 0.5, id: 'a.1' }],
      events: [
        { t: 1, flag: 'one' },
        { t: 3, flag: 'two' },
      ],
    };
    return { bus, input, camera, cutscenes, def, ran };
  }

  it('moves the camera through its shots, fires lines and events on time, then hands the camera back', async () => {
    const { bus, camera, cutscenes, def, ran } = rig();
    const ended = record(bus, [EV.CUTSCENE_ENDED]);
    const done = cutscenes.play(def);
    cutscenes.update(1.0);
    expect(camera.override.position.z).toBeCloseTo(4, 1);
    expect(ran).toEqual([{ flag: 'one' }]);
    cutscenes.update(1.5);
    expect(camera.override.position.x).toBe(5);
    cutscenes.update(2);
    expect(ran).toEqual([{ flag: 'one' }, { flag: 'two' }]);
    expect(camera.override).toBeNull();
    expect(ended).toEqual([{ type: EV.CUTSCENE_ENDED, id: 'scene', skipped: false }]);
    await expect(done).resolves.toEqual({ skipped: false });
  });

  it('holding a button skips, and the remaining events still happen', async () => {
    const { input, cutscenes, def, ran } = rig();
    const done = cutscenes.play(def);
    cutscenes.update(0.2);
    input.hold('jump', true);
    cutscenes.update(SKIP_HOLD_SECONDS / 2);
    expect(cutscenes.active).not.toBeNull();
    cutscenes.update(SKIP_HOLD_SECONDS / 2 + 0.01);
    expect(cutscenes.active).toBeNull();
    expect(ran).toEqual([{ flag: 'one' }, { flag: 'two' }]);
    await expect(done).resolves.toEqual({ skipped: true });
  });
});

describe('MissionSystem', () => {
  function rig(missions) {
    const bus = new EventBus();
    const doc = createDefaultSave(0);
    const story = new StoryState({ bus, doc });
    const dialogue = new Dialogue({ bus, i18n: { language: 'en' }, data: DATA });
    const input = fakeInput();
    const feet = { x: 0, y: 0, z: 0 };
    const world = {
      triggers: [{ id: 'gate', center: { x: 10, y: 1, z: 0 }, half: { x: 1, y: 2, z: 1 }, radius: 0 }],
      markers: { table: { p: { x: 0, y: 0, z: 5 }, yaw: 0 }, start: { p: { x: -3, y: 0, z: 0 }, yaw: 0 } },
    };
    const calls = [];
    let region = 'home';
    const host = {
      world: () => world,
      region: () => region,
      feet: () => feet,
      actions: {
        encounter: (id) => calls.push(['encounter', id]),
        teleport: (p) => calls.push(['teleport', p]),
        autosave: (at) => calls.push(['autosave', at]),
        kelipWave: (p) => calls.push(['kelipWave', p]),
        prompt: (action) => calls.push(['prompt', action]),
        light: (name) => calls.push(['light', name]),
        water: (level) => calls.push(['water', level]),
        ability: (name) => calls.push(['ability', name]),
        region: async (id) => {
          calls.push(['region', id]);
          region = id;
        },
        abilities: (set) => calls.push(['abilities', set]),
        darken: (dir) => calls.push(['darken', dir]),
      },
    };
    const system = new MissionSystem({ bus, story, dialogue, cutscenes: null, input, missions, host });
    const seen = record(bus, [EV.MISSION_STEP, EV.MISSION_COMPLETED, EV.CHECKPOINT]);
    const tick = (n = 1) => {
      for (let i = 0; i < n; i++) {
        system.fixedUpdate(1 / 60);
        input.clear();
      }
    };
    return { bus, doc, story, input, feet, system, calls, seen, tick };
  }

  const MISSIONS = {
    one: {
      id: 'one',
      chapter: '1',
      steps: [
        {
          id: 'walk',
          objective: 'objective.walk',
          guide: 'trigger:gate',
          until: { trigger: 'gate' },
          on: { start: [{ say: 'a.1' }], done: [{ flag: 'walked' }] },
        },
        { id: 'fight', checkpoint: true, until: { encounter: 'e1' }, on: { start: [{ encounter: 'e1' }] } },
        { id: 'signal', until: { event: EV.PLAYER_PARRY, match: { perfect: true } } },
        {
          id: 'read',
          until: { interact: 'table', radius: 2 },
          on: { done: [{ journal: 'j.1' }, { page: 1 }, { cahaya: 1 }] },
        },
        { id: 'pause', until: { seconds: 0.5 } },
      ],
      end: [{ autosave: true }, { next: 'two' }],
    },
    two: { id: 'two', chapter: '1', steps: [{ id: 'only', until: { flag: 'done' } }] },
  };

  it('walks through trigger, encounter, event, interact and timer steps, then chains the next mission', async () => {
    const { bus, doc, story, input, feet, system, calls, seen, tick } = rig(MISSIONS);
    await system.start('one');
    expect(seen[0]).toMatchObject({ type: EV.MISSION_STEP, step: 'walk', objective: 'objective.walk' });
    expect(system.guideTarget).toMatchObject({ x: 10, z: 0 });
    tick(10);
    expect(system.step.id).toBe('walk');
    feet.x = 10;
    feet.y = 1;
    tick();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(story.get('walked')).toBe(true);
    expect(system.step.id).toBe('fight');
    expect(calls).toContainEqual(['encounter', 'e1']);
    expect(calls).toContainEqual(['autosave', { mission: 'one', step: 'fight' }]);
    expect(seen.some((e) => e.type === EV.CHECKPOINT && e.step === 'fight')).toBe(true);
    bus.emit(EV.ENCOUNTER_CLEARED, { id: 'e1' });
    tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(system.step.id).toBe('signal');
    bus.emit(EV.PLAYER_PARRY, { perfect: false });
    tick();
    expect(system.step.id).toBe('signal');
    bus.emit(EV.PLAYER_PARRY, { perfect: true });
    tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(system.step.id).toBe('read');
    feet.x = 0;
    feet.y = 0;
    feet.z = 6;
    input.press('context');
    tick();
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.story.journal).toEqual(['j.1']);
    expect(doc.story.pages).toEqual([1]);
    expect(doc.progression.cahaya).toBe(1);
    tick(40);
    await new Promise((r) => setTimeout(r, 0));
    expect(doc.missions.completed.one).toBe(true);
    expect(system.mission.id).toBe('two');
    expect(doc.story.mission).toBe('two');
    expect(seen.some((e) => e.type === EV.MISSION_COMPLETED && e.id === 'one')).toBe(true);
  });

  it('resumes at a checkpointed step without replaying the mission start', async () => {
    const missions = { ...MISSIONS, one: { ...MISSIONS.one, start: [{ teleport: 'marker:start' }] } };
    const { system, calls } = rig(missions);
    await system.start('one', 'fight');
    expect(system.step.id).toBe('fight');
    expect(calls.some(([name]) => name === 'teleport')).toBe(false);
    expect(calls).toContainEqual(['encounter', 'e1']);
  });
});

describe('MissionSystem: starting and resuming', () => {
  function rig(missions) {
    const bus = new EventBus();
    const doc = createDefaultSave(0);
    const story = new StoryState({ bus, doc });
    const dialogue = new Dialogue({ bus, i18n: { language: 'en' }, data: DATA });
    const world = { triggers: [], markers: { spawn: { p: { x: 0, y: 0, z: 0 }, yaw: 0 } } };
    let region = 'prologue';
    const calls = [];
    const host = {
      world: () => world,
      region: () => region,
      feet: () => ({ x: 0, y: 0, z: 0 }),
      actions: {
        autosave: (at) => calls.push(['autosave', at.mission, at.step]),
        region: async (id, marker) => {
          calls.push(['region', id, marker]);
          region = id;
        },
        abilities: (set) => calls.push(['abilities', set]),
        light: (name) => calls.push(['light', name]),
        darken: (dir) => calls.push(['darken', dir]),
        encounter: (id) => calls.push(['encounter', id]),
      },
    };
    const system = new MissionSystem({
      bus,
      story,
      dialogue,
      cutscenes: null,
      input: fakeInput(),
      missions,
      host,
    });
    return { system, calls, doc };
  }

  const MISSIONS = {
    night: {
      id: 'night',
      chapter: '1',
      region: 'kampung',
      abilities: 'chapter1',
      setup: [{ light: 'night' }],
      start: [{ encounter: 'intro' }],
      steps: [
        { id: 'first', until: { flag: 'never' } },
        {
          id: 'second',
          checkpoint: true,
          until: { flag: 'never' },
          on: { resume: [{ darken: [0, -1], seconds: 0 }], start: [{ encounter: 'fight' }] },
        },
      ],
    },
  };

  it('a fresh start enters the region, applies abilities and setup, runs start, and saves at the first step', async () => {
    const { system, calls } = rig(MISSIONS);
    await system.start('night');
    expect(calls).toEqual([
      ['region', 'kampung', 'spawn'],
      ['abilities', 'chapter1'],
      ['light', 'night'],
      ['encounter', 'intro'],
      ['autosave', 'night', 'first'],
    ]);
    expect(system.step.id).toBe('first');
  });

  it("a resume runs setup and the step's on.resume instead of the mission start", async () => {
    const { system, calls } = rig(MISSIONS);
    await system.start('night', 'second');
    expect(calls).toEqual([
      ['region', 'kampung', 'spawn'],
      ['abilities', 'chapter1'],
      ['light', 'night'],
      ['darken', [0, -1]],
      ['autosave', 'night', 'second'],
      ['encounter', 'fight'],
    ]);
  });

  it('rejects an unknown step (a bad save or URL fails loudly)', async () => {
    const { system } = rig(MISSIONS);
    await expect(system.start('night', 'nope')).rejects.toThrow(/no step/);
  });
});
