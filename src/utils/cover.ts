// Geometry helpers shared by the layout engine and the Konva image nodes.

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the centered source-pixel crop that makes an image COVER a target
 * box without distortion. The crop aspect matches target aspect, so when Konva
 * scales the cropped region into width/height it fills the cell exactly.
 */
export function coverCrop(
  naturalW: number,
  naturalH: number,
  targetW: number,
  targetH: number,
): CropRect {
  if (naturalW <= 0 || naturalH <= 0 || targetW <= 0 || targetH <= 0) {
    return { x: 0, y: 0, width: Math.max(1, naturalW), height: Math.max(1, naturalH) };
  }
  const imageAspect = naturalW / naturalH;
  const targetAspect = targetW / targetH;
  let cw: number;
  let ch: number;
  if (imageAspect > targetAspect) {
    ch = naturalH;
    cw = naturalH * targetAspect;
  } else {
    cw = naturalW;
    ch = naturalW / targetAspect;
  }
  return { x: (naturalW - cw) / 2, y: (naturalH - ch) / 2, width: cw, height: ch };
}

/**
 * Re-fit a photo's crop to a new box size, keeping what the user chose: their
 * zoom (relative to a plain cover-crop of the old box) and the point they
 * centred on. Resizing, re-laying-out or swapping a photo used to reset the
 * crop to a centred cover-crop, silently discarding any crop work. With no
 * crop yet this is just coverCrop — which also means a never-cropped photo
 * gets cropped to its new shape rather than stretched into it.
 */
export function refitCrop(
  naturalW: number,
  naturalH: number,
  crop: CropRect | undefined,
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
): CropRect {
  const base = coverCrop(naturalW, naturalH, newW, newH);
  if (!crop || crop.width <= 0 || crop.height <= 0) return base;
  const oldBase = coverCrop(naturalW, naturalH, oldW, oldH);
  // min() of the two ratios: if the stored crop's aspect ever disagrees with
  // its box, err towards showing more of the photo, never less.
  const zoom = Math.max(1, Math.min(oldBase.width / crop.width, oldBase.height / crop.height));
  const width = base.width / zoom;
  const height = base.height / zoom;
  const cx = crop.x + crop.width / 2;
  const cy = crop.y + crop.height / 2;
  return {
    x: Math.max(0, Math.min(cx - width / 2, naturalW - width)),
    y: Math.max(0, Math.min(cy - height / 2, naturalH - height)),
    width,
    height,
  };
}

/**
 * Fraction of an image's area that survives a cover-crop into a cell of the
 * given aspect. 1 = perfect fit (no crop). Used to score layout candidates.
 */
export function keptFraction(imageAspect: number, cellAspect: number): number {
  if (imageAspect <= 0 || cellAspect <= 0) return 0;
  const r = imageAspect / cellAspect;
  return r > 1 ? 1 / r : r;
}
