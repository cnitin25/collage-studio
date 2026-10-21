import { test, expect, type Page } from '@playwright/test';
import { state } from './helpers';

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

async function scrollInspectorToEnd(page: Page) {
  await page.locator('.inspector').evaluate((el) => (el.scrollTop = el.scrollHeight));
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
    await scrollInspectorToEnd(page);
    await expectSearchPinned(page);
    const footer = (await page.locator('.inspector-modes').boundingBox())!;
    const sheet = (await page.locator('.inspector').boundingBox())!;
    expect(footer.y + footer.height).toBeGreaterThan(sheet.y + sheet.height - 2);
  });
});
