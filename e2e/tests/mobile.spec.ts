import { test, expect, type Page } from '@playwright/test';
import { act, addImage, stageGeometry, state } from './helpers';

type ViewState = { viewScale: number; viewX: number; viewY: number };

async function getView(page: Page): Promise<ViewState> {
  return page.evaluate(() => {
    const store = (window as unknown as { __editorStore?: { getState: () => ViewState } }).__editorStore;
    const s = store!.getState();
    return { viewScale: s.viewScale, viewX: s.viewX, viewY: s.viewY };
  });
}

/** Dispatches a real two-finger touch sequence via CDP — Playwright's
 * page.touchscreen only supports a single finger. */
async function pinch(
  page: Page,
  center: { x: number; y: number },
  opts: { startSpread: number; endSpread: number; steps?: number },
) {
  const cdp = await page.context().newCDPSession(page);
  const steps = opts.steps ?? 6;
  const points = (spread: number) => [
    { x: center.x - spread, y: center.y, id: 0 },
    { x: center.x + spread, y: center.y, id: 1 },
  ];

  const dispatch = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    touchPoints: { x: number; y: number; id: number }[],
  ) => {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: touchPoints.map((p) => ({ x: p.x, y: p.y, id: p.id })),
    });
  };

  await dispatch('touchStart', points(opts.startSpread));
  for (let i = 1; i <= steps; i++) {
    const spread = opts.startSpread + ((opts.endSpread - opts.startSpread) * i) / steps;
    await dispatch('touchMove', points(spread));
  }
  await dispatch('touchEnd', []);
}

