import { test, expect, type Page } from '@playwright/test';
import type Konva from 'konva';
import { act, addImage, analyzeExport, exportImage, stageGeometry, state } from './helpers';

// Mid-gesture rendering, snapping, progress feedback, colour, fonts and crash
// recovery.

type Box = { x: number; y: number; width: number; height: number };

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

/** Page position of a Transformer anchor ('middle-right', 'rotater', ...) and of the item it's on. */
async function anchorGeometry(page: Page, id: string, anchor: string) {
  return page.evaluate(
    ({ id, anchor }) => {
      const K = window.Konva;
      const stage = K.stages[K.stages.length - 1];
      const a = stage.findOne<Konva.Transformer>('Transformer')!.findOne('.' + anchor)!.getClientRect();
      const n = stage.findOne('#' + id)!.getClientRect();
      const r = stage.container().getBoundingClientRect();
      return {
        anchor: { x: r.left + a.x + a.width / 2, y: r.top + a.y + a.height / 2 },
        centre: { x: r.left + n.x + n.width / 2, y: r.top + n.y + n.height / 2 },
      };
    },
    { id, anchor },
  );
}

test('a photo is cropped, not stretched, while a side handle is being dragged', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}')`);
  const { anchor } = await anchorGeometry(page, id, 'middle-right');
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.move(anchor.x + 150, anchor.y, { steps: 6 });
  const live = await page.evaluate((id) => {
    const K = window.Konva;
    const group = K.stages[K.stages.length - 1].findOne<Konva.Group>('#' + id)!;
    const img = group.findOne<Konva.Image>('Image')!;
    const crop = img.crop();
    return {
      scaleX: group.scaleX(),
      boxAspect: (img.width() * group.scaleX()) / (img.height() * group.scaleY()),
      cropAspect: crop.width / crop.height,
    };
  }, id);
  await page.mouse.up();
  expect(live.scaleX, 'really mid-resize').toBeGreaterThan(1.1);
  expect(live.cropAspect, 'the drawn region has the shape of the box').toBeCloseTo(live.boxAspect, 2);
});

test('a text box rewraps while its handle is dragged, instead of stretching', async ({ page }) => {
  await act(page, 's.addText(); s.stopEditingText()');
  const id = await state<string>(page, 's.items[0].id');
  await act(page, `s.updateItem('${id}', { text: 'one two three four five six seven eight' }); s.select('${id}')`);
  const width = await state<number>(page, 's.items[0].width');
  const { anchor } = await anchorGeometry(page, id, 'middle-right');
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  await page.mouse.move(anchor.x - 120, anchor.y, { steps: 6 });
  const live = await page.evaluate((id) => {
    const K = window.Konva;
    const node = K.stages[K.stages.length - 1].findOne('#' + id)!;
    return { scaleX: node.scaleX(), width: node.width() };
  }, id);
  await page.mouse.up();
  expect(live.scaleX, 'glyphs never squashed').toBe(1);
  expect(live.width).toBeLessThan(width - 50);
});

test('rotating with the handle snaps to the nearest 45°', async ({ page }) => {
  // Not laid out: a full-height photo's rotate handle sits above the stage.
  const id = await addImage(page);
  await act(page, `s.select('${id}')`);
  const { anchor, centre } = await anchorGeometry(page, id, 'rotater');
  // The handle starts straight above the centre; move it round 87° clockwise.
  const radius = Math.hypot(anchor.x - centre.x, anchor.y - centre.y);
  const to = (deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: centre.x + radius * Math.cos(a), y: centre.y + radius * Math.sin(a) };
  };
  await page.mouse.move(anchor.x, anchor.y);
  await page.mouse.down();
  for (const deg of [20, 45, 70, 87]) await page.mouse.move(to(deg).x, to(deg).y, { steps: 3 });
  await page.mouse.up();
  expect(await state<number>(page, 's.items[0].rotation')).toBeCloseTo(90, 5);
});

test('snapping reaches the same distance on screen at any zoom', async ({ page }) => {
  const id = await addImage(page, 'photo', 400, 300);
  await act(page, `s.select(null); s.updateItem('${id}', { x: 200, y: 390 })`);
  const { box, scale: ds } = await stageGeometry(page);
  // Zoom to 4x with the canvas's left edge 50 px into the stage.
  const vs = 4;
  const vx = 50 / ds;
  const vy = box.height / 2 / ds - 540 * vs;
  await act(page, `s.setView(${vs}, ${vx}, ${vy})`);
  const toScreen = (cx: number, cy: number) => ({ x: box.x + (vx + cx * vs) * ds, y: box.y + (vy + cy * vs) * ds });
  // Drag the photo so its left edge ends 5 canvas px from the canvas edge:
  // about 13 px on screen at this zoom, well beyond a 6 px snap.
  const from = toScreen(220, 540);
  const to = toScreen(220 - 195, 540);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  expect(await state<number>(page, 's.items[0].x')).toBeCloseTo(5, 0);
});

