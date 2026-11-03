import { test, expect, type Page } from '@playwright/test';
import { act, analyzeExport, exportImage, state } from './helpers';

// Text effects — outline, shadow, highlight, letter and line spacing — and
// opacity for text and stickers, checked in the exported image.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

/** "HELLO" in black, 160 px, centred in an 800 px box on a white canvas; `patch` adds to it. */
async function addHello(page: Page, patch = '') {
  await act(page, `s.setBackground({ backgroundType: 'color', backgroundColor: '#ffffff' }); s.addText(); s.stopEditingText()`);
  const id = await state<string>(page, 's.items[0].id');
  await act(
    page,
    `s.updateItem('${id}', { text: 'HELLO', fontSize: 160, fill: '#000000', x: 140, y: 400, width: 800, align: 'center', ${patch} }); s.select(null)`,
  );
  // Until its font has loaded, the text is measured in a fallback and measured
  // again once it's in (TextNode): measure after that, not before.
  await page.waitForFunction(() => document.fonts.check('160px Inter'));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  return id;
}

/** Pixels of a colour in the export, counted on a 2 px grid. */
async function countColour(page: Page, test: 'red' | 'blue' | 'green') {
  const download = await exportImage(page, 'png', 1);
  return analyzeExport(
    page,
    download,
    (px, w, h, test) => {
      let n = 0;
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const [r, g, b] = px(x, y);
          const hit =
            test === 'red' ? r > 200 && g < 80 && b < 80 : test === 'blue' ? b > 200 && r < 80 && g < 80 : g > 200 && r < 80 && b < 80;
          if (hit) n++;
        }
      }
      return n;
    },
    test,
  );
}

/** Left and right edge of the dark (text) pixels across the export. */
async function inkSpan(page: Page) {
  const download = await exportImage(page, 'png', 1);
  return analyzeExport(page, download, (px, w, h) => {
    let left = w;
    let right = -1;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = px(x, y);
        if (r < 100 && g < 100 && b < 100) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    return { left, right, width: right - left };
  });
}

test('an outline goes round the letters, in its colour', async ({ page }) => {
  await addHello(page, `fill: '#ffffff', outlineColor: '#ff0000', outlineWidth: 6`);
  expect(await countColour(page, 'red')).toBeGreaterThan(500);
});

test('a shadow falls where it is set', async ({ page }) => {
  await addHello(page, `shadow: { color: '#0000ff', blur: 0, opacity: 1, offsetX: 20, offsetY: 20 }`);
  expect(await countColour(page, 'blue')).toBeGreaterThan(500);
});

test('an outline and a shadow together: the shadow stays under the outline', async ({ page }) => {
  await addHello(page, `outlineColor: '#ff0000', outlineWidth: 8, shadow: { color: '#0000ff', blur: 0, opacity: 1, offsetX: 3, offsetY: 3 }`);
  // A 3 px shadow under an 8 px outline is covered by it: very little blue.
  const red = await countColour(page, 'red');
  const blue = await countColour(page, 'blue');
  expect(red).toBeGreaterThan(500);
  expect(blue).toBeLessThan(red / 4);
});

test('a highlight is a padded box behind the lines of text, not the whole text box', async ({ page }) => {
  const id = await addHello(page, `background: { color: '#00ff00', opacity: 1, padding: 24, radius: 0 }`);
  const text = await page.evaluate((id) => {
    const K = window.Konva;
    const t = K.stages[K.stages.length - 1].findOne<import('konva/lib/shapes/Text').Text>('#' + id)!;
    return { x: t.x(), y: t.y(), boxWidth: t.width(), lineWidth: t.getTextWidth(), height: t.height() };
  }, id);
  const download = await exportImage(page, 'png', 1);
  const green = await analyzeExport(page, download, (px, w, h) => {
    let left = w, right = -1, top = h, bottom = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = px(x, y);
        if (g > 200 && r < 80 && b < 80) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    return { left, right, top, bottom };
  });
  const lineLeft = text.x + (text.boxWidth - text.lineWidth) / 2;
  expect(Math.abs(green.left - (lineLeft - 24))).toBeLessThanOrEqual(3);
  expect(Math.abs(green.right - (lineLeft + text.lineWidth + 24))).toBeLessThanOrEqual(3);
  expect(Math.abs(green.top - (text.y - 24))).toBeLessThanOrEqual(3);
  expect(Math.abs(green.bottom - (text.y + text.height + 24))).toBeLessThanOrEqual(3);
  expect(green.right - green.left, 'fits the line, not the 800 px box').toBeLessThan(text.boxWidth - 40);
});

test('letter spacing widens the text', async ({ page }) => {
  const id = await addHello(page);
  const plain = await inkSpan(page);
  await act(page, `s.updateItem('${id}', { letterSpacing: 30 })`);
  const spaced = await inkSpan(page);
  expect(spaced.width - plain.width).toBeGreaterThan(100);
});

test('line spacing spreads the lines', async ({ page }) => {
  const id = await addHello(page, `text: 'ONE\\nTWO', lineHeight: 1`);
  const height = () =>
    page.evaluate((id) => {
      const K = window.Konva;
      return K.stages[K.stages.length - 1].findOne('#' + id)!.height();
    }, id);
  const tight = await height();
  await act(page, `s.updateItem('${id}', { lineHeight: 2 })`);
  expect(await height()).toBeGreaterThan(tight * 1.8);
});

test('text and stickers can be made translucent', async ({ page }) => {
  await addHello(page, `opacity: 50`);
  const download = await exportImage(page, 'png', 1);
  const darkest = await analyzeExport(page, download, (px, w, h) => {
    let min = 255;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) min = Math.min(min, px(x, y)[0]);
    return min;
  });
  expect(darkest, 'black at 50% over white').toBeGreaterThan(110);
  expect(darkest).toBeLessThan(145);

  await act(page, `s.addSticker('⭐')`);
  const sticker = await state<string>(page, 's.items[1].id');
  await act(page, `s.updateItem('${sticker}', { opacity: 40 })`);
  expect(
    await page.evaluate((id) => {
      const K = window.Konva;
      return K.stages[K.stages.length - 1].findOne('#' + id)!.opacity();
    }, sticker),
  ).toBeCloseTo(0.4, 5);
});

test('the Text Effects panel sets them, one undo step per change', async ({ page }) => {
  const id = await addHello(page);
  await act(page, `s.select('${id}'); s.requestPanel('Text Effects')`);
  const panel = page.locator('[data-panel-title="Text Effects"]');
  await expect(panel).toBeVisible();

  const outline = panel.getByRole('slider', { name: 'Outline' });
  await outline.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await outline.blur();
  expect(await state<number>(page, 's.items[0].outlineWidth')).toBeGreaterThan(0);

  await panel.getByRole('button', { name: 'Shadow' }).click();
  expect(await state<unknown>(page, 's.items[0].shadow')).toBeTruthy();
  await panel.getByRole('button', { name: 'Highlight' }).click();
  expect(await state<unknown>(page, 's.items[0].background')).toBeTruthy();

  const before = await state<number>(page, 's.past.length');
  await act(page, 's.undo()');
  expect(await state<unknown>(page, 's.items[0].background'), 'one step undoes the highlight').toBeFalsy();
  expect(await state<number>(page, 's.past.length')).toBe(before - 1);
});

test('the Opacity slider is there for text and stickers too', async ({ page }) => {
  const id = await addHello(page);
  await act(page, `s.select('${id}'); s.requestPanel('Crop and Arrange')`);
  await expect(page.locator('[data-panel-title="Crop and Arrange"]').getByRole('slider', { name: 'Opacity' })).toBeVisible();
});
