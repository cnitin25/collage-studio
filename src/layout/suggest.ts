import { keptFraction } from '../utils/cover';
import { computeLayout } from './strategies';
import type { LayoutOptions, LayoutSpec, Rect } from './types';

export interface Suggestion {
  spec: LayoutSpec;
  label: string;
  rects: Rect[];
  /** average kept-area across cells, 0..1 (1 = nothing cropped) */
  score: number;
}

/**
 * Generate candidate layouts and rank them by how little they crop the photos.
 * "Smart" here is heuristic: aspect-ratio fit only (no content/face detection).
 */
export function suggestLayouts(
  aspects: number[],
  opts: LayoutOptions,
  max = 3,
): Suggestion[] {
  const n = aspects.length;
  if (n < 2) return [];

  const candidates: Array<{ spec: LayoutSpec; label: string }> = [];
  for (const c of [2, 3, 4]) {
    if (c <= n) candidates.push({ spec: { type: 'grid', cols: c }, label: `Grid ${c}` });
  }
  candidates.push({ spec: { type: 'justified' }, label: 'Justified' });
  candidates.push({ spec: { type: 'mosaic' }, label: 'Mosaic' });

  const scored: Suggestion[] = candidates.map(({ spec, label }) => {
    const rects = computeLayout(aspects, spec, opts);
    let sum = 0;
    let count = 0;
    rects.forEach((r, i) => {
      const innerW = Math.max(1, r.width - 2 * opts.padding);
      const innerH = Math.max(1, r.height - 2 * opts.padding);
      sum += keptFraction(aspects[i], innerW / innerH);
      count += 1;
    });
    return { spec, label, rects, score: count ? sum / count : 0 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max);
}
