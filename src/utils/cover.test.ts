import { describe, expect, it } from 'vitest';
import { coverCrop, keptFraction, refitCrop, type CropRect } from './cover';

const aspect = (r: { width: number; height: number }) => r.width / r.height;
const insidePhoto = (r: CropRect, w: number, h: number) =>
  r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.width <= w + 1e-9 && r.y + r.height <= h + 1e-9;

describe('coverCrop', () => {
  it('crops a landscape photo to a square box, centred, keeping its full height', () => {
    expect(coverCrop(4000, 3000, 500, 500)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
  });

  it('crops a portrait photo to a wide box, centred, keeping its full width', () => {
    expect(coverCrop(3000, 4000, 400, 200)).toEqual({ x: 0, y: 1250, width: 3000, height: 1500 });
  });

  it.each([
    [4000, 3000, 1080, 1920],
    [3000, 4000, 1920, 1080],
    [1000, 1000, 300, 200],
    [6000, 1000, 100, 100],
  ])('a %ix%i photo in a %ix%i box: the box shape, inside the photo', (nw, nh, bw, bh) => {
    const crop = coverCrop(nw, nh, bw, bh);
    expect(aspect(crop)).toBeCloseTo(bw / bh, 9);
    expect(insidePhoto(crop, nw, nh)).toBe(true);
    // One side always spans the whole photo: nothing is cropped needlessly.
    expect(crop.width === nw || crop.height === nh).toBe(true);
  });

  it('falls back to the whole photo when a size is zero', () => {
    expect(coverCrop(800, 600, 0, 100)).toEqual({ x: 0, y: 0, width: 800, height: 600 });
    expect(coverCrop(0, 600, 100, 100)).toEqual({ x: 0, y: 0, width: 1, height: 600 });
  });
});

describe('refitCrop', () => {
  it('is a plain cover-crop for a photo that was never cropped', () => {
    expect(refitCrop(4000, 3000, undefined, 100, 100, 300, 100)).toEqual(coverCrop(4000, 3000, 300, 100));
  });

  it("keeps the user's zoom and the point they centred on when the box changes shape", () => {
    // A 2x zoom into a square box's cover-crop, centred at (1250, 1500).
    const crop = { x: 500, y: 750, width: 1500, height: 1500 };
    const out = refitCrop(4000, 3000, crop, 500, 500, 800, 400);
    const base = coverCrop(4000, 3000, 800, 400);
    expect(out.width).toBeCloseTo(base.width / 2, 9);
    expect(out.height).toBeCloseTo(base.height / 2, 9);
    expect(out.x + out.width / 2).toBeCloseTo(1250, 9);
    expect(out.y + out.height / 2).toBeCloseTo(1500, 9);
    expect(aspect(out)).toBeCloseTo(2, 9);
  });

  it('slides the crop back inside the photo rather than past its edge', () => {
    // Centred at (500, 500); at the new width it would start at x = -167.
    const corner = { x: 0, y: 0, width: 1000, height: 1000 };
    const out = refitCrop(4000, 3000, corner, 500, 500, 1000, 250);
    expect(insidePhoto(out, 4000, 3000)).toBe(true);
    expect(out.x).toBe(0);
    expect(out.y + out.height / 2).toBeCloseTo(500, 9);
  });

  it('never zooms out past a cover-crop, whatever the stored crop says', () => {
    const tooWide = { x: 0, y: 0, width: 4000, height: 3000 };
    expect(refitCrop(4000, 3000, tooWide, 500, 500, 500, 500)).toEqual(coverCrop(4000, 3000, 500, 500));
  });
});

describe('keptFraction', () => {
  it('is 1 when the photo already has the cell shape', () => {
    expect(keptFraction(1.5, 1.5)).toBe(1);
  });

  it('is the share of the photo left after cropping, either way round', () => {
    expect(keptFraction(2, 1)).toBe(0.5);
    expect(keptFraction(1, 2)).toBe(0.5);
  });

  it('is 0 for an impossible shape', () => {
    expect(keptFraction(0, 1)).toBe(0);
    expect(keptFraction(1, -1)).toBe(0);
  });
});
