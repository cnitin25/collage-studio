import type {
  BackgroundType,
  BaseItem,
  BorderStyle,
  CanvasConfig,
  ClipShape,
  CollageItem,
  EnhancePresetId,
  ImageFilters,
  ImageItem,
  PatternKind,
  ShadowStyle,
  StickerItem,
  TextAlign,
  TextBackground,
  TextItem,
} from '../types';
import type { LayoutSpec, LayoutType, SpacingOptions } from '../layout/types';
import { uid } from '../utils/id';
import { downloadBlob } from '../utils/exportStage';

const FILE_VERSION = 1;

interface ProjectFile {
  fileVersion: number;
  name: string;
  exportedAt: number;
  canvas: CanvasConfig;
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
  items: CollageItem[]; // image items carry `src` as an embedded base64 data URL
}

/** The only image source a file may carry: one embedded in it. */
const EMBEDDED_IMAGE = /^data:image\/[a-z0-9.+-]+;base64,/i;

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Embed a (blob:) image URL as a data URL; undefined if it can't be read. */
async function embedImage(src: string | undefined): Promise<string | undefined> {
  if (!src) return undefined;
  try {
    const blob = await fetch(src).then((r) => r.blob());
    return await blobToDataURL(blob);
  } catch {
    return undefined;
  }
}

/**
 * Turn an embedded data: URL back into a blob: URL. Keeping multi-megabyte
 * base64 strings in editor state would copy every one of them into each undo
 * snapshot (structuredClone), and blob: URLs are what the rest of the app
 * expects anyway.
 */
async function dataUrlToObjectUrl(src: string): Promise<string | undefined> {
  try {
    return URL.createObjectURL(await fetch(src).then((r) => r.blob()));
  } catch {
    return undefined;
  }
}

function slugify(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'collage';
}

/**
 * Build a single portable, self-contained project file — every photo is
 * embedded as a base64 data URL — and trigger a browser download. Unlike the
 * in-browser Projects list (IndexedDB), this file lives wherever the user
 * saves it and can be reopened on any device/browser via "Import file".
 *
 * The photos go into the file as separate Blob parts, one at a time, rather
 * than spliced into one JSON string: base64 inflates each by a third, and one
 * string holding every photo at once could exhaust a phone's memory.
 */
export async function exportProjectFile(args: {
  name: string;
  canvas: CanvasConfig;
  items: CollageItem[];
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
}): Promise<void> {
  const { name, canvas, items, spacing, lastLayout } = args;

  // Each image source becomes a placeholder; the random nonce keeps one from
  // ever matching text the user typed.
  const nonce = Math.random().toString(36).slice(2, 10);
  const sources: (string | undefined)[] = [];
  const placeholder = (src: string | undefined) => `@@asset-${nonce}-${sources.push(src) - 1}@@`;

  const file: ProjectFile = {
    fileVersion: FILE_VERSION,
    name,
    exportedAt: Date.now(),
    // Kept while another background type is showing, as a save keeps it.
    canvas: {
      ...canvas,
      backgroundImageSrc: canvas.backgroundImageSrc ? placeholder(canvas.backgroundImageSrc) : undefined,
      backgroundAssetId: undefined,
    },
    spacing,
    lastLayout,
    items: items.map((it) => (it.type === 'image' ? { ...it, src: placeholder(it.src), assetId: undefined } : { ...it })),
  };

  // Split around the (quoted) placeholders: odd pieces are source indices.
  const pieces = JSON.stringify(file).split(new RegExp(`"@@asset-${nonce}-(\\d+)@@"`));
  let blob = new Blob([pieces[0]], { type: 'application/json' });
  for (let k = 1; k < pieces.length; k += 2) {
    // A photo that can't be read is written as empty; importing reports it.
    const data = (await embedImage(sources[Number(pieces[k])])) ?? '';
    blob = new Blob([blob, JSON.stringify(data), pieces[k + 1]], { type: 'application/json' });
  }
  downloadBlob(blob, `${slugify(name)}.collagestudio.json`);
}

/** A part of a project file that couldn't be used, for the import report. */
export interface SkippedPart {
  name: string;
  reason: string;
}

