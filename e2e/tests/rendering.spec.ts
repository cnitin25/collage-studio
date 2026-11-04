import { test, expect } from '@playwright/test';
import { act, addImage, analyzeExport, exportImage, state } from './helpers';

// What the export draws must match the controls: border widths, gaps between
// photos, and what shows through a translucent photo.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

test('a photo whose image fails to load is marked on the canvas, and the mark stays out of exports', async ({ page }) => {
  const id = await addImage(page, 'solid', 1200, 900, '#00ff00');
  await act(page, `s.applyLayout({ type: 'grid' }); s.setBackground({ backgroundType: 'color', backgroundColor: '#ff00ff' })`);
  await act(page, `s.updateItem('${id}', { src: 'blob:http://localhost:5173/gone' })`);
  await expect
    .poll(() => page.evaluate(() => window.Konva.stages[0].find('.missing-photo').length))
    .toBe(1);
  const b = await state<{ x: number; y: number; width: number; height: number }>(page, 's.items[0]');
  const centre = await analyzeExport(
    page,
    await exportImage(page, 'png', 1),
    (px, _w, _h, b) => px(b.x + b.width / 2, b.y + b.height / 2).slice(0, 3),
    b,
  );
  // The background shows where the photo was: no photo, and no placeholder either.
  expect(centre).toEqual([255, 0, 255]);
});

test('the collage frame border is its full width on every side and round the corners', async ({ page }) => {
  await addImage(page, 'solid', 400, 400);
  for (const radius of [0, 200]) {
    await act(
      page,
      `s.setBackground({ backgroundType: 'color', backgroundColor: '#0000ff', frameBorderColor: '#ff0000', frameBorderWidth: 40, frameCornerRadius: ${radius} })`,
    );
    const download = await exportImage(page, 'png', 1);
    const { edge, corner } = await analyzeExport(page, download, (px, w) => {
      const red = (x: number, y: number) => {
        const [r, g, b, a] = px(x, y);
        return r > 200 && g < 70 && b < 70 && a > 200;
      };
      let edge = 0;
      while (red(Math.floor(w / 2), edge)) edge++;
      let diag = 0;
      for (let t = 0; t < 300; t++) if (red(t, t)) diag++;
      return { edge, corner: diag * Math.SQRT2 };
    });
    expect(edge, `top edge, radius ${radius}`).toBeGreaterThanOrEqual(39);
    expect(edge, `top edge, radius ${radius}`).toBeLessThanOrEqual(41);
    if (radius > 0) expect(Math.abs(corner - 40), 'across the rounded corner').toBeLessThan(4);
  }
});

test('a photo border sits inside the photo, so the spacing between photos stays visible', async ({ page }) => {
  await addImage(page, 'solid');
  await addImage(page, 'solid');
  await act(
    page,
    `s.setBackground({ backgroundType: 'color', backgroundColor: '#0000ff' });
     s.applyLayout({ type: 'grid', cols: 2 });
     s.setSpacingLive({ margin: 0, gutter: 12, padding: 0 });
     s.select(s.items[0].id); s.applyFrame('matte'); s.applyStyleToAllPhotos()`,
  );
  const y = await state<number>(page, 'Math.round(s.items[0].y + s.items[0].height / 5)');
  const download = await exportImage(page, 'png', 1);
  // Run-length encode one row into white (matte), green (photo) and blue (background).
  const runs = await analyzeExport(
    page,
    download,
    (px, w, _h, y) => {
      const kind = (x: number) => {
        const [r, g, b] = px(x, y);
        if (r > 200 && g > 200 && b > 200) return 'W';
        if (g > 200 && r < 80 && b < 80) return 'G';
        if (b > 200 && r < 80 && g < 80) return 'B';
        return '?';
      };
      const out: [string, number][] = [];
      for (let x = 0; x < w; x++) {
        const k = kind(x);
        if (k === '?') continue;
        const last = out[out.length - 1];
        if (last && last[0] === k) last[1]++;
        else out.push([k, 1]);
      }
      return out;
    },
    y,
  );
  expect(runs.map(([k]) => k).join('')).toBe('WGWBWGW');
  // ±2 px: the export scale (1 / display scale) is never exactly 1, so cell
  // edges land between pixels and blend — those pixels are skipped above.
  const [leftEdge, , mid1, gap, mid2, , rightEdge] = runs.map(([, n]) => n);
  for (const matte of [leftEdge, mid1, mid2, rightEdge]) expect(Math.abs(matte - 18), 'matte width').toBeLessThanOrEqual(2);
  expect(Math.abs(gap - 12), 'spacing between photos').toBeLessThanOrEqual(2);
});

