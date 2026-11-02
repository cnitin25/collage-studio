import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Correctness rules only; formatting is left alone. Type-aware, so
// floating promises and async handlers passed where a sync one is expected
// are caught — the e2e specs included, where a missing `await` silently
// skips an assertion.
export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'e2e/test-results', 'e2e/playwright-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      parserOptions: {
        // src/ and e2e/ each have a tsconfig.json; the Vite and Vitest configs share one.
        projectService: { allowDefaultProject: ['vite.config.ts', 'vitest.config.ts'], defaultProject: 'tsconfig.node.json' },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['e2e/**/*.ts', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
]);
