import type { BackgroundType, CanvasConfig, CollageItem, ImageItem, StickerItem, TextItem } from '../types';
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

const LAYOUT_TYPES: readonly LayoutType[] = ['grid', 'justified', 'mosaic', 'masonry', 'spotlight'];
const BACKGROUND_TYPES: readonly BackgroundType[] = ['color', 'gradient', 'image', 'pattern'];
const ALIGNS = ['left', 'center', 'right'] as const;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPos = (v: unknown): v is number => isNum(v) && v > 0;
const isStr = (v: unknown): v is string => typeof v === 'string';

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
  let raw: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !raw.canvas || typeof raw.canvas !== 'object') {
    throw new Error('This file is not a Collage Studio project.');
  }
  if (isNum(raw.fileVersion) && raw.fileVersion > FILE_VERSION) {
    throw new Error(
      'This project was saved by a newer version of Collage Studio. Reload the app to update it, then import it again.',
    );
  }
  const c = raw.canvas;
  if (!isPos(c.width) || !isPos(c.height) || c.width > 20_000 || c.height > 20_000) {
    throw new Error("This project's canvas size is missing or not valid.");
  }

  const skipped: SkippedPart[] = [];
  const items: CollageItem[] = [];
  let photos = 0;
  let texts = 0;
  for (const it of raw.items) {
    const placed = it && isNum(it.x) && isNum(it.y);
    const rotation = isNum(it?.rotation) ? it.rotation : 0;
    if (it?.type === 'image') {
      const label = `Photo ${++photos}`;
      if (!placed || !isPos(it.width) || !isPos(it.height) || !isPos(it.naturalWidth) || !isPos(it.naturalHeight)) {
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
      items.push({ ...(it as ImageItem), rotation, src, id: uid('img'), assetId: uid('asset') });
    } else if (it?.type === 'text') {
      const label = `Text ${++texts}`;
      if (!placed || !isPos(it.width) || !isStr(it.text) || !isPos(it.fontSize)) {
        skipped.push({ name: label, reason: 'Its text, size or position is missing.' });
        continue;
      }
      const item: TextItem = {
        ...(it as TextItem),
        rotation,
        height: isPos(it.height) ? it.height : it.fontSize * 1.4,
        fontFamily: isStr(it.fontFamily) ? it.fontFamily : 'Inter, system-ui, sans-serif',
        fontStyle: isStr(it.fontStyle) ? it.fontStyle : 'normal',
        fill: isStr(it.fill) ? it.fill : '#15171d',
        align: ALIGNS.includes(it.align) ? it.align : 'center',
        id: uid('txt'),
      };
      items.push(item);
    } else if (it?.type === 'sticker') {
      if (!placed || !isStr(it.emoji) || !isPos(it.fontSize)) {
        skipped.push({ name: 'A sticker', reason: 'Its emoji, size or position is missing.' });
        continue;
      }
      const item: StickerItem = {
        ...(it as StickerItem),
        rotation,
        width: it.fontSize,
        height: it.fontSize,
        id: uid('stk'),
      };
      items.push(item);
    } else {
      skipped.push({ name: 'An item', reason: `Its kind ("${String(it?.type)}") isn't one this version knows.` });
    }
  }

  // A blob: URL inside a file is always dead — it belonged to the page that
  // exported it (older exports stored the background image this way).
  let bgSrc: string | undefined;
  const bg = c.backgroundImageSrc;
  if (isStr(bg) && EMBEDDED_IMAGE.test(bg)) {
    bgSrc = await dataUrlToObjectUrl(bg);
    if (!bgSrc) skipped.push({ name: 'Background image', reason: "The embedded image couldn't be read." });
  } else if (isStr(bg) && /^https?:/i.test(bg)) {
    skipped.push({ name: 'Background image', reason: NOT_EMBEDDED });
  }

  const canvas: CanvasConfig = {
    ...(c as CanvasConfig),
    backgroundType: BACKGROUND_TYPES.includes(c.backgroundType) ? c.backgroundType : 'color',
    backgroundColor: isStr(c.backgroundColor) ? c.backgroundColor : '#ffffff',
    backgroundImageSrc: bgSrc,
    backgroundAssetId: bgSrc ? uid('asset') : undefined,
  };

  return {
    name: isStr(raw.name) && raw.name.trim() ? raw.name : 'Imported project',
    canvas,
    items,
    // Layout code dereferences spacing.margin etc. unconditionally, so a file
    // without it (hand-edited, or truncated) would crash the editor.
    spacing:
      raw.spacing && isNum(raw.spacing.margin) && isNum(raw.spacing.gutter) && isNum(raw.spacing.padding)
        ? raw.spacing
        : { margin: 24, gutter: 12, padding: 0 },
    lastLayout: raw.lastLayout && LAYOUT_TYPES.includes(raw.lastLayout.type) ? raw.lastLayout : null,
    skipped,
  };
}
