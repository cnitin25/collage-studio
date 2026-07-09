import type { LayoutOptions, LayoutSpec, Rect } from './types';

const min1 = (n: number) => Math.max(1, n);

/** Uniform grid. Partial last row is centered. */
export function gridLayout(aspects: number[], opts: LayoutOptions, cols?: number): Rect[] {
  const n = aspects.length;
  if (n === 0) return [];
  const c = Math.max(1, cols ?? Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / c);
  const contentW = opts.canvasWidth - 2 * opts.margin;
  const contentH = opts.canvasHeight - 2 * opts.margin;
  const cellW = min1((contentW - (c - 1) * opts.gutter) / c);
  const cellH = min1((contentH - (rows - 1) * opts.gutter) / rows);

  const rects: Rect[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / c);
    const col = i % c;
    const itemsInRow = row === rows - 1 ? n - row * c : c;
    const rowOffset = itemsInRow < c ? ((c - itemsInRow) * (cellW + opts.gutter)) / 2 : 0;
    rects.push({
      x: opts.margin + rowOffset + col * (cellW + opts.gutter),
      y: opts.margin + row * (cellH + opts.gutter),
      width: cellW,
      height: cellH,
    });
  }
  return rects;
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

/** Dispatch to the chosen strategy. Returns CELL rects (padding applied later). */
export function computeLayout(aspects: number[], spec: LayoutSpec, opts: LayoutOptions): Rect[] {
  switch (spec.type) {
    case 'grid':
      return gridLayout(aspects, opts, spec.cols);
    case 'justified':
      return justifiedLayout(aspects, opts);
    case 'mosaic':
      return mosaicLayout(aspects, opts);
    default:
      return gridLayout(aspects, opts);
  }
}
