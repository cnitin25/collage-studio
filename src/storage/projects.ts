import type { CanvasConfig, CollageItem } from '../types';
import type { LayoutSpec, SpacingOptions } from '../layout/types';
import {
  deleteAsset,
  deleteProjectRec,
  getAllAssetKeys,
  getAllProjectRecs,
  getAssetBlob,
  getProjectRec,
  hasAsset,
  putAsset,
  putProjectRec,
} from './db';

export interface SerializedState {
  canvas: CanvasConfig;
  items: CollageItem[];
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
}

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail?: string;
}

interface StoredProject extends ProjectMeta {
  state: SerializedState;
}

export interface SaveResult extends ProjectMeta {
  /** Photos that were neither already stored nor readable from their URL —
   * the project is saved, but these won't come back when it's reopened. */
  missingPhotos: number;
}

// Saves and garbage collection run one at a time. Otherwise a collection pass
// could run after a save has written its photo blobs but before it has written
// the project record that references them — and delete those blobs as orphans.
let storageQueue: Promise<unknown> = Promise.resolve();
function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = storageQueue.then(fn, fn);
  storageQueue = run.catch(() => {});
  return run;
}

/**
 * Store one photo blob under its assetId. Returns false only when the blob is
 * genuinely unavailable (no URL, or a URL that no longer resolves).
 *
 * A blob never changes under an existing assetId — replacing a photo or
 * uploading a background mints a new one — so an asset that's already stored
 * is skipped. Without that, every save (and every 30s auto-save) rewrote every
 * photo in the project.
 *
 * Storage errors are deliberately NOT caught: a full disk (QuotaExceededError)
 * must fail the save, not produce a project that says "Saved" with its photos
 * missing.
 */
async function persistAsset(assetId: string, src: string | undefined): Promise<boolean> {
  if (await hasAsset(assetId)) return true;
  if (!src) return false;
  let blob: Blob;
  try {
    blob = await fetch(src).then((r) => r.blob());
  } catch {
    return false;
  }
  await putAsset(assetId, blob);
  return true;
}

/** Delete every stored photo blob that no saved project references. */
async function collectGarbageAssets(): Promise<void> {
  const projects = (await getAllProjectRecs()) as StoredProject[];
  const live = new Set<string>();
  for (const p of projects) {
    for (const it of p.state.items) {
      if (it.type === 'image' && it.assetId) live.add(it.assetId);
    }
    if (p.state.canvas.backgroundAssetId) live.add(p.state.canvas.backgroundAssetId);
  }
  for (const key of await getAllAssetKeys()) {
    if (!live.has(key)) await deleteAsset(key);
  }
}

async function collectGarbageQuietly(): Promise<void> {
  try {
    await collectGarbageAssets();
  } catch (err) {
    // Cleanup is best-effort — a failure here must never fail the save/delete
    // that triggered it. Orphans are simply picked up by the next pass.
    console.warn('Collage Studio: asset cleanup failed', err);
  }
}

/**
 * Persist a project. Image blobs are recovered from their (blob:) object URLs
 * via fetch and stored under assetId, so reopening rebuilds them later.
 * Rejects if storage fails (e.g. the browser's quota is full).
 */
export function saveProject(args: {
  id: string;
  name: string;
  state: SerializedState;
  thumbnail?: string;
}): Promise<SaveResult> {
  return withStorageLock(() => saveProjectUnlocked(args));
}

async function saveProjectUnlocked(args: {
  id: string;
  name: string;
  state: SerializedState;
  thumbnail?: string;
}): Promise<SaveResult> {
  const { id, name, state, thumbnail } = args;

  let missingPhotos = 0;
  const seen = new Set<string>();
  for (const it of state.items) {
    if (it.type === 'image' && it.assetId && !seen.has(it.assetId)) {
      seen.add(it.assetId);
      if (!(await persistAsset(it.assetId, it.src))) missingPhotos++;
    }
  }

  // The background image lives on `canvas`, not in `items` — it needs the
  // same blob-persistence treatment or it silently vanishes on reopen (the
  // src is a blob: URL that dies with the page).
  const { backgroundType, backgroundImageSrc, backgroundAssetId } = state.canvas;
  if (backgroundType === 'image' && backgroundAssetId && !seen.has(backgroundAssetId)) {
    seen.add(backgroundAssetId);
    if (!(await persistAsset(backgroundAssetId, backgroundImageSrc))) missingPhotos++;
  }

  // `thumbnail` is optional per call (e.g. auto-save doesn't render one). Since
  // IndexedDB put() fully replaces the record rather than merging, an omitted
  // thumbnail must fall back to whatever was already stored — otherwise every
  // background auto-save would silently erase the thumbnail from the last
  // manual save.
  let finalThumbnail = thumbnail;
  if (finalThumbnail === undefined) {
    const existing = (await getProjectRec(id)) as StoredProject | undefined;
    finalThumbnail = existing?.thumbnail;
  }

  // Strip volatile object URLs; the blobs live in the assets store now.
  const items = state.items.map((it) => (it.type === 'image' ? { ...it, src: '' } : { ...it }));
  const canvas =
    backgroundType === 'image' && backgroundAssetId
      ? { ...state.canvas, backgroundImageSrc: '' }
      : state.canvas;
  const updatedAt = Date.now();
  await putProjectRec({ id, name, updatedAt, thumbnail: finalThumbnail, state: { ...state, items, canvas } });
  // A replaced or deleted photo leaves its old blob behind; drop it now.
  await collectGarbageQuietly();
  return { id, name, updatedAt, thumbnail: finalThumbnail, missingPhotos };
}

export async function openProject(
  id: string,
): Promise<{ meta: ProjectMeta; state: SerializedState } | null> {
  const rec = (await getProjectRec(id)) as StoredProject | undefined;
  if (!rec) return null;

  const items: CollageItem[] = [];
  for (const it of rec.state.items) {
    if (it.type === 'image' && it.assetId) {
      const blob = await getAssetBlob(it.assetId);
      items.push({ ...it, src: blob ? URL.createObjectURL(blob) : '' });
    } else {
      items.push(it);
    }
  }

  let canvas = rec.state.canvas;
  if (canvas.backgroundType === 'image' && canvas.backgroundAssetId) {
    const blob = await getAssetBlob(canvas.backgroundAssetId);
    canvas = { ...canvas, backgroundImageSrc: blob ? URL.createObjectURL(blob) : '' };
  }

  return {
    meta: { id: rec.id, name: rec.name, updatedAt: rec.updatedAt, thumbnail: rec.thumbnail },
    state: { ...rec.state, items, canvas },
  };
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = (await getAllProjectRecs()) as StoredProject[];
  return all
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, thumbnail: p.thumbnail }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Delete a project and every photo blob no other project still uses. */
export function removeProject(id: string): Promise<void> {
  return withStorageLock(async () => {
    await deleteProjectRec(id);
    await collectGarbageQuietly();
  });
}
