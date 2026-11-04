import { describe, expect, it } from 'vitest';
import Konva from 'konva';
import { Brighten } from 'konva/lib/filters/Brighten';
import type { Filter, FilterFunction } from 'konva/lib/Node';
import type { ImageFilters } from '../types';
import { NEUTRAL_FILTERS } from '../style/enhancePresets';
import {
  brightnessFilter,
  exposureFilter,
  filterPipeline,
  hasAdjustments,
  sharpenFilter,
  toneCurve,
  toneFilter,
  vibranceFilter,
  vignetteFilter,
  type PixelFilter,
} from './adjustments';

type Pixel = [number, number, number, number];

/** An ImageData-shaped object (Node has no ImageData), each pixel from `fill`. */
function image(width: number, height: number, fill: (x: number, y: number) => Pixel): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(fill(x, y), (y * width + x) * 4);
  return { data, width, height } as ImageData;
}
const apply = (filter: PixelFilter, img: ImageData, ratio?: number) => {
  filter(img, ratio);
  return img;
};
const at = (img: ImageData, x: number, y: number): Pixel => {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
};
/** One pixel through a filter. */
const one = (filter: PixelFilter, px: Pixel) => at(apply(filter, image(1, 1, () => px)), 0, 0);
const gray = (v: number): Pixel => [v, v, v, 255];
/** sRGB 0–255 to linear light 0–1. */
const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luma = ([r, g, b]: Pixel) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const chroma = ([r, g, b]: Pixel) => Math.max(r, g, b) - Math.min(r, g, b);

describe('brightnessFilter', () => {
  it("matches Konva's deprecated Brighten exactly, so saved photos look the same", () => {
    // Every level from 0 to 255, as greys.
    const levels = Uint8ClampedArray.from({ length: 256 * 4 }, (_, i) => (i % 4 === 3 ? 255 : i >> 2));
    for (const amount of [-100, -35, -21, -1.8, 0.5, 1, 3, 21, 35, 100]) {
      const ours = new Uint8ClampedArray(levels);
      const konva = new Uint8ClampedArray(levels);
      brightnessFilter(amount)({ data: ours, width: 256, height: 1 } as ImageData);
      (Brighten as FilterFunction).call({ brightness: () => amount / 100 } as never, { data: konva } as ImageData);
      expect([...ours], `brightness ${amount}`).toEqual([...konva]);
    }
  });
});

describe('exposureFilter', () => {
  it('leaves a photo alone at 0', () => {
    expect(one(exposureFilter(0), [12, 128, 250, 255])).toEqual([12, 128, 250, 255]);
  });

  it('works in stops: +50 doubles the light and -50 halves it', () => {
    for (const v of [40, 80, 120]) {
      const [up] = one(exposureFilter(50), gray(v));
      const [down] = one(exposureFilter(-50), gray(v));
      expect(toLinear(up) / toLinear(v), `${v} up`).toBeCloseTo(2, 1);
      expect(toLinear(down) / toLinear(v), `${v} down`).toBeCloseTo(0.5, 1);
    }
  });

  it('keeps black black, and stops at white', () => {
    expect(one(exposureFilter(100), gray(0))).toEqual(gray(0));
    expect(one(exposureFilter(100), [200, 250, 255, 255])).toEqual([255, 255, 255, 255]);
    expect(one(exposureFilter(-100), gray(255))[0]).toBeLessThan(255);
  });

  it('treats each channel alike, and leaves transparency alone', () => {
    const [r, g, b, a] = one(exposureFilter(30), [90, 90, 90, 77]);
    expect([g, b, a]).toEqual([r, r, 77]);
    expect(r).toBeGreaterThan(90);
  });
});

