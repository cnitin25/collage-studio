import { test, expect, type Page } from '@playwright/test';
import { act, addImage, stageGeometry, state } from './helpers';

type Crop = { x: number; y: number; width: number; height: number };
type Img = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  flipX?: boolean;
  flipY?: boolean;
  crop: Crop;
  src: string;
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__editorStore);
});

test('the histogram reads the whole photo, not its top-left corner', async ({ page }) => {
  const id = await addImage(page, 'redblue', 1200, 900); // exactly half red, half blue
  await act(page, `s.applyLayout({ type: 'grid' }); s.select('${id}'); s.requestPanel('Enhance & Adjust')`);
  const paths = page.locator('svg.histogram path');
  await expect(paths).toHaveCount(3);
  // Height of each channel's top bin (value 255): the last point of each path.
  const topBins = () =>
    paths.evaluateAll((els) => els.map((e) => 72 - Number((e.getAttribute('d') ?? '').trim().split(/\s+/).pop())));
  await expect.poll(async () => (await topBins())[0]).toBeGreaterThan(20);
  const [red, , blue] = await topBins();
  expect(red).toBeGreaterThan(20);
  expect(Math.abs(red - blue)).toBeLessThan(red * 0.15);
});

test('ctrl+wheel zoom keeps the point under the cursor fixed, even after an earlier zoom', async ({ page }) => {
  await addImage(page);
  const { box, scale } = await stageGeometry(page);
  const contentUnder = async (p: { x: number; y: number }) => {
    const [vs, vx, vy] = await state<number[]>(page, '[s.viewScale, s.viewX, s.viewY]');
    return { x: ((p.x - box.x) / scale - vx) / vs, y: ((p.y - box.y) / scale - vy) / vs };
  };
  const zoomAt = async (p: { x: number; y: number }) => {
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await page.waitForTimeout(100);
  };
  const A = { x: box.x + 150, y: box.y + 120 };
  const B = { x: box.x + 450, y: box.y + 380 };
  await zoomAt(A);
  const before = await contentUnder(B);
  await zoomAt(B);
  const after = await contentUnder(B);
  expect(await state<number>(page, 's.viewScale')).toBeGreaterThan(1.15);
  expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
});

test('align bottom uses the full height of multi-line text', async ({ page }) => {
  await act(page, 's.addText(); s.stopEditingText()');
  const id = await state<string>(page, 's.items[0].id');
  await act(page, `s.updateItem('${id}', { text: 'one\\ntwo\\nthree' }); s.select('${id}'); s.alignItems('bottom')`);
  const [y, fontSize, canvasH] = await state<number[]>(page, '[s.items[0].y, s.items[0].fontSize, s.canvas.height]');
  const drawnHeight = 3 * fontSize * 1.4; // three lines at the default line height
  expect(y + drawnHeight).toBeCloseTo(canvasH, 0);
});

test('90° rotate turns a photo about its centre', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' })`);
  const centre = (it: Img) => {
    const r = (it.rotation * Math.PI) / 180;
    return {
      x: it.x + (it.width / 2) * Math.cos(r) - (it.height / 2) * Math.sin(r),
      y: it.y + (it.width / 2) * Math.sin(r) + (it.height / 2) * Math.cos(r),
    };
  };
  const before = centre(await state<Img>(page, 's.items[0]'));
  await act(page, `s.rotateItem('${id}', 90)`);
  const after = centre(await state<Img>(page, 's.items[0]'));
  expect(await state<number>(page, 's.items[0].rotation')).toBe(90);
  expect(after.x).toBeCloseTo(before.x, 3);
  expect(after.y).toBeCloseTo(before.y, 3);
});

/** Source-image pixel drawn at a page point, for an item with any rotation/flip. */
async function sourceUnder(page: Page, p: { x: number; y: number }) {
  const { box, scale } = await stageGeometry(page);
  const it = await state<Img>(page, 's.items[0]');
  const dx = (p.x - box.x) / scale - it.x;
  const dy = (p.y - box.y) / scale - it.y;
  const r = (-it.rotation * Math.PI) / 180;
  let u = dx * Math.cos(r) - dy * Math.sin(r);
  let v = dx * Math.sin(r) + dy * Math.cos(r);
  if (it.flipX) u = it.width - u;
  if (it.flipY) v = it.height - v;
  return { x: it.crop.x + (u * it.crop.width) / it.width, y: it.crop.y + (v * it.crop.height) / it.height };
}

for (const setup of [
  { name: 'flipped', body: (id: string) => `s.flipItem('${id}', 'x')` },
  { name: 'rotated', body: (id: string) => `s.rotateItem('${id}', 90)` },
]) {
  test(`dragging a crop moves a ${setup.name} photo with the pointer`, async ({ page }) => {
    const id = await addImage(page);
    await act(page, `s.applyLayout({ type: 'grid' }); s.setCropZoom('${id}', 2); ${setup.body(id)}; s.startCrop('${id}')`);
    const { box } = await stageGeometry(page);
    const P = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const Q = { x: P.x + 50, y: P.y + 30 };

    const grabbed = await sourceUnder(page, P);
    await page.mouse.move(P.x, P.y);
    await page.mouse.down();
    await page.mouse.move(Q.x, Q.y, { steps: 8 });
    await page.mouse.up();
    const landed = await sourceUnder(page, Q);

    // The photo pixel grabbed at P is now under the pointer at Q.
    expect(Math.abs(landed.x - grabbed.x)).toBeLessThan(2);
    expect(Math.abs(landed.y - grabbed.y)).toBeLessThan(2);
  });
}

