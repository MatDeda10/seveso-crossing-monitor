import js from '@eslint/js';
import globals from 'globals';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';

// eslint-plugin-react-hooks espone la config flat con nomi diversi fra le versioni.
const reactHooksRecommended =
  reactHooks.configs.flat?.recommended ??
  reactHooks.configs['recommended-latest'] ??
  reactHooks.configs.recommended;

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended, reactHooksRecommended, reactRefresh.configs.vite],
    plugins: { react: reactPlugin },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // Senza queste regole ESLint non vede l'uso dei componenti nel JSX.
      'react/jsx-uses-vars': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Il proxy gira su Cloudflare Workers: stessi globali del browser + caches.
    files: ['workers/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
  },
  {
    files: ['**/*.test.js'],
    languageOptions: { globals: globals.node },
  },
]);
