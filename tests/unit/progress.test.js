import { describe, expect, it } from 'vitest';
import { GhostRecorder, GhostTrack } from '../../src/competitive/Ghost.js';
import { Trials } from '../../src/competitive/Trials.js';
import { data } from '../../src/core/Data.js';
import { EventBus } from '../../src/core/EventBus.js';
import { EV } from '../../src/core/events.js';
import { createDefaultSave } from '../../src/core/saveSchema.js';
import { Achievements } from '../../src/progression/Achievements.js';

describe('ghosts', () => {
  it('records at the set rate in centimetres and plays back between samples', () => {
    const recorder = new GhostRecorder(20);
    recorder.begin();
    for (let tick = 0; tick <= 120; tick++) {
      const t = tick / 60;
      recorder.sample(t, { x: t * 6, y: 1, z: 0 }, Math.PI / 2);
    }
    const ghost = recorder.finish(2);
    expect(ghost.samples.length / 4).toBe(41); // 0 … 2 s at 20 Hz
    const track = new GhostTrack(ghost, (p) => p.x);
    const p = { x: 0, y: 0, z: 0 };
    const pose = track.at(1.025, p);
    expect(p.x).toBeCloseTo(6.15, 2);
    expect(pose.yaw).toBeCloseTo(1.57, 2);
    expect(pose.speed).toBeCloseTo(6, 1);
    // Reached 6 m along the line after 1 s.
    expect(track.timeAt(6)).toBeCloseTo(1, 5);
    expect(track.timeAt(100)).toBe(Infinity);
  });
});

describe('trials', () => {
  function rig() {
    const bus = new EventBus();
    const doc = createDefaultSave(0);
    doc.missions.completed['1.1'] = true;
    const feet = { x: 0, y: 1, z: 0 };
    const placed = [];
    const world = {
      markers: { start: { p: { x: 0, y: 1, z: 0 }, yaw: 0 } },
      triggers: [{ id: 'finish', center: { x: 0, y: 1, z: 20 }, half: { x: 2, y: 2, z: 1 }, radius: 0 }],
      paths: {
        line: [
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 1, z: 20 },
        ],
      },
    };
    const pressed = new Set();
    const input = { pressed: (a) => pressed.has(a), consume: (a) => pressed.delete(a) };
    let saves = 0;
    const config = {
      ghostHz: 20,
      countdown: 3,
      trials: {
        t: {
          name: 'x',
          region: 'kampung',
          unlock: '1.1',
          start: 'marker:start',
          finish: 'finish',
          line: 'line',
          medals: { gold: 5, silver: 7, bronze: 9 },
        },
      },
    };
    const trials = new Trials({
      bus,
      config,
      doc,
      host: {
        world: () => world,
        region: () => 'kampung',
        feet: () => feet,
        facing: () => 0,
        place: (p) => placed.push(p),
        save: () => saves++,
        input,
        playerGltf: () => null,
        clips: new Map(),
        profile: {},
        scene: null,
        camera: null,
      },
    });
    const finished = [];
    bus.on(EV.TRIAL_FINISHED, (r) => finished.push(r));
    /** Runs the trial at `speed` m/s up the line until it finishes. */
    const run = (speed) => {
      trials.start('t');
      for (let i = 0; i < 60 * 3 + 1; i++) trials.fixedUpdate(1 / 60);
      feet.z = 0;
      for (let i = 0; i < 60 * 30 && trials.active.phase === 'run'; i++) {
        feet.z += speed / 60;
        trials.fixedUpdate(1 / 60);
      }
      return finished.at(-1);
    };
    return { trials, doc, run, placed, saves: () => saves, pressed };
  }

  it('holds Bayu through the countdown, then times the run to the finish and gives the medal', () => {
    const { trials, doc, run, placed, saves } = rig();
    expect(trials.status('t')).toEqual({ unlocked: true, here: true });
    const first = run(3); // 19 m at 3 m/s ≈ 6.3 s → silver
    expect(placed).toHaveLength(1);
    expect(first.medal).toBe('silver');
    expect(first.record).toBe(true);
    expect(first.newMedal).toBe(true);
    expect(doc.competitive.medals.t).toBe('silver');
    expect(doc.competitive.ghosts.t.time).toBe(first.seconds);
    expect(saves()).toBe(1);
    expect(trials.holding).toBe(true); // results showing
    const slower = run(2.2); // bronze, not a record
    expect(slower.medal).toBe('bronze');
    expect(slower.record).toBe(false);
    expect(doc.competitive.medals.t).toBe('silver');
    const faster = run(4.5); // gold
    expect(faster.medal).toBe('gold');
    expect(faster.record).toBe(true);
    expect(doc.competitive.medals.t).toBe('gold');
    expect(trials.active.track).not.toBeNull(); // the ghost of the earlier best ran alongside
  });

  it('the context button restarts at once; exit leaves the trial', () => {
    const { trials, pressed } = rig();
    trials.start('t');
    for (let i = 0; i < 60 * 4; i++) trials.fixedUpdate(1 / 60);
    expect(trials.active.phase).toBe('run');
    pressed.add('context');
    trials.fixedUpdate(1 / 60);
    expect(trials.active.phase).toBe('countdown');
    trials.exit();
    expect(trials.active).toBeNull();
    expect(trials.holding).toBe(false);
  });
});