describe('toneFilter (highlights and shadows)', () => {
  it('leaves a photo alone at 0', () => {
    expect(one(toneFilter(0, 0), [30, 120, 220, 255])).toEqual([30, 120, 220, 255]);
  });

  it('Shadows lifts the dark tones, and barely touches the light ones', () => {
    expect(one(toneFilter(0, 60), gray(40))[0]).toBeGreaterThan(55);
    expect(Math.abs(one(toneFilter(0, 60), gray(225))[0] - 225)).toBeLessThanOrEqual(3);
    expect(one(toneFilter(0, -60), gray(40))[0]).toBeLessThan(32);
  });

  it('Highlights pulls the bright tones down, and barely touches the dark ones', () => {
    expect(one(toneFilter(-60, 0), gray(215))[0]).toBeLessThan(200);
    expect(Math.abs(one(toneFilter(-60, 0), gray(30))[0] - 30)).toBeLessThanOrEqual(3);
    expect(one(toneFilter(60, 0), gray(215))[0]).toBeGreaterThan(222);
  });

  it('never turns tones over: black stays black, white stays white, and the curve only rises', () => {
    const turnedOver: string[] = [];
    for (let h = -100; h <= 100; h += 25)
      for (let s = -100; s <= 100; s += 25) {
        let prev = toneCurve(0, h, s);
        if (Math.abs(prev) > 1e-9 || Math.abs(toneCurve(1, h, s) - 1) > 1e-9) turnedOver.push(`ends ${h}/${s}`);
        for (let i = 1; i <= 1000; i++) {
          const y = toneCurve(i / 1000, h, s);
          if (y < prev - 1e-9) turnedOver.push(`${h}/${s} at ${i / 1000}`);
          prev = y;
        }
      }
    expect(turnedOver).toEqual([]);
  });

  it("keeps a colour's hue: its channels scale together", () => {
    const [r, g, b] = one(toneFilter(-40, 70), [120, 60, 30, 255]);
    expect(r).toBeGreaterThan(120);
    expect(r / g).toBeCloseTo(2, 1);
    expect(g / b).toBeCloseTo(2, 1);
  });

  it('stops a bright colour at white, rather than clipping one channel and shifting its hue', () => {
    const [r, g, b] = one(toneFilter(100, 100), [230, 115, 46, 255]);
    expect(r).toBe(255);
    expect(r / g).toBeCloseTo(2, 1);
    expect(g / b).toBeCloseTo(2.5, 1);
  });
});

describe('vibranceFilter', () => {
  const muted: Pixel = [150, 130, 120, 255];
  const vivid: Pixel = [220, 60, 40, 255];
  const gain = (amount: number, p: Pixel) => chroma(one(vibranceFilter(amount), p)) / chroma(p);

  it('leaves a photo alone at 0, and greys alone at any setting', () => {
    expect(one(vibranceFilter(0), [150, 120, 90, 255])).toEqual([150, 120, 90, 255]);
    expect(one(vibranceFilter(100), gray(128))).toEqual(gray(128));
  });

  it('boosts muted colours more than vivid ones', () => {
    expect(gain(60, muted)).toBeGreaterThan(1.3);
    expect(gain(60, muted)).toBeGreaterThan(gain(60, vivid) + 0.2);
  });

  it('mutes the muted colours first when negative', () => {
    expect(gain(-60, muted)).toBeLessThan(gain(-60, vivid) - 0.2);
  });

  it('keeps brightness and hue: a colour moves straight out from grey', () => {
    const after = one(vibranceFilter(80), muted);
    expect(Math.abs(luma(after) - luma(muted))).toBeLessThan(1);
    expect((after[0] - after[1]) / (after[1] - after[2])).toBeCloseTo((150 - 130) / (130 - 120), 0);
  });

  it('stops a colour at the edge of what can be shown, rather than clipping one channel', () => {
    const p: Pixel = [250, 140, 120, 255];
    const after = one(vibranceFilter(100), p);
    expect(after[0]).toBe(255);
    expect((after[0] - after[1]) / (after[1] - after[2])).toBeCloseTo((250 - 140) / (140 - 120), 0);
  });
});

describe('sharpenFilter', () => {
  /** 16x4: dark on the left half, light on the right. */
  const edge = () => image(16, 4, (x) => gray(x < 8 ? 80 : 160));
  const row = (img: ImageData) => Array.from({ length: img.width }, (_, x) => at(img, x, 1)[0]);

  it('leaves a photo alone at 0, and flat areas alone at any setting', () => {
    expect(row(apply(sharpenFilter(0), edge()))).toEqual(row(edge()));
    expect(row(apply(sharpenFilter(100), image(8, 8, () => gray(90))))).toEqual(Array(8).fill(90));
  });

  it('steepens an edge: darker just inside the dark side, lighter just inside the light side', () => {
    const r = row(apply(sharpenFilter(80), edge()));
    expect(r[7]).toBeLessThan(80);
    expect(r[8]).toBeGreaterThan(160);
    expect([r[0], r[15]]).toEqual([80, 160]);
  });

  it('widens with the pixel ratio, so a 3x export matches the screen', () => {
    const changed = (ratio: number) =>
      row(apply(sharpenFilter(80), edge(), ratio)).filter((v, x) => v !== (x < 8 ? 80 : 160)).length;
    expect(changed(1)).toBe(2);
    expect(changed(3)).toBe(6);
  });

  it('leaves transparency alone', () => {
    const img = apply(sharpenFilter(100), image(16, 4, (x) => [x < 8 ? 80 : 160, 0, 0, x < 8 ? 40 : 255]));
    expect([at(img, 7, 1)[3], at(img, 8, 1)[3]]).toEqual([40, 255]);
  });
});

