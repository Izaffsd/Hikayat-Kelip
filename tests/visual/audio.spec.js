import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures.js';
import { boot, fight, reach, tap, watch } from './helpers.js';

const manifest = JSON.parse(readFileSync('src/data/generated/assets.json', 'utf8')).assets;
const banks = Object.entries(manifest).filter(([, entry]) => entry.type === 'audio');
const audio = (page) => page.evaluate(() => window.__hk.audio());
const played = async (page, id) => (await audio(page)).played[id] ?? 0;

/** Waits until the context runs and every named bank is decoded. */
function banksReady(page, wanted, timeout = 30_000) {
  return page.waitForFunction(
    (ids) => {
      const a = window.__hk.audio();
      return a.state === 'running' && ids.every((id) => a.banks.includes(id));
    },
    wanted,
    { timeout },
  );
}

test('every sound bank decodes in the browser with its regions inside the decoded audio', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'webgpu', 'audio decoding does not depend on the render backend');
  await page.goto('/?test=1');
  const decoded = await page.evaluate(
    async (urls) => {
      const context = new OfflineAudioContext(1, 1, 44100);
      const out = {};
      for (const url of urls) {
        const buffer = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
        out[url] = { duration: buffer.duration, channels: buffer.numberOfChannels };
      }
      return out;
    },
    banks.map(([, entry]) => entry.url),
  );

  for (const [key, entry] of banks) {
    const { duration, channels } = decoded[entry.url];
    expect(channels, key).toBe(1);
    const end = Math.max(...Object.values(entry.sounds).flatMap((regions) => regions.map(([o, d]) => o + d)));
    expect(end, key).toBeLessThanOrEqual(duration + 1e-3);
    if (entry.loop)
      expect(Math.abs(duration - end), `${key} decodes to its exact loop length`).toBeLessThan(1e-3);
  }
  await testInfo.attach('decoded', {
    body: JSON.stringify(decoded, null, 2),
    contentType: 'application/json',
  });
});

test('prologue sound: the start tap unlocks audio, storm beds and the score play, steps, a jump, menu clicks, thunder and the tiger', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(180_000);
  const problems = [];
  watch(page, problems);
  await boot(page, [testQuery]);
  await reach(page, 'P', 'roofs');
  await banksReady(page, [
    'ui',
    'sfx',
    'glide_wind',
    'storm',
    'tiger',
    'amb_rain',
    'amb_wind',
    'amb_water',
    'music_prologue',
  ]);
  // Beds fade in; the stems start on the grid and come up to the explore mix.
  await page.waitForFunction(() => (window.__hk.audio().music.levels.explore ?? 0) > 0.5, null, {
    timeout: 8000,
  });
  const start = await audio(page);
  expect(start.music.state).toBe('explore');
  expect(Object.keys(start.ambience).sort()).toEqual(['amb_rain', 'amb_water', 'amb_wind']);
  expect(start.played.ui_confirm ?? 0).toBeLessThanOrEqual(1);

  // Walking along the roof ridge: footsteps on the surface underfoot.
  await page.evaluate(() => window.__hk.drive({ x: 1, z: 0, magnitude: 0.7 }));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__hk.drive(null));
  const walked = await audio(page);
  const steps = Object.entries(walked.played).filter(([id]) => id.startsWith('step_'));
  console.info(`[${testInfo.project.name}] steps: ${JSON.stringify(steps)} of ${walked.steps}`);
  expect(walked.steps).toBeGreaterThan(1);
  await tap(page, 'jump');
  await page.waitForTimeout(1200);
  expect(await played(page, 'jump')).toBeGreaterThan(0);

  // The pause menu: the book opens, focus moves click, the world quietens; closing brings it back.
  await page.keyboard.press('Escape');
  await expect(page.locator('.hk-pause')).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  expect(await played(page, 'book_open')).toBe(1);
  expect(await played(page, 'ui_hover')).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__hk.engine.audio.paused)).toBe(true);
  // Back on the rail closes the menu (after its open grace, which keeps the opening press from closing it).
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(page.locator('.hk-pause')).toBeHidden();
  expect(await page.evaluate(() => window.__hk.engine.audio.paused)).toBe(false);

  // Into the chase: lightning and thunder, the danger mix on the next bar, then the standoff and the roar.
  await page.evaluate(() => window.__hk.engine.story.restart('P', 'chase'));
  await reach(page, 'P', 'chase');
  await page.waitForFunction(() => window.__hk.audio().music.state === 'danger', null, { timeout: 6000 });
  await page.evaluate(() => window.__hk.teleport([119, 3, 1.6]));
  await reach(page, 'P', 'flood');
  await page.waitForTimeout(600);
  expect(await played(page, 'thunder')).toBeGreaterThan(0);
  await page.evaluate(() => window.__hk.teleport([166, 2.6, 0]));
  await page.waitForFunction(() => window.__hk.story().cutscene === 'p_standoff', null, { timeout: 8000 });
  await page.waitForFunction(() => window.__hk.audio().music.state === 'story', null, { timeout: 6000 });
  await page.waitForTimeout(3200);
  expect(await played(page, 'tiger_roar')).toBe(1);
  expect(await played(page, 'paw')).toBeGreaterThan(0);
  const end = await audio(page);
  console.info(`[${testInfo.project.name}] prologue audio: ${JSON.stringify(end)}`);
  expect(end.voices).toBeLessThanOrEqual(24);
  expect(problems).toEqual([]);
});

test('kampung sound: night beds, combat music on the beat in the jetty fight, hits and tells, back to night', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(180_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=1.2', 'step=fight', testQuery]);
  await reach(page, '1.2', 'fight');
  await banksReady(page, ['ui', 'sfx', 'amb_night', 'amb_water', 'music_kampung']);
  await page.waitForFunction(() => window.__hk.enemies().length === 3, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__hk.audio().music.state === 'combat', null, { timeout: 6000 });
  const fightStart = await audio(page);
  expect(fightStart.music.override).toBe('night');
  // Night: the insects over the water.
  await page.waitForTimeout(500);
  const beds = (await audio(page)).ambience;
  expect(beds.amb_night).toBeGreaterThan(beds.amb_water);

  // Started at the step, Bayu is at the region's spawn: put him on the jetty head with the wisps.
  await page.evaluate(() => window.__hk.teleport([2, 1.25, -62]));
  const fought = await fight(page, 60);
  console.info(`[${testInfo.project.name}] jetty wisps: ${JSON.stringify(fought)}`);
  expect(fought.left).toBe(0);
  const after = await audio(page);
  for (const id of ['whoosh_light', 'hit_staff', 'tell', 'wisp_dissolve'])
    expect(after.played[id] ?? 0, id).toBeGreaterThan(0);
  // The fight is over: the music leaves combat for the mission's mix (night, then danger as Adi is caught).
  await page.waitForFunction(() => ['night', 'danger'].includes(window.__hk.audio().music.state), null, {
    timeout: 8000,
  });
  console.info(`[${testInfo.project.name}] kampung audio: ${JSON.stringify(await audio(page))}`);
  expect(problems).toEqual([]);
});