async function addTextFromMenu(page: Page) {
  await page.locator('.toolbar-overflow-toggle').click();
  await page.locator('.overflow-menu').getByText('Add text').click();
}

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('tools sheet opens at half height, leaving the canvas visible above it', async ({ page }) => {
    await page.goto('/');
    const sheet = page.locator('.inspector');
    await expect(sheet).not.toHaveClass(/is-open/);

    await page.locator('.toolbar-tools-toggle').click();
    await expect(sheet).toHaveClass(/is-open/);

    // canvas stays full-width, and refits into the space above the sheet
    const viewportWidth = page.viewportSize()!.width;
    expect((await page.locator('.stage-col').boundingBox())!.width).toBeGreaterThan(viewportWidth * 0.9);
    await expect
      .poll(async () => {
        const canvas = (await page.locator('.canvas-area').boundingBox())!;
        const sheetBox = (await sheet.boundingBox())!;
        return canvas.y + canvas.height - sheetBox.y;
      })
      .toBeLessThanOrEqual(1);
    // no scrim at half height: the canvas above stays usable
    await expect(page.locator('.drawer-scrim')).toBeHidden();

    // accordion still single-open inside the sheet
    await page.locator('.panel-toggle', { hasText: 'Layout' }).click();
    await expect(page.locator('.panel-toggle', { hasText: 'Layout' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.panel-toggle', { hasText: 'Canvas' })).toHaveAttribute('aria-expanded', 'false');

    await page.locator('.inspector-close').click();
    await expect(sheet).not.toHaveClass(/is-open/);
  });

  test('the sheet expands, then closes from the scrim or a downward swipe', async ({ page }) => {
    await page.goto('/');
    const sheet = page.locator('.inspector');
    await page.locator('.toolbar-tools-toggle').click();
    await page.locator('.sheet-expand').click();
    await expect(sheet).toHaveClass(/is-expanded/);
    await page.locator('.drawer-scrim').click({ position: { x: 5, y: 5 } });
    await expect(sheet).not.toHaveClass(/is-open/);

    await page.locator('.toolbar-tools-toggle').click();
    await expect(sheet).toHaveClass(/is-open/);
    const head = (await page.locator('.inspector-drawer-head').boundingBox())!;
    await page.mouse.move(head.x + 60, head.y + head.height / 2);
    await page.mouse.down();
    await page.mouse.move(head.x + 60, head.y + head.height / 2 + 160, { steps: 6 });
    await page.mouse.up();
    await expect(sheet).not.toHaveClass(/is-open/);
  });

  test('Export stays in the toolbar; secondary actions move into the overflow menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.toolbar-secondary')).toBeHidden();
    await expect(page.locator('.toolbar-wide').first()).toBeHidden();
    await expect(page.locator('.toolbar-export')).toBeVisible();

    const menu = page.locator('.overflow-menu');
    await expect(menu).toBeHidden();
    await page.locator('.toolbar-overflow-toggle').click();
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Add text')).toBeVisible();
    await expect(menu.getByText('Duplicate')).toBeVisible();
    await expect(menu.getByText('Projects')).toBeVisible();

    // outside tap closes it — the empty-state overlay covers the canvas
    // area entirely when there are no items yet, so tap that.
    await page.locator('.empty-state').click({ position: { x: 5, y: 5 } });
    await expect(menu).toBeHidden();
  });

  test('pinch-zoom updates view state and resetView returns it to neutral', async ({ page }) => {
    await page.goto('/');
    // The empty-state overlay sits on top of the canvas and swallows touch
    // input until there's at least one item — add one first, same as a real
    // pinch-to-zoom would only ever happen on an actual collage.
    await addTextFromMenu(page);
    // Added text opens straight into the docked text editor — leave it
    // first, as a user would before pinch-zooming.
    await page.keyboard.press('Escape');

    const before = await getView(page);
    expect(before.viewScale).toBe(1);

    const box = (await page.locator('.canvas-area').boundingBox())!;
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await pinch(page, center, { startSpread: 40, endSpread: 140 });

    const afterPinch = await getView(page);
    expect(afterPinch.viewScale).toBeGreaterThan(before.viewScale);

    // Reset zoom / pan lives in the Canvas panel — open the drawer to reach it.
    // Adding text auto-expands the Insert panel (collapsing Canvas, since only
    // one section is open at a time), so re-open Canvas explicitly first.
    await page.locator('.toolbar-tools-toggle').click();
    await page.locator('.panel-toggle', { hasText: 'Canvas' }).click();
    await page.getByRole('button', { name: 'Reset zoom / pan' }).click();
    const afterReset = await getView(page);
    expect(afterReset).toEqual({ viewScale: 1, viewX: 0, viewY: 0 });
  });

  test('single-finger drag moves an item without changing the view scale', async ({ page }) => {
    await page.goto('/');
    await addTextFromMenu(page);

    const node = page.locator('.stage-surface');
    await expect(node).toBeVisible();
    const box = (await node.boundingBox())!;
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const end = { x: start.x + 40, y: start.y + 20 };

    const before = await getView(page);
    await page.touchscreen.tap(start.x, start.y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 5 });
    await page.mouse.up();

    const after = await getView(page);
    expect(after.viewScale).toBe(before.viewScale);
  });

  test('no console errors on load and after interacting with the drawer/menu/canvas', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.locator('.toolbar-tools-toggle').click();
    await page.locator('.inspector-close').click();
    await page.locator('.toolbar-overflow-toggle').click();
    await page.keyboard.press('Escape');

    expect(errors).toEqual([]);
  });
});

test.describe('desktop layout (regression guard)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('toolbar and inspector render exactly as before — no drawer/overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.toolbar-secondary')).toBeVisible();
    await expect(page.locator('.toolbar-tools-toggle')).toBeHidden();
    await expect(page.locator('.toolbar-overflow-toggle')).toBeHidden();
    await expect(page.locator('.inspector-drawer-head')).toBeHidden();

    const inspector = page.locator('.inspector');
    const box = (await inspector.boundingBox())!;
    expect(box.width).toBeCloseTo(280, 0);
  });
});