test("lowering a photo's opacity shows what is behind it, not its shadow caster", async ({ page }) => {
  const id = await addImage(page, 'solid', 600, 600, '#ff0000');
  await act(page, `s.setBackground({ backgroundType: 'color', backgroundColor: '#0000ff' }); s.select('${id}'); s.applyFrame('soft')`);
  const it = await state<{ x: number; y: number; width: number; height: number }>(page, 's.items[0]');
  const points = { cx: it.x + it.width / 2, cy: it.y + it.height / 2, below: it.y + it.height + 8 };
  const sample = async (opacity: number) => {
    await act(page, `s.updateItem('${id}', { opacity: ${opacity} })`);
    const download = await exportImage(page, 'png', 1);
    return analyzeExport(page, download, (px, _w, _h, p) => ({ centre: px(p.cx, p.cy), below: px(p.cx, p.below) }), points);
  };

  expect((await sample(0)).centre.slice(0, 3), 'invisible photo: just the background').toEqual([0, 0, 255]);
  expect((await sample(50)).centre[1], 'half-transparent red over blue: no white mixed in').toBeLessThan(40);
  const opaque = await sample(100);
  expect(opaque.centre.slice(0, 3)).toEqual([255, 0, 0]);
  expect(opaque.below[2], 'the shadow still falls below the photo').toBeLessThan(235);
});

test('masonry keeps the spacing the same down a column as across it', async ({ page }) => {
  const result = await page.evaluate(async () => {
    // Indirect import: the test runner must not rewrite a browser-side import().
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const load = new Function('path', 'return import(path)') as (
      p: string,
    ) => Promise<typeof import('../../src/layout/strategies')>;
    const { masonryLayout } = await load('/src/layout/strategies.ts');
    const rects = masonryLayout(
      [1, 0.5, 2, 1.5, 0.8, 1.2],
      { canvasWidth: 1080, canvasHeight: 1080, margin: 24, gutter: 40, padding: 0 },
      2,
    );
    const columns = new Map<number, typeof rects>();
    for (const r of rects) columns.set(Math.round(r.x), [...(columns.get(Math.round(r.x)) ?? []), r]);
    const vertical: number[] = [];
    for (const col of columns.values()) {
      col.sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i++) vertical.push(col[i].y - (col[i - 1].y + col[i - 1].height));
    }
    const [left, right] = [...columns.keys()].sort((a, b) => a - b);
    return {
      vertical,
      horizontal: right - (left + columns.get(left)![0].width),
      bottom: Math.max(...rects.map((r) => r.y + r.height)),
    };
  });
  for (const gap of result.vertical) expect(gap).toBeCloseTo(40, 0);
  expect(result.horizontal).toBeCloseTo(40, 0);
  expect(result.bottom, 'the tallest column still reaches the bottom margin').toBeCloseTo(1080 - 24, 0);
});

test('a frame preset replaces a glyph border with its own solid one', async ({ page }) => {
  const id = await addImage(page);
  await act(page, `s.select('${id}'); s.updateItem('${id}', { borderStyle: 'glyph', borderGlyph: '★', borderWidth: 6 }); s.applyFrame('matte')`);
  expect(await state(page, '[s.items[0].borderStyle, s.items[0].borderWidth]')).toEqual(['solid', 18]);
});
