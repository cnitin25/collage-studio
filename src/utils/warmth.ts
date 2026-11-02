/**
 * Colour temperature as a Konva filter: warmer lifts red and lowers blue,
 * cooler the reverse — a white-balance shift. "Warmth" used to be a hue
 * rotation, which turns blue skies purple and skin green well before a photo
 * reads as warm. `amount` is in UI units, -100..100.
 */
export function warmthFilter(amount: number) {
  const k = Math.max(-100, Math.min(100, amount)) / 100;
  const red = 1 + 0.25 * k;
  const green = 1 + 0.05 * k;
  const blue = 1 - 0.25 * k;
  return function Warmth(imageData: ImageData) {
    const d = imageData.data; // Uint8ClampedArray: clamps and rounds on write
    for (let i = 0; i < d.length; i += 4) {
      d[i] *= red;
      d[i + 1] *= green;
      d[i + 2] *= blue;
    }
  };
}
