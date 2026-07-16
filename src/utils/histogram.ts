import { loadHTMLImage } from './palette';

export interface Histogram {
  r: number[];
  g: number[];
  b: number[];
  max: number;
}

/** Bucket RGBA pixel data into a per-channel value histogram. */
export function histogramFromImageData(data: Uint8ClampedArray, bins = 64): Histogram {
  const r = new Array(bins).fill(0);
  const g = new Array(bins).fill(0);
  const b = new Array(bins).fill(0);

  const bucketSize = 256 / bins;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) continue; // skip transparent
    r[Math.min(bins - 1, Math.floor(data[i] / bucketSize))]++;
    g[Math.min(bins - 1, Math.floor(data[i + 1] / bucketSize))]++;
    b[Math.min(bins - 1, Math.floor(data[i + 2] / bucketSize))]++;
  }

  const peak = Math.max(1, ...r, ...g, ...b);
  return { r, g, b, max: peak };
}

/** Histogram of whatever is currently drawn on a canvas (e.g. a filtered render). */
export function histogramFromCanvas(canvas: HTMLCanvasElement, bins = 64): Histogram {
  const ctx = canvas.getContext('2d');
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    const empty = new Array(bins).fill(0);
    return { r: empty, g: empty, b: empty, max: 1 };
  }
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return histogramFromImageData(data, bins);
}

/** Per-channel pixel-value histogram for an image source, read from the original file. */
export async function computeHistogram(src: string, bins = 64): Promise<Histogram> {
  const img = await loadHTMLImage(src);
  const max = 160; // downscale first — we only need the value distribution, not full resolution
  const scale = Math.min(max / img.naturalWidth, max / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return histogramFromImageData(new Uint8ClampedArray(0), bins);
  ctx.drawImage(img, 0, 0, w, h);
  return histogramFromCanvas(canvas, bins);
}