test.describe('pinch-zoom anchoring', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  /** Canvas coordinates of the content currently drawn under a page point. */
  async function contentUnder(page: Page, p: { x: number; y: number }) {
    const box = (await page.locator('.konvajs-content').boundingBox())!;
    const { viewScale, viewX, viewY } = await getView(page);
    const canvasWidth = await page.evaluate(
      () => (window as any).__editorStore.getState().canvas.width as number,
    );
    const s = box.width / canvasWidth; // display scale
    return { x: ((p.x - box.x) / s - viewX) / viewScale, y: ((p.y - box.y) / s - viewY) / viewScale };
  }

  test('the point between the fingers stays put, including on a second pinch elsewhere', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const s = (window as any).__editorStore.getState();
      s.addText();
      s.stopEditingText();
      s.select(null);
    });
    const box = (await page.locator('.konvajs-content').boundingBox())!;
    const A = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.4 };
    const B = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.65 };

    // First pinch, from the neutral view: anchored on the fingers (it used to
    // anchor on a point offset by the stage's position inside its wrapper).
    const aBefore = await contentUnder(page, A);
    await pinch(page, A, { startSpread: 30, endSpread: 80 });
    expect((await getView(page)).viewScale).toBeGreaterThan(1.5);
    const aAfter = await contentUnder(page, A);
    expect(Math.abs(aAfter.x - aBefore.x)).toBeLessThan(3);
    expect(Math.abs(aAfter.y - aBefore.y)).toBeLessThan(3);

    // Second pinch somewhere else, from an already-zoomed view.
    const bBefore = await contentUnder(page, B);
    await pinch(page, B, { startSpread: 30, endSpread: 60 });
    const bAfter = await contentUnder(page, B);
    expect(Math.abs(bAfter.x - bBefore.x)).toBeLessThan(3);
    expect(Math.abs(bAfter.y - bBefore.y)).toBeLessThan(3);
  });
});

