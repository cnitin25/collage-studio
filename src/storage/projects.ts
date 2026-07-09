import type { CanvasConfig, CollageItem } from '../types';
import type { LayoutSpec, SpacingOptions } from '../layout/types';
import {
  deleteProjectRec,
  getAllProjectRecs,
  getAssetBlob,
  getProjectRec,
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

/**
 * Persist a project. Image blobs are recovered from their (blob:) object URLs
 * via fetch and stored under assetId, so reopening rebuilds them later.
 */
export async function saveProject(args: {
  id: string;
  name: string;
  state: SerializedState;
  thumbnail?: string;
}): Promise<ProjectMeta> {
  const { id, name, state, thumbnail } = args;

  const seen = new Set<string>();
  for (const it of state.items) {
    if (it.type === 'image' && it.assetId && it.src && !seen.has(it.assetId)) {
      seen.add(it.assetId);
      try {
        const blob = await fetch(it.src).then((r) => r.blob());
        await putAsset(it.assetId, blob);
      } catch {
        // image no longer available — skip; it just won't restore
      }
    }
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

  // Strip volatile object URLs; the blob lives in the assets store now.
  const items = state.items.map((it) => (it.type === 'image' ? { ...it, src: '' } : { ...it }));
  const updatedAt = Date.now();
  await putProjectRec({ id, name, updatedAt, thumbnail: finalThumbnail, state: { ...state, items } });
  return { id, name, updatedAt, thumbnail: finalThumbnail };
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

  return {
    meta: { id: rec.id, name: rec.name, updatedAt: rec.updatedAt, thumbnail: rec.thumbnail },
    state: { ...rec.state, items },
  };
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = (await getAllProjectRecs()) as StoredProject[];
  return all
    .map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, thumbnail: p.thumbnail }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeProject(id: string): Promise<void> {
  await deleteProjectRec(id);
}
