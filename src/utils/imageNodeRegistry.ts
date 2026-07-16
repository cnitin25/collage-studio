import type Konva from 'konva';

// Lets sidebar panels (e.g. the histogram) reach the actual rendered Konva
// node for a photo, so they can read its current filtered/cropped pixels
// instead of only the original source file.
const nodes = new Map<string, Konva.Image>();

export function registerImageNode(id: string, node: Konva.Image | null): void {
  if (node) nodes.set(id, node);
  else nodes.delete(id);
}

export function getImageNode(id: string): Konva.Image | undefined {
  return nodes.get(id);
}