/** A PNG made in the page, as a file to hand to an <input type=file>. */
async function pngFile(page: Page, name: string) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 200;
    c.getContext('2d')!.fillRect(0, 0, 150, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

test('adding photos shows progress, and so does preparing an export', async ({ page }) => {
  // Slow each photo's decode a little, so the progress is there to be seen.
  await page.evaluate(() => {
    const Original = window.Image;
    window.Image = class extends Original {
      set onload(fn: ((this: GlobalEventHandlers, ev: Event) => unknown) | null) {
        super.onload = fn ? (ev: Event) => setTimeout(() => fn.call(this, ev), 400) : null;
      }
      get onload() {
        return super.onload;
      }
    };
  });
  const files = await Promise.all(['a.png', 'b.png', 'c.png'].map((n) => pngFile(page, n)));
  await page.locator('.stage-host input[type=file]').setInputFiles(files);
  await expect(page.locator('.busy-indicator')).toContainText('Adding photos');
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(3);
  await expect(page.locator('.busy-indicator')).toBeHidden();

  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- re-applied to each call's own canvas
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, ...args: Parameters<typeof toBlob>) {
      setTimeout(() => toBlob.apply(this, args), 800);
    };
  });
  const download = page.waitForEvent('download');
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.locator('.busy-indicator')).toContainText('Preparing');
  await download;
  await expect(page.locator('.busy-indicator')).toBeHidden();
});

test('Warmth shifts colour temperature, and Hue is its own control', async ({ page }) => {
  const id = await addImage(page, 'solid', 600, 600, '#808080');
  await act(page, `s.select('${id}'); s.requestPanel('Enhance & Adjust')`);
  await expect(page.getByRole('slider', { name: 'Warmth', exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Hue', exact: true })).toBeVisible();

  await act(page, `s.updateItem('${id}', { filters: { warmth: 60 } })`);
  const it = await state<Box>(page, 's.items[0]');
  const download = await exportImage(page, 'png', 1);
  const [r, g, b] = await analyzeExport(page, download, (px, _w, _h, p) => px(p.x, p.y), {
    x: it.x + it.width / 2,
    y: it.y + it.height / 2,
  });
  expect(r - b, 'neutral grey turned warm').toBeGreaterThan(25);
  expect(g).toBeGreaterThan(b);
  expect(g).toBeLessThan(r);

  // The Warm preset warms; it no longer rotates every hue.
  await act(page, `s.resetEnhancements('${id}'); s.select('${id}'); s.applyEnhancePreset('warm')`);
  expect(await state<number>(page, 's.items[0].filters.hue')).toBe(0);
  expect(await state<number>(page, 's.items[0].filters.warmth')).toBeGreaterThan(0);
});

test('every text font ships with the app, so text looks the same on every device', async ({ page }) => {
  const families = await page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((f) => f.family.replace(/["']/g, ''));
  });
  for (const family of ['Inter', 'Anton', 'Pacifico', 'Dancing Script', 'Caveat', 'Great Vibes']) {
    expect(families, family).toContain(family);
  }
  await act(page, 's.addText(); s.stopEditingText()');
  await act(page, `s.select(s.items[0].id); s.requestPanel('Insert')`);
  await page.getByRole('button', { name: 'Display', exact: true }).click();
  expect(await state<string>(page, 's.items[0].fontFamily')).toMatch(/^Anton\b/);
});

test('a crash saves a recovery copy of unsaved work to Projects', async ({ page }) => {
  await addImage(page);
  await act(page, 's.addText(); s.stopEditingText()');
  const id = await state<string>(page, 's.items[1].id');
  // A state the inspector can't render — what any rendering bug looks like to the error boundary.
  await act(page, `s.updateItemLive('${id}', { fontStyle: undefined }); s.select('${id}')`);
  await expect(page.getByText('Something went wrong')).toBeVisible();
  await expect(page.getByText(/saved in Projects as “Collage \(recovered\)”/)).toBeVisible();
  const names = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const req = indexedDB.open('collage-studio');
        req.onsuccess = () => {
          const all = req.result.transaction('projects').objectStore('projects').getAll();
          all.onsuccess = () => resolve(all.result.map((p: { name: string }) => p.name));
        };
      }),
  );
  expect(names).toContain('Collage (recovered)');
});
