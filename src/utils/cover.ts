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
 * Fraction of an image's area that survives a cover-crop into a cell of the
 * given aspect. 1 = perfect fit (no crop). Used to score layout candidates.
 */
export function keptFraction(imageAspect: number, cellAspect: number): number {
  if (imageAspect <= 0 || cellAspect <= 0) return 0;
  const r = imageAspect / cellAspect;
  return r > 1 ? 1 / r : r;
}
