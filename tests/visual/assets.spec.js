import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures.js';

const manifest = JSON.parse(readFileSync('src/data/generated/assets.json', 'utf8')).assets;
const models = Object.keys(manifest).filter((key) => manifest[key].type === 'glb');

test('every published model loads through the game AssetLoader (KTX2 + Meshopt) on this backend', async ({
  page,
  testQuery,
}, testInfo) => {
  const problems = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      problems.push(`${message.type()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  await page.goto(`/?${['test=1', testQuery].filter(Boolean).join('&')}`);
  await page.waitForFunction(() => window.__hk?.ready === true, null, { timeout: 90_000 });
  const summary = await page.evaluate((keys) => window.__hk.loadAssets(keys), models);

  for (const key of models) {
    const entry = summary[key];
    if (key.startsWith('anim/')) {
      expect(entry.clips, key).toBeGreaterThan(0);
      continue;
    }
    expect(entry.meshes, key).toBeGreaterThan(0);
    expect(entry.triangles, key).toBeGreaterThan(0);
    // Every texture ships as KTX2 and must arrive GPU-compressed. (Solid-colour textures are folded into the
    // material colour by gltf-transform's prune, so a model may legitimately have none, e.g. the wisp's ink.)
    expect(entry.compressed, key).toBe(entry.textures);
  }
  await testInfo.attach('summary', {
    body: JSON.stringify(summary, null, 2),
    contentType: 'application/json',
  });
  expect(problems).toEqual([]);
});
