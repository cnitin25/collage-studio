import { test, expect, type Page } from '@playwright/test';
import { act, addImage, state } from './helpers';

// Keyboard shortcuts and the clipboard: copying, cutting and pasting items,
// pasting images and text from other apps, Save, Export and layer order.

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

/** A paste from another app: what it put on the clipboard, as files and text. */
async function pasteFromAnotherApp(page: Page, content: { text?: string; png?: boolean }) {
  await page.evaluate(async ({ text, png }) => {
    const data = new DataTransfer();
    if (text) data.setData('text/plain', text);
    if (png) {
      const c = document.createElement('canvas');
      c.width = 300;
      c.height = 200;
      c.getContext('2d')!.fillRect(0, 0, 300, 200);
      const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'));
      data.items.add(new File([blob], 'screenshot.png', { type: 'image/png' }));
    }
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, content);
}

type Placed = { id: string; x: number; y: number; src?: string; assetId?: string };

test('copy and paste makes an offset copy of the selected item, as one undo step', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}')`);
  const original = await state<Placed>(page, 's.items[0]');
  await page.keyboard.press('ControlOrMeta+C');
  await page.keyboard.press('ControlOrMeta+V');
  expect(await state<number>(page, 's.items.length')).toBe(2);
  const pasted = await state<Placed>(page, 's.items[1]');
  expect(pasted.id).not.toBe(id);
  expect([pasted.x, pasted.y]).toEqual([original.x + 28, original.y + 28]);
  expect(pasted.assetId, 'the same stored photo').toBe(original.assetId);
  expect(await state<string>(page, 's.selectedId')).toBe(pasted.id);
  expect(await state<string>(page, 's.historyLabels.at(-1)')).toBe('Paste');

  await page.keyboard.press('ControlOrMeta+V');
  expect(await state<number>(page, 's.items[2].x'), 'each paste one step further').toBe(original.x + 56);
  await act(page, 's.undo(); s.undo()');
  expect(await state<number>(page, 's.items.length')).toBe(1);
});

test('cut removes the selected item, and paste puts it back where it was', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}')`);
  const original = await state<Placed>(page, 's.items[0]');
  await page.keyboard.press('ControlOrMeta+X');
  expect(await state<number>(page, 's.items.length')).toBe(0);
  expect(await state<string>(page, 's.historyLabels.at(-1)')).toBe('Cut');
  await page.keyboard.press('ControlOrMeta+V');
  const pasted = await state<Placed>(page, 's.items[0]');
  expect([pasted.x, pasted.y]).toEqual([original.x, original.y]);
});

test('copying a text item puts its text on the system clipboard, and pastes back styled', async ({ page }) => {
  await act(page, 's.addText(); s.stopEditingText()');
  const id = await state<string>(page, 's.items[0].id');
  await act(page, `s.updateItem('${id}', { text: 'Summer 2026', fill: '#ff0000' }); s.select('${id}')`);
  await page.keyboard.press('ControlOrMeta+C');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Summer 2026');
  await page.keyboard.press('ControlOrMeta+V');
  expect(await state<string>(page, 's.items[1].text')).toBe('Summer 2026');
  expect(await state<string>(page, 's.items[1].fill'), 'the copy, not a plain text box').toBe('#ff0000');
});

test('an image pasted from another app is added as a photo', async ({ page }) => {
  await pasteFromAnotherApp(page, { png: true });
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(1);
  expect(await state<string>(page, 's.items[0].type')).toBe('image');
});

test('text pasted from another app becomes a text box', async ({ page }) => {
  await pasteFromAnotherApp(page, { text: 'Hello from the clipboard' });
  expect(await state<string>(page, 's.items[0].type')).toBe('text');
  expect(await state<string>(page, 's.items[0].text')).toBe('Hello from the clipboard');
  expect(await state<string>(page, 's.historyLabels.at(-1)')).toBe('Paste');
});

test('a paste into a text field is left to the field', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Project name' }).focus();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'not for the canvas');
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  expect(await state<number>(page, 's.items.length')).toBe(0);
});

test('copying text selected on the page copies that text, not the item', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}')`);
  const shown = await page.evaluate(() => {
    const el = document.querySelector('.status-primary')!;
    getSelection()!.selectAllChildren(el);
    return el.textContent;
  });
  await page.keyboard.press('ControlOrMeta+C');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(shown);
});

test('a copied photo still pastes after everything showing it is gone', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}')`);
  await page.keyboard.press('ControlOrMeta+C');
  // A new project: the photo, and every undo step that could bring it back.
  await act(page, 's.resetProject()');
  await page.keyboard.press('ControlOrMeta+V');
  const src = await state<string>(page, 's.items[0].src');
  const bytes = await page.evaluate(async (src) => (await (await fetch(src)).blob()).size, src);
  expect(bytes).toBeGreaterThan(100);
});

test('Save and Export have shortcuts, shown in their tooltips', async ({ page }) => {
  await addImage(page);
  await expect(page.locator('.toolbar [aria-label="Save"]')).toHaveAttribute('data-tip', /\((Ctrl\+|⌘)S\)/);
  await expect(page.locator('.toolbar [aria-label="Export"]')).toHaveAttribute('data-tip', /\((Ctrl\+|⌘)Shift\+E\)/);
  await page.keyboard.press('ControlOrMeta+S');
  await expect(page.locator('.toast')).toHaveText('Saved');
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('ControlOrMeta+Shift+E')]);
  expect(download.suggestedFilename()).toBe('Collage.png');
});

test('the bracket keys move the selection up or down the stack, and with Shift to the top or bottom', async ({ page }) => {
  const a = await addImage(page);
  const b = await addImage(page);
  const c = await addImage(page);
  const order = () => state<string[]>(page, 's.items.map((i) => i.id)');
  await act(page, `s.select('${a}')`);
  await page.keyboard.press('ControlOrMeta+]');
  expect(await order()).toEqual([b, a, c]);
  await page.keyboard.press('ControlOrMeta+Shift+]');
  expect(await order()).toEqual([b, c, a]);
  await page.keyboard.press('ControlOrMeta+[');
  expect(await order()).toEqual([b, a, c]);
  await page.keyboard.press('ControlOrMeta+Shift+[');
  expect(await order()).toEqual([a, b, c]);
});
