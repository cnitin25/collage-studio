import { looksLikeHeic, convertHeicToJpeg } from './heic';

export interface LoadedImage {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

export interface ImageLoadFailure {
  name: string;
  reason: string;
}

// Trust the extension as well as the MIME type — file.type is empty or wrong
// for some formats (notably HEIC) on several OS/browser combinations, and a
// pure MIME check would silently drop those files before ever trying to load
// them, with no error at all.
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif)$/i;

function looksLikeImage(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
}

/**
 * Longest side a photo is kept at. A 12 MP phone photo decodes to ~48 MB and
 * every photo stays decoded while it's on the canvas, so twenty originals is
 * more memory than iOS Safari gives a tab — it reloads and the work is lost.
 * 4096 px still covers a full-bleed photo on any preset at 1×–2× export.
 */
export const MAX_IMPORT_SIDE = 4096;

function decode(blob: Blob): Promise<{ img: HTMLImageElement; src: string }> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, src });
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('This file could not be read as an image.'));
    };
    img.src = src;
  });
}

/** Whether the image has any transparency, judged from a small rendering of it. */
function hasAlpha(img: HTMLImageElement): boolean {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return true;
  ctx.drawImage(img, 0, 0, 64, 64);
  const d = ctx.getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
  return false;
}

/** Re-encode an oversized image at MAX_IMPORT_SIDE; null if it can't be. */
async function downscale(img: HTMLImageElement, type: string): Promise<Blob | null> {
  const k = MAX_IMPORT_SIDE / Math.max(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  // Only formats that can carry transparency need PNG; a photo as PNG would
  // be several times the size of the JPEG.
  const keepAlpha = /png|webp|gif|avif/i.test(type) && hasAlpha(img);
  const blob = await new Promise<Blob | null>((r) =>
    c.toBlob(r, keepAlpha ? 'image/png' : 'image/jpeg', 0.92),
  );
  c.width = c.height = 0; // release the backing store now, not at GC time
  return blob;
}

async function readAsImage(blob: Blob): Promise<LoadedImage> {
  const { img, src } = await decode(blob);
  const oversized = Math.max(img.naturalWidth, img.naturalHeight) > MAX_IMPORT_SIDE;
  if (oversized && !/svg/i.test(blob.type)) {
    const small = await downscale(img, blob.type);
    if (small) {
      URL.revokeObjectURL(src);
      return readAsImage(small);
    }
  }
  return { src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
}

/** Load a single file, transparently converting HEIC/HEIF to JPEG first if needed. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (looksLikeHeic(file)) {
    const jpegBlob = await convertHeicToJpeg(file); // throws a readable Error on failure
    return readAsImage(jpegBlob);
  }
  return readAsImage(file);
}

// Two at a time: decoding (and HEIC conversion) is the memory peak, and a
// phone picking 20 photos at once would otherwise decode all 20 together.
const IMPORT_CONCURRENCY = 2;

/**
 * Load a batch of files. Never lets one bad file take down the rest — each
 * file succeeds or fails independently, and every skipped/failed file is
 * reported back with a reason so the caller can show the user what happened,
 * instead of files silently vanishing.
 */
export async function loadImageFiles(
  files: File[],
): Promise<{ images: LoadedImage[]; failures: ImageLoadFailure[] }> {
  const candidates = files.filter(looksLikeImage);
  const failures: ImageLoadFailure[] = files
    .filter((f) => !looksLikeImage(f))
    .map((f) => ({ name: f.name, reason: 'Not a recognized image file.' }));

  const settled: PromiseSettledResult<LoadedImage>[] = new Array(candidates.length);
  let next = 0;
  const worker = async () => {
    while (next < candidates.length) {
      const i = next++;
      try {
        settled[i] = { status: 'fulfilled', value: await loadImageFile(candidates[i]) };
      } catch (reason) {
        settled[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(IMPORT_CONCURRENCY, candidates.length) }, worker));
  const images: LoadedImage[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') images.push(r.value);
    else
      failures.push({
        name: candidates[i].name,
        reason: r.reason instanceof Error ? r.reason.message : 'Could not load this image.',
      });
  });

  return { images, failures };
}
