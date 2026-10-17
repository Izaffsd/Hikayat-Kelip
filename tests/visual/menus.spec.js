import { expect, test } from './fixtures.js';
import { boot, reach, runRaceRoute, watch } from './helpers.js';

const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    return {
      cls: el?.className ?? '',
      id: el?.dataset?.id ?? null,
      path: el?.dataset?.path ?? null,
      text: el?.textContent?.trim(),
    };
  });

test('pause: Esc opens the menu and freezes the game; keyboard walks it; a setting changes live; Esc backs out', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(150_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=1.2', testQuery]);
  await reach(page, '1.2', 'pondok');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hk-pause')).toBeVisible();
  expect(await page.evaluate(() => window.__hk.engine.paused)).toBe(true);
  // Frozen: the clock that drives missions and the player do not move.
  const before = await page.evaluate(() => [
    window.__hk.player(),
    window.__hk.engine.story.missions.stepTime,
  ]);
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => [window.__hk.player(), window.__hk.engine.story.missions.stepTime]);
  expect(after[1]).toBe(before[1]);
  expect(after[0].x).toBe(before[0].x);
  expect((await focused(page)).id).toBe('resume');
  await page.screenshot({ path: testInfo.outputPath('40-pause-journal.png') });

  // Down the rail to Settings, into it, change the language with the right arrow.
  for (let i = 0; i < 4 && (await focused(page)).id !== 'settings'; i++)
    await page.keyboard.press('ArrowDown');
  expect((await focused(page)).id).toBe('settings');
  await page.keyboard.press('Enter');
  expect((await focused(page)).path).toBe('language');
  const language = await page.evaluate(() => window.__hk.engine.i18n.language);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  const changed = await page.evaluate(() => window.__hk.engine.i18n.language);
  expect(changed).not.toBe(language);
  await expect(page.locator('.hk-pause__title')).toHaveText(changed === 'bm' ? 'Jeda' : 'Paused');
  expect((await focused(page)).path).toBe('language'); // focus survives the re-render
  await page.screenshot({ path: testInfo.outputPath('41-settings.png') });
  // Back to English for the remaining checks, out of the panel, then close.
  await page.evaluate(() => window.__hk.engine.settings.set('language', 'en'));
  await page.keyboard.press('Escape');
  expect((await focused(page)).id).toBe('settings');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hk-pause')).toBeHidden();
  expect(await page.evaluate(() => window.__hk.engine.paused)).toBe(false);

  // Touch/mouse: the map panel and Resume by clicking.
  await page.keyboard.press('Escape');
  await page.locator('.hk-pause__action[data-id="map"]').click();
  await expect(page.locator('.hk-map__item.is-here')).toContainText('Kampung Berembang');
  await page.screenshot({ path: testInfo.outputPath('42-map.png') });
  for (const [w, h] of [
    [844, 390],
    [667, 375],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(250);
    await page.locator('.hk-pause__action[data-id="settings"]').click();
    await page.screenshot({ path: testInfo.outputPath(`43-settings-${w}x${h}.png`) });
    // Nothing of the panel spills out of the screen.
    const box = await page.locator('.hk-pause__panel').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(w + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5);
    // Every action button is at least 44 px tall (design system: touch targets).
    const heights = await page
      .locator('.hk-pause__action')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    for (const height of heights) expect(height).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('.hk-pause__action[data-id="resume"]').click();
  await expect(page.locator('.hk-pause')).toBeHidden();
  expect(problems).toEqual([]);
});

test('pause: restart from checkpoint returns to the saved step and position', async ({ page, testQuery }) => {
  test.setTimeout(150_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=1.2', testQuery]);
  await reach(page, '1.2', 'pondok');
  const saved = await page.evaluate(() => window.__hk.savedDoc().checkpoint);
  await page.evaluate(() => window.__hk.teleport([2, 1.25, -63]));
  await reach(page, '1.2', 'hikayat');
  await page.keyboard.press('Escape');
  await expect(page.locator('.hk-pause')).toBeVisible();
  await expect(page.locator('.hk-pause__action[data-id="restart"]')).toBeEnabled();
  await page.locator('.hk-pause__action[data-id="restart"]').click({ timeout: 10_000 });
  await expect(page.locator('.hk-pause__action[data-id="restart"]')).toContainText('again');
  await page.locator('.hk-pause__action[data-id="restart"]').click();
  await expect(page.locator('.hk-pause')).toBeHidden();
  await reach(page, '1.2', 'pondok');
  const p = await page.evaluate(() => window.__hk.player());
  expect(Math.hypot(p.x - saved.position[0], p.z - saved.position[2])).toBeLessThan(0.5);
  expect(problems).toEqual([]);
});

test('trial: from the pause menu, a countdown, a gold run, the results; Retry runs against the ghost; Exit returns to the story', async ({
  page,
  testQuery,
}, testInfo) => {
  test.setTimeout(200_000);
  const problems = [];
  watch(page, problems);
  await boot(page, ['mission=1.2', testQuery]);
  await reach(page, '1.2', 'pondok');
  // The trial unlocks with 1.1.
  await page.evaluate(() => {
    window.__hk.engine.saveDoc.missions.completed['1.1'] = true;
  });
  await page.keyboard.press('Escape');
  await page.locator('.hk-pause__action[data-id="trials"]').click();
  await expect(page.locator('.hk-trial__start')).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('50-trials-panel.png') });
  await page.locator('.hk-trial__start').click();
  await expect(page.locator('.hk-pause')).toBeHidden();
  await expect(page.locator('.hk-trial__count')).toHaveClass(/is-visible/);
  expect(await page.evaluate(() => window.__hk.engine.trials.holding)).toBe(true);
  await page.waitForFunction(() => window.__hk.engine.trials.active?.phase === 'run', null, {
    timeout: 8000,
  });
  const run = await runRaceRoute(page);
  expect(run.done).toBe(true);
  await expect(page.locator('.hk-results')).toBeVisible();
  const result = await page.evaluate(() => window.__hk.engine.saveDoc.competitive);
  console.info(
    `[${testInfo.project.name}] trial: ${JSON.stringify({ time: result.ghosts['race_1.1'].time, medal: result.medals['race_1.1'] })}`,
  );
  expect(result.medals['race_1.1']).toBe('gold');
  expect(result.ghosts['race_1.1'].samples.length).toBeGreaterThan(100);
  await expect(page.locator('.hk-toast')).toContainText('First Gold', { timeout: 6000 });
  await page.screenshot({ path: testInfo.outputPath('51-results.png') });
  // Retry (Enter: the focused button): the ghost runs the best line and the delta shows.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__hk.engine.trials.active?.phase === 'run', null, {
    timeout: 8000,
  });
  expect(await page.evaluate(() => window.__hk.engine.trials._ghost?.visible)).toBe(true);
  await page.evaluate(() => window.__hk.drive({ x: 1, z: 0, magnitude: 1, sprintHeld: true }));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__hk.drive(null));
  await expect(page.locator('.hk-trial__delta')).not.toHaveText('');
  await page.screenshot({ path: testInfo.outputPath('52-ghost.png') });
  // Leave: the context button restarts; finishing again then Exit goes back to the mission's checkpoint.
  const run2 = await runRaceRoute(page);
  expect(run2.done).toBe(true);
  await expect(page.locator('.hk-results')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.hk-results')).toBeHidden();
  await expect(page.locator('.hk-pause')).toBeHidden();
  await reach(page, '1.2', 'pondok');
  expect(await page.evaluate(() => window.__hk.engine.trials.active)).toBeNull();
  expect(problems).toEqual([]);
});
