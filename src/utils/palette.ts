// Lightweight, dependency-free palette extraction. The quantizer is pure so it
// can be unit-tested; the wrapper just rasterizes the image to pixels first.

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

const dist = (a: Bucket, b: Bucket) =>
  Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

/**
 * Quantize RGBA pixels to a small palette. Buckets colors into 4 bits/channel,
 * averages each bucket, sorts by frequency, then greedily picks distinct colors.
 */
export function quantize(data: Uint8ClampedArray, count = 6, minDistance = 48): string[] {
  const map = new Map<number, Bucket>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 125) continue; // skip transparent
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = map.get(key);
    if (e) {
      e.count++;
      e.r += r;
      e.g += g;
      e.b += b;
    } else {
      map.set(key, { count: 1, r, g, b });
    }
  }

  const buckets: Bucket[] = [...map.values()].map((e) => ({
    count: e.count,
    r: Math.round(e.r / e.count),
    g: Math.round(e.g / e.count),
    b: Math.round(e.b / e.count),
  }));
  buckets.sort((a, b) => b.count - a.count);

  const chosen: Bucket[] = [];
  for (const b of buckets) {
    if (chosen.every((c) => dist(c, b) > minDistance)) chosen.push(b);
    if (chosen.length >= count) break;
  }
  // Fallback: if everything was too similar, take the top buckets regardless.
  if (chosen.length === 0 && buckets.length) chosen.push(buckets[0]);
  return chosen.map((c) => toHex(c.r, c.g, c.b));
}

function loadHTMLImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Extract up to `count` dominant colors (hex) from an image source. */
export async function extractPalette(src: string, count = 6): Promise<string[]> {
  const img = await loadHTMLImage(src);
  const max = 80;
  const scale = Math.min(max / img.naturalWidth, max / img.naturalHeight, 1);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return quantize(data, count);
}
