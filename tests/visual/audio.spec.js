import { readFileSync } from 'node:fs';
import { expect, test } from './fixtures.js';

const manifest = JSON.parse(readFileSync('src/data/generated/assets.json', 'utf8')).assets;
const banks = Object.entries(manifest).filter(([, entry]) => entry.type === 'audio');

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
