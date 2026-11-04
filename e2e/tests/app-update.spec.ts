import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { act, addImage, state } from './helpers';

// Updates: a new version waits for the user to reload (the service worker
// doesn't swap the app under them), and a page left open across a release,
// whose on-demand code is gone from the server, says so instead of failing
// obscurely. The service worker itself runs only in the production build, so
// these drive the notice through the store; the production smoke test
// checks the worker registers.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

const notice = (page: Page) => page.locator('.update-banner');

test('a waiting new version offers a reload, and saves the work first', async ({ page }) => {
  await addImage(page); // unsaved, with auto-save on (the default)
  await act(page, "s.setAppUpdate('new-version')");
  await expect(notice(page)).toContainText('new version');
  await Promise.all([page.waitForEvent('load'), notice(page).getByRole('button', { name: 'Reload' }).click()]);
  await page.waitForFunction(() => !!window.__editorStore);
  // Reopened after the reload: it was saved before it.
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(1);
  await expect(notice(page)).toHaveCount(0);
});

test('Later puts the notice away', async ({ page }) => {
  await act(page, "s.setAppUpdate('new-version')");
  await notice(page).getByRole('button', { name: 'Later' }).click();
  await expect(notice(page)).toHaveCount(0);
});

test('the new-version notice goes away on its own', async ({ page }) => {
  await page.clock.install();
  await act(page, "s.setAppUpdate('new-version')");
  await expect(notice(page)).toBeVisible();
  await page.clock.fastForward(8000);
  await expect(notice(page), 'long enough to read and act on').toBeVisible();
  await page.clock.fastForward(5000);
  await expect(notice(page)).toHaveCount(0);
});

test('a page that is out of date keeps saying so: something has already failed', async ({ page }) => {
  await page.clock.install();
  await act(page, "s.setAppUpdate('out-of-date')");
  await page.clock.fastForward(60_000);
  await expect(notice(page)).toBeVisible();
});

test('code that can no longer be fetched says the app was updated, and offers a reload', async ({ page }) => {
  // The HEIC converter loads on demand; after a release its old file is gone.
  await page.route(/heic-to/, (route) => route.abort());
  await page
    .locator('.stage-host input[type=file]')
    .setInputFiles(fileURLToPath(new URL('../fixtures/photo.heic', import.meta.url)));
  await expect(notice(page)).toContainText('updated');
  await expect(page.locator('.import-warning')).toContainText('Reload the page');
  await Promise.all([page.waitForEvent('load'), notice(page).getByRole('button', { name: 'Reload' }).click()]);
  await page.waitForFunction(() => !!window.__editorStore);
  await expect(notice(page)).toHaveCount(0);
});
