import { test, expect } from '@playwright/test';
import { act, addImage, exportImage, imageStats, redEdgeWidth } from './helpers';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__editorStore);
});

test('a filtered photo exports as sharp as an unfiltered one at 3x', async ({ page }) => {
  test.slow(); // three 3240px exports decoded in the page
  const id = await addImage(page, 'checker', 1000, 1000);
  await act(page, `s.applyLayout({ type: 'grid' })`);
  const plain = await imageStats(page, await exportImage(page, 'png', 3));

  // Any filter at all puts the photo on Konva's (previously 1x-only) cache.
  await act(page, `s.updateItem('${id}', { filters: { brightness: 1 } })`);
  const filtered = await imageStats(page, await exportImage(page, 'png', 3));

  expect(filtered.width).toBe(plain.width);
  expect(filtered.sharpness).toBeGreaterThan(plain.sharpness * 0.8);
});

test('photo blur is the same strength at 1x and 3x export', async ({ page }) => {
  const id = await addImage(page, 'redblue', 1200, 900);
  await act(page, `s.applyLayout({ type: 'grid' }); s.updateItem('${id}', { filters: { blur: 8 } })`);
  const one = await redEdgeWidth(page, await exportImage(page, 'png', 1));
  const three = await redEdgeWidth(page, await exportImage(page, 'png', 3));

  // Compare in canvas pixels: the 3x image is three times wider.
  const oneCanvasPx = one.edge;
  const threeCanvasPx = three.edge / 3;
  expect(oneCanvasPx).toBeGreaterThan(4); // the blur really is there
  expect(threeCanvasPx).toBeGreaterThan(oneCanvasPx * 0.7);
  expect(threeCanvasPx).toBeLessThan(oneCanvasPx * 1.4);
});

test('JPEG export fills rounded collage corners with white, not black', async ({ page }) => {
  await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' }); s.setBackground({ frameCornerRadius: 150 })`);
  const jpeg = await imageStats(page, await exportImage(page, 'jpeg', 1));
  for (const channel of jpeg.corner) expect(channel).toBeGreaterThan(240);
});