export interface ImportedProject {
  name: string;
  canvas: CanvasConfig;
  items: CollageItem[];
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
  /** Items (and a background) left out, each with the reason. */
  skipped: SkippedPart[];
}

type Json = Record<string, unknown>;

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPos = (v: unknown): v is number => isNum(v) && v > 0;
const isStr = (v: unknown): v is string => typeof v === 'string';

// Field readers: each returns the value if it's usable, else undefined.
const num = (v: unknown) => (isNum(v) ? v : undefined);
const nonNeg = (v: unknown) => (isNum(v) && v >= 0 ? v : undefined);
const pos = (v: unknown) => (isPos(v) ? v : undefined);
const str = (v: unknown) => (isStr(v) ? v : undefined);
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const within = (lo: number, hi: number) => (v: unknown) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const count = (v: unknown) => (isNum(v) && Number.isInteger(v) && v >= 0 ? v : undefined);
const atLeastOne = (v: unknown) => (isNum(v) && Number.isInteger(v) && v >= 1 ? v : undefined);
/** Every member of a string union, listed once: a member added to the type without one here fails the build. */
const members = <T extends string>(all: Record<T, true>) => Object.keys(all) as T[];
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (v: unknown) =>
    values.find((x) => x === v);

/**
 * One reader per field of T. Building items from these, rather than spreading
 * the parsed object, keeps anything the editor doesn't know out of its state —
 * and, because the map must name every field, adding a field to a type
 * without teaching the importer about it is a compile error rather than data
 * silently dropped on import.
 */
type Readers<T> = { [K in keyof T]-?: (v: unknown) => T[K] | undefined };

