import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);
// three's "exports" map hides package.json, so read it from disk.
const THREE_VERSION = JSON.parse(
  readFileSync(new URL('./node_modules/three/package.json', import.meta.url), 'utf8'),
).version;

/**
 * Third-party runtime files that must be served as plain files (workers, wasm), copied from node_modules.
 * The path carries the three.js version so the files can be cached as immutable.
 */
const VENDOR_FILES = [
  [
    'three/examples/jsm/libs/basis/basis_transcoder.js',
    `vendor/three-${THREE_VERSION}/basis/basis_transcoder.js`,
  ],
  [
    'three/examples/jsm/libs/basis/basis_transcoder.wasm',
    `vendor/three-${THREE_VERSION}/basis/basis_transcoder.wasm`,
  ],
];

/**
 * Serves VENDOR_FILES in dev and emits them into the build.
 * @returns {import('vite').Plugin}
 */
function vendorFiles() {
  const resolved = VENDOR_FILES.map(([pkgPath, url]) => ({ source: require.resolve(pkgPath), url }));
  return {
    name: 'hk-vendor-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = resolved.find((f) => req.url === `/${f.url}`);
        if (!file) return next();
        res.setHeader('Content-Type', file.url.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        res.end(readFileSync(file.source));
      });
    },
    generateBundle() {
      for (const file of resolved) {
        this.emitFile({ type: 'asset', fileName: file.url, source: readFileSync(file.source) });
      }
    },
  };
}

export default defineConfig({
  define: {
    __THREE_VERSION__: JSON.stringify(THREE_VERSION),
    __BUILD_ID__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7)),
  },
  plugins: [vendorFiles()],
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
    // The Rapier compat chunk embeds its 2.9 MB WASM as base64 (4.3 MB, 1.7 MB gzipped); see PROGRESS.md.
    chunkSizeWarningLimit: 4500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'rapier', test: /node_modules[\\/]@dimforge[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ['tests/unit/**/*.test.js'],
    environment: 'node',
  },
});
