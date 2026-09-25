import { test, expect, type Page } from '@playwright/test';
import { act, addImage, stageGeometry, state } from './helpers';

type Crop = { x: number; y: number; width: number; height: number };
type Img = { x: number; y: number; width: number; height: number; crop?: Crop };

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__editorStore);
});

/** Drag a Transformer anchor, given its position in canvas coordinates. */
async function dragAnchor(page: Page, canvasX: number, canvasY: number, dx: number, dy: number) {
  const { box, scale } = await stageGeometry(page);
  const x = box.x + canvasX * scale;
  const y = box.y + canvasY * scale;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 6 });
  await page.mouse.up();
}

/** Crop zoom relative to a plain cover-crop of the item's box (1 = uncropped). */
function zoomOf(it: Img & { naturalWidth: number; naturalHeight: number }): number {
  const boxAspect = it.width / it.height;
  const coverW = Math.min(it.naturalWidth, it.naturalHeight * boxAspect);
  return coverW / it.crop!.width;
}

test('resizing a photo keeps its crop zoom', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' }); s.select('${id}'); s.setCropZoom('${id}', 2)`);
  const before = await state<Img & { naturalWidth: number; naturalHeight: number }>(page, `s.items[0]`);
  expect(zoomOf(before)).toBeCloseTo(2, 2);

  await dragAnchor(page, before.x + before.width, before.y + before.height, -40, -60);
  const after = await state<Img & { naturalWidth: number; naturalHeight: number }>(page, `s.items[0]`);
  expect(after.width).toBeLessThan(before.width); // it really was resized
  expect(zoomOf(after)).toBeCloseTo(2, 2);
});

test('moving a spacing slider keeps crop zoom', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' }); s.setCropZoom('${id}', 1.8)`);
  // What the Outer margin slider does on every tick.
  await act(page, `s.beginChange('Outer margin'); s.setSpacingLive({ margin: 90 }); s.commitChange()`);
  const it = await state<Img & { naturalWidth: number; naturalHeight: number }>(page, `s.items[0]`);
  expect(zoomOf(it)).toBeCloseTo(1.8, 2);
});

test('a side handle crops a never-laid-out photo instead of stretching it', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}')`);
  const it = await state<Img>(page, 's.items[0]');
  expect(it.crop).toBeUndefined();

  await dragAnchor(page, it.x + it.width, it.y + it.height / 2, 120, 0);
  const after = await state<Img>(page, 's.items[0]');
  expect(after.width).toBeGreaterThan(it.width);
  // The source region drawn has the same shape as the box, so nothing stretches.
  expect(after.crop!.width / after.crop!.height).toBeCloseTo(after.width / after.height, 2);
});

test('the Insert panel text box can be typed into, as one undo step', async ({ page }) => {
  await act(page, 's.addText()');
  await act(page, 's.stopEditingText()');
  const historyBefore = await state<number>(page, 's.past.length');

  const box = page.locator('[data-panel-title="Insert"]').getByRole('textbox', { name: 'Text', exact: true });
  await box.fill('');
  await box.pressSequentially('Hello');
  await expect(box).toBeFocused(); // focus used to jump away immediately
  await box.blur();

  expect(await state<string>(page, 's.items[0].text')).toBe('Hello');
  expect(await state<number>(page, 's.past.length')).toBe(historyBefore + 1);
  expect(await state<string[]>(page, 's.historyLabels')).toContain('Edit text');
});

test('collapsing the Insert panel mid-edit still records the edit', async ({ page }) => {
  await act(page, 's.addText()');
  await act(page, 's.stopEditingText()');
  const historyBefore = await state<number>(page, 's.past.length');
  const box = page.locator('[data-panel-title="Insert"]').getByRole('textbox', { name: 'Text', exact: true });
  await box.fill('Collapsed');
  // Opening another panel unmounts the focused text box.
  await page.locator('.panel-title', { hasText: 'Canvas' }).click();
  await expect(box).toHaveCount(0);

  expect(await state<string>(page, 's.items[0].text')).toBe('Collapsed');
  expect(await state<number>(page, 's.past.length')).toBe(historyBefore + 1);
  expect(await state<unknown>(page, 's._pending')).toBeNull(); // no snapshot left open
});

test('focusing the Insert panel text box without typing records nothing', async ({ page }) => {
  await act(page, 's.addText()');
  await act(page, 's.stopEditingText()');
  const historyBefore = await state<number>(page, 's.past.length');
  await page.locator('[data-panel-title="Insert"]').getByRole('textbox', { name: 'Text', exact: true }).click();
  await page.locator('.panel-title', { hasText: 'Canvas' }).click();
  expect(await state<number>(page, 's.past.length')).toBe(historyBefore);
});
