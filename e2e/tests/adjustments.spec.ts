import { test, expect, type Page } from '@playwright/test';
import { act, addImage, analyzeExport, exportImage, state, type Px } from './helpers';

// The photo adjustments, measured in exported images: the real Konva filter
// pipeline in a real browser, at 1x and at 3x. The arithmetic of each filter
// is unit-tested (src/utils/adjustments.test.ts).

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

const panel = (page: Page) => page.locator('section.panel[data-panel-title="Enhance & Adjust"]');

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where photo `i` sits on the canvas, in canvas px. */
const photoBox = (page: Page, i = 0) =>
  state<Box>(page, `(({ x, y, width, height }) => ({ x, y, width, height }))(s.items[${i}])`);

/** RGB at the centre of a photo, and 3 canvas px in from its top-left corner, in an export at scale `k`. */
function centreAndCorner(px: Px, _w: number, _h: number, { b, k }: { b: Box; k: number }) {
  const centre = px((b.x + b.width / 2) * k, (b.y + b.height / 2) * k);
  const corner = px((b.x + 3) * k, (b.y + 3) * k);
  return { centre: centre.slice(0, 3), corner: corner.slice(0, 3) };
}

test('the Adjust sliders come in three groups: light, colour, and detail and effects', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}'); s.requestPanel('Enhance & Adjust')`);
  const p = panel(page);
  await expect(p.locator('.subhead')).toHaveText(['Histogram', 'Presets', 'Color style', 'Light', 'Color', 'Detail & effects']);
  const sliders = await p.getByRole('slider').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(sliders).toEqual([
    'Exposure',
    'Brightness',
    'Contrast',
    'Highlights',
    'Shadows',
    'Warmth',
    'Vibrance',
    'Saturation',
    'Hue',
    'Sharpen',
    'Vignette',
    'Blur',
  ]);
});

test('each new slider steps from its + button, as one undo step named after it', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}'); s.requestPanel('Enhance & Adjust')`);
  const keys = {
    Exposure: 'exposure',
    Highlights: 'highlights',
    Shadows: 'shadows',
    Vibrance: 'vibrance',
    Sharpen: 'sharpen',
    Vignette: 'vignette',
  };
  for (const [label, key] of Object.entries(keys)) {
    const before = await state<number>(page, 's.past.length');
    await panel(page).getByRole('button', { name: `Increase ${label}` }).click();
    expect(await state<number>(page, `s.items[0].filters.${key}`), label).toBe(1);
    expect(await state<number>(page, 's.past.length'), label).toBe(before + 1);
    expect(await state<string>(page, 's.historyLabels[s.historyLabels.length - 1]'), label).toBe(label);
  }
});

