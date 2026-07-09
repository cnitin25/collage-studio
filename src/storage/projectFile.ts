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
      let src = it.src;
      try {
        const blob = await fetch(it.src).then((r) => r.blob());
        src = await blobToDataURL(blob);
      } catch {
        // leave src as-is if it can't be fetched; image just won't restore
      }
      embeddedItems.push({ ...it, src, assetId: undefined });
    } else {
      embeddedItems.push({ ...it });
    }
  }

  const file: ProjectFile = {
    fileVersion: FILE_VERSION,
    name,
    exportedAt: Date.now(),
    canvas,
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

  const items: CollageItem[] = raw.items.map((it) => {
    if (it.type === 'image') {
      const img = it as ImageItem;
      return { ...img, id: uid('img'), assetId: uid('asset') };
    }
    return {
      ...it,
      id: uid(it.type === 'text' ? 'txt' : 'stk'),
    };
  });

  return {
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Imported project',
    canvas: raw.canvas,
    items,
    spacing: raw.spacing,
    lastLayout: raw.lastLayout ?? null,
  };
}
