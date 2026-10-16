import { defineConfig } from '@playwright/test';

// Keep Chrome's temporary profiles off drive C:, which is nearly full (docs/DECISIONS.md D-008).
process.env.TEMP = 'D:\\dev\\.cache\\tmp';
process.env.TMP = 'D:\\dev\\.cache\\tmp';

const PORT = 4173;

/**
 * Visual self-tests: the installed Chrome, headed, on the real GPU (never a headless WebGPU capture).
 * Run with `npm run test:visual` (builds first). Never run `playwright install`.
 */
export default defineConfig({
  testDir: 'tests/visual',
  outputDir: 'test-results',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    channel: 'chrome',
    headless: false,
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'webgpu', use: { testQuery: '' } },
    { name: 'webgl2', use: { testQuery: 'webgl=1' } },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