function read<T>(raw: Json, readers: Readers<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(readers) as (keyof T & string)[]) {
    const value = readers[key](raw[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

const LAYOUT_TYPES = members<LayoutType>({ grid: true, justified: true, mosaic: true, masonry: true, spotlight: true });
const BACKGROUND_TYPES = members<BackgroundType>({ color: true, gradient: true, image: true, pattern: true });
const PATTERN_KINDS = members<PatternKind>({ dots: true, grid: true, stripes: true, checker: true });
const BORDER_STYLES = members<BorderStyle>({ solid: true, dashed: true, dotted: true, glyph: true });
const CLIP_SHAPES = members<ClipShape>({ rect: true, circle: true, ellipse: true, heart: true });
const ALIGNS = members<TextAlign>({ left: true, center: true, right: true });
const PRESET_IDS = members<EnhancePresetId>({
  brighten: true,
  darken: true,
  antique: true,
  vivid: true,
  warm: true,
  auto: true,
});

const BASE: Readers<Omit<BaseItem, 'id' | 'type'>> = {
  x: num,
  y: num,
  width: pos,
  height: pos,
  rotation: num,
  opacity: within(0, 100),
  cornerRadius: nonNeg,
  borderColor: str,
  borderWidth: nonNeg,
};

const FILTERS: Readers<ImageFilters> = {
  brightness: within(-100, 100),
  contrast: within(-100, 100),
  saturation: within(-100, 100),
  blur: within(0, 40),
  hue: within(-180, 180),
  warmth: within(-100, 100),
  enhance: within(0, 100),
  grayscale: bool,
  sepia: bool,
  presetId: oneOf(PRESET_IDS),
  presetStrength: within(0, 100),
};

const SHADOW: Readers<ShadowStyle> = {
  color: str,
  blur: nonNeg,
  opacity: within(0, 1),
  offsetX: num,
  offsetY: num,
};

const CROP: Readers<NonNullable<ImageItem['crop']>> = { x: nonNeg, y: nonNeg, width: pos, height: pos };

/** A nested object whose fields are all required: all of them usable, or none. */
function readWhole<T>(raw: unknown, readers: Readers<T>): T | undefined {
  if (!isRecord(raw)) return undefined;
  const out = read(raw, readers);
  return Object.keys(out).length === Object.keys(readers).length ? (out as T) : undefined;
}

const IMAGE: Readers<Omit<ImageItem, keyof BaseItem | 'src' | 'assetId'>> = {
  naturalWidth: pos,
  naturalHeight: pos,
  crop: (v) => readWhole(v, CROP),
  filters: (v) => (isRecord(v) ? read(v, FILTERS) : undefined),
  shadow: (v) => readWhole(v, SHADOW),
  frame: str,
  borderStyle: oneOf(BORDER_STYLES),
  borderGlyph: str,
  clipShape: oneOf(CLIP_SHAPES),
  flipX: bool,
  flipY: bool,
};

const TEXT_BACKGROUND: Readers<TextBackground> = {
  color: str,
  opacity: within(0, 1),
  padding: within(0, 500),
  radius: within(0, 500),
};

const TEXT: Readers<Omit<TextItem, keyof BaseItem>> = {
  text: str,
  fontFamily: str,
  fontSize: pos,
  fontStyle: str,
  fill: str,
  align: oneOf(ALIGNS),
  lineHeight: pos,
  letterSpacing: within(-100, 500),
  outlineColor: str,
  outlineWidth: within(0, 100),
  shadow: (v) => readWhole(v, SHADOW),
  background: (v) => readWhole(v, TEXT_BACKGROUND),
};

const STICKER: Readers<Omit<StickerItem, keyof BaseItem>> = { emoji: str, fontSize: pos };

const CANVAS: Readers<Omit<CanvasConfig, 'backgroundImageSrc' | 'backgroundAssetId'>> = {
  width: pos,
  height: pos,
  backgroundType: oneOf(BACKGROUND_TYPES),
  backgroundColor: str,
  gradientFrom: str,
  gradientTo: str,
  gradientAngle: num,
  backgroundBlur: nonNeg,
  patternKind: oneOf(PATTERN_KINDS),
  patternColor: str,
  patternBg: str,
  patternScale: pos,
  frameBorderWidth: nonNeg,
  frameBorderColor: str,
  frameCornerRadius: nonNeg,
};

const SPACING: Readers<SpacingOptions> = { margin: nonNeg, gutter: nonNeg, padding: nonNeg };
const LAYOUT: Readers<LayoutSpec> = { type: oneOf(LAYOUT_TYPES), cols: atLeastOne, heroIndex: count };

const NOT_EMBEDDED =
  "It links to an outside address. Only photos embedded in the file are opened — nothing is ever fetched from the internet.";

/**
 * Parse a project file selected by the user. Rebuilds fresh ids for every
 * item. Hand-edited, truncated or foreign files are common enough that every
 * field is checked: an item the editor can't draw is left out and reported
 * rather than loaded half-broken (and then auto-saved that way), and an image
 * source that isn't embedded data is never loaded — the file can't make the
 * app fetch anything, nor taint the canvas so that export fails.
 */
export async function importProjectFile(file: File): Promise<ImportedProject> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isRecord(raw) || !Array.isArray(raw.items) || !isRecord(raw.canvas)) {
    throw new Error('This file is not a Collage Studio project.');
  }
  if (isNum(raw.fileVersion) && raw.fileVersion > FILE_VERSION) {
    throw new Error(
      'This project was saved by a newer version of Collage Studio. Reload the app to update it, then import it again.',
    );
  }
  const c = read(raw.canvas, CANVAS);
  if (!c.width || !c.height || c.width > 20_000 || c.height > 20_000) {
    throw new Error("This project's canvas size is missing or not valid.");
  }

  const skipped: SkippedPart[] = [];
  const items: CollageItem[] = [];
  let photos = 0;
  let texts = 0;
  for (const it of raw.items as unknown[]) {
    const kind = isRecord(it) ? it.type : undefined;
    const base: Partial<Omit<BaseItem, 'id' | 'type'>> = isRecord(it) ? read(it, BASE) : {};
    const { x, y } = base;
    const placed = x !== undefined && y !== undefined;
    const rotation = base.rotation ?? 0;
    if (kind === 'image' && isRecord(it)) {
      const label = `Photo ${++photos}`;
      const image = read(it, IMAGE);
      const { width, height } = base;
      const { naturalWidth, naturalHeight } = image;
      if (!placed || !width || !height || !naturalWidth || !naturalHeight) {
        skipped.push({ name: label, reason: 'Its size or position is missing.' });
        continue;
      }
      if (!isStr(it.src) || !EMBEDDED_IMAGE.test(it.src)) {
        skipped.push({
          name: label,
          reason: isStr(it.src) && /^https?:/i.test(it.src) ? NOT_EMBEDDED : "The photo isn't in the file.",
        });
        continue;
      }
      const src = await dataUrlToObjectUrl(it.src);
      if (!src) {
        skipped.push({ name: label, reason: "The embedded photo couldn't be read." });
        continue;
      }
      // A crop reaching outside the photo draws nothing in some browsers.
      const { crop } = image;
      const cropFits =
        !crop || (crop.x + crop.width <= naturalWidth + 0.5 && crop.y + crop.height <= naturalHeight + 0.5);
      items.push({
        ...base,
        ...image,
        crop: cropFits ? crop : undefined,
        type: 'image',
        id: uid('img'),
        x,
        y,
        width,
        height,
        rotation,
        naturalWidth,
        naturalHeight,
        src,
        assetId: uid('asset'),
      });
    } else if (kind === 'text' && isRecord(it)) {
      const label = `Text ${++texts}`;
      const t = read(it, TEXT);
      const { width } = base;
      const { text, fontSize } = t;
      if (!placed || !width || text === undefined || !fontSize) {
        skipped.push({ name: label, reason: 'Its text, size or position is missing.' });
        continue;
      }
      items.push({
        ...base,
        ...t,
        type: 'text',
        id: uid('txt'),
        x,
        y,
        width,
        height: base.height ?? fontSize * 1.4,
        rotation,
        text,
        fontSize,
        fontFamily: t.fontFamily ?? 'Inter, system-ui, sans-serif',
        fontStyle: t.fontStyle ?? 'normal',
        fill: t.fill ?? '#15171d',
        align: t.align ?? 'center',
      });
    } else if (kind === 'sticker' && isRecord(it)) {
      const s = read(it, STICKER);
      const { emoji, fontSize } = s;
      if (!placed || emoji === undefined || !fontSize) {
        skipped.push({ name: 'A sticker', reason: 'Its emoji, size or position is missing.' });
        continue;
      }
      items.push({
        ...base,
        type: 'sticker',
        id: uid('stk'),
        x,
        y,
        width: fontSize,
        height: fontSize,
        rotation,
        emoji,
        fontSize,
      });
    } else {
      skipped.push({ name: 'An item', reason: `Its kind ("${String(kind)}") isn't one this version knows.` });
    }
  }

  // A blob: URL inside a file is always dead — it belonged to the page that
  // exported it (older exports stored the background image this way).
  let bgSrc: string | undefined;
  const bg = raw.canvas.backgroundImageSrc;
  if (isStr(bg) && EMBEDDED_IMAGE.test(bg)) {
    bgSrc = await dataUrlToObjectUrl(bg);
    if (!bgSrc) skipped.push({ name: 'Background image', reason: "The embedded image couldn't be read." });
  } else if (isStr(bg) && /^https?:/i.test(bg)) {
    skipped.push({ name: 'Background image', reason: NOT_EMBEDDED });
  }

  const canvas: CanvasConfig = {
    ...c,
    width: c.width,
    height: c.height,
    backgroundType: c.backgroundType ?? 'color',
    backgroundColor: c.backgroundColor ?? '#ffffff',
    backgroundImageSrc: bgSrc,
    backgroundAssetId: bgSrc ? uid('asset') : undefined,
  };

  // Layout code dereferences spacing.margin etc. unconditionally, so a file
  // without it (hand-edited, or truncated) would crash the editor.
  const spacing = readWhole(raw.spacing, SPACING) ?? { margin: 24, gutter: 12, padding: 0 };
  const layout = isRecord(raw.lastLayout) ? read(raw.lastLayout, LAYOUT) : {};

  return {
    name: isStr(raw.name) && raw.name.trim() ? raw.name : 'Imported project',
    canvas,
    items,
    spacing,
    lastLayout: layout.type ? { ...layout, type: layout.type } : null,
    skipped,
  };
}
