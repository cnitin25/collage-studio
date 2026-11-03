import { test, expect, type Page } from '@playwright/test';
import type Konva from 'konva';
import { act, addImage, stageGeometry, state } from './helpers';

// Several items at once: selecting them (Shift-click, a box, Ctrl+A), moving,
// resizing, deleting, duplicating, nudging, copying, aligning and
// distributing them together, saved groups, and the floating selection bar.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

/** Page position of an item's centre, as drawn. */
async function centreOf(page: Page, id: string) {
  return page.evaluate((id) => {
    const K = window.Konva;
    const stage = K.stages[K.stages.length - 1];
    const r = stage.findOne('#' + id)!.getClientRect();
    const c = stage.container().getBoundingClientRect();
    return { x: c.left + r.x + r.width / 2, y: c.top + r.y + r.height / 2 };
  }, id);
}

/** Page position of a canvas point. */
async function onPage(page: Page, cx: number, cy: number) {
  const { box, scale } = await stageGeometry(page);
  return { x: box.x + cx * scale, y: box.y + cy * scale };
}

/** Three small photos in a row, nothing selected. */
async function threePhotos(page: Page) {
  const ids = [await addImage(page), await addImage(page), await addImage(page)];
  await act(
    page,
    `s.updateItem('${ids[0]}', { x: 60, y: 300, width: 240, height: 160 });
     s.updateItem('${ids[1]}', { x: 420, y: 340, width: 240, height: 160 });
     s.updateItem('${ids[2]}', { x: 780, y: 380, width: 240, height: 160 });
     s.select(null)`,
  );
  return ids;
}

const selection = (page: Page) => state<string[]>(page, 's.selectedIds');

async function click(page: Page, id: string, shift = false) {
  const p = await centreOf(page, id);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(p.x, p.y);
  if (shift) await page.keyboard.up('Shift');
}

test('Shift-click adds an item to the selection, and takes it out again', async ({ page }) => {
  const [a, b] = await threePhotos(page);
  await click(page, a);
  await click(page, b, true);
  expect(await selection(page)).toEqual([a, b]);
  expect(await state<string | null>(page, 's.selectedId'), 'no single item is "the" selection').toBeNull();
  await click(page, b, true);
  expect(await selection(page)).toEqual([a]);
});

test('dragging across empty canvas selects every item the box touches', async ({ page }) => {
  const [a, b] = await threePhotos(page);
  const from = await onPage(page, 20, 250);
  const to = await onPage(page, 520, 600);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  expect(await selection(page)).toEqual([a, b]);
});

test('Ctrl+A selects everything, and Escape clears the selection', async ({ page }) => {
  const ids = await threePhotos(page);
  await page.keyboard.press('ControlOrMeta+A');
  expect(await selection(page)).toEqual(ids);
  await page.keyboard.press('Escape');
  expect(await selection(page)).toEqual([]);
});

test('dragging one of several selected items moves them all, as one undo step', async ({ page }) => {
  const ids = await threePhotos(page);
  await page.keyboard.press('ControlOrMeta+A');
  const before = await state<{ x: number; y: number }[]>(page, 's.items.map((i) => ({ x: i.x, y: i.y }))');
  const steps = await state<number>(page, 's.past.length');
  const p = await centreOf(page, ids[1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 60, p.y + 30, { steps: 6 });
  await page.mouse.up();
  const after = await state<{ x: number; y: number }[]>(page, 's.items.map((i) => ({ x: i.x, y: i.y }))');
  const dx = after[0].x - before[0].x;
  const dy = after[0].y - before[0].y;
  expect(dx).toBeGreaterThan(20);
  for (let i = 1; i < 3; i++) {
    expect(after[i].x - before[i].x).toBeCloseTo(dx, 5);
    expect(after[i].y - before[i].y).toBeCloseTo(dy, 5);
  }
  expect(await state<number>(page, 's.past.length')).toBe(steps + 1);
  await act(page, 's.undo()');
  expect(await state<{ x: number; y: number }[]>(page, 's.items.map((i) => ({ x: i.x, y: i.y }))')).toEqual(before);
});

test('resizing a selection scales every item in it, text by its font size, as one undo step', async ({ page }) => {
  const photo = await addImage(page);
  await act(page, `s.updateItem('${photo}', { x: 100, y: 300, width: 300, height: 200 }); s.addText(); s.stopEditingText()`);
  const text = await state<string>(page, 's.items[1].id');
  await act(page, `s.updateItem('${text}', { x: 450, y: 320, width: 300, fontSize: 40 }); s.select(null)`);
  await page.keyboard.press('ControlOrMeta+A');
  const steps = await state<number>(page, 's.past.length');
  const corner = await page.evaluate(() => {
    const K = window.Konva;
    const stage = K.stages[K.stages.length - 1];
    const r = stage.findOne<Konva.Transformer>('Transformer')!.findOne('.bottom-right')!.getClientRect();
    const c = stage.container().getBoundingClientRect();
    return { x: c.left + r.x + r.width / 2, y: c.top + r.y + r.height / 2 };
  });
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 80, corner.y + 40, { steps: 8 });
  await page.mouse.up();
  const ratio = (await state<number>(page, `s.items[0].width`)) / 300;
  expect(ratio).toBeGreaterThan(1.1);
  expect((await state<number>(page, `s.items[1].fontSize`)) / 40).toBeCloseTo(ratio, 1);
  expect(await state<number>(page, 's.past.length')).toBe(steps + 1);
});