describe('vignetteFilter', () => {
  const flat = (v: number) => image(200, 100, () => gray(v));

  it('leaves a photo alone at 0', () => {
    const img = apply(vignetteFilter(0), flat(200));
    expect([at(img, 0, 0), at(img, 100, 50)]).toEqual([gray(200), gray(200)]);
  });

  it('darkens towards the corners, and leaves the centre alone', () => {
    const img = apply(vignetteFilter(-70), flat(200));
    const [centre, side, corner] = [at(img, 100, 50)[0], at(img, 0, 50)[0], at(img, 0, 0)[0]];
    expect(centre).toBe(200);
    expect(side).toBeLessThan(190);
    expect(corner).toBeLessThan(side - 10);
  });

  it('is the same in all four corners, and on all four sides of a square photo', () => {
    const img = apply(vignetteFilter(-70), image(100, 100, () => gray(200)));
    const corners = [at(img, 0, 0), at(img, 99, 0), at(img, 0, 99), at(img, 99, 99)].map((p) => p[0]);
    expect(new Set(corners).size).toBe(1);
    const sides = [at(img, 0, 50), at(img, 99, 50), at(img, 50, 0), at(img, 50, 99)].map((p) => p[0]);
    expect(Math.max(...sides) - Math.min(...sides)).toBeLessThanOrEqual(1);
  });

  it('is rounder than a long photo: it darkens the far ends, not all along the long sides', () => {
    const img = apply(vignetteFilter(-70), flat(200));
    const corners = [at(img, 0, 0), at(img, 199, 0), at(img, 0, 99), at(img, 199, 99)].map((p) => p[0]);
    expect(new Set(corners).size).toBe(1);
    expect(at(img, 0, 50)[0], 'an end').toBeLessThan(at(img, 100, 0)[0] - 30);
  });

  it('lightens the corners when positive', () => {
    const img = apply(vignetteFilter(70), flat(100));
    expect(at(img, 0, 0)[0]).toBeGreaterThan(130);
    expect(at(img, 100, 50)[0]).toBe(100);
  });

  it('leaves transparency alone', () => {
    const img = apply(vignetteFilter(-100), image(20, 10, () => [200, 200, 200, 90]));
    expect(at(img, 0, 0)[3]).toBe(90);
  });
});

describe('the filter pipeline', () => {
  const nameOf = (fn: Filter) => (typeof fn === 'string' ? fn : fn.name);
  const names = (f: ImageFilters) => filterPipeline(f).map(nameOf);

  it('runs a photo from an older project through the same filters, in the same order, as before', () => {
    const older: ImageFilters = { brightness: 10, contrast: 5, warmth: 20, saturation: 10, hue: 5, enhance: 50, sepia: true, blur: 3 };
    expect(names(older)).toEqual(['Brightness', 'Contrast', 'Warmth', 'HSL', 'Enhance', 'Sepia', 'Blur']);
  });

  it('slots the new adjustments in by kind: light first, then colour, then detail and effects', () => {
    const every: ImageFilters = {
      exposure: 10,
      brightness: 10,
      contrast: 10,
      highlights: -10,
      shadows: 10,
      warmth: 10,
      vibrance: 10,
      saturation: 10,
      hue: 10,
      enhance: 10,
      grayscale: true,
      sharpen: 10,
      blur: 1,
      vignette: -10,
    };
    expect(names(every)).toEqual([
      'Exposure',
      'Brightness',
      'Contrast',
      'HighlightsShadows',
      'Warmth',
      'Vibrance',
      'HSL',
      'Enhance',
      'Grayscale',
      'Sharpen',
      'Blur',
      'Vignette',
    ]);
  });

  it('uses its own brightness, not the Brighten filter Konva has deprecated', () => {
    expect(filterPipeline({ brightness: 10 })).not.toContain(Konva.Filters.Brighten);
  });

  it('keeps hue and saturation in one pass, highlights and shadows in one, and grayscale over sepia', () => {
    expect(names({ hue: 4, saturation: 0 })).toEqual(['HSL']);
    expect(names({ highlights: 0, shadows: 20 })).toEqual(['HighlightsShadows']);
    expect(names({ grayscale: true, sepia: true })).toEqual(['Grayscale']);
  });

  it('adds nothing for neutral values, so an untouched photo skips the filter cache', () => {
    expect(filterPipeline(NEUTRAL_FILTERS)).toEqual([]);
    expect(hasAdjustments(NEUTRAL_FILTERS)).toBe(false);
    expect(hasAdjustments(undefined)).toBe(false);
    expect(hasAdjustments({ presetId: 'vivid', presetStrength: 0 })).toBe(false);
    for (const key of ['exposure', 'highlights', 'shadows', 'vibrance', 'sharpen', 'vignette'] as const)
      expect(hasAdjustments({ [key]: 5 }), key).toBe(true);
  });
});
