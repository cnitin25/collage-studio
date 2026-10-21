import { test, expect, type Page } from '@playwright/test';
import { act, addImage, state } from './helpers';

// Phone tools sheet: swiping to scroll must never change a slider, and the
// pane has an always-visible scrollbar that can be dragged.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** A real single-finger touch drag via CDP (page.touchscreen only taps). */
async function swipe(page: Page, from: { x: number; y: number }, dx: number, dy: number, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }],
    });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).__editorStore);
  const id = await addImage(page);
  await addImage(page);
  await act(page, `s.applyLayout({ type: 'grid' }); s.select('${id}')`);
  await page.locator('.toolbar-tools-toggle').click();
  await page.locator('.nav-item', { hasText: 'Photo' }).click();
  await page.waitForTimeout(400);
});

const firstSlider = (page: Page) => page.locator('.inspector-pane .slider').first();
const pane = (page: Page) => page.locator('.inspector-pane');

test('a vertical swipe that starts on a slider scrolls, and leaves the value alone', async ({ page }) => {
  const input = firstSlider(page).locator('input[type=range]');
  const box = (await input.boundingBox())!;
  const before = await input.inputValue();
  const history = await state<number>(page, 's.historyLabels.length');
  // Start well away from the thumb: a native range input would jump there.
  await swipe(page, { x: box.x + box.width * 0.85, y: box.y + box.height / 2 }, 4, -150);
  expect(await input.inputValue()).toBe(before);
  expect(await state(page, 's.historyLabels.length')).toBe(history);
  expect(await pane(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
});

test('a sideways drag adjusts the slider from where it was, as one undo step', async ({ page }) => {
  const input = firstSlider(page).locator('input[type=range]');
  const box = (await input.boundingBox())!;
  const [min, max] = await input.evaluate((el: HTMLInputElement) => [Number(el.min), Number(el.max)]);
  const before = Number(await input.inputValue());
  const history = await state<number>(page, 's.historyLabels.length');
  // A quarter of the track to the right, starting near its left end — far
  // from the thumb, which a native input would have jumped to instead.
  await swipe(page, { x: box.x + box.width * 0.1, y: box.y + box.height / 2 }, box.width * 0.25, 2);
  const after = Number(await input.inputValue());
  const expected = Math.min(max, before + (max - min) * 0.25);
  expect(Math.abs(after - expected)).toBeLessThan((max - min) * 0.05);
  expect(await state(page, 's.historyLabels.length')).toBe(history + 1);
});

test('tapping a slider track changes nothing', async ({ page }) => {
  const input = firstSlider(page).locator('input[type=range]');
  const box = (await input.boundingBox())!;
  const before = await input.inputValue();
  await page.touchscreen.tap(box.x + box.width * 0.9, box.y + box.height / 2);
  expect(await input.inputValue()).toBe(before);
});

test('the pane has an always-visible scrollbar whose thumb can be dragged', async ({ page }) => {
  const rail = page.locator('.scroll-rail');
  const thumb = page.locator('.scroll-rail-thumb');
  await expect(rail).toBeVisible();
  await expect(thumb).toBeVisible(); // before any scrolling, not only during it
  const railBox = (await rail.boundingBox())!;
  expect(railBox.width).toBeGreaterThanOrEqual(24);
  // It sits beside the pane, not over its controls.
  const paneBox = (await pane(page).boundingBox())!;
  expect(railBox.x).toBeGreaterThanOrEqual(paneBox.x + paneBox.width - 1);

  const t = (await thumb.boundingBox())!;
  await swipe(page, { x: t.x + t.width / 2, y: t.y + t.height / 2 }, 0, railBox.height - t.height);
  const { scrollTop, max } = await pane(page).evaluate((el) => ({
    scrollTop: el.scrollTop,
    max: el.scrollHeight - el.clientHeight,
  }));
  expect(scrollTop).toBeGreaterThan(max * 0.9); // dragged to the end
  const moved = (await thumb.boundingBox())!;
  expect(moved.y + moved.height).toBeGreaterThan(railBox.y + railBox.height - 4);
});

test('tapping the scrollbar track jumps there', async ({ page }) => {
  const railBox = (await page.locator('.scroll-rail').boundingBox())!;
  await page.touchscreen.tap(railBox.x + railBox.width / 2, railBox.y + railBox.height * 0.75);
  const { scrollTop, max } = await pane(page).evaluate((el) => ({
    scrollTop: el.scrollTop,
    max: el.scrollHeight - el.clientHeight,
  }));
  expect(scrollTop).toBeGreaterThan(max * 0.4);
});
