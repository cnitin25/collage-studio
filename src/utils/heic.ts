// HEIC/HEIF (the format iPhones default to) has no native decode support in
// Chrome, Firefox, or Edge — only Safari can read it, via the OS codec. There's
// no server here to convert it either, so we decode it fully client-side with
// a WASM-free, self-contained JS port of libheif (heic2any). It's ~1.3MB, so
// it's dynamically imported — only users who actually drop a HEIC file pay for
// it, and it still works fully offline once loaded (no CDN, no network calls;
// verified by inspecting the bundle directly).

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

/** Convert a HEIC/HEIF file to a JPEG Blob. Throws with a readable message on failure. */
export async function convertHeicToJpeg(file: File): Promise<Blob> {
  let heic2any: typeof import('heic2any').default;
  try {
    heic2any = (await import('heic2any')).default;
  } catch {
    throw new Error('The HEIC/HEIF converter could not be loaded.');
  }
  let result: Blob | Blob[];
  try {
    result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`This HEIC/HEIF photo could not be converted (${detail}).`);
  }
  // Some HEIC containers hold multiple images (e.g. burst shots); use the first.
  return Array.isArray(result) ? result[0] : result;
}
