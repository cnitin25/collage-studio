import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * The specs whose subject behaves differently in Safari's engine: storage,
 * project files, import and export (sharing), the phone layout, and
 * stickers (SVG images drawn on a canvas). Run on WebKit as well as
 * Chromium; not a substitute for a real iPhone.
 */
const WEBKIT_SPECS = /(storage|data-safety|project-files|import|export|mobile|stickers)\.spec\.ts$/;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  // One retry on CI, with a trace of it: a test that passes on retry is
  // reported as flaky rather than hidden.
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', testMatch: WEBKIT_SPECS, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !CI,
    timeout: 60_000,
    cwd: '..',
    // vite.config opens a browser tab on start; not wanted here.
    env: { BROWSER: 'none' },
  },
});
