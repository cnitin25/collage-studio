import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { act, addImage, idbKeys, state } from './helpers';

async function save(page: Page) {
  await page.locator('.toolbar-secondary button', { hasText: 'Save' }).click();
}

async function openProjects(page: Page) {
  await page.locator('.toolbar-secondary button', { hasText: 'Projects' }).click();
  await expect(page.locator('.modal')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__editorStore);
});

test('a storage failure while saving is reported instead of showing "Saved"', async ({ page }) => {
  await addImage(page);
  // Simulate a full disk: every write to the photo store fails with the error
  // browsers raise when the site's quota is exhausted.
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (this.name === 'assets') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await save(page);
  await expect(page.getByRole('alert')).toContainText("Couldn't save");
  await expect(page.getByRole('alert')).toContainText('storage for this site is full');
  // No project record was written that would reopen with its photos missing.
  expect(await idbKeys(page, 'projects')).toEqual([]);
});

test('deleting a project removes its stored photos', async ({ page }) => {
  await addImage(page);
  await save(page);
  await expect(page.getByRole('status')).toHaveText('Saved');
  expect(await idbKeys(page, 'assets')).toHaveLength(1);

  await openProjects(page);
  page.once('dialog', (d) => d.accept());
  await page.locator('.project-del').click();
  await expect(page.locator('.project-card')).toHaveCount(0);
  await expect.poll(() => idbKeys(page, 'assets')).toEqual([]);
});

test('replacing a photo drops the old stored blob on the next save', async ({ page }) => {
  const id = await addImage(page);
  await save(page);
  await expect(page.getByRole('status')).toHaveText('Saved');
  const [oldAsset] = await idbKeys(page, 'assets');

  // Replace with a freshly drawn image (same path as the toolbar's Replace photo).
  await page.evaluate(async (id) => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 300;
    c.getContext('2d')!.fillRect(0, 0, 400, 300);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!)));
    (window as any).__editorStore
      .getState()
      .replaceImage(id, { src: URL.createObjectURL(blob), naturalWidth: 400, naturalHeight: 300 });
  }, id);
  const newAsset = await state<string>(page, 's.items[0].assetId');
  expect(newAsset).not.toBe(oldAsset);
  await save(page);
  // Poll storage itself — the first save's "Saved" toast may still be showing.
  await expect.poll(() => idbKeys(page, 'assets')).toEqual([newAsset]);
});

test('unsaved work asks before New project discards it', async ({ page }) => {
  await addImage(page);
  await openProjects(page);

  let prompted = '';
  page.once('dialog', (d) => {
    prompted = d.message();
    d.dismiss();
  });
  await page.getByRole('button', { name: 'New project' }).click();
  expect(prompted).toContain('unsaved changes');
  expect(await state<number>(page, 's.items.length')).toBe(1); // dismissed: kept

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'New project' }).click();
  expect(await state<number>(page, 's.items.length')).toBe(0); // accepted: discarded
});

test('saved work is not prompted for', async ({ page }) => {
  await addImage(page);
  await save(page);
  await expect(page.getByRole('status')).toHaveText('Saved');
  await openProjects(page);
  let prompted = false;
  page.on('dialog', (d) => {
    prompted = true;
    d.dismiss();
  });
  await page.getByRole('button', { name: 'New project' }).click();
  expect(prompted).toBe(false);
  expect(await state<number>(page, 's.items.length')).toBe(0);
});

test('deleting a saved project asks first', async ({ page }) => {
  await addImage(page);
  await save(page);
  await expect(page.getByRole('status')).toHaveText('Saved');
  await openProjects(page);
  page.once('dialog', (d) => d.dismiss());
  await page.locator('.project-del').click();
  await expect(page.locator('.project-card')).toHaveCount(1);
});

test('an exported project file carries the background image, and importing restores it', async ({ page }) => {
  await addImage(page);
  await act(page, `const it = s.items[0]; s.setBackground({ backgroundType: 'image', backgroundImageSrc: it.src, backgroundAssetId: it.assetId })`);
  await openProjects(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export file/ }).click(),
  ]);
  const path = (await download.path())!;
  const file = JSON.parse(readFileSync(path, 'utf-8'));
  expect(file.canvas.backgroundImageSrc).toMatch(/^data:image\//);

  // Start over, then import the file.
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'New project' }).click();
  await openProjects(page);
  await page.locator('.modal input[type=file]').setInputFiles(path);
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(1);

  const bg = await state<string>(page, 's.canvas.backgroundImageSrc');
  expect(bg).toMatch(/^blob:/); // converted back from the embedded data URL
  const bytes = await page.evaluate(async (src) => (await (await fetch(src)).blob()).size, bg);
  expect(bytes).toBeGreaterThan(1000);
  expect(await state<string>(page, 's.items[0].src')).toMatch(/^blob:/);
});
