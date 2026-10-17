import { test as base, expect } from '@playwright/test';
import { keepFocused } from './focus.js';

const test = base.extend({ testQuery: ['', { option: true }] });

/** Waits until the player state satisfies `predicate` (evaluated in the page), polling each animation frame. */
async function waitPlayer(page, predicate, timeout = 4000) {
  await page.waitForFunction(predicate, null, { timeout, polling: 'raf' });
}

/**
 * Traversal in the browser (both backends), in the movement sandbox: the automatic mantle onto the 1.0 m block,
 * jump–grab–climb on the 1.4 m block, a slide, and the wau glide off the platform roof. The mechanics are covered
 * headless in tests/unit/traversal.test.js; this checks the game wires them up (input, animation, no errors) and
 * keeps screenshots of each move for review.
 */
test('mantle, ledge climb, slide and glide work in the game', async ({ page, testQuery }, testInfo) => {
  const problems = [];
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(e.message));
  await keepFocused(page);
  await page.goto(`/?${['test=1', 'scene=sandbox', testQuery].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 90_000 });
  await page.mouse.click(640, 520);
  await page.waitForFunction(() => window.__hk.started && window.__hk.frame > 30);
  const shot = (name) => page.screenshot({ path: testInfo.outputPath(`${name}.png`) });

  // Mantle: the 1.0 m block at (2.8, −10); the camera looks toward −Z, so W runs at it.
  await page.evaluate(() => window.__hk.teleport([2.8, 0.05, -5]));
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyW');
  await waitPlayer(page, () => window.__hk.player().state === 'mantle');
  await page.waitForTimeout(120);
  await shot('10-mantle');
  await waitPlayer(page, () => window.__hk.player().state === 'ground' && window.__hk.player().y > 0.9);
  await page.keyboard.up('KeyW');

  // Ledge: the 1.4 m block at (6, −10): walk up to it, jump, hang, then climb by holding forward.
  await page.evaluate(() => window.__hk.teleport([6, 0.05, -7.6]));
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(500);
  await page.keyboard.press('Space');
  await waitPlayer(page, () => ['hang', 'mantle', 'climb'].includes(window.__hk.player().state));
  const caught = await page.evaluate(() => window.__hk.player().state);
  await page.waitForTimeout(100);
  await shot('11-ledge');
  await waitPlayer(page, () => window.__hk.player().state === 'ground' && window.__hk.player().y > 1.3);
  await page.keyboard.up('KeyW');
  expect(['hang', 'mantle', 'climb']).toContain(caught);

  // Slide: sprint across open ground and press C.
  await page.evaluate(() => window.__hk.teleport([0, 0.05, 8]));
  await page.waitForTimeout(400);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(450);
  await page.keyboard.press('KeyC');
  await waitPlayer(page, () => window.__hk.player().state === 'slide');
  await page.waitForTimeout(150);
  await shot('12-slide');
  await waitPlayer(page, () => window.__hk.player().state === 'ground');
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');

  // Glide: from the platform roof (top 5.0), run off the edge holding jump.
  await page.evaluate(() => window.__hk.teleport([12, 5.05, 2]));
  await page.waitForTimeout(500);
  await page.keyboard.down('KeyW');
  await waitPlayer(page, () => window.__hk.player().z < -2.6);
  await page.keyboard.down('Space');
  await waitPlayer(page, () => window.__hk.player().state === 'glide');
  await page.waitForTimeout(250);
  await shot('13-glide');
  await waitPlayer(page, () => window.__hk.player().state === 'ground', 8000);
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  const landed = await page.evaluate(() => window.__hk.player());
  expect(landed.z).toBeLessThan(-8);

  expect(problems).toEqual([]);
});
