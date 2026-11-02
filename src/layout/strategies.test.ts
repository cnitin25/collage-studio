import { describe, expect, it } from 'vitest';
import { computeLayout, gridLayout, justifiedLayout, masonryLayout, mosaicLayout, spotlightLayout } from './strategies';
import { suggestLayouts } from './suggest';
import type { LayoutOptions, LayoutSpec, Rect } from './types';

const EPS = 1e-6;
const square: LayoutOptions = { canvasWidth: 1080, canvasHeight: 1080, margin: 24, gutter: 12, padding: 0 };
const story: LayoutOptions = { canvasWidth: 1080, canvasHeight: 1920, margin: 40, gutter: 20, padding: 0 };
const wide: LayoutOptions = { canvasWidth: 1920, canvasHeight: 1080, margin: 0, gutter: 8, padding: 0 };

/** Mixed portrait, landscape and square photos, deterministic. */
const aspects = (n: number) => Array.from({ length: n }, (_, i) => [1.5, 0.75, 1, 1.78, 0.56, 1.33][i % 6]);

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;
/** At least `gap` of clear space between two cells, along either axis. */
const apart = (a: Rect, b: Rect, gap: number) =>
  right(a) + gap <= b.x + EPS || right(b) + gap <= a.x + EPS || bottom(a) + gap <= b.y + EPS || bottom(b) + gap <= a.y + EPS;

const SPECS: LayoutSpec[] = [
  { type: 'grid' },
  { type: 'grid', cols: 4 },
  { type: 'justified' },
  { type: 'mosaic' },
  { type: 'masonry' },
  { type: 'masonry', cols: 2 },
  { type: 'spotlight' },
  { type: 'spotlight', heroIndex: 2 },
];

describe.each(SPECS)('$type layout (cols $cols, hero $heroIndex)', (spec) => {
  describe.each([
    ['square', square],
    ['story', story],
    ['wide, no margin', wide],
  ] as const)('on a %s canvas', (_, opts) => {
    it.each([1, 2, 3, 5, 8, 13])('places %i photos inside the margins, never closer than the spacing', (n) => {
      const rects = computeLayout(aspects(n), spec, opts);
      expect(rects).toHaveLength(n);
      for (const r of rects) {
        expect(r.width).toBeGreaterThan(0);
        expect(r.height).toBeGreaterThan(0);
        expect(r.x).toBeGreaterThanOrEqual(opts.margin - EPS);
        expect(r.y).toBeGreaterThanOrEqual(opts.margin - EPS);
        expect(right(r)).toBeLessThanOrEqual(opts.canvasWidth - opts.margin + EPS);
        expect(bottom(r)).toBeLessThanOrEqual(opts.canvasHeight - opts.margin + EPS);
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) expect(apart(rects[i], rects[j], opts.gutter), `cells ${i} and ${j}`).toBe(true);
      }
    });
  });
});

describe('every layout', () => {
  it('returns nothing for no photos', () => {
    for (const spec of SPECS) expect(computeLayout([], spec, square)).toEqual([]);
  });

  it('dispatches on the spec, passing columns and the hero through', () => {
    const a = aspects(7);
    expect(computeLayout(a, { type: 'grid', cols: 3 }, square)).toEqual(gridLayout(a, square, 3));
    expect(computeLayout(a, { type: 'masonry', cols: 3 }, square)).toEqual(masonryLayout(a, square, 3));
    expect(computeLayout(a, { type: 'spotlight', heroIndex: 4 }, square)).toEqual(spotlightLayout(a, square, 4));
  });
});

describe('grid', () => {
  it('gives every cell the same size and centres a short last row', () => {
    const rects = gridLayout(aspects(5), square, 3);
    expect(new Set(rects.map((r) => `${r.width}x${r.height}`)).size).toBe(1);
    const last = rects.slice(3);
    const rowLeft = last[0].x - square.margin;
    const rowRight = square.canvasWidth - square.margin - right(last[1]);
    expect(rowLeft).toBeCloseTo(rowRight, 6);
  });
});

