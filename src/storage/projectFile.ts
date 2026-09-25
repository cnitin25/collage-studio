import type { CanvasConfig, CollageItem, ImageItem } from '../types';
import type { LayoutSpec, SpacingOptions } from '../layout/types';
import { uid } from '../utils/id';

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
async function dataUrlToObjectUrl(src: string | undefined): Promise<string | undefined> {
  // A blob: URL inside a file is always dead — it belonged to the page that
  // exported it (older exports stored the background image this way).
  if (!src || src.startsWith('blob:')) return undefined;
  if (!src.startsWith('data:')) return src;
  try {
    return URL.createObjectURL(await fetch(src).then((r) => r.blob()));
  } catch {
    return src; // still renderable as-is
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
 */
export async function exportProjectFile(args: {
  name: string;
  canvas: CanvasConfig;
  items: CollageItem[];
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
}): Promise<void> {
  const { name, canvas, items, spacing, lastLayout } = args;

  const embeddedItems: CollageItem[] = [];
  for (const it of items) {
    if (it.type === 'image') {
      // leave src as-is if it can't be fetched; image just won't restore
      const src = (await embedImage(it.src)) ?? it.src;
      embeddedItems.push({ ...it, src, assetId: undefined });
    } else {
      embeddedItems.push({ ...it });
    }
  }

  // The background image is a blob: URL too — embed it like the photos, or the
  // file carries a link that is dead the moment this page closes.
  const embeddedCanvas: CanvasConfig =
    canvas.backgroundType === 'image'
      ? { ...canvas, backgroundImageSrc: await embedImage(canvas.backgroundImageSrc), backgroundAssetId: undefined }
      : { ...canvas, backgroundImageSrc: undefined, backgroundAssetId: undefined };

  const file: ProjectFile = {
    fileVersion: FILE_VERSION,
    name,
    exportedAt: Date.now(),
    canvas: embeddedCanvas,
    spacing,
    lastLayout,
    items: embeddedItems,
  };

  const json = JSON.stringify(file);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slugify(name)}.collagestudio.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ImportedProject {
  name: string;
  canvas: CanvasConfig;
  items: CollageItem[];
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
}

/** Parse a project file selected by the user. Rebuilds fresh ids for every item. */
export async function importProjectFile(file: File): Promise<ImportedProject> {
  const text = await file.text();
  let raw: ProjectFile;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items) || !raw.canvas) {
    throw new Error('This file is not a Collage Studio project.');
  }

  const items: CollageItem[] = [];
  for (const it of raw.items) {
    if (it.type === 'image') {
      const img = it as ImageItem;
      items.push({ ...img, src: (await dataUrlToObjectUrl(img.src)) ?? '', id: uid('img'), assetId: uid('asset') });
    } else {
      items.push({ ...it, id: uid(it.type === 'text' ? 'txt' : 'stk') });
    }
  }

  const bgSrc = await dataUrlToObjectUrl(raw.canvas.backgroundImageSrc);
  const canvas: CanvasConfig = {
    ...raw.canvas,
    backgroundImageSrc: bgSrc,
    backgroundAssetId: bgSrc ? uid('asset') : undefined,
  };

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Imported project',
    canvas,
    items,
    // Layout code dereferences spacing.margin etc. unconditionally, so a file
    // without it (hand-edited, or truncated) would crash the editor.
    spacing:
      raw.spacing && typeof raw.spacing.margin === 'number'
        ? raw.spacing
        : { margin: 24, gutter: 12, padding: 0 },
    lastLayout: raw.lastLayout ?? null,
  };
}
