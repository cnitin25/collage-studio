import { isIOS } from './platform';

/** Trigger a browser download for an already-rendered data URL. */
export function downloadDataURL(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Trigger a browser download for a Blob, via a short-lived object URL. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  downloadDataURL(url, fileName);
  // Revoking straight away can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

// WebKit on iOS refuses any canvas over 16,777,216 px (4096²) and hands back
// an empty image instead of an error. Elsewhere the practical ceiling is the
// 268M px / 16384 px-per-side limit Chromium, Firefox and desktop Safari share.
const MAX_SIDE = 16_384;
function maxArea(): number {
  return isIOS() ? 16_777_216 : 268_435_456;
}

/** Largest export multiplier this browser can render for a w×h canvas. */
export function maxExportScale(width: number, height: number): number {
  const byArea = Math.sqrt(maxArea() / (width * height));
  const bySide = MAX_SIDE / Math.max(width, height);
  // Floored to 2 decimals so rounding can't push the result back over.
  return Math.floor(Math.min(byArea, bySide) * 100) / 100;
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-gesture';

/**
 * Hand the exported image to the phone's share sheet ("Save Image" puts it in
 * Photos), falling back to a normal download. Desktop always downloads —
 * Chrome on Windows/macOS supports file sharing too, and a share dialog there
 * would replace the download people expect.
 *
 * Share needs a recent tap. Rendering a large export can outlast that window
 * (notably on iOS), in which case this returns 'needs-gesture' and the caller
 * offers a button that calls it again.
 */
export async function shareOrDownload(blob: Blob, fileName: string): Promise<ShareResult> {
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const file = new File([blob], fileName, { type: blob.type });
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      if (err instanceof DOMException && err.name === 'NotAllowedError') return 'needs-gesture';
      // Anything else (share target failed, unsupported type): fall through.
    }
  }
  downloadBlob(blob, fileName);
  return 'downloaded';
}
