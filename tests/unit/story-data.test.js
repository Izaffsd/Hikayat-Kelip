import { describe, expect, it } from 'vitest';
import { data, dataKeys, lazyKeys, loadData } from '../../src/core/Data.js';
import { EV } from '../../src/core/events.js';
import { StoryDirector } from '../../src/narrative/StoryDirector.js';

/** Missions in the GDD's first ten minutes: their cutscenes stay under 20 s (TECHNICAL §9). */
const FIRST_TEN_MINUTES = new Set(['P', '1.1', '1.2']);

/** Every action key a mission or cutscene may use (MissionSystem built-ins plus StoryDirector host actions). */
const ACTIONS = new Set([
  'say',
  'conversation',
  'cutscene',
  'encounter',
  'flag',
  'add',
  'journal',
  'page',
  'cahaya',
  'ability',
  'abilities',
  'light',
  'water',
  'teleport',
  'region',
  'kelipWave',
  'kelipRise',
  'prompt',
  'autosave',
  'next',
  'wait',
  'fade',
  'title',
  'darken',
  'relight',
  'prop',
  'avatar',
  'tiger',
  'pose',
  'lightning',
  'shake',
  'undefeatable',
  'npc',
  'tendrils',
  'race',
  'hold',
  'lamp',
  'waitFor',
  'clearEnemies',
  'achievement',
]);
const TIGER_COMMANDS = new Set(['load', 'chase', 'standoff', 'roar', 'hide']);
const NPC_COMMANDS = new Set(['load', 'place', 'run', 'flee', 'hold', 'face', 'ink', 'hide']);
const NPC = data('tuning/npc');
const MODELS = data('generated/assets').assets;
/** Keys that are arguments of an action, not actions. */
const ARGUMENTS = new Set([
  'seconds',
  'value',
  'by',
  'marker',
  'text',
  'offset',
  'yaw',
  'to',
  't',
  'at',
  'path',
  'end',
  'do',
  'state',
  'on',
  'pace',
  'rival',
  'win',
  'lose',
]);

const content = await StoryDirector.loadData();
const scenes = Object.fromEntries(
  dataKeys()
    .filter((key) => key.startsWith('cutscenes/'))
    .map((key) => [data(key).id, data(key)]),
);
const regions = {};
for (const key of lazyKeys('regions/')) regions[key.slice('regions/'.length)] = await loadData(key);
const en = data('i18n/en');
const bm = data('i18n/bm');
const encounters = data('encounters');
const events = new Set(Object.values(EV));

/** Every action list of a mission, with where it is. */
function actionLists(mission) {
  const lists = [
    ['setup', mission.setup],
    ['start', mission.start],
    ['end', mission.end],
  ];
  for (const step of mission.steps) {
    for (const [name, list] of Object.entries(step.on ?? {})) lists.push([`${step.id}.${name}`, list]);
  }
  return lists.filter(([, list]) => list);
}

/** Conditions of a step, flattened. */
function conditions(until) {
  if (!until) return [];
  return [until, ...(until.all ?? []).flatMap(conditions), ...(until.any ?? []).flatMap(conditions)];
}

/** Checks a 'marker:x' / 'trigger:x' reference against a region layout. */
function expectPoint(region, at, where) {
  if (Array.isArray(at) || at === 'player') return;
  const [kind, name] = at.includes(':') ? at.split(':') : ['marker', at];
  if (kind === 'trigger')
    expect(
      region.triggers.map((t) => t.id),
      where,
    ).toContain(name);
  else expect(Object.keys(region.markers), where).toContain(name);
}

