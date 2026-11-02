import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { act, addImage, state } from './helpers';

// Portable project files (.collagestudio.json): only what's embedded in the
// file is opened, a damaged or newer file is refused or trimmed with a
// report, and every photo survives the round trip.

const PNG_1PX_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_1PX = `data:image/png;base64,${PNG_1PX_B64}`;

const photo = (src: string) => ({ type: 'image', src, naturalWidth: 1, naturalHeight: 1, x: 100, y: 100, width: 300, height: 300, rotation: 0 });
const text = (t: string) => ({ type: 'text', text: t, x: 50, y: 50, width: 400, height: 90, rotation: 0, fontFamily: 'Inter, system-ui, sans-serif', fontSize: 48, fontStyle: 'normal', fill: '#000000', align: 'center' });
const projectFile = (items: unknown[], canvas: Record<string, unknown> = {}) => ({
  fileVersion: 1,
  name: 'Imported',
  exportedAt: 0,
  canvas: { width: 1080, height: 1080, backgroundType: 'color', backgroundColor: '#ffffff', ...canvas },
  spacing: { margin: 24, gutter: 12, padding: 0 },
  lastLayout: null,
  items,
});

async function importFile(page: Page, file: unknown) {
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Projects', exact: true }).click();
  await page.locator('.modal input[type=file]').setInputFiles({
    name: 'test.collagestudio.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__editorStore);
});

test('a project file cannot make the app load anything from the internet', async ({ page }) => {
  const requests: string[] = [];
  await page.route('https://example.invalid/**', (route) => {
    requests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG_1PX_B64, 'base64') });
  });
  await importFile(
    page,
    projectFile([photo('https://example.invalid/tracker.png'), photo(PNG_1PX)], {
      backgroundType: 'image',
      backgroundImageSrc: 'https://example.invalid/background.png',
    }),
  );
  await expect(page.locator('.modal')).toBeHidden();
  await page.waitForTimeout(500);
  expect(requests, 'no request to the address in the file').toEqual([]);
  expect(await state<number>(page, 's.items.length'), 'only the embedded photo').toBe(1);
  await expect(page.locator('.import-warning')).toContainText('2 parts of');
  await expect(page.locator('.import-warning')).toContainText('outside address');

  // And what did load exports normally.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.toolbar-secondary').getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  expect(readFileSync((await download.path())!).length).toBeGreaterThan(1000);
});

test('a project file from a newer version is refused with a clear message', async ({ page }) => {
  await importFile(page, { ...projectFile([photo(PNG_1PX)]), fileVersion: 99 });
  await expect(page.locator('.import-error')).toContainText('newer version');
  expect(await state<number>(page, 's.items.length')).toBe(0);
});

test('unreadable items in a project file are skipped and reported, not half-loaded', async ({ page }) => {
  await importFile(
    page,
    projectFile([
      photo(PNG_1PX),
      { type: 'image', src: PNG_1PX }, // no size or position
      { type: 'text' }, // no text
      { type: 'hologram', x: 0, y: 0 }, // unknown kind
      text('Hello'),
    ]),
  );
  await expect(page.locator('.modal')).toBeHidden();
  expect(await state<string[]>(page, 's.items.map((i) => i.type)')).toEqual(['image', 'text']);
  await expect(page.locator('.import-warning')).toContainText('3 parts of');
});

test('an export that fails says so, instead of doing nothing', async ({ page }) => {
  await addImage(page);
  // What a canvas tainted by an outside image does when asked for its pixels.
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.toBlob = () => {
      throw new DOMException('Tainted canvases may not be exported.', 'SecurityError');
    };
  });
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText("Couldn't create the image");
});

test('a project file carries every photo and an unused background, and opens them all', async ({ page }) => {
  await addImage(page, 'solid', 300, 200, '#ff0000');
  await addImage(page, 'solid', 200, 300, '#0000ff');
  await act(page, "s.addText(); s.stopEditingText()");
  await act(page, `const it = s.items[0];
    s.setBackground({ backgroundType: 'image', backgroundImageSrc: it.src, backgroundAssetId: it.assetId });
    window.__editorStore.getState().setBackground({ backgroundType: 'color' })`);
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Projects', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export file/ }).click(),
  ]);
  const path = (await download.path())!;
  const file = JSON.parse(readFileSync(path, 'utf-8'));
  expect(file.items.map((i: { type: string }) => i.type)).toEqual(['image', 'image', 'text']);
  for (const it of file.items.filter((i: { type: string }) => i.type === 'image')) expect(it.src).toMatch(/^data:image\//);
  expect(file.canvas.backgroundImageSrc).toMatch(/^data:image\//);

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'New project' }).click();
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Projects', exact: true }).click();
  await page.locator('.modal input[type=file]').setInputFiles(path);
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(3);
  const sizes = await page.evaluate(async () => {
    const s = (window as any).__editorStore.getState();
    const srcs = [...s.items.filter((i: any) => i.type === 'image').map((i: any) => i.src), s.canvas.backgroundImageSrc];
    return Promise.all(srcs.map(async (src: string) => (await (await fetch(src)).blob()).size));
  });
  expect(sizes).toHaveLength(3);
  for (const size of sizes) expect(size).toBeGreaterThan(100);
});
