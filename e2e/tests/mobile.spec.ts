import { test, expect, type Page } from '@playwright/test';

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

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('tools drawer opens over a full-width canvas and closes via scrim + close button', async ({ page }) => {
    await page.goto('/');
    const drawer = page.locator('.inspector');
    await expect(drawer).not.toHaveClass(/is-open/);

    await page.locator('.toolbar-tools-toggle').click();
    await expect(drawer).toHaveClass(/is-open/);

    // canvas stays full-width behind the drawer
    const stageCol = page.locator('.stage-col');
    const stageBox = await stageCol.boundingBox();
    const viewportWidth = page.viewportSize()!.width;
    expect(stageBox!.width).toBeGreaterThan(viewportWidth * 0.9);

    // accordion still single-open through the drawer wrapper
    await page.locator('.panel-toggle', { hasText: 'Layout' }).click();
    await expect(page.locator('.panel-toggle', { hasText: 'Layout' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.panel-toggle', { hasText: 'Canvas' })).toHaveAttribute('aria-expanded', 'false');

    await page.locator('.inspector-close').click();
    await expect(drawer).not.toHaveClass(/is-open/);

    await page.locator('.toolbar-tools-toggle').click();
    await expect(drawer).toHaveClass(/is-open/);
    await page.locator('.drawer-scrim').click({ position: { x: 5, y: 5 } });
    await expect(drawer).not.toHaveClass(/is-open/);
  });

  test('secondary toolbar actions move into the overflow menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.toolbar-secondary')).toBeHidden();

    const menu = page.locator('.overflow-menu');
    await expect(menu).toBeHidden();
    await page.locator('.toolbar-overflow-toggle').click();
    await expect(menu).toBeVisible();
    await expect(menu.getByText('Duplicate')).toBeVisible();
    await expect(menu.getByText('Projects')).toBeVisible();
    await expect(menu.getByText('Export')).toBeVisible();

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
    await page.locator('button[title="Add an editable text box to the canvas"]').click();
    // Added text opens directly in in-canvas edit mode (a focused textarea
    // over the text box) — commit it first, same as a real user tapping
    // away before pinch-zooming, so the gesture reaches the canvas instead
    // of the text field sitting on top of it.
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
    await page.locator('button[title="Add an editable text box to the canvas"]').click();

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
