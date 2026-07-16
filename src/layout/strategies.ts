import type { LayoutOptions, LayoutSpec, Rect } from './types';

const min1 = (n: number) => Math.max(1, n);

/** Tile `n` cells into an arbitrary rect as a uniform grid. Partial last row is centered. */
function tileGrid(rect: Rect, n: number, gutter: number, cols?: number): Rect[] {
  if (n === 0) return [];
  const c = Math.max(1, cols ?? Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / c);
  const cellW = min1((rect.width - (c - 1) * gutter) / c);
  const cellH = min1((rect.height - (rows - 1) * gutter) / rows);

  const rects: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / c);
    const col = i % c;
    const itemsInRow = row === rows - 1 ? n - row * c : c;
    const rowOffset = itemsInRow < c ? ((c - itemsInRow) * (cellW + gutter)) / 2 : 0;
    rects.push({
      x: rect.x + rowOffset + col * (cellW + gutter),
      y: rect.y + row * (cellH + gutter),
      width: cellW,
      height: cellH,
    });
  }
  return rects;
}

/** Uniform grid. Partial last row is centered. */
export function gridLayout(aspects: number[], opts: LayoutOptions, cols?: number): Rect[] {
  const n = aspects.length;
  if (n === 0) return [];
  const contentW = opts.canvasWidth - 2 * opts.margin;
  const contentH = opts.canvasHeight - 2 * opts.margin;
  return tileGrid(
    { x: opts.margin, y: opts.margin, width: contentW, height: contentH },
    n,
    opts.gutter,
    cols,
  );
}

/**
 * Justified rows (Flickr/Google-Photos style): images keep their aspect order,
 * packed into rows that fill the width; rows are then normalized vertically to
 * fill the canvas. Cells cover-crop to their final aspect.
 */
export function justifiedLayout(aspects: number[], opts: LayoutOptions): Rect[] {
  const n = aspects.length;
  if (n === 0) return [];
  const contentW = opts.canvasWidth - 2 * opts.margin;
  const contentH = opts.canvasHeight - 2 * opts.margin;
  const g = opts.gutter;

  const targetH = Math.max(40, contentH / Math.max(1, Math.round(Math.sqrt(n))));

  // Greedy row assignment.
  const rows: number[][] = [];
  let cur: number[] = [];
  for (let i = 0; i < n; i++) {
    cur.push(i);
    const arSum = cur.reduce((a, idx) => a + aspects[idx], 0);
    const rowW = arSum * targetH + (cur.length - 1) * g;
    if (rowW >= contentW) {
      rows.push(cur);
      cur = [];
    }
  }
  if (cur.length) rows.push(cur);

  // Natural height per row (height that makes the row exactly fill the width).
  const natH = rows.map((row) => {
    const arSum = row.reduce((a, idx) => a + aspects[idx], 0);
    return (contentW - (row.length - 1) * g) / Math.max(0.0001, arSum);
  });

  // Normalize heights to fill the canvas vertically.
  const sumNat = natH.reduce((a, h) => a + h, 0);
  const availH = contentH - (rows.length - 1) * g;
  const kH = sumNat > 0 ? availH / sumNat : 1;

  const rects: Rect[] = new Array(n);
  let y = opts.margin;
  rows.forEach((row, r) => {
    const h = min1(natH[r] * kH);
    const widthsNat = row.map((idx) => aspects[idx] * h);
    const sumW = widthsNat.reduce((a, w) => a + w, 0);
    const availW = contentW - (row.length - 1) * g;
    const kW = sumW > 0 ? availW / sumW : 1;
    let x = opts.margin;
    row.forEach((idx, j) => {
      const w = min1(widthsNat[j] * kW);
      rects[idx] = { x, y, width: w, height: h };
      x += w + g;
    });
    y += h + g;
  });
  return rects;
}

/**
 * Mosaic: recursively split the content rect, alternating orientation, dividing
 * by item count so cells stay roughly balanced. Always fills the whole canvas.
 */
export function mosaicLayout(aspects: number[], opts: LayoutOptions): Rect[] {
  const n = aspects.length;
  if (n === 0) return [];
  const contentW = opts.canvasWidth - 2 * opts.margin;
  const contentH = opts.canvasHeight - 2 * opts.margin;
  const rects: Rect[] = new Array(n);
  const g = opts.gutter;

  const rec = (rect: Rect, list: number[], horizontal: boolean) => {
    if (list.length === 1) {
      rects[list[0]] = { ...rect };
      return;
    }
    const mid = Math.ceil(list.length / 2);
    const a = list.slice(0, mid);
    const b = list.slice(mid);
    const fracA = a.length / list.length;
    if (horizontal) {
      const wA = min1((rect.width - g) * fracA);
      const wB = min1(rect.width - g - wA);
      rec({ x: rect.x, y: rect.y, width: wA, height: rect.height }, a, !horizontal);
      rec({ x: rect.x + wA + g, y: rect.y, width: wB, height: rect.height }, b, !horizontal);
    } else {
      const hA = min1((rect.height - g) * fracA);
      const hB = min1(rect.height - g - hA);
      rec({ x: rect.x, y: rect.y, width: rect.width, height: hA }, a, !horizontal);
      rec({ x: rect.x, y: rect.y + hA + g, width: rect.width, height: hB }, b, !horizontal);
    }
  };

  rec(
    { x: opts.margin, y: opts.margin, width: contentW, height: contentH },
    Array.from({ length: n }, (_, i) => i),
    contentW >= contentH,
  );
  return rects;
}

