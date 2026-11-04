import { test, expect, type Page } from '@playwright/test';
import { act, addImage, state } from './helpers';

// Keyboard, wheel and text-editing behaviour on the desktop layout.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

const items = (page: Page) => state<number>(page, 's.items.length');

test('holding an arrow key is one undo step, not a flood that erases history', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' }); s.select('${id}')`);
  const x = await state<number>(page, 's.items[0].x');
  for (let i = 0; i < 65; i++) await page.keyboard.press('ArrowRight');
  expect(await state<number>(page, 's.items[0].x')).toBeCloseTo(x + 65);
  expect(await state<string[]>(page, 's.historyLabels')).toEqual(['Add photos', 'Layout', 'Move']);
  await page.keyboard.press('Control+z');
  expect(await state<number>(page, 's.items[0].x')).toBeCloseTo(x);
});

test('the Projects dialog traps editor shortcuts and focus, and Escape closes it', async ({ page }) => {
  await addImage(page); // selected
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Projects', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Projects' });
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  expect(await items(page), 'neither deleted nor undone behind the dialog').toBe(1);

  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement)), 'focus stays in the dialog').toBe(true);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  expect(await state<string | null>(page, 's.selectedId'), 'Escape only closed the dialog').not.toBeNull();
});

test('Space after clicking a toolbar button pans, instead of clicking it again', async ({ page }) => {
  await addImage(page);
  const duplicate = page.getByRole('button', { name: 'Duplicate', exact: true });
  await duplicate.click();
  expect(await items(page)).toBe(2);
  await page.keyboard.press('Space');
  expect(await items(page)).toBe(2);
  // A keyboard user's Space still presses the button they moved to.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(duplicate).toBeFocused();
  await page.keyboard.press('Space');
  expect(await items(page)).toBe(3);
});

test('a gentle pinch zooms gently, and scrolling pans a zoomed view', async ({ page }) => {
  await addImage(page);
  const box = (await page.locator('.konvajs-content').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const view = () => state<[number, number, number]>(page, '[s.viewScale, s.viewX, s.viewY]');

  // A trackpad pinch: Ctrl+wheel in many small steps.
  await page.keyboard.down('Control');
  for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -3);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await view())[0]).toBeGreaterThan(1.5);
  expect((await view())[0]).toBeLessThan(2.2);

  // One Ctrl+mouse-wheel notch is one modest step.
  await act(page, 's.resetView()');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await view())[0]).toBeGreaterThan(1.1);
  expect((await view())[0]).toBeLessThanOrEqual(1.2001);

  // A plain scroll pans the zoomed view...
  const [, , y0] = await view();
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await view())[2]).toBeLessThan(y0);
  // ...and leaves the fitted view alone.
  await act(page, 's.resetView()');
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(100);
  expect(await view()).toEqual([1, 0, 0]);
});

test('the desktop text editor shows every line, and an unchanged edit records nothing', async ({ page }) => {
  await act(page, 's.addText(); s.stopEditingText()');
  const id = await state<string>(page, 's.items[0].id');
  await act(page, `s.updateItem('${id}', { text: 'one\\ntwo\\nthree\\nfour\\nfive' })`);
  const before = await state<number>(page, 's.past.length');
  const editor = page.locator('textarea.text-edit');

  await act(page, `s.startEditingText('${id}')`);
  await expect(editor).toBeFocused();
  const { visible, content } = await editor.evaluate((el) => ({ visible: el.clientHeight, content: el.scrollHeight }));
  expect(visible, 'all five lines in view').toBeGreaterThanOrEqual(content - 1);
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect(editor).toBeHidden();
  expect(await state<number>(page, 's.past.length'), 'clicking away unchanged').toBe(before);

  await act(page, `s.startEditingText('${id}')`);
  await expect(editor).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(editor).toBeHidden();
  expect(await state<number>(page, 's.past.length'), 'Enter unchanged').toBe(before);
});

test('moving an Adjust slider by hand ends the preset, so Strength cannot undo it', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}'); s.requestPanel('Enhance & Adjust')`);
  await page.getByRole('button', { name: 'Vivid', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Strength' })).toBeVisible();
  await page.getByRole('button', { name: 'Increase Brightness' }).click();
  expect(await state(page, 's.items[0].filters.presetId')).toBeUndefined();
  expect(await state<number>(page, 's.items[0].filters.brightness')).toBe(4); // Vivid at 60% is 3, +1
  await expect(page.getByRole('slider', { name: 'Strength' })).toBeHidden();
});