test('Reset is offered for a photo with only a vignette, and clears it', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.updateItem('${id}', { filters: { vignette: -40 } }); s.select('${id}'); s.requestPanel('Enhance & Adjust')`);
  const reset = panel(page).getByRole('button', { name: 'Reset' });
  await expect(reset).toBeEnabled();
  await reset.click();
  expect(await state<number>(page, 's.items[0].filters.vignette')).toBe(0);
  await expect(reset).toBeDisabled();
});

test('Exposure works in stops: +50 doubles the light', async ({ page }) => {
  const id = await addImage(page, 'solid', 1200, 900, '#606060');
  await act(page, `s.applyLayout({ type: 'grid' }); s.updateItem('${id}', { filters: { exposure: 50 } })`);
  const b = await photoBox(page);
  const { centre } = await analyzeExport(page, await exportImage(page, 'png', 1), centreAndCorner, { b, k: 1 });
  // 0x60 is 96: 0.117 in linear light, doubled to 0.234, which is 133.
  for (const c of centre) {
    expect(c).toBeGreaterThanOrEqual(129);
    expect(c).toBeLessThanOrEqual(137);
  }
});

test('Shadows lifts a dark photo, and Highlights pulls a light one down', async ({ page }) => {
  const dark = await addImage(page, 'solid', 1200, 900, '#303030');
  const light = await addImage(page, 'solid', 1200, 900, '#e0e0e0');
  await act(
    page,
    `s.applyLayout({ type: 'grid' }); s.updateItem('${dark}', { filters: { shadows: 80 } }); s.updateItem('${light}', { filters: { highlights: -80 } })`,
  );
  const [bd, bl] = [await photoBox(page, 0), await photoBox(page, 1)];
  const download = await exportImage(page, 'png', 1);
  const d = await analyzeExport(page, download, centreAndCorner, { b: bd, k: 1 });
  const l = await analyzeExport(page, download, centreAndCorner, { b: bl, k: 1 });
  expect(d.centre[0], 'the dark photo, from 48').toBeGreaterThanOrEqual(72);
  expect(l.centre[0], 'the light photo, from 224').toBeLessThanOrEqual(208);
});

test('Vibrance strengthens a muted colour and keeps its brightness', async ({ page }) => {
  const id = await addImage(page, 'solid', 1200, 900, '#a08878');
  await act(page, `s.applyLayout({ type: 'grid' }); s.updateItem('${id}', { filters: { vibrance: 80 } })`);
  const b = await photoBox(page);
  const { centre } = await analyzeExport(page, await exportImage(page, 'png', 1), centreAndCorner, { b, k: 1 });
  const [r, g, bl] = centre;
  const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  expect(Math.max(r, g, bl) - Math.min(r, g, bl), 'from 40').toBeGreaterThanOrEqual(55);
  expect(Math.abs(luma(r, g, bl) - luma(160, 136, 120))).toBeLessThan(3);
});

test('Vignette darkens the corners and leaves the centre alone, alike at 1x and 3x', async ({ page }) => {
  test.slow(); // a 3240px export, decoded in the page
  const id = await addImage(page, 'solid', 1200, 900, '#c8c8c8');
  await act(page, `s.applyLayout({ type: 'grid' }); s.updateItem('${id}', { filters: { vignette: -70 } })`);
  const b = await photoBox(page);
  const one = await analyzeExport(page, await exportImage(page, 'png', 1), centreAndCorner, { b, k: 1 });
  const three = await analyzeExport(page, await exportImage(page, 'png', 3), centreAndCorner, { b, k: 3 });
  expect(Math.abs(one.centre[0] - 200), 'the centre').toBeLessThanOrEqual(2);
  expect(one.corner[0], 'a corner, from 200').toBeLessThan(110);
  expect(Math.abs(three.corner[0] - one.corner[0]), 'the same corner at 3x').toBeLessThanOrEqual(8);
});

test('Sharpen steepens an edge, by the same width in canvas px at 1x and 3x', async ({ page }) => {
  test.slow(); // a 3240px export, decoded in the page
  const id = await addImage(page, 'edge', 1200, 900);
  await act(page, `s.applyLayout({ type: 'grid' }); s.updateItem('${id}', { filters: { sharpen: 80 } })`);
  const b = await photoBox(page);
  /** Along the photo's middle row near the edge: how far past each grey it goes, and over how many pixels. */
  const halo = (px: Px, _w: number, _h: number, { b, k }: { b: Box; k: number }) => {
    const y = (b.y + b.height / 2) * k;
    const mid = (b.x + b.width / 2) * k;
    let min = 255;
    let max = 0;
    let width = 0;
    for (let x = Math.round(mid - 20 * k); x <= Math.round(mid + 20 * k); x++) {
      const v = px(x, y)[0];
      min = Math.min(min, v);
      max = Math.max(max, v);
      if (v < 0x50 - 4 || v > 0xb0 + 4) width++;
    }
    return { min, max, width };
  };
  const one = await analyzeExport(page, await exportImage(page, 'png', 1), halo, { b, k: 1 });
  const three = await analyzeExport(page, await exportImage(page, 'png', 3), halo, { b, k: 3 });
  // Unsharpened, the edge stays between the two greys: drawing a photo
  // larger or smaller blends its edges but never overshoots them.
  expect(one.min, 'darker than the dark grey beside the edge').toBeLessThan(0x50 - 4);
  expect(one.max, 'lighter than the light grey beside the edge').toBeGreaterThan(0xb0 + 4);
  expect(one.width).toBeGreaterThanOrEqual(2);
  expect(three.width / 3).toBeGreaterThan(one.width * 0.5);
  expect(three.width / 3).toBeLessThan(one.width * 2);
});
