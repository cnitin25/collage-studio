import { test, expect, type Page } from '@playwright/test';
import { act, addImage, state } from './helpers';

// Desktop toolbar: icon-only buttons with tooltips, and at medium widths the
// less-used actions move into the ⋯ menu so nothing runs off the edge.

async function visibleToolbarButtons(page: Page) {
  const boxes: { name: string; x: number; width: number }[] = [];
  for (const b of await page.locator('.toolbar-actions > button, .toolbar-actions .toolbar-secondary > button, .toolbar-overflow > button').all()) {
    if (!(await b.isVisible())) continue;
    const box = (await b.boundingBox())!;
    boxes.push({ name: (await b.getAttribute('aria-label')) ?? '?', x: box.x, width: box.width });
  }
  return boxes;
}

for (const width of [1280, 1024, 900, 800]) {
  test(`at ${width}px every toolbar button fits on screen, unsqueezed`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const buttons = await visibleToolbarButtons(page);
    expect(buttons.length).toBeGreaterThan(5);
    for (const b of buttons) {
      expect(b.x + b.width, b.name).toBeLessThanOrEqual(width);
      expect(b.width, b.name).toBeGreaterThanOrEqual(30);
    }
  });
}

test.describe('wide desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('buttons are icons with an accessible name and a tooltip', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.toolbar-overflow-toggle')).toBeHidden();
    for (const b of await page.locator('.toolbar .icon-btn').all()) {
      if (!(await b.isVisible())) continue;
      expect((await b.textContent())?.trim(), 'no visible text').toBe('');
      expect(await b.getAttribute('aria-label')).toBeTruthy();
      expect(await b.getAttribute('data-tip')).toBeTruthy();
      expect(await b.getAttribute('title'), 'no native tooltip doubling up').toBeNull();
    }
  });

  test('hovering a button shows its tooltip, with the shortcut', async ({ page }) => {
    await page.goto('/');
    const tip = (sel: string) =>
      page.locator(sel).evaluate((el) => {
        const cs = getComputedStyle(el, '::after');
        return { opacity: cs.opacity, content: cs.content };
      });
    const undo = page.getByRole('button', { name: 'Undo', exact: true });
    expect((await tip('.toolbar [aria-label="Undo"]')).opacity).toBe('0');
    await undo.hover();
    await expect.poll(async () => (await tip('.toolbar [aria-label="Undo"]')).opacity).toBe('1');
    expect((await tip('.toolbar [aria-label="Undo"]')).content).toMatch(/Undo \((Ctrl\+|⌘)Z\)/);
    // Undo is disabled on a fresh page. A disabled button must not be faded
    // with opacity: that traps its tooltip under the workspace, half-hidden.
    await expect(undo).toBeDisabled();
    expect(await undo.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  });

  test('a disabled button says what it needs', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.toolbar [aria-label="Replace photo"]')).toHaveAttribute(
      'data-tip',
      /select a photo first/,
    );
  });
});

test.describe('medium desktop width', () => {
  test.use({ viewport: { width: 900, height: 800 } });

  test('Duplicate, Delete, Clear canvas and the theme move into the ⋯ menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__editorStore);
    const id = await addImage(page);
    await act(page, `s.select('${id}')`);

    for (const name of ['Duplicate', 'Delete', 'Clear canvas']) {
      await expect(page.locator(`.toolbar-secondary [aria-label="${name}"]`)).toBeHidden();
    }
    for (const name of ['Projects', 'Save', 'Export']) {
      await expect(page.locator(`.toolbar-secondary [aria-label="${name}"]`)).toBeVisible();
    }
    // The phone-only tools toggle stays off at this width.
    await expect(page.locator('.toolbar-tools-toggle')).toBeHidden();

    await page.locator('.toolbar-overflow-toggle').click();
    const menu = page.locator('.overflow-menu');
    for (const item of ['Duplicate', 'Delete', 'Clear canvas', 'Light mode']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
    }
    // ...but not the ones already on the toolbar here.
    for (const item of ['Add text', 'Replace photo', 'Projects', 'Save']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeHidden();
    }
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
    expect(await state(page, 's.items.length')).toBe(2);
  });
});

test.describe('landscape phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('keeps the full phone menu, though it is as wide as a medium desktop', async ({ page }) => {
    await page.goto('/');
    await page.locator('.toolbar-overflow-toggle').click();
    const menu = page.locator('.overflow-menu');
    for (const item of ['Add text', 'Replace photo', 'Duplicate', 'Projects', 'Save']) {
      await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
    }
  });
});
