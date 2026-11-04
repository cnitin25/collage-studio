import { describe, expect, it } from 'vitest';
import { histogramFromImageData } from './histogram';
import { quantize } from './palette';
import { warmthFilter } from './warmth';

/** RGBA pixel data from [r, g, b, a] tuples. */
const pixels = (...px: [number, number, number, number][]) => new Uint8ClampedArray(px.flat());
const run = (filter: (d: ImageData) => void, data: Uint8ClampedArray) => {
  filter({ data } as ImageData);
  return [...data];
};

describe('warmthFilter', () => {
  it('leaves a photo alone at 0', () => {
    expect(run(warmthFilter(0), pixels([120, 130, 140, 255]))).toEqual([120, 130, 140, 255]);
  });

  it('warms by lifting red and lowering blue; cools the other way', () => {
    const [r, g, b, a] = run(warmthFilter(100), pixels([100, 100, 100, 200]));
    expect([r, g, b, a]).toEqual([125, 105, 75, 200]);
    const [cr, , cb] = run(warmthFilter(-100), pixels([100, 100, 100, 255]));
    expect(cr).toBeLessThan(100);
    expect(cb).toBeGreaterThan(100);
  });

  it('caps the amount at ±100 and clips channels at 255', () => {
    expect(run(warmthFilter(400), pixels([250, 10, 10, 255]))).toEqual(run(warmthFilter(100), pixels([250, 10, 10, 255])));
    expect(run(warmthFilter(100), pixels([250, 10, 10, 255]))[0]).toBe(255);
  });
});

describe('quantize (palette from photo)', () => {
  it('returns the distinct colours, most common first', () => {
    const data = pixels([200, 20, 20, 255], [200, 20, 20, 255], [200, 20, 20, 255], [20, 20, 200, 255]);
    expect(quantize(data, 6)).toEqual(['#c81414', '#1414c8']);
  });

  it('merges colours closer than the minimum distance', () => {
    const data = pixels([100, 100, 100, 255], [104, 102, 100, 255]);
    expect(quantize(data, 6)).toHaveLength(1);
  });

  it('ignores transparent pixels, and returns nothing for an invisible image', () => {
    expect(quantize(pixels([255, 0, 0, 0], [0, 0, 255, 255]))).toEqual(['#0000ff']);
    expect(quantize(pixels([255, 0, 0, 0]))).toEqual([]);
  });

  it('stops at the number of colours asked for', () => {
    const data = pixels([255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255]);
    expect(quantize(data, 2)).toHaveLength(2);
  });
});

describe('histogramFromImageData', () => {
  it('counts each channel into its value bucket, skipping transparent pixels', () => {
    const h = histogramFromImageData(pixels([0, 128, 255, 255], [0, 0, 255, 255], [9, 9, 9, 0]), 4);
    expect(h.r).toEqual([2, 0, 0, 0]);
    expect(h.g).toEqual([1, 0, 1, 0]);
    expect(h.b).toEqual([0, 0, 0, 2]);
    expect(h.max).toBe(2);
  });

  it('has a peak of at least 1, so an empty chart never divides by zero', () => {
    expect(histogramFromImageData(new Uint8ClampedArray(0), 8).max).toBe(1);
  });
});
