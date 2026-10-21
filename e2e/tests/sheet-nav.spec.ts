import { test, expect, type Page } from '@playwright/test';
import { act, addImage } from './helpers';

// Phone tools sheet: a rail of section groups on the left, the picked
// group's panels scrolling on the right. Desktop keeps its accordion.

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

async function setup(page: Page, select = true) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__editorStore);
  const id = await addImage(page);
  await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' }); s.select(${select ? `'${id}'` : 'null'})`);
}

const titlesIn = (page: Page, scope: string) =>
  page.locator(`${scope} [data-panel-title]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-panel-title')!));

test('every desktop section is reachable from exactly one rail item', async ({ browser }) => {
  const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await setup(desk);
  const desktopTitles = await titlesIn(desk, '.inspector');
  expect(desktopTitles.length).toBeGreaterThan(8);

  const ctx = await browser.newContext(PHONE);
  const phone = await ctx.newPage();
  await setup(phone);
  await phone.locator('.toolbar-tools-toggle').click();
  const seen: string[] = [];
  for (const item of await phone.locator('.nav-item').all()) {
    await item.click();
    seen.push(...(await titlesIn(phone, '.inspector-pane')));
  }
  expect([...seen].sort()).toEqual([...desktopTitles].sort()); // all of them, none twice
  await ctx.close();
  await desk.close();
});

test.describe('phone', () => {
  test.use(PHONE);

  test('all seven rail items fit the half-height sheet without scrolling', async ({ page }) => {
    await setup(page);
    await page.locator('.toolbar-tools-toggle').click();
    await expect(page.locator('.inspector')).not.toHaveClass(/is-expanded/);
    const nav = page.locator('.inspector-nav');
    await expect(page.locator('.nav-item')).toHaveCount(7);
    const { scrollHeight, clientHeight } = await nav.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight + 1);
    await expect(page.locator('.nav-item', { hasText: 'History' })).toBeInViewport({ ratio: 1 });
  });

  test('the photo item is dimmed with a hint until something is selected', async ({ page }) => {
    await setup(page, false);
    await page.locator('.toolbar-tools-toggle').click();
    const photo = page.locator('.nav-item', { hasText: 'Photo' });
    await expect(photo).toHaveClass(/is-unavailable/);
    await photo.click();
    await expect(page.locator('.nav-empty')).toBeVisible();
    await expect(page.locator('.inspector-pane [data-panel-title]')).toHaveCount(0);

    await act(page, `s.select(s.items[0].id)`);
    await expect(photo).not.toHaveClass(/is-unavailable/);
    await expect(page.locator('.nav-empty')).toHaveCount(0);
    await expect(page.locator('.inspector-pane [data-panel-title="Enhance & Adjust"]')).toBeVisible();
  });

  test('the pane scrolls on its own, and a new section starts at its top', async ({ page }) => {
    await setup(page);
    await page.locator('.toolbar-tools-toggle').click();
    await page.locator('.nav-item', { hasText: 'Photo' }).click();
    const pane = page.locator('.inspector-pane');
    const railBefore = (await page.locator('.inspector-nav').boundingBox())!;
    await pane.evaluate((el) => (el.scrollTop = el.scrollHeight));
    expect(await pane.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    expect((await page.locator('.inspector-nav').boundingBox())!.y).toBeCloseTo(railBefore.y, 0);
    expect(await page.locator('.inspector').evaluate((el) => el.scrollTop)).toBe(0);

    await page.locator('.nav-item', { hasText: 'Layout' }).click();
    expect(await pane.evaluate((el) => el.scrollTop)).toBe(0);
  });

  test("the selection bar's Crop opens the sheet at the crop controls, photo still in view", async ({ page }) => {
    await setup(page);
    const id = await page.evaluate(() => (window as any).__editorStore.getState().selectedId);
    await page.locator('.selection-bar').getByRole('button', { name: 'Crop' }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__editorStore.getState().croppingId)).toBe(id);
    await expect(page.locator('.inspector')).toHaveClass(/is-open/);
    await expect(page.locator('.nav-item', { hasText: 'Photo' })).toHaveAttribute('aria-current', 'page');
    // Scrolled past Size to the Crop controls, with Zoom on screen.
    await expect
      .poll(async () => {
        const pane = (await page.locator('.inspector-pane').boundingBox())!;
        const crop = (await page.locator('[data-panel-anchor="crop"]').boundingBox())!;
        const offset = Math.round(crop.y - pane.y);
        return offset >= -2 && offset < 40;
      })
      .toBe(true);
    await expect(page.locator('[data-panel-title="Crop and Arrange"]').getByRole('slider', { name: 'Zoom' })).toBeInViewport();
    // The half-height sheet leaves the canvas above it to drag the photo.
    const canvas = (await page.locator('.konvajs-content').boundingBox())!;
    const sheet = (await page.locator('.inspector').boundingBox())!;
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(sheet.y + 1);
  });

  test('sections show as plain headings, with no collapse toggles', async ({ page }) => {
    await setup(page);
    await page.locator('.toolbar-tools-toggle').click();
    await expect(page.locator('.inspector-pane .panel-toggle')).toHaveCount(0);
    await expect(page.locator('.inspector-pane .panel-title', { hasText: 'Canvas' })).toBeVisible();
  });
});

test.describe('landscape phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('the side panel has the rail beside the scrolling pane', async ({ page }) => {
    await setup(page);
    await page.locator('.toolbar-tools-toggle').click();
    await page.waitForTimeout(350); // after the slide-in, so both boxes are measured at rest
    const rail = (await page.locator('.inspector-nav').boundingBox())!;
    const pane = (await page.locator('.inspector-pane').boundingBox())!;
    expect(rail.x + rail.width).toBeLessThanOrEqual(pane.x + 1);
    expect(pane.width).toBeGreaterThan(230);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keeps the accordion, with no rail', async ({ page }) => {
    await setup(page);
    await expect(page.locator('.inspector-nav')).toBeHidden();
    await expect(page.locator('.panel-toggle', { hasText: 'Layout' })).toBeVisible();
    await page.locator('.panel-toggle', { hasText: 'Layout' }).click();
    await expect(page.locator('.panel-toggle', { hasText: 'Layout' })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.panel-toggle', { hasText: 'Canvas' })).toHaveAttribute('aria-expanded', 'false');
  });
});
