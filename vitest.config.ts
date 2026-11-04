import { defineConfig } from 'vitest/config';

// Unit tests for the editor's logic: layout, geometry, colour, presets,
// project-file import and the undo history. They run in plain Node — nothing
// they cover draws, so neither a DOM nor Konva's canvas is needed. Rendering,
// storage and the UI are the Playwright suite's (e2e/).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
  },
});
