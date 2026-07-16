export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LayoutType = 'grid' | 'justified' | 'mosaic' | 'masonry' | 'spotlight';

export interface SpacingOptions {
  /** gap between the collage content and the canvas edge (px) */
  margin: number;
  /** gap between cells (px) */
  gutter: number;
  /** inset of the image inside its cell (px) — reveals background as a frame */
  padding: number;
}

export interface LayoutOptions extends SpacingOptions {
  canvasWidth: number;
  canvasHeight: number;
}

export interface LayoutSpec {
  type: LayoutType;
  /** columns, for the grid/masonry strategies */
  cols?: number;
  /** index of the featured item, for the spotlight strategy (default 0) */
  heroIndex?: number;
}