describe('justified', () => {
  it('fills the full width on every row and the full height overall', () => {
    const rects = justifiedLayout(aspects(9), story);
    const rows = new Map<number, Rect[]>();
    for (const r of rects) rows.set(Math.round(r.y), [...(rows.get(Math.round(r.y)) ?? []), r]);
    for (const row of rows.values()) {
      expect(Math.min(...row.map((r) => r.x))).toBeCloseTo(story.margin, 6);
      expect(Math.max(...row.map(right))).toBeCloseTo(story.canvasWidth - story.margin, 6);
    }
    expect(Math.max(...rects.map(bottom))).toBeCloseTo(story.canvasHeight - story.margin, 6);
  });

  it('keeps photo order left to right, top to bottom', () => {
    const rects = justifiedLayout(aspects(9), story);
    for (let i = 1; i < rects.length; i++) {
      const sameRow = Math.abs(rects[i].y - rects[i - 1].y) < EPS;
      expect(sameRow ? rects[i].x > rects[i - 1].x : rects[i].y > rects[i - 1].y).toBe(true);
    }
  });
});

describe('mosaic', () => {
  it('covers the whole content area, less the gaps', () => {
    const rects = mosaicLayout(aspects(7), square);
    const contentW = square.canvasWidth - 2 * square.margin;
    const area = rects.reduce((sum, r) => sum + r.width * r.height, 0);
    expect(Math.min(...rects.map((r) => r.x))).toBeCloseTo(square.margin, 6);
    expect(Math.max(...rects.map(right))).toBeCloseTo(square.canvasWidth - square.margin, 6);
    expect(Math.max(...rects.map(bottom))).toBeCloseTo(square.canvasHeight - square.margin, 6);
    expect(area).toBeLessThan(contentW * contentW);
    expect(area).toBeGreaterThan(contentW * contentW * 0.9);
  });
});

describe('masonry', () => {
  it('uses equal columns, keeps each photo’s shape, and fits the tallest column exactly', () => {
    const a = aspects(8);
    const rects = masonryLayout(a, story, 3);
    expect(new Set(rects.map((r) => r.width.toFixed(6))).size).toBe(1);
    const columns = new Map<number, Rect[]>();
    for (const r of rects) columns.set(Math.round(r.x), [...(columns.get(Math.round(r.x)) ?? []), r]);
    expect(columns.size).toBe(3);
    expect(Math.max(...rects.map(bottom))).toBeCloseTo(story.canvasHeight - story.margin, 6);
    for (const col of columns.values()) {
      // Gaps down a column equal the spacing across columns.
      for (let i = 1; i < col.length; i++) expect(col[i].y - bottom(col[i - 1])).toBeCloseTo(story.gutter, 6);
    }
  });

  it('gives a single photo the whole content area', () => {
    expect(masonryLayout([1.5], square)).toEqual([{ x: 24, y: 24, width: 1032, height: 1032 }]);
  });
});

describe('spotlight', () => {
  it('makes the hero the largest cell, beside the grid on a wide canvas and above it on a tall one', () => {
    for (const [opts, side] of [
      [wide, 'left'],
      [story, 'top'],
    ] as const) {
      const rects = spotlightLayout(aspects(5), opts, 3);
      const areas = rects.map((r) => r.width * r.height);
      expect(Math.max(...areas)).toBe(areas[3]);
      if (side === 'left') expect(rects[3].height).toBeCloseTo(opts.canvasHeight - 2 * opts.margin, 6);
      else expect(rects[3].width).toBeCloseTo(opts.canvasWidth - 2 * opts.margin, 6);
    }
  });

  it('clamps an out-of-range hero to a real photo', () => {
    expect(spotlightLayout(aspects(3), square, 99)).toEqual(spotlightLayout(aspects(3), square, 2));
  });
});

describe('suggestLayouts', () => {
  it('needs at least two photos', () => {
    expect(suggestLayouts([1.5], square)).toEqual([]);
  });

  it('ranks by how little of the photos is cropped, best first', () => {
    const out = suggestLayouts(aspects(6), square, 10);
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    for (const s of out) {
      expect(s.score).toBeGreaterThan(0);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it('scores a perfect fit as 1: square photos in a square grid', () => {
    const [best] = suggestLayouts([1, 1, 1, 1], square);
    expect(best.score).toBeCloseTo(1, 6);
  });

  it('returns at most the number asked for', () => {
    expect(suggestLayouts(aspects(6), square, 2)).toHaveLength(2);
  });
});