function checkAction(action, mission, region, where) {
  const keys = Object.keys(action).filter((key) => !ARGUMENTS.has(key));
  expect(keys, `${where}: one action per entry`).toHaveLength(1);
  const [key] = keys;
  expect(ACTIONS, `${where}: unknown action "${key}"`).toContain(key);
  const value = action[key];
  if (key === 'say' || key === 'conversation') {
    for (const id of [value].flat()) expect(content.dialogue.lines[id], `${where}: line ${id}`).toBeDefined();
  }
  if (key === 'journal') expect(content.dialogue.lines[value], `${where}: journal ${value}`).toBeDefined();
  if (key === 'cutscene') expect(scenes[value], `${where}: cutscene ${value}`).toBeDefined();
  if (key === 'encounter') {
    expect(encounters[value], `${where}: encounter ${value}`).toBeDefined();
    expect(encounters[value].region, `${where}: encounter ${value} region`).toBe(region.id);
  }
  if (key === 'next') expect(content.missions[value], `${where}: next ${value}`).toBeDefined();
  if (key === 'region') {
    expect(regions[value], `${where}: region ${value}`).toBeDefined();
    expect(Object.keys(regions[value].markers)).toContain(action.marker ?? 'spawn');
  }
  if (key === 'teleport' || key === 'kelipWave' || key === 'kelipRise') expectPoint(region, value, where);
  if (key === 'prop') expectPoint(region, action.at, where);
  if (key === 'tiger') {
    expect(TIGER_COMMANDS, `${where}: tiger ${value}`).toContain(value);
    if (action.path) expect(region.paths[action.path], `${where}: path ${action.path}`).toBeDefined();
    if (action.end) expectPoint(region, action.end, where);
    if (action.at) expectPoint(region, action.at, where);
  }
  if (key === 'pose') expect(data('animation/human').states[value], `${where}: pose ${value}`).toBeDefined();
  if (key === 'npc') {
    expect(NPC.models[value], `${where}: villager ${value}`).toBeDefined();
    expect(MODELS[`characters/${NPC.models[value]}`], `${where}: model of ${value}`).toBeDefined();
    expect(NPC_COMMANDS, `${where}: npc do ${action.do}`).toContain(action.do);
    if (action.at) expectPoint(region, action.at, where);
    if (action.path) expect(region.paths[action.path], `${where}: path ${action.path}`).toBeDefined();
    if (action.do === 'run') expect(NPC.paces[action.pace], `${where}: pace ${action.pace}`).toBeDefined();
    if (action.do === 'hold' && action.state) {
      expect(data('animation/human').states[action.state], `${where}: state ${action.state}`).toBeDefined();
    }
  }
  if (key === 'tendrils') {
    expect(['rise', 'sink'], `${where}: tendrils ${value}`).toContain(value);
    if (value === 'rise') expect(region.paths[action.path], `${where}: path ${action.path}`).toBeDefined();
  }
  if (key === 'race') {
    expect(['start', 'finish'], `${where}: race ${value}`).toContain(value);
    for (const line of [action.win, action.lose].filter(Boolean)) {
      expect(content.dialogue.lines[line], `${where}: line ${line}`).toBeDefined();
    }
  }
  if (key === 'lamp') expectPoint(region, action.at, where);
  if (key === 'waitFor') expect(value, `${where}: waitFor`).toBe('dialogue');
  if (key === 'achievement')
    expect(data('achievements').achievements[value], `${where}: ${value}`).toBeDefined();
  if (key === 'prompt' && value !== null) {
    expect(data('input/bindings').keyboard[value], `${where}: prompt action ${value}`).toBeDefined();
    if (action.text) {
      expect(en[action.text], `${where}: ${action.text} (en)`).toBeTruthy();
      expect(bm[action.text], `${where}: ${action.text} (bm)`).toBeTruthy();
    }
  }
  if (key === 'title') {
    for (const part of ['kicker', 'title']) {
      expect(en[`${value}.${part}`], `${where}: ${value}.${part}`).toBeTruthy();
      expect(bm[`${value}.${part}`], `${where}: ${value}.${part}`).toBeTruthy();
    }
  }
  if (key === 'abilities') expect(data('abilities').sets[value]).toBeDefined();
  if (key === 'avatar') expect(MODELS[`characters/${value}`], `${where}: model ${value}`).toBeDefined();
}