test('Delete, Duplicate and the arrow keys act on the whole selection', async ({ page }) => {
  await threePhotos(page);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+D');
  expect(await state<number>(page, 's.items.length')).toBe(6);
  expect((await selection(page)).length, 'the copies are selected').toBe(3);
  const before = await state<number[]>(page, 's.items.slice(3).map((i) => i.x)');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await state<number[]>(page, 's.items.slice(3).map((i) => i.x)')).toEqual(before.map((x) => x + 2));
  await page.keyboard.press('Delete');
  expect(await state<number>(page, 's.items.length')).toBe(3);
});

test('copy and paste several items', async ({ page }) => {
  await threePhotos(page);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  await page.keyboard.press('ControlOrMeta+V');
  expect(await state<number>(page, 's.items.length')).toBe(6);
  expect((await selection(page)).length).toBe(3);
  expect(await state<string>(page, 's.historyLabels.at(-1)')).toBe('Paste');
});

test('a group stays together: one click selects it, it is saved, and it can be ungrouped', async ({ page }) => {
  const [a, b, c] = await threePhotos(page);
  await click(page, a);
  await click(page, b, true);
  await page.keyboard.press('ControlOrMeta+G');
  const group = await state<string>(page, 's.items[0].groupId');
  expect(group).toBeTruthy();
  expect(await state<string>(page, 's.items[1].groupId')).toBe(group);
  expect(await state<unknown>(page, 's.items[2].groupId')).toBeUndefined();

  await click(page, c);
  await click(page, a);
  expect(await selection(page), 'one member selects the group').toEqual([a, b]);

  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('Saved');
  await page.reload();
  await page.waitForFunction(() => window.__editorStore?.getState().items.length === 3);
  await click(page, a);
  expect(await selection(page), 'still a group after a reload').toEqual([a, b]);

  await page.keyboard.press('ControlOrMeta+Shift+G');
  expect(await state<unknown>(page, 's.items[0].groupId')).toBeUndefined();
  await click(page, c);
  await click(page, a);
  expect(await selection(page)).toEqual([a]);
});

test('align lines the selection up with itself, and distribute evens out the gaps', async ({ page }) => {
  const [a, b, c] = await threePhotos(page);
  await act(page, `s.selectMany(['${a}', '${b}', '${c}']); s.alignItems('top')`);
  expect(await state<number[]>(page, 's.items.map((i) => i.y)')).toEqual([300, 300, 300]);
  await act(page, `s.updateItem('${b}', { x: 340 }); s.selectMany(['${a}', '${b}', '${c}']); s.distributeSelection('x')`);
  const xs = await state<number[]>(page, 's.items.map((i) => i.x)');
  const gaps = [xs[1] - (xs[0] + 240), xs[2] - (xs[1] + 240)];
  expect(gaps[0]).toBeCloseTo(gaps[1], 5);
  expect(xs[0]).toBe(60);
  expect(xs[2]).toBe(780);
});

test('the floating bar sits above a selection of several, and acts on it', async ({ page }) => {
  const [a, b] = await threePhotos(page);
  const bar = page.getByRole('toolbar', { name: 'Selection' });
  await click(page, a);
  await expect(bar, 'not for one item').toBeHidden();
  await click(page, b, true);
  await expect(bar).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  const top = Math.min((await centreOf(page, a)).y, (await centreOf(page, b)).y) - 50;
  expect(barBox.y + barBox.height, 'above the selection').toBeLessThan(top);

  // Out of the way while the selection is dragged.
  const p = await centreOf(page, a);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 40, p.y + 20, { steps: 4 });
  await expect(bar).toBeHidden();
  await page.mouse.up();
  await expect(bar).toBeVisible();

  await bar.getByRole('button', { name: 'Align left edges' }).click();
  expect(await state<number>(page, 's.items[0].x')).toBeCloseTo(await state<number>(page, 's.items[1].x'), 6);
  await bar.getByRole('button', { name: 'Group' }).click();
  expect(await state<string>(page, 's.items[0].groupId')).toBeTruthy();
  await expect(bar.getByRole('button', { name: 'Ungroup' })).toBeVisible();
  await bar.getByRole('button', { name: 'Delete' }).click();
  expect(await state<number>(page, 's.items.length')).toBe(1);
});

test('panels for one item step aside while several are selected', async ({ page }) => {
  const [a, b] = await threePhotos(page);
  await act(page, `s.select('${a}'); s.requestPanel('Enhance & Adjust')`);
  await expect(page.locator('[data-panel-title="Enhance & Adjust"]')).toBeVisible();
  await act(page, `s.selectMany(['${a}', '${b}'])`);
  await expect(page.locator('[data-panel-title="Enhance & Adjust"]')).toHaveCount(0);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Select more adds tapped items, and the bar can group them', async ({ page }) => {
    const [a, b] = await threePhotos(page);
    const tap = async (id: string) => {
      const p = await centreOf(page, id);
      await page.touchscreen.tap(p.x, p.y);
    };
    await tap(a);
    const bar = page.locator('.selection-bar');
    await bar.getByRole('button', { name: 'Select more' }).click();
    await tap(b);
    expect(await selection(page)).toEqual([a, b]);
    await bar.getByRole('button', { name: 'Group' }).click();
    expect(await state<string>(page, 's.items[1].groupId')).toBeTruthy();
  });
});
