import base from './playwright.config.js';

/**
 * Long-running performance checks (phase-end): CPU-throttled frame rate, a performance trace and a
 * memory-growth soak. Run with `npm run test:perf` after `npm run build`.
 */
export default {
  ...base,
  testDir: 'tests/perf',
  timeout: 20 * 60 * 1000,
};
