import type { EnhancePresetId, ImageFilters } from '../types';

export const NEUTRAL_FILTERS: ImageFilters = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  blur: 0,
  hue: 0,
  warmth: 0,
  enhance: 0,
  grayscale: false,
  sepia: false,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  vibrance: 0,
  sharpen: 0,
  vignette: 0,
};

/**
 * Detail and effects: a preset sets a photo's light and colour, and leaves
 * these as they were — choosing a look shouldn't take away a vignette.
 */
const EFFECT_KEYS = ['sharpen', 'vignette', 'blur'] as const;

/** The detail and effects set on a photo, to carry across a preset change. */
export function keptEffects(filters: ImageFilters | undefined): ImageFilters {
  const kept: ImageFilters = {};
  for (const key of EFFECT_KEYS) if (filters?.[key]) kept[key] = filters[key];
  return kept;
}

export type ColorStyle = 'grayscale' | 'sepia';

/**
 * Whether a photo has this colour style of its own. A preset's sepia doesn't
 * count: it belongs to the preset, whose chip is the one lit.
 */
export function hasColorStyle(filters: ImageFilters | undefined, style: ColorStyle): boolean {
  return !filters?.presetId && !!filters?.[style];
}

// New preset clicks start here rather than at 100% — the original full-recipe
// values read as too aggressive as a default (specifically reported for
// Brighten/Darken). The Strength slider can still go back up to 100.
export const DEFAULT_PRESET_STRENGTH = 60;

// Values are in the same UI units as the Adjust panel sliders, and represent
// the FULL (100%) strength version of each look. Warm uses colour temperature,
// not hue: rotating every hue to warm a photo also shifted its blues and greens.
export const ENHANCE_PRESETS: { id: EnhancePresetId; label: string; filters: ImageFilters }[] = [
  { id: 'brighten', label: 'Brighten', filters: { ...NEUTRAL_FILTERS, brightness: 35, contrast: 5 } },
  { id: 'darken', label: 'Darken', filters: { ...NEUTRAL_FILTERS, brightness: -35, contrast: 5 } },
  { id: 'antique', label: 'Antique', filters: { ...NEUTRAL_FILTERS, brightness: -5, contrast: -10, sepia: true } },
  { id: 'vivid', label: 'Vivid', filters: { ...NEUTRAL_FILTERS, brightness: 5, contrast: 20, saturation: 55 } },
  { id: 'warm', label: 'Warm', filters: { ...NEUTRAL_FILTERS, brightness: 3, saturation: 10, warmth: 45 } },
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

const NUMERIC_KEYS = [
  'brightness',
  'contrast',
  'saturation',
  'hue',
  'warmth',
  'enhance',
  'exposure',
  'highlights',
  'shadows',
  'vibrance',
] as const;

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
