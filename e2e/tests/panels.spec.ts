import { test, expect, type Page } from '@playwright/test';
import { act, addImage, state } from './helpers';

// Editor mode toggles (status bar / phone sheet footer), the Canvas panel's
// preset icons, and the inspector's sticky search.

const MODES = [
  { label: 'Snap', flag: 'snapEnabled' },
  { label: 'Lock layout', flag: 'layoutLocked' },
  { label: 'Swap', flag: 'swapModeEnabled' },
  { label: 'Lock ratio', flag: 'lockAspectEnabled' },
  { label: 'Stay in crop', flag: 'cropLocked' },
];

/** Flip every mode twice from `where`, checking store flag + pressed state each time. */
async function checkToggles(page: Page, where: string) {
  for (const { label, flag } of MODES) {
    const btn = page.locator(`${where} .mode-toggle`, { hasText: label });
    const start = await state<boolean>(page, `s.${flag}`);
    await expect(btn).toHaveAttribute('aria-pressed', String(start));
    for (const expected of [!start, start]) {
      await btn.click();
      expect(await state(page, `s.${flag}`), label).toBe(expected);
      await expect(btn).toHaveAttribute('aria-pressed', String(expected));
      if (expected) await expect(btn).toHaveClass(/is-active/);
      else await expect(btn).not.toHaveClass(/is-active/);
    }
  }
}

/** Desktop scrolls the inspector; the phone's rail layout scrolls its pane. */
async function scrollInspectorToEnd(page: Page, scroller = '.inspector') {
  await page.locator(scroller).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await page.waitForTimeout(100);
}

/** The search box's top edge is at (or below) the scrolling panel's top edge. */
async function expectSearchPinned(page: Page) {
  const search = (await page.locator('.command-search-input').boundingBox())!;
  const panel = (await page.locator('.inspector').boundingBox())!;
  expect(search.y).toBeGreaterThanOrEqual(panel.y);
  expect(search.y).toBeLessThan(panel.y + 140);
  // nothing of the panels shows above it: the sticky block starts at the edge
  const top = (await page.locator('.inspector-top').boundingBox())!;
  expect(Math.abs(top.y - panel.y)).toBeLessThanOrEqual(1);
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__editorStore);
  });

  test('mode toggles live in the status bar, highlighted while on', async ({ page }) => {
    await expect(page.locator('[data-panel-title="Settings"]')).toHaveCount(0);
    await checkToggles(page, '.status-bar');
  });

  test('mode toggles stay reachable with the tools panel collapsed', async ({ page }) => {
    await page.locator('.inspector-collapse-toggle').click();
    await expect(page.locator('.inspector')).toHaveClass(/is-collapsed/);
    const before = await state<boolean>(page, 's.snapEnabled');
    await page.locator('.status-bar .mode-toggle', { hasText: 'Snap' }).click();
    expect(await state(page, 's.snapEnabled')).toBe(!before);
  });

  test('preset icons show each preset\'s proportions, with labels aligned per row', async ({ page }) => {
    const shape = (label: string) =>
      page.locator('.preset', { hasText: new RegExp(`^${label}$`) }).locator('.preset-shape').boundingBox();
    const portrait = (await shape('Portrait'))!;
    const story = (await shape('Story'))!;
    const wide = (await shape('Wide'))!;
    expect(story.height).toBeGreaterThan(portrait.height - 1);
    expect(story.width).toBeLessThan(portrait.width - 3); // Story is visibly narrower
    expect(wide.width).toBeGreaterThan(wide.height * 1.5);

    // Square / Portrait / Story share a row: their labels share a baseline.
    const labelY = async (label: string) =>
      (await page.locator('.preset-label', { hasText: new RegExp(`^${label}$`) }).boundingBox())!.y;
    const ys = [await labelY('Square'), await labelY('Portrait'), await labelY('Story')];
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
  });

  test('print orientation chips fit inside the panel', async ({ page }) => {
    const panel = (await page.locator('[data-panel-title="Canvas"]').boundingBox())!;
    for (const name of ['Portrait', 'Landscape']) {
      const chip = (await page.locator('.print-orientation .chip', { hasText: name }).boundingBox())!;
      expect(chip.x + chip.width, name).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    }
  });

  test("clicking a slider's name doesn't step its value", async ({ page }) => {
    // Sliders used to be <label>s, which forward any click to their first
    // control: the − button.
    await page.locator('.panel-toggle', { hasText: 'Layout' }).click();
    const slider = page.locator('.slider', { hasText: 'Outer margin' });
    const input = slider.getByRole('slider', { name: 'Outer margin' });
    await addImage(page);
    const before = await input.inputValue();
    await slider.locator('.slider-head span').first().click();
    expect(await input.inputValue()).toBe(before);
  });

  test('the search box stays at the top while the panels scroll', async ({ page }) => {
    await scrollInspectorToEnd(page);
    expect(await page.locator('.inspector').evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    await expectSearchPinned(page);
  });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__editorStore);
    await page.locator('.toolbar-tools-toggle').click();
    await expect(page.locator('.inspector')).toHaveClass(/is-open/);
  });

  test('mode toggles sit at the foot of the tools sheet', async ({ page }) => {
    await expect(page.locator('.status-bar')).toBeHidden();
    const footer = (await page.locator('.inspector-modes').boundingBox())!;
    const sheet = (await page.locator('.inspector').boundingBox())!;
    expect(footer.y + footer.height).toBeGreaterThan(sheet.y + sheet.height - 2);
    await checkToggles(page, '.inspector-modes');
  });

  test('the search box and the toggles stay put while the sheet scrolls', async ({ page }) => {
    await page.locator('.sheet-expand').click();
    await expect(page.locator('.inspector')).toHaveClass(/is-expanded/);
    await page.waitForTimeout(400); // let the height transition finish before measuring
    await page.locator('.sheet-search').click(); // hidden on phones until asked for
    await page.locator('.nav-item', { hasText: 'Photo' }).click();
    await scrollInspectorToEnd(page, '.inspector-pane');
    await expectSearchPinned(page);
    const footer = (await page.locator('.inspector-modes').boundingBox())!;
    const sheet = (await page.locator('.inspector').boundingBox())!;
    expect(footer.y + footer.height).toBeGreaterThan(sheet.y + sheet.height - 2);
  });
});

