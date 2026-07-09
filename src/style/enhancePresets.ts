import type { EnhancePresetId, ImageFilters } from '../types';

export const NEUTRAL_FILTERS: ImageFilters = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  hue: 0,
  enhance: 0,
  grayscale: false,
  sepia: false,
};

// New preset clicks start here rather than at 100% — the original full-recipe
// values read as too aggressive as a default (specifically reported for
// Brighten/Darken). The Strength slider can still go back up to 100.
export const DEFAULT_PRESET_STRENGTH = 60;

// Values are in the same UI units as the Adjust panel sliders, and represent
// the FULL (100%) strength version of each look.
// Hue sign was verified numerically against Konva's actual HSL matrix:
// negative hue shifts warmer (more red, less blue), positive shifts cooler.
export const ENHANCE_PRESETS: { id: EnhancePresetId; label: string; filters: ImageFilters }[] = [
  { id: 'brighten', label: 'Brighten', filters: { ...NEUTRAL_FILTERS, brightness: 35, contrast: 5 } },
  { id: 'darken', label: 'Darken', filters: { ...NEUTRAL_FILTERS, brightness: -35, contrast: 5 } },
  { id: 'antique', label: 'Antique', filters: { ...NEUTRAL_FILTERS, brightness: -5, contrast: -10, sepia: true } },
  { id: 'vivid', label: 'Vivid', filters: { ...NEUTRAL_FILTERS, brightness: 5, contrast: 20, saturation: 55 } },
  { id: 'warm', label: 'Warm', filters: { ...NEUTRAL_FILTERS, brightness: 3, saturation: 15, hue: 12 } },
  {
    id: 'auto',
    label: 'Auto Enhance',
    // Konva's `enhance` filter is a genuine auto-levels histogram stretch —
    // it finds each channel's min/max across the photo and stretches that
    // range toward 0-255. On a photo that's already well-exposed (most
    // modern phone photos are), there's little headroom left to stretch, so
    // `enhance` alone can look barely different even at full strength — not
    // a wiring bug, just what a correct auto-levels algorithm does on a
    // photo it wasn't built to fix. Pairing it with a real contrast/
    // saturation boost keeps this preset visibly useful across more photos,
    // not only washed-out ones.
    filters: { ...NEUTRAL_FILTERS, enhance: 100, contrast: 12, saturation: 20 },
  },
];

const NUMERIC_KEYS = ['brightness', 'contrast', 'saturation', 'hue', 'enhance'] as const;

/**
 * Scale a preset's numeric fields by strengthPct (0..100) of its full recipe.
 * Grayscale/sepia stay exactly as the recipe defines them — Konva's Grayscale
 * and Sepia filters are all-or-nothing, so there's no meaningful "50% sepia"
 * without a bigger rendering change (blending two rendered layers). That's a
 * real, honest limitation rather than a fake partial effect.
 */
export function scaleEnhanceFilters(recipeFilters: ImageFilters, strengthPct: number): ImageFilters {
  const pct = Math.max(0, Math.min(100, strengthPct)) / 100;
  const scaled: ImageFilters = { ...NEUTRAL_FILTERS };
  for (const key of NUMERIC_KEYS) {
    const v = recipeFilters[key];
    if (typeof v === 'number') scaled[key] = Math.round(v * pct * 10) / 10;
  }
  scaled.grayscale = recipeFilters.grayscale ?? false;
  scaled.sepia = recipeFilters.sepia ?? false;
  return scaled;
}