/**
 * Masonry (Pinterest-style): fixed-width columns, each new item goes into the
 * shortest column so far. Column widths stay uniform; heights vary with each
 * photo's own aspect ratio, then the whole thing is scaled vertically to fill
 * the canvas.
 */
export function masonryLayout(aspects: number[], opts: LayoutOptions, cols?: number): Rect[] {
  const n = aspects.length;
  if (n === 0) return [];
  const contentW = opts.canvasWidth - 2 * opts.margin;
  const contentH = opts.canvasHeight - 2 * opts.margin;
  if (n === 1) {
    return [{ x: opts.margin, y: opts.margin, width: contentW, height: contentH }];
  }
  const g = opts.gutter;
  const c = Math.min(n, Math.max(1, cols ?? Math.round(Math.sqrt(n))));
  const colW = min1((contentW - (c - 1) * g) / c);
  const colHeights = new Array(c).fill(0);

  const rects: Rect[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let col = 0;
    for (let k = 1; k < c; k++) {
      if (colHeights[k] < colHeights[col]) col = k;
    }
    const h = colW / Math.max(0.0001, aspects[i]);
    rects[i] = {
      x: opts.margin + col * (colW + g),
      y: opts.margin + colHeights[col],
      width: colW,
      height: h,
    };
    colHeights[col] += h + g;
  }

  const maxColHeight = Math.max(...colHeights.map((h) => h - g));
  const availH = contentH;
  const scaleY = maxColHeight > 0 ? availH / maxColHeight : 1;
  rects.forEach((r) => {
    r.y = opts.margin + (r.y - opts.margin) * scaleY;
    r.height = min1(r.height * scaleY);
  });
  return rects;
}

/**
 * Spotlight: one large "hero" cell plus a uniform grid of the remaining
 * photos, split along whichever axis matches the canvas's long side.
 */
export function spotlightLayout(aspects: number[], opts: LayoutOptions, heroIndex = 0): Rect[] {
  const n = aspects.length;
  if (n === 0) return [];
  const contentW = opts.canvasWidth - 2 * opts.margin;
  const contentH = opts.canvasHeight - 2 * opts.margin;
  if (n === 1) {
    return [{ x: opts.margin, y: opts.margin, width: contentW, height: contentH }];
  }
  const g = opts.gutter;
  const hero = Math.min(Math.max(0, heroIndex), n - 1);
  const rest = Array.from({ length: n }, (_, i) => i).filter((i) => i !== hero);

  const rects: Rect[] = new Array(n);
  const heroFrac = 0.62;
  let heroRect: Rect;
  let gridRect: Rect;
  if (contentW >= contentH) {
    const heroW = min1(contentW * heroFrac - g / 2);
    heroRect = { x: opts.margin, y: opts.margin, width: heroW, height: contentH };
    gridRect = {
      x: opts.margin + heroW + g,
      y: opts.margin,
      width: min1(contentW - heroW - g),
      height: contentH,
    };
  } else {
    const heroH = min1(contentH * heroFrac - g / 2);
    heroRect = { x: opts.margin, y: opts.margin, width: contentW, height: heroH };
    gridRect = {
      x: opts.margin,
      y: opts.margin + heroH + g,
      width: contentW,
      height: min1(contentH - heroH - g),
    };
  }

  rects[hero] = heroRect;
  const tiled = tileGrid(gridRect, rest.length, g);
  rest.forEach((idx, j) => {
    rects[idx] = tiled[j];
  });
  return rects;
}

/** Dispatch to the chosen strategy. Returns CELL rects (padding applied later). */
export function computeLayout(aspects: number[], spec: LayoutSpec, opts: LayoutOptions): Rect[] {
  switch (spec.type) {
    case 'grid':
      return gridLayout(aspects, opts, spec.cols);
    case 'justified':
      return justifiedLayout(aspects, opts);
    case 'mosaic':
      return mosaicLayout(aspects, opts);
    case 'masonry':
      return masonryLayout(aspects, opts, spec.cols);
    case 'spotlight':
      return spotlightLayout(aspects, opts, spec.heroIndex);
    default:
      return gridLayout(aspects, opts);
  }
}
