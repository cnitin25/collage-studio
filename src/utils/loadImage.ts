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

function readAsImage(blob: Blob): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const src = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () =>
      resolve({ src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error('This file could not be read as an image.'));
    };
    img.src = src;
  });
}

/** Load a single file, transparently converting HEIC/HEIF to JPEG first if needed. */
export async function loadImageFile(file: File): Promise<LoadedImage> {
  if (looksLikeHeic(file)) {
    const jpegBlob = await convertHeicToJpeg(file); // throws a readable Error on failure
    return readAsImage(jpegBlob);
  }
  return readAsImage(file);
}

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

  const settled = await Promise.allSettled(candidates.map(loadImageFile));
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