/**
 * Select a photo, open Enhance & Adjust, apply Auto Enhance, then Undo.
 * `scroller` is whatever scrolls the panels: the inspector on desktop, the
 * rail layout's pane on a phone.
 */
async function enhanceThenUndo(page: Page, openPanel: () => Promise<void>, scroller = '.inspector') {
  const id = await addImage(page);
  await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' }); s.select('${id}')`);
  await openPanel();
  const section = page.locator('[data-panel-title="Enhance & Adjust"]');
  await expect(section.getByRole('button', { name: 'Auto Enhance' })).toBeVisible();
  await page.getByRole('button', { name: 'Auto Enhance' }).click();
  expect(await state(page, 's.historyLabels.length')).toBeGreaterThan(0);
  const scrollBefore = await page.locator(scroller).evaluate((el) => el.scrollTop);
  await page.locator('.toolbar').getByRole('button', { name: 'Undo', exact: true }).click();
  const scrollAfter = await page.locator(scroller).evaluate((el) => el.scrollTop);
  return { id, section, scrollBefore, scrollAfter };
}

test.describe('undo keeps your place', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__editorStore);
  });

  test('undoing an enhancement keeps the photo selected and its panel open', async ({ page }) => {
    const { id, section, scrollBefore, scrollAfter } = await enhanceThenUndo(page, () =>
      page.locator('.panel-toggle', { hasText: 'Enhance & Adjust' }).click(),
    );
    expect(await state(page, 's.selectedId')).toBe(id);
    await expect(page.locator('.panel-toggle', { hasText: 'Enhance & Adjust' })).toHaveAttribute('aria-expanded', 'true');
    await expect(section).toBeInViewport();
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(5);
  });

  test('undoing the step that created the selected item clears the selection', async ({ page }) => {
    const id = await addImage(page);
    await act(page, `s.select('${id}')`);
    await act(page, 's.undo()');
    expect(await state(page, 's.items.length')).toBe(0);
    expect(await state(page, 's.selectedId')).toBeNull();
  });
});

test.describe('phone: sheet search, handles, undo', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__editorStore);
  });

  test('the search field is hidden until the header search button opens it', async ({ page }) => {
    await page.locator('.toolbar-tools-toggle').click();
    const input = page.locator('.command-search-input');
    await expect(input).toBeHidden();
    await page.locator('.sheet-search').click();
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await input.fill('export');
    await page.locator('.command-search-results').getByRole('option').first().click();
    await expect(input).toBeHidden();
    await expect(page.locator('.nav-item', { hasText: 'Export' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.inspector-pane [data-panel-title="Export settings"]')).toBeVisible();
  });

  test('undoing an enhancement in the sheet keeps the panel open', async ({ page }) => {
    const { id, section, scrollBefore, scrollAfter } = await enhanceThenUndo(
      page,
      () => page.locator('.selection-bar').getByRole('button', { name: 'Adjust' }).click(),
      '.inspector-pane',
    );
    expect(await state(page, 's.selectedId')).toBe(id);
    await expect(section).toBeVisible();
    await expect(page.locator('.inspector')).toHaveClass(/is-open/);
    // (Tapping Auto Enhance scrolled the pane to reach it; Undo must not move it.)
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(5);
  });

  test('resize handles are small dots just outside the photo, and still resize it', async ({ page }) => {
    const id = await addImage(page);
    await act(page, `s.applyLayout({ type: 'grid' }); s.select('${id}')`);
    const geo = await page.evaluate((id) => {
      const K = (window as any).Konva;
      const stage = K.stages[K.stages.length - 1];
      const tr = stage.findOne('Transformer');
      const node = stage.findOne('#' + id);
      const a = tr.findOne('.bottom-right').getClientRect();
      const n = node.getClientRect();
      const r = stage.container().getBoundingClientRect();
      return { size: tr.anchorSize(), padding: tr.padding(), a, n, left: r.left, top: r.top };
    }, id);
    expect(geo.size).toBeLessThanOrEqual(14);
    expect(geo.padding).toBeGreaterThan(0);
    // The dot sits beyond the photo's bottom-right corner, not on top of it.
    expect(geo.a.x).toBeGreaterThanOrEqual(geo.n.x + geo.n.width - 1);
    expect(geo.a.y).toBeGreaterThanOrEqual(geo.n.y + geo.n.height - 1);

    // Dragging it still resizes the photo by about the distance moved.
    const scale = await state<number>(page, `s.items[0].width`).then(async (w0) => ({
      w0,
      s: (await page.locator('.konvajs-content').boundingBox())!.width / (await state<number>(page, 's.canvas.width')),
    }));
    const start = { x: geo.left + geo.a.x + geo.a.width / 2, y: geo.top + geo.a.y + geo.a.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x - 40, start.y - 40, { steps: 8 });
    await page.mouse.up();
    const w1 = await state<number>(page, 's.items[0].width');
    const expected = scale.w0 - 40 / scale.s;
    expect(Math.abs(w1 - expected) / scale.w0).toBeLessThan(0.08);
  });
});
