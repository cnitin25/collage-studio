import { test, expect, type Page } from '@playwright/test';
import type Konva from 'konva';
import { act, analyzeExport, exportImage, state } from './helpers';

// Stickers are drawn from bundled Twemoji images, not each device's own emoji
// font, so a collage looks the same on every device and in every export. Runs
// on WebKit too: it draws SVG images on a canvas its own way.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

/** The sticker's Konva node, once its image (if it has one) has loaded. */
async function stickerNode(page: Page, id: string) {
  await page.waitForFunction((id) => {
    const K = window.Konva;
    const node = K.stages[K.stages.length - 1].findOne('#' + id);
    return !!node && (node.getClassName() !== 'Image' || !!(node as Konva.Image).image());
  }, id);
  return page.evaluate((id) => {
    const K = window.Konva;
    const node = K.stages[K.stages.length - 1].findOne('#' + id)!;
    const image = node.getClassName() === 'Image' ? ((node as Konva.Image).image() as HTMLImageElement) : null;
    return {
      kind: node.getClassName(),
      src: image?.src ?? null,
      natural: image ? [image.naturalWidth, image.naturalHeight] : null,
    };
  }, id);
}

test('a palette sticker is drawn from its bundled image, the same in an export', async ({ page }) => {
  await act(page, `s.setBackground({ backgroundType: 'color', backgroundColor: '#ffffff' }); s.requestPanel('Insert')`);
  const button = page.getByRole('button', { name: 'Add ⭐', exact: true });
  await button.click();
  const id = await state<string>(page, 's.items[0].id');
  const node = await stickerNode(page, id);
  expect(node.kind).toBe('Image');
  // The palette shows the same image the canvas draws.
  expect(await button.locator('img').getAttribute('src')).toBe(node.src);
  // An SVG drawn on a canvas needs an intrinsic size: Firefox can't draw one
  // without, and other browsers size it 300x150, squashing a square emoji.
  expect(node.natural![0]).toBeGreaterThanOrEqual(256);
  expect(node.natural![0]).toBe(node.natural![1]);

  const box = await state<{ x: number; y: number; fontSize: number }>(page, 's.items[0]');
  const centre = await analyzeExport(
    page,
    await exportImage(page, 'png', 1),
    (px, _w, _h, b) => px(b.x + b.fontSize / 2, b.y + b.fontSize / 2).slice(0, 3),
    box,
  );
  // Twemoji's star is #ffac33; each system emoji font draws its star another colour.
  expect(Math.abs(centre[0] - 0xff)).toBeLessThanOrEqual(6);
  expect(Math.abs(centre[1] - 0xac)).toBeLessThanOrEqual(6);
  expect(Math.abs(centre[2] - 0x33)).toBeLessThanOrEqual(6);
});

test('an emoji outside the bundled set is still drawn, as text', async ({ page }) => {
  // Older projects and project files can hold any emoji.
  await act(page, `s.addSticker('🦖')`);
  expect((await stickerNode(page, await state<string>(page, 's.items[0].id'))).kind).toBe('Text');
});

test('the sticker palette credits the images’ authors', async ({ page }) => {
  await act(page, `s.requestPanel('Insert')`);
  const credit = page.locator('.sticker-credit');
  await expect(credit).toContainText('Twemoji');
  await expect(credit.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  );
});
