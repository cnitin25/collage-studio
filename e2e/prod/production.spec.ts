import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Drives the production build through every feature that touches a directive
// of the Content-Security-Policy — the service worker, bundled fonts, image
// decoding (HEIC runs in a blob: worker), export, IndexedDB and the project
// file — through the UI alone: the dev-only store hook isn't in this build.

const fixture = (name: string) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

/** Photos in the stored record of the project the next load reopens. */
const storedPhotoCount = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const id = localStorage.getItem('collage-studio-last-project') ?? '';
        const req = indexedDB.open('collage-studio');
        req.onerror = () => resolve(-1);
        req.onsuccess = () => {
          const get = req.result.transaction('projects').objectStore('projects').get(id);
          get.onerror = () => resolve(-1);
          get.onsuccess = () => {
            req.result.close();
            const rec = get.result as { state: { items: { type: string }[] } } | undefined;
            resolve(rec ? rec.state.items.filter((i) => i.type === 'image').length : 0);
          };
        };
      }),
  );

test('the production build works under its security policy', async ({ page }) => {
  const violations: string[] = [];
  const errors: string[] = [];
  await page.exposeFunction('__reportViolation', (v: string) => violations.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const report = (window as unknown as { __reportViolation: (v: string) => void }).__reportViolation;
      report(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber}`);
    });
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('dialog', (d) => void d.accept());

  const toolbar = (name: string) => page.locator('.toolbar-secondary').getByRole('button', { name, exact: true });
  const photos = page.locator('.thumb-item');

  const response = await page.goto('/');
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp, 'served with a CSP').toContain("default-src 'self'");
  // No script may evaluate strings as code: that's most of what a CSP
  // protects against cross-site scripting.
  expect(csp, "script-src without 'unsafe-eval'").not.toContain("'unsafe-eval'");

  await test.step('service worker and fonts', async () => {
    expect(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active))).toBe(true);
    expect(await page.evaluate(() => document.fonts.ready.then(() => document.fonts.size))).toBeGreaterThan(0);
    // Every bundled family loads from the site itself (font-src 'self').
    for (const family of ['Inter', 'Anton', 'Gelasio', 'Courier Prime', 'Pacifico', 'Dancing Script', 'Caveat', 'Great Vibes']) {
      const faces = await page.evaluate((f) => document.fonts.load(`16px "${f}"`).then((loaded) => loaded.length), family);
      expect(faces, family).toBeGreaterThan(0);
    }
  });

  await test.step('import a JPEG and a HEIC', async () => {
    await page.locator('.stage-host input[type=file]').setInputFiles(fixture('photo.jpg'));
    await expect(photos).toHaveCount(1);
    await page.locator('.stage-host input[type=file]').setInputFiles(fixture('photo.heic'));
    await expect(photos).toHaveCount(2, { timeout: 60_000 });
    await expect(page.locator('.import-warning')).toHaveCount(0);
  });

  await test.step('add a sticker, drawn from its bundled image', async () => {
    const insert = page.locator('[data-panel-title="Insert"] .panel-toggle');
    if ((await insert.getAttribute('aria-expanded')) !== 'true') await insert.click();
    await page.getByRole('button', { name: 'Add ⭐', exact: true }).click();
    // The build inlines the images as data: URLs, which img-src allows.
    await page.waitForFunction(() =>
      window.Konva.stages[0]
        .find<import('konva').default.Image>('Image')
        .some((n) => (n.image() as HTMLImageElement | undefined)?.src.startsWith('data:image/svg+xml')),
    );
  });

  await test.step('export a PNG', async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), toolbar('Export').click()]);
    expect(readFileSync(await download.path()).length).toBeGreaterThan(1000);
  });

  await test.step('save, and round-trip a project file', async () => {
    await toolbar('Save').click();
    await expect(page.locator('.toast').filter({ hasText: 'Saved' })).toBeVisible();
    await toolbar('Projects').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Export file/ }).click(),
    ]);
    const file = await download.path();
    await page.getByRole('button', { name: 'New project' }).click();
    await expect(photos).toHaveCount(0);
    await toolbar('Projects').click();
    await page.locator('.modal input[type=file]').setInputFiles(file);
    await expect(photos).toHaveCount(2);
  });

  await test.step('reload reopens the last saved project', async () => {
    await toolbar('Save').click();
    // Wait for the record itself: the previous step's "Saved" toast can still
    // be showing, and reloading mid-save would lose the project.
    await expect.poll(() => storedPhotoCount(page)).toBe(2);
    await page.reload();
    await expect(photos).toHaveCount(2);
  });

  expect(violations, 'CSP violations').toEqual([]);
  expect(errors, 'page errors').toEqual([]);
});