describe('story data', () => {
  it('loads the slice: the prologue and Chapter 1 missions, chained from P to 1.4', () => {
    expect(Object.keys(content.missions).sort()).toEqual(['1.1', '1.2', '1.3', '1.4', 'P']);
    const chain = [];
    for (let id = 'P'; id;) {
      chain.push(id);
      id = content.missions[id].end?.find((action) => action.next)?.next;
    }
    expect(chain).toEqual(['P', '1.1', '1.2', '1.3', '1.4']);
    // A new save starts the prologue.
    expect(content.missions.P.region).toBe('prologue');
  });

  it('every mission names things that exist: region, abilities, steps, triggers, markers, lines, events', () => {
    for (const mission of Object.values(content.missions)) {
      const region = regions[mission.region];
      expect(region, `${mission.id} region`).toBeDefined();
      if (mission.abilities) expect(data('abilities').sets[mission.abilities]).toBeDefined();
      if (mission.avatar)
        expect(MODELS[`characters/${mission.avatar}`], `${mission.id} avatar`).toBeDefined();
      const stepIds = mission.steps.map((s) => s.id);
      expect(new Set(stepIds).size, `${mission.id} unique steps`).toBe(stepIds.length);
      for (const step of mission.steps) {
        const where = `${mission.id}/${step.id}`;
        if (step.objective) {
          expect(en[step.objective], `${where} objective (en)`).toBeTruthy();
          expect(bm[step.objective], `${where} objective (bm)`).toBeTruthy();
        }
        if (step.guide) expectPoint(region, step.guide, `${where} guide`);
        expect(step.until, `${where} has a condition`).toBeDefined();
        for (const c of conditions(step.until)) {
          if (c.trigger)
            expect(
              region.triggers.map((t) => t.id),
              where,
            ).toContain(c.trigger);
          if (c.encounter) expect(encounters[c.encounter]?.region, where).toBe(mission.region);
          if (c.cutscene) expect(scenes[c.cutscene], where).toBeDefined();
          if (c.interact) expectPoint(region, c.interact, where);
          if (c.event) expect(events, `${where}: event ${c.event}`).toContain(c.event);
        }
      }
      for (const [where, list] of actionLists(mission)) {
        for (const action of list) checkAction(action, mission, region, `${mission.id}/${where}`);
      }
    }
  });

  it('cutscenes are short, ordered, and only name existing lines and markers', () => {
    const users = {};
    for (const mission of Object.values(content.missions)) {
      for (const [, list] of actionLists(mission)) {
        for (const action of list) if (action.cutscene) users[action.cutscene] = mission;
      }
    }
    for (const scene of Object.values(scenes)) {
      const mission = users[scene.id];
      expect(mission, `${scene.id} is used by a mission`).toBeDefined();
      const limit = FIRST_TEN_MINUTES.has(mission.id) ? 20 : 30;
      expect(scene.duration, scene.id).toBeLessThan(limit);
      const region = regions[mission.region];
      for (const shot of scene.shots) {
        expect(shot.t).toBeLessThan(scene.duration);
        for (const point of [shot.from, shot.to, shot.look, shot.lookTo].filter(Boolean)) {
          expectPoint(region, point.at, `${scene.id} shot @${shot.t}`);
        }
      }
      for (const line of scene.lines ?? []) {
        expect(content.dialogue.lines[line.id], `${scene.id}: ${line.id}`).toBeDefined();
        expect(line.t).toBeLessThan(scene.duration);
      }
      for (const event of scene.events ?? []) {
        expect(event.t).toBeLessThanOrEqual(scene.duration);
        checkAction(event, mission, region, `${scene.id} @${event.t}`);
      }
    }
  });

  it('every line has a known speaker and both languages', () => {
    const { speakers, lines } = content.dialogue;
    for (const [id, line] of Object.entries(lines)) {
      expect(speakers[line.speaker], `${id} speaker`).toBeDefined();
      expect(line.bm?.trim(), `${id} bm`).toBeTruthy();
      expect(line.en?.trim(), `${id} en`).toBeTruthy();
    }
  });
});
