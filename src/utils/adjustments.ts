import Konva from 'konva';
import type { Filter } from 'konva/lib/Node';
import type { ImageFilters } from '../types';
import { warmthFilter } from './warmth';

/**
 * A Konva filter of our own. Konva hands it the cached photo's pixels and the
 * cache's pixel ratio (cache pixels per canvas px), so anything measured in
 * pixels — sharpening's radius — can be set in canvas px and comes out the
 * same on screen and in a 3x export.
 */
export type PixelFilter = (imageData: ImageData, pixelRatio?: number) => void;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rec. 709 luma of 0–255 channel values. */
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Additive brightness: lifts or lowers every channel by the same amount. The
 * same arithmetic as Konva's Brighten, which Konva 10 deprecated, so a photo
 * saved with a brightness setting renders exactly as it did. Exposure is the
 * photographic alternative.
 */
export function brightnessFilter(amount: number): PixelFilter {
  const add = (amount / 100) * 255; // Brighten's brightness() * 255, to the bit
  return function Brightness(imageData) {
    const d = imageData.data; // Uint8ClampedArray: rounds and clamps on write
    for (let i = 0; i < d.length; i += 4) {
      d[i] += add;
      d[i + 1] += add;
      d[i + 2] += add;
    }
  };
}

/** UI units to stops: ±100 is ±2 stops, four times (or a quarter of) the light. */
const STOPS_PER_UNIT = 2 / 100;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSRGB = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/**
 * Exposure, in stops, applied in linear light as a camera's would be: +1 stop
 * doubles the light. Unlike Brightness, black stays black and the midtones
 * keep their contrast; whatever passes white stops there.
 */
export function exposureFilter(amount: number): PixelFilter {
  const gain = 2 ** (clamp(amount, -100, 100) * STOPS_PER_UNIT);
  const table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) table[v] = toSRGB(Math.min(1, toLinear(v / 255) * gain)) * 255;
  return function Exposure(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = table[d[i]];
      d[i + 1] = table[d[i + 1]];
      d[i + 2] = table[d[i + 2]];
    }
  };
}

/** The largest shift Shadows (lifting) and Highlights (pulling down) make, as a share of the range. */
const TONE_RECOVER = 0.2;
/** The other way, deepening shadows or brightening highlights, adds contrast. Past
 *  4/27 the curve would turn over near black or white and invert tones there. */
const TONE_DEEPEN = 4 / 27;

/**
 * The tone curve behind Highlights and Shadows, on 0–1 luminance. Shadows
 * moves the dark tones, most at a third of the way up; Highlights the light
 * ones, most at two thirds. Each fades to nothing at black and at white, so
 * neither moves, and the amounts are capped so the curve always rises.
 */
export function toneCurve(y: number, highlights: number, shadows: number): number {
  const h = clamp(highlights, -100, 100) / 100;
  const s = clamp(shadows, -100, 100) / 100;
  // 27/4 scales each bump to a peak of 1.
  const dark = (27 / 4) * y * (1 - y) * (1 - y);
  const light = (27 / 4) * y * y * (1 - y);
  return y + s * (s > 0 ? TONE_RECOVER : TONE_DEEPEN) * dark + h * (h < 0 ? TONE_RECOVER : TONE_DEEPEN) * light;
}

/**
 * Highlights and Shadows: the tone curve on each pixel's luminance, applied by
 * scaling its three channels together so the colour keeps its hue, and capped
 * where the brightest channel reaches white instead of clipping it alone.
 */
export function toneFilter(highlights: number, shadows: number): PixelFilter {
  // The gain for each luminance level: what the curve makes of it, over itself.
  const gain = new Float32Array(256);
  for (let v = 1; v < 256; v++) gain[v] = toneCurve(v / 255, highlights, shadows) / (v / 255);
  gain[0] = gain[1];
  return function HighlightsShadows(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      let k = gain[Math.round(luma(r, g, b))];
      if (k === 1) continue;
      const max = Math.max(r, g, b);
      if (max * k > 255) k = 255 / max;
      d[i] = r * k;
      d[i + 1] = g * k;
      d[i + 2] = b * k;
    }
  };
}

