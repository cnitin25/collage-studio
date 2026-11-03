import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { state } from './helpers';

// Photos above MAX_IMPORT_SIDE (4096 px) are downscaled on import: twenty
// full-size phone photos held decoded is more memory than iOS Safari gives a
// tab. Files go in through the real file input, as a picked photo would.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

/** Encode a w×h test image in the page and return its bytes. */
async function makeImage(page: Page, w: number, h: number, type: 'image/jpeg' | 'image/png', alpha = false) {
  const b64 = await page.evaluate(
    async ({ w, h, type, alpha }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#ffb35e');
      g.addColorStop(1, '#4b2c6f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (alpha) ctx.clearRect(0, 0, w / 4, h / 4);
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), type, 0.9));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { w, h, type, alpha },
  );
  return Buffer.from(b64, 'base64');
}

async function importFile(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.locator('.stage-host input[type="file"]').setInputFiles({ name, mimeType, buffer });
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(1);
  return state<{ naturalWidth: number; naturalHeight: number; src: string }>(page, 's.items[0]');
}

/** Encoded type of the stored photo, read back from its blob URL. */
const storedType = (page: Page, src: string) =>
  page.evaluate((src) => fetch(src).then((r) => r.blob()).then((b) => b.type), src);

test('an oversized photo is stored at 4096 px on its long side, as a JPEG', async ({ page }) => {
  test.slow();
  const item = await importFile(page, 'big.jpg', 'image/jpeg', await makeImage(page, 6000, 3000, 'image/jpeg'));
  expect(item.naturalWidth).toBe(4096);
  expect(item.naturalHeight).toBe(2048);
  expect(await storedType(page, item.src)).toBe('image/jpeg');
});

test('an oversized PNG with transparency stays a PNG', async ({ page }) => {
  test.slow();
  const item = await importFile(page, 'big.png', 'image/png', await makeImage(page, 3000, 5000, 'image/png', true));
  expect(item.naturalHeight).toBe(4096);
  expect(await storedType(page, item.src)).toBe('image/png');
});

test('a HEIC photo is converted to a JPEG of the same picture, in its own colours', async ({ page }) => {
  test.slow();
  // The two fixtures are the same 1600x1200 picture, one as HEIC, one as JPEG.
  for (const [name, mimeType] of [
    ['photo.jpg', 'image/jpeg'],
    ['photo.heic', 'image/heic'],
  ]) {
    const buffer = readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));
    await page.locator('.stage-host input[type="file"]').setInputFiles({ name, mimeType, buffer });
  }
  await expect.poll(() => state<number>(page, 's.items.length'), { timeout: 60_000 }).toBe(2);
  const [jpeg, heic] = await state<{ naturalWidth: number; naturalHeight: number; src: string }[]>(page, 's.items');
  expect([heic.naturalWidth, heic.naturalHeight]).toEqual([jpeg.naturalWidth, jpeg.naturalHeight]);
  expect(await storedType(page, heic.src)).toBe('image/jpeg');
  const mean = (src: string) =>
    page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      [c.width, c.height] = [img.naturalWidth, img.naturalHeight];
      const g = c.getContext('2d')!;
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const sum = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += d[i + k];
      return sum.map((v) => v / (d.length / 4));
    }, src);
  // heic2any, the converter before, shifted these by up to 10 levels (it
  // read the photo's colours with the wrong conversion from YCbCr).
  const [want, got] = [await mean(jpeg.src), await mean(heic.src)];
  want.forEach((w, k) => expect(Math.abs(got[k] - w), `channel ${k}`).toBeLessThanOrEqual(3));
});

test('a photo within the limit is kept exactly as it was', async ({ page }) => {
  const item = await importFile(page, 'small.jpg', 'image/jpeg', await makeImage(page, 1200, 900, 'image/jpeg'));
  expect(item.naturalWidth).toBe(1200);
  expect(item.naturalHeight).toBe(900);
});
