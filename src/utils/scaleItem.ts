import type { CollageItem, TextItem } from '../types';

/**
 * An item's size, scaled: a text box by its font as well as its width, so it
 * doesn't rewrap, and with its effects, so it looks the same, only bigger or
 * smaller (they are in px, like the font).
 */
export function scaledBy(it: CollageItem, s: number): Partial<CollageItem> {
  if (it.type === 'image') return { width: it.width * s, height: it.height * s };
  if (it.type === 'text') return { width: it.width * s, fontSize: it.fontSize * s, ...scaledEffects(it, s) };
  const size = it.fontSize * s;
  return { fontSize: size, width: size, height: size };
}

/** Only the effects the text has: one it doesn't have stays unset. */
function scaledEffects(t: TextItem, s: number): Partial<TextItem> {
  const out: Partial<TextItem> = {};
  if (t.letterSpacing) out.letterSpacing = t.letterSpacing * s;
  if (t.outlineWidth) out.outlineWidth = t.outlineWidth * s;
  if (t.shadow) {
    const { blur, offsetX, offsetY } = t.shadow;
    out.shadow = { ...t.shadow, blur: blur * s, offsetX: offsetX * s, offsetY: offsetY * s };
  }
  if (t.background) {
    const { padding, radius } = t.background;
    out.background = { ...t.background, padding: padding * s, radius: radius * s };
  }
  return out;
}
