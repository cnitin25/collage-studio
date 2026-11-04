import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

/**
 * Smoke test of the production build, served with the same security headers
 * (CSP included) as Vercel — the dev server sends none, so a resource the
 * policy blocks only fails here. Set PROD_URL to run it against a deployment
 * instead, e.g. PROD_URL=https://offline-collage.vercel.app.
 */
const target = process.env.PROD_URL;

export default defineConfig({
  testDir: './prod',
  reporter: CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: target ?? 'http://localhost:4173',
    acceptDownloads: true,
    trace: 'retain-on-failure',
  },
  webServer: target
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !CI,
        timeout: 180_000,
        cwd: '..',
        env: { BROWSER: 'none' },
      },
});