/**
 * Vibrance: more saturation for muted colours than for vivid ones (and, when
 * negative, mutes the muted ones first). Each colour moves straight out from,
 * or towards, the grey of its own luminance, so brightness and hue stay put,
 * and it stops where a channel reaches the edge of the range.
 */
export function vibranceFilter(amount: number): PixelFilter {
  const v = clamp(amount, -100, 100) / 100;
  return function Vibrance(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max === min) continue; // grey: nothing to saturate
      let k = 1 + v * (1 - (max - min) / max);
      // Not grey, so the luma lies strictly between the lowest channel and the highest.
      const y = luma(r, g, b);
      if (k > 1) k = Math.min(k, (255 - y) / (max - y), y / (y - min));
      d[i] = y + (r - y) * k;
      d[i + 1] = y + (g - y) * k;
      d[i + 2] = y + (b - y) * k;
    }
  };
}

/** Sharpen's strength at 100 (an unsharp mask amount of 100%), and its radius in canvas px. */
const SHARPEN_MAX = 1;
const SHARPEN_RADIUS = 1;

/**
 * Sharpen: an unsharp mask. Each pixel moves away from the average of the
 * pixels around it, steepening edges and leaving flat areas as they are. The
 * neighbourhood is SHARPEN_RADIUS canvas px each way, scaled by the cache's
 * pixel ratio, so a 3x export is sharpened as the screen shows it.
 */
export function sharpenFilter(amount: number): PixelFilter {
  const strength = (clamp(amount, 0, 100) / 100) * SHARPEN_MAX;
  return function Sharpen(imageData, pixelRatio = 1) {
    if (!strength) return;
    const { data, width, height } = imageData;
    const r = Math.max(1, Math.round(SHARPEN_RADIUS * pixelRatio));
    const n = 2 * r + 1;
    const row = width * 4;
    // A box blur in two passes, edges extended. Across each row first...
    const across = new Uint8ClampedArray(data.length);
    for (let y = 0; y < height; y++) {
      const start = y * row;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += data[start + clamp(k, 0, width - 1) * 4 + c];
        for (let x = 0; x < width; x++) {
          across[start + x * 4 + c] = sum / n;
          sum += data[start + Math.min(x + r + 1, width - 1) * 4 + c] - data[start + Math.max(x - r, 0) * 4 + c];
        }
      }
    }
    // ...then down each column, a running sum per column, sharpening as it goes.
    const columns = new Float64Array(width * 3);
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++)
        for (let k = -r; k <= r; k++) columns[x * 3 + c] += across[clamp(k, 0, height - 1) * row + x * 4 + c];
    for (let y = 0; y < height; y++) {
      const enter = Math.min(y + r + 1, height - 1) * row;
      const leave = Math.max(y - r, 0) * row;
      for (let x = 0; x < width; x++)
        for (let c = 0; c < 3; c++) {
          const j = x * 3 + c;
          const i = y * row + x * 4 + c;
          data[i] += strength * (data[i] - columns[j] / n);
          columns[j] += across[enter + x * 4 + c] - across[leave + x * 4 + c];
        }
    }
  };
}

/** Where the vignette begins (0 is the centre, 1 a corner), and its strongest darkening and lightening. */
const VIGNETTE_START = 0.35;
const VIGNETTE_DARKEN = 0.85;
const VIGNETTE_LIGHTEN = 0.7;
/** The vignette's shape: 0 fits the photo's box, 1 is a circle. Fitted
 *  exactly, a long thin photo was shaded like a tube all down its long sides. */
const VIGNETTE_ROUNDNESS = 0.5;

/**
 * Vignette: darkens (negative) or lightens (positive) the visible photo
 * towards its corners, leaving the centre alone. Its shape is an ellipse
 * halfway between the photo's box and a circle, so it reaches all four sides
 * of a square photo alike, and darkens the far ends of a long one.
 */