describe('achievements', () => {
  it('are earned once, kept with the time and announced', () => {
    const bus = new EventBus();
    const doc = createDefaultSave(0);
    const toasts = [];
    bus.on(EV.TOAST, (t) => toasts.push(t));
    const achievements = new Achievements({ bus, config: data('achievements'), doc, now: () => 42 });
    expect(achievements.unlock('bunyi_pertama')).toBe(true);
    expect(achievements.unlock('bunyi_pertama')).toBe(false);
    expect(doc.progression.achievements.bunyi_pertama).toBe(42);
    expect(toasts).toEqual([
      {
        title: 'achievement.bunyi_pertama.title',
        body: 'achievement.bunyi_pertama.body',
        kind: 'achievement',
      },
    ]);
    expect(() => achievements.unlock('nope')).toThrow();
  });

  it('every achievement has its texts in both languages', () => {
    const en = data('i18n/en');
    const bm = data('i18n/bm');
    for (const def of Object.values(data('achievements').achievements)) {
      for (const key of [def.title, def.body]) {
        expect(en[key], key).toBeTruthy();
        expect(bm[key], key).toBeTruthy();
      }
    }
  });
});

describe('settings menu data', () => {
  it('only edits settings that exist, with values of the right type, and every label in both languages', () => {
    const menu = data('ui/settingsMenu');
    const defaults = data('settings.defaults');
    const en = data('i18n/en');
    const bm = data('i18n/bm');
    const read = (path) => path.split('.').reduce((node, key) => node?.[key], defaults);
    for (const section of menu.sections) {
      expect(en[section.label] && bm[section.label], section.label).toBeTruthy();
      for (const row of section.rows) {
        const fallback = read(row.path);
        expect(fallback, row.path).not.toBeUndefined();
        expect(en[row.label] && bm[row.label], row.label).toBeTruthy();
        if (row.options) {
          const options = typeof row.options === 'string' ? menu.optionSets[row.options] : row.options;
          expect(options.length, row.path).toBeGreaterThan(1);
          for (const [value, label] of options) {
            expect(en[label] && bm[label], label).toBeTruthy();
            // A value must suit the setting: its default's type, or 'auto' where the default is 'auto'.
            const ok = value === 'auto' || fallback === 'auto' || typeof value === typeof fallback;
            expect(ok, `${row.path} = ${value}`).toBe(true);
          }
          expect(
            options.some(([v]) => v === fallback),
            `${row.path}: default is a choice`,
          ).toBe(true);
        } else {
          const [min, max, step] = row.range;
          expect(min < max && step > 0, row.path).toBe(true);
          expect(fallback >= min && fallback <= max, `${row.path}: default in range`).toBe(true);
        }
      }
    }
  });
});
