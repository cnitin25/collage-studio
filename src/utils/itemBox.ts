import Konva from 'konva';
import { DEFAULT_LINE_HEIGHT, type CollageItem, type TextItem } from '../types';

// One detached Konva.Text, reused for measuring. Konva lays text out (wrapping
// included) without a stage, so this gives exactly the height the canvas will
// draw — re-implementing its wrapping here would drift from it.
let probe: Konva.Text | null = null;

/** Rendered height of a text item: every wrapped line × fontSize × lineHeight. */
export function textHeight(item: TextItem): number {
  probe ??= new Konva.Text();
  probe.setAttrs({
    text: item.text,
    width: item.width,
    fontSize: item.fontSize,
    fontFamily: item.fontFamily,
    fontStyle: item.fontStyle,
    lineHeight: item.lineHeight ?? DEFAULT_LINE_HEIGHT,
  });
  return probe.height();
}

/**
 * The unrotated size of an item as drawn. `height` on a text item is not kept
 * in sync with its content (the box's height is derived from the text), and a
 * sticker is a single glyph `fontSize` tall, so neither can use width/height.
 */
export function itemSize(item: CollageItem): { width: number; height: number } {
  if (item.type === 'sticker') return { width: item.fontSize, height: item.fontSize };
  if (item.type === 'text') return { width: item.width, height: textHeight(item) };
  return { width: item.width, height: item.height };
}