test('one colour-picker session is one undo step', async ({ page }) => {
  await act(page, `s.requestPanel('Collage Background')`);
  const before = await state<number>(page, 's.past.length');
  await page.locator('[data-panel-title="Collage Background"] input[type=color]').evaluate((el: HTMLInputElement) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    // Dragging inside the picker fires `input` repeatedly…
    for (const v of ['#101010', '#202020', '#303030', '#404040', '#505050', '#606060']) {
      set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // …and `change` once when the choice is committed.
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(await state<string>(page, 's.canvas.backgroundColor')).toBe('#606060');
  expect(await state<number>(page, 's.past.length')).toBe(before + 1);
  expect(await state<string[]>(page, 's.historyLabels')).toContain('Background color');
});

const urlIsAlive = (page: Page, url: string) =>
  page.evaluate(async (u) => {
    try {
      await fetch(u);
      return true;
    } catch {
      return false;
    }
  }, url);

test('a deleted photo stays restorable while undo can reach it, then is released', async ({ page }) => {
  const id = await addImage(page);
  const src = await state<string>(page, 's.items[0].src');
  await act(page, `s.select('${id}'); s.removeSelected()`);
  expect(await urlIsAlive(page, src)).toBe(true); // undo can still bring it back

  // 60 more history steps push the deletion out of the 60-step undo limit.
  await act(page, `for (let i = 0; i < 61; i++) s.addSticker('⭐')`);
  expect(await state<string[]>(page, 's.items.filter(i => i.type === "image").map(i => i.src)')).toEqual([]);
  await expect.poll(() => urlIsAlive(page, src)).toBe(false);
});

test('an undone photo is released once a new action discards the redo branch', async ({ page }) => {
  await addImage(page);
  const src = await state<string>(page, 's.items[0].src');
  await act(page, 's.undo()');
  expect(await urlIsAlive(page, src)).toBe(true); // redo can still bring it back
  await act(page, `s.addSticker('⭐')`);
  await expect.poll(() => urlIsAlive(page, src)).toBe(false);
});

test('auto-save previews never include selection handles or crop outlines', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__editorStore);
  const id = await addImage(page, 'redblue', 1200, 900);
  await act(page, `s.applyLayout({ type: 'grid' }); s.setAutoSaveEnabled(true); s.startCrop('${id}')`);
  // Let the photo decode and draw in real time first. Otherwise the fake clock
  // fires auto-save before the image exists, and two blank previews "match".
  await page.waitForTimeout(500);
  await page.clock.runFor(100);

  const saved = () =>
    page.evaluate(
      () =>
        new Promise<{ thumbnail: string; updatedAt: number }>((resolve, reject) => {
          const req = indexedDB.open('collage-studio');
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            if (!req.result.objectStoreNames.contains('projects')) return resolve({ thumbnail: '', updatedAt: 0 });
            const all = req.result.transaction('projects').objectStore('projects').getAll();
            all.onsuccess = () => resolve(all.result[0] ?? { thumbnail: '', updatedAt: 0 });
          };
        }),
    );

  // Auto-save while the photo is selected in crop mode…
  await page.clock.runFor(31_000);
  await expect.poll(async () => (await saved()).updatedAt).toBeGreaterThan(0);
  const first = await saved();

  // …and again with nothing selected (mark it unsaved so auto-save runs).
  // Waits on updatedAt: with the fix, the two previews are identical.
  await act(page, `s.endCrop(); s.select(null); s.markSaved({ ...s.savedRef, items: [] })`);
  await page.clock.runFor(31_000);
  await expect.poll(async () => (await saved()).updatedAt).toBeGreaterThan(first.updatedAt);
  const withSelection = first.thumbnail;
  const clean = (await saved()).thumbnail;

  const { maxDiff, redShare } = await page.evaluate(async ([a, b]) => {
    const load = async (u: string) => {
      const bmp = await createImageBitmap(await (await fetch(u)).blob());
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      return ctx.getImageData(0, 0, c.width, c.height).data;
    };
    const [da, db] = [await load(a), await load(b)];
    let max = 0;
    for (let i = 0; i < da.length; i++) max = Math.max(max, Math.abs(da[i] - db[i]));
    // Share of strongly red pixels in each — the photo really is in both.
    const red = (d: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) n++;
      return n / (d.length / 4);
    };
    return { maxDiff: max, redShare: [red(da), red(db)] };
  }, [withSelection, clean]);
  expect(redShare[0]).toBeGreaterThan(0.3);
  expect(redShare[1]).toBeGreaterThan(0.3);
  expect(maxDiff).toBeLessThan(40); // same picture, allowing only JPEG noise
});
