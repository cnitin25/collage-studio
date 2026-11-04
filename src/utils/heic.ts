// HEIC/HEIF (the format iPhones default to) has no native decode support in
// Chrome, Firefox, or Edge — only Safari can read it, via the OS codec. There's
// no server here to convert it either, so we decode it fully client-side with
// libheif compiled to plain JavaScript (heic-to's `csp` build), in a worker.
// That build evaluates no strings as code, so the Content-Security-Policy
// needs neither 'unsafe-eval' nor 'wasm-unsafe-eval' (heic2any, used before,
// needed the first). It's ~3MB, so it's dynamically imported, and precached:
// it works fully offline (no CDN, no network calls).

import { useEditorStore } from '../store/useEditorStore';

const HEIC_MIME_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const HEIC_EXTENSIONS = ['.heic', '.heif'];

/**
 * HEIC files are notoriously inconsistent about MIME type — Safari reports
 * 'image/heic', many other browsers/OSes report '' or 'application/octet-stream'
 * for a format their MIME database doesn't know. Extension is the more
 * reliable signal in practice, so we check both.
 */
export function looksLikeHeic(file: File): boolean {
  const type = file.type.toLowerCase();
  if (HEIC_MIME_TYPES.includes(type)) return true;
  const name = file.name.toLowerCase();
  return HEIC_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * The converter decodes in a worker, and if that worker dies (blocked by a
 * Content-Security-Policy, out of memory) its promise may never settle: the
 * import just hung, with no photo and no error. Far longer than a real
 * conversion takes, even of a large photo on a slow phone.
 */
const CONVERT_TIMEOUT_MS = 90_000;

/** Convert a HEIC/HEIF file to a JPEG Blob. Throws with a readable message on failure. */
export async function convertHeicToJpeg(file: File): Promise<Blob> {
  let heicTo: typeof import('heic-to/csp').heicTo;
  try {
    ({ heicTo } = await import('heic-to/csp'));
  } catch (err) {
    // Its file has most likely gone from the server: a new release replaced
    // it while this page was open. A reload fetches the new one.
    useEditorStore.getState().setAppUpdate('out-of-date');
    throw new Error("The HEIC/HEIF converter couldn't be loaded. Reload the page and try again.", { cause: err });
  }
  let timer: number | undefined;
  try {
    // A file holding several images (a burst, grid tiles) gives its primary one.
    return await Promise.race([
      heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 }),
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error('it took too long')), CONVERT_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    // The converter rejects with a string, not an Error.
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`This HEIC/HEIF photo could not be converted (${detail}).`, { cause: err });
  } finally {
    window.clearTimeout(timer);
  }
}
