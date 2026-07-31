// Central data model. Fields marked "(Phase N)" aren't wired into the UI yet,
// but they live here now so the store and Konva nodes don't need reshaping later.

export type ItemType = 'image' | 'text' | 'sticker';

export interface BaseItem {
  id: string;
  type: ItemType;
  /** position of the item's top-left in canvas space (px) */
  x: number;
  y: number;
  /** rendered size in canvas space (px) — scale is always baked back to width/height */
  width: number;
  height: number;
  /** degrees */
  rotation: number;
  /** 0–100, default 100 */
  opacity?: number;

  // ---- styling (wired up in later phases) ----
  cornerRadius?: number; // Phase 2
  borderColor?: string; // Phase 2
  borderWidth?: number; // Phase 2
}

export interface ImageFilters {
  // All in UI units, converted to Konva units at render time.
  brightness?: number; // -100..100  (Phase 3)
  contrast?: number; // -100..100    (Phase 3)
  saturation?: number; // -100..100  (Phase 3)
  blur?: number; // 0..40 px         (Phase 3)
  hue?: number; // -180..180, UI convention: POSITIVE = warmer. Negated at
  // render time since Konva's own hue property runs the opposite direction
  // (verified numerically against its HSL matrix — see ImageNode.tsx).
  enhance?: number; // 0..100, Konva's auto-enhance strength (v2)
  grayscale?: boolean; // mutually exclusive with sepia (v2)
  sepia?: boolean; // mutually exclusive with grayscale (v2)
  // Remembers which preset produced these values and at what strength, so the
  // Strength slider can recompute from the ORIGINAL recipe rather than
  // compounding scale-downs on an already-scaled value.
  presetId?: EnhancePresetId;
  presetStrength?: number; // 0..100
}

export type EnhancePresetId =
  | 'brighten'
  | 'darken'
  | 'antique'
  | 'vivid'
  | 'warm'
  | 'auto';


export interface ShadowStyle {
  color: string;
  blur: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
}

export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'glyph';
export type ClipShape = 'rect' | 'circle' | 'ellipse' | 'heart';

export interface ImageItem extends BaseItem {
  type: 'image';
  src: string; // object URL (Phase 1) — moves to IndexedDB blobs at the offline phase
  naturalWidth: number;
  naturalHeight: number;
  /** crop rect in SOURCE pixels */
  crop?: { x: number; y: number; width: number; height: number };
  filters?: ImageFilters;
  shadow?: ShadowStyle; // Phase 3 (used by frames)
  frame?: string; // active frame preset id, for UI state (Phase 3)
  borderStyle?: BorderStyle; // Phase 6
  borderGlyph?: string; // Phase 6 (when borderStyle === 'glyph')
  clipShape?: ClipShape; // Phase 7 (heart/circle/oval)
  flipX?: boolean;
  flipY?: boolean;
  /** stable id of the persisted image blob in IndexedDB (Phase 6) */
  assetId?: string;
}

// Widens to `ImageItem | TextItem | StickerItem` in Phase 3.
export interface TextItem extends BaseItem {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string; // 'normal' | 'bold' | 'italic' | 'italic bold'
  fill: string;
  align: 'left' | 'center' | 'right';
}

export interface StickerItem extends BaseItem {
  type: 'sticker';
  emoji: string;
  fontSize: number;
}

export type CollageItem = ImageItem | TextItem | StickerItem;

export type TextAlign = 'left' | 'center' | 'right';

export type BackgroundType = 'color' | 'gradient' | 'image' | 'pattern';

export type PatternKind = 'dots' | 'grid' | 'stripes' | 'checker';

export interface CanvasConfig {
  width: number;
  height: number;
  backgroundType: BackgroundType;
  backgroundColor: string;

  // gradient
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number; // degrees

  // image / blurred (blurred = image with backgroundBlur > 0)
  backgroundImageSrc?: string;
  // Identifies the blob backing backgroundImageSrc so saveProject/openProject
  // can persist and rebuild it — backgroundImageSrc alone is a volatile blob:
  // URL that dies on reload, same reason ImageItem carries assetId.
  backgroundAssetId?: string;
  backgroundBlur?: number; // px

  // pattern
  patternKind?: PatternKind;
  patternColor?: string;
  patternBg?: string;
  patternScale?: number; // tile size px

  // whole-collage frame (border + rounded corners around the entire canvas)
  frameBorderWidth?: number;
  frameBorderColor?: string;
  frameCornerRadius?: number;
}

/** The subset of an image's look that can be copied to other photos. */
export type ImageStyle = Pick<
  ImageItem,
  'borderWidth' | 'borderColor' | 'cornerRadius' | 'shadow' | 'frame' | 'filters'
>;

export interface CanvasPreset {
  label: string;
  width: number;
  height: number;
}