export function vignetteFilter(amount: number): PixelFilter {
  const a = clamp(amount, -100, 100) / 100;
  return function Vignette(imageData) {
    if (!a) return;
    const { data, width, height } = imageData;
    // The ellipse's radii, between the box's half-sides and the circle that
    // puts the corners as far out as the box's own ellipse does.
    const hw = width / 2;
    const hh = height / 2;
    const circle = Math.sqrt((hw * hw + hh * hh) / 2);
    const rx = hw + (circle - hw) * VIGNETTE_ROUNDNESS;
    const ry = hh + (circle - hh) * VIGNETTE_ROUNDNESS;
    const corner = (hw / rx) ** 2 + (hh / ry) ** 2;
    // Each pixel centre's squared offset from the middle, scaled so a corner is 1.
    const across = Float64Array.from({ length: width }, (_, x) => ((x + 0.5 - hw) / rx) ** 2 / corner);
    for (let y = 0; y < height; y++) {
      const down = ((y + 0.5 - hh) / ry) ** 2 / corner;
      for (let x = 0; x < width; x++) {
        const dist = Math.sqrt(across[x] + down); // 1 in a corner
        if (dist <= VIGNETTE_START) continue;
        const t = (dist - VIGNETTE_START) / (1 - VIGNETTE_START);
        const weight = t * t * (3 - 2 * t); // smoothstep
        const i = (y * width + x) * 4;
        if (a < 0) {
          const k = 1 + a * VIGNETTE_DARKEN * weight;
          data[i] *= k;
          data[i + 1] *= k;
          data[i + 2] *= k;
        } else {
          const k = a * VIGNETTE_LIGHTEN * weight;
          data[i] += (255 - data[i]) * k;
          data[i + 1] += (255 - data[i + 1]) * k;
          data[i + 2] += (255 - data[i + 2]) * k;
        }
      }
    }
  };
}

/** Whether a photo has any adjustment at all. Without one it skips Konva's filter cache. */
export function hasAdjustments(f: ImageFilters | undefined): boolean {
  return !!(
    f &&
    (f.exposure ||
      f.brightness ||
      f.contrast ||
      f.highlights ||
      f.shadows ||
      f.warmth ||
      f.vibrance ||
      f.saturation ||
      f.hue ||
      f.enhance ||
      f.grayscale ||
      f.sepia ||
      f.sharpen ||
      f.blur ||
      f.vignette)
  );
}

/**
 * A photo's filters, in the order they run: light first, then colour, then
 * detail and effects. The filters older versions had keep their order among
 * themselves, so a photo from an older project renders as it did.
 *
 * Ours are a new function for each value: Konva re-runs the filters when this
 * list changes, not when a value a function closes over does. Konva's own
 * read their values off the node, where ImageNode sets them (contrast, hue,
 * saturation, enhance, blurRadius).
 */
export function filterPipeline(f: ImageFilters): Filter[] {
  const list: Filter[] = [];
  if (f.exposure) list.push(exposureFilter(f.exposure));
  if (f.brightness) list.push(brightnessFilter(f.brightness));
  if (f.contrast) list.push(Konva.Filters.Contrast);
  if (f.highlights || f.shadows) list.push(toneFilter(f.highlights ?? 0, f.shadows ?? 0));
  if (f.warmth) list.push(warmthFilter(f.warmth));
  if (f.vibrance) list.push(vibranceFilter(f.vibrance));
  if (f.hue || f.saturation) list.push(Konva.Filters.HSL);
  if (f.enhance) list.push(Konva.Filters.Enhance);
  // Grayscale and sepia are mutually exclusive whole-photo recolours, after
  // every other colour change.
  if (f.grayscale) list.push(Konva.Filters.Grayscale);
  else if (f.sepia) list.push(Konva.Filters.Sepia);
  if (f.sharpen) list.push(sharpenFilter(f.sharpen));
  if (f.blur) list.push(Konva.Filters.Blur);
  if (f.vignette) list.push(vignetteFilter(f.vignette));
  return list;
}
