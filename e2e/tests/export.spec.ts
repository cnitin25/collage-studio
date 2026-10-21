import { test, expect, devices, type Page } from '@playwright/test';
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

test('desktop downloads even where the browser can share files', async ({ page }) => {
  await page.evaluate(() => {
    (navigator as any).canShare = () => true;
    (navigator as any).share = async () => {
      (window as any).__shared = true;
    };
  });
  await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' })`);
  const download = await exportImage(page, 'png', 1);
  expect(download.suggestedFilename()).toBe('Collage.png');
  expect(await page.evaluate(() => (window as any).__shared)).toBeUndefined();
});

test.describe('on a phone', () => {
  test.use({
    userAgent: devices['iPhone 13'].userAgent,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  /** Stand-in for navigator.share; records what it was handed. */
  async function stubShare(page: Page, failFirstWith?: string) {
    await page.evaluate((failFirstWith) => {
      let calls = 0;
      (navigator as any).canShare = () => true;
      (navigator as any).share = async (data: { files: File[] }) => {
        calls++;
        if (failFirstWith && calls === 1) throw new DOMException('no gesture', failFirstWith);
        const f = data.files[0];
        (window as any).__shared = { name: f.name, type: f.type, size: f.size };
      };
    }, failFirstWith);
  }
  const shared = (page: Page) => page.evaluate(() => (window as any).__shared ?? null);

  test('Export hands the image to the share sheet', async ({ page }) => {
    await stubShare(page);
    await addImage(page);
    await act(page, `s.applyLayout({ type: 'grid' }); s.select(null)`);
    await page.locator('.toolbar-export').click();
    await expect.poll(() => shared(page)).toMatchObject({ name: 'Collage.png', type: 'image/png' });
    expect((await shared(page)).size).toBeGreaterThan(1000);
  });

  test('when sharing needs a fresh tap, the toast offers one', async ({ page }) => {
    await stubShare(page, 'NotAllowedError');
    await addImage(page);
    await act(page, `s.applyLayout({ type: 'grid' }); s.select(null)`);
    await page.locator('.toolbar-export').click();
    const again = page.locator('.toast').getByRole('button', { name: 'Save / share' });
    await expect(again).toBeVisible();
    expect(await shared(page)).toBeNull();
    await again.click();
    await expect.poll(() => shared(page)).toMatchObject({ name: 'Collage.png' });
  });

  test('a 3x Story export is kept under the iOS canvas limit instead of coming out blank', async ({ page }) => {
    test.slow(); // a ~10 MP PNG, decoded again in the page to measure it
    await page.evaluate(() => {
      delete (Navigator.prototype as any).share;
      delete (Navigator.prototype as any).canShare;
    });
    await addImage(page);
    await act(page, `s.setCanvasSize(1080, 1920); s.applyLayout({ type: 'grid' }); s.setExportScale(3); s.select(null)`);
    // The 3× chip is unavailable at this size, and the panel says why.
    await page.locator('.toolbar-tools-toggle').click();
    await page.locator('[data-panel-title="Export settings"] .panel-toggle').click();
    await expect(page.locator('[data-panel-title="Export settings"] .chip', { hasText: '3×' })).toBeDisabled();
    await expect(page.locator('[data-panel-title="Export settings"]')).toContainText("can't make images larger than");
    await page.locator('.inspector-close').click();

    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.toolbar-export').click()]);
    const out = await imageStats(page, download);
    expect(out.width * out.height).toBeLessThanOrEqual(16_777_216);
    expect(out.width).toBeGreaterThan(1080 * 2); // as large as allowed, not dropped to 1×
    await expect(page.locator('.toast')).toContainText('Exported at');
  });
});
