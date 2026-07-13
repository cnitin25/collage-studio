import type { CollageItem } from '../types';

function isBlobUrl(src: string | undefined): src is string {
  return !!src && src.startsWith('blob:');
}

/**
 * Revokes blob: object URLs that belonged to `removed` items but aren't
 * referenced anywhere in `aliveItemLists` — e.g. duplicateSelected() copies
 * an image item's src verbatim, so two items can share one blob URL, and
 * undo/redo history snapshots (structuredClone'd, but the src STRING is
 * still the same blob: URL) keep a "deleted" image's URL alive until that
 * history entry itself is gone. Pass current items plus every past/future
 * history snapshot's items as `aliveItemLists` so a delete-then-undo never
 * hands back an item pointing at an already-revoked URL.
 */
export function revokeUnusedImageUrls(
  removed: CollageItem[],
  aliveItemLists: CollageItem[][],
): void {
  const stillUsed = new Set<string>();
  for (const items of aliveItemLists) {
    for (const it of items) {
      if (it.type === 'image' && isBlobUrl(it.src)) stillUsed.add(it.src);
    }
  }
  for (const it of removed) {
    if (it.type === 'image' && isBlobUrl(it.src) && !stillUsed.has(it.src)) {
      URL.revokeObjectURL(it.src);
    }
  }
}
