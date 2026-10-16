import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      'build-cache/**',
      'art/**',
      'test-results/**',
      'playwright-report/**',
      'blob-report/**',
      '.claude/**',
      'design-system/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, __THREE_VERSION__: 'readonly', __BUILD_ID__: 'readonly' },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-implicit-globals': 'error',
    },
  },
  {
    files: ['api/**/*.js', 'tools/**/*.{js,mjs}', '*.config.js', 'tests/**/*.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['api/**/*.js', 'tools/**/*.{js,mjs}'],
    rules: { 'no-console': 'off' },
  },
];
