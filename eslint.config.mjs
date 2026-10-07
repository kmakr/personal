import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-public/**',
      '**/.local/**',
      'apps/health/artifacts/**',
      '**/.astro/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      'apps/*/public/**',
    ],
  },
  {
    files: ['apps/health/**/*.jsx'],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['apps/gallery/src/**/*.{ts,tsx}', 'apps/health/src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['apps/cms-auth/src/**/*.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // This bundled animation is copied from the deployed homepage.
    files: ['apps/health/src/ink-mark.js'],
    rules: { '@typescript-eslint/no-unused-expressions': 'off' },
  },
);