test.describe('phone editing flow', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__editorStore);
  });

  test('touch controls are finger-sized, and fields are 16px so iOS does not zoom', async ({ page }) => {
    for (const sel of ['.toolbar-tools-toggle', '.toolbar-overflow-toggle', '.toolbar-export']) {
      const box = (await page.locator(sel).boundingBox())!;
      expect(box.height, sel).toBeGreaterThanOrEqual(44);
      expect(box.width, sel).toBeGreaterThanOrEqual(44);
    }
    await page.locator('.toolbar-tools-toggle').click();
    const fontSize = await page
      .locator('.command-search-input')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
  });

  test('selecting a photo swaps the strip for its actions without moving the canvas', async ({ page }) => {
    const id = await addImage(page);
    await addImage(page);
    await act(page, `s.applyLayout({ type: 'grid' }); s.select(null)`);
    await expect(page.locator('.thumb-strip')).toBeVisible();
    const before = (await page.locator('.konvajs-content').boundingBox())!;

    await act(page, `s.select('${id}')`);
    const bar = page.locator('.selection-bar');
    await expect(bar).toBeVisible();
    await expect(page.locator('.thumb-strip')).toBeHidden();
    const after = (await page.locator('.konvajs-content').boundingBox())!;
    expect(after.y).toBeCloseTo(before.y, 0);

    await bar.getByRole('button', { name: 'Crop' }).click();
    expect(await state(page, 's.croppingId')).toBe(id);
    await bar.getByRole('button', { name: 'Done' }).click();
    expect(await state(page, 's.croppingId')).toBeNull();

    // Adjust opens the sheet at the photo's Enhance panel...
    await bar.getByRole('button', { name: 'Adjust' }).click();
    await expect(page.locator('.inspector')).toHaveClass(/is-open/);
    await expect(page.locator('.panel-toggle', { hasText: 'Enhance & Adjust' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    // ...scrolled so its heading sits just under the sheet's header, not past it.
    await expect
      .poll(async () => {
        const head = (await page.locator('.inspector-drawer-head').boundingBox())!;
        const panel = (await page.locator('[data-panel-title="Enhance & Adjust"]').boundingBox())!;
        return Math.round(panel.y - (head.y + head.height));
      })
      .toBeGreaterThanOrEqual(-2);

    await page.locator('.inspector-close').click();
    await bar.getByRole('button', { name: 'Delete' }).click();
    expect(await state(page, 's.items.length')).toBe(1);
  });

  test('text is edited in a docked field: 16px, Enter makes a new line, one undo step', async ({ page }) => {
    await addTextFromMenu(page);
    const input = page.locator('.text-edit-dock-input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    expect(await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);

    await input.fill('');
    await input.pressSequentially('Line one');
    await page.keyboard.press('Enter');
    await input.pressSequentially('Line two');
    // the canvas follows along while typing
    expect(await state(page, 's.items[0].text')).toBe('Line one\nLine two');
    await page.locator('.text-edit-dock').getByRole('button', { name: 'Done' }).click();
    await expect(input).toBeHidden();

    expect(await state(page, 's.historyLabels.slice(-2)')).toEqual(['Add text', 'Edit text']);
    await act(page, 's.undo()');
    expect(await state(page, 's.items[0].text')).toBe('Your text');
  });

  test('Cancel in the text dock restores the original text and records nothing', async ({ page }) => {
    await addTextFromMenu(page);
    const input = page.locator('.text-edit-dock-input');
    await input.fill('Something else');
    await page.locator('.text-edit-dock').getByRole('button', { name: 'Cancel' }).click();
    expect(await state(page, 's.items[0].text')).toBe('Your text');
    expect(await state(page, 's.historyLabels')).toEqual(['Add text']);
  });

  test('a pinch can start in the margin, and the Fit chip undoes it', async ({ page }) => {
    await addImage(page);
    await act(page, `s.applyLayout({ type: 'grid' }); s.select(null)`);
    const stage = (await page.locator('.konvajs-content').boundingBox())!;
    const area = (await page.locator('.canvas-area').boundingBox())!;
    // Below the stage, inside the canvas area: grey margin, not canvas.
    const margin = { x: area.x + area.width / 2, y: (stage.y + stage.height + area.y + area.height) / 2 };
    expect(margin.y).toBeGreaterThan(stage.y + stage.height);
    await pinch(page, margin, { startSpread: 30, endSpread: 90 });
    expect((await getView(page)).viewScale).toBeGreaterThan(1.5);

    const fit = page.locator('.fit-chip');
    await expect(fit).toBeVisible();
    await fit.click();
    expect(await getView(page)).toEqual({ viewScale: 1, viewX: 0, viewY: 0 });
    await expect(fit).toBeHidden();
  });

  test('releasing a pinch over an item does not select it', async ({ page }) => {
    await act(page, 's.addText(); s.stopEditingText(); s.select(null)');
    const { box, scale } = await stageGeometry(page);
    const t = await state<{ x: number; y: number; width: number }>(page, 's.items[0]');
    // Fingers either side of the text box's centre line, both on the text.
    const c = { x: box.x + (t.x + t.width / 2) * scale, y: box.y + (t.y + 30) * scale };
    await pinch(page, c, { startSpread: 20, endSpread: 50 });
    expect((await getView(page)).viewScale).toBeGreaterThan(1.5);
    expect(await state(page, 's.selectedId')).toBeNull();
  });

  test('Clear canvas needs no confirmation and can be undone from the toast', async ({ page }) => {
    await addImage(page);
    await addImage(page);
    await page.locator('.toolbar-overflow-toggle').click();
    await page.locator('.overflow-menu').getByText('Clear canvas').click();
    expect(await state(page, 's.items.length')).toBe(0);
    await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
    expect(await state(page, 's.items.length')).toBe(2);
  });
});

test.describe('landscape phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('gets the compact layout, with tools as a side panel beside the canvas', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.toolbar-secondary')).toBeHidden();
    await expect(page.locator('.toolbar-tools-toggle')).toBeVisible();
    await expect(page.locator('.status-bar')).toBeHidden();

    await page.locator('.toolbar-tools-toggle').click();
    const sheet = page.locator('.inspector');
    await expect(sheet).toHaveClass(/is-open/);
    await expect(page.locator('.sheet-expand')).toBeHidden();
    await expect
      .poll(async () => {
        const canvas = (await page.locator('.canvas-area').boundingBox())!;
        const panel = (await sheet.boundingBox())!;
        return canvas.x + canvas.width - panel.x;
      })
      .toBeLessThanOrEqual(1);
  });
});
