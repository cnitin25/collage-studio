// The sticker palette, drawn from bundled Twemoji images (CC BY 4.0, see
// assets/stickers/LICENSE.md) rather than each device's own emoji font, so a
// sticker looks the same on every device and in every export.

export const STICKERS = [
  '⭐', '❤️', '✨', '🎉', '🌟', '🔥', '😍', '😎',
  '🥳', '🌈', '☀️', '🌸', '🍩', '🎈', '👑', '💯',
  '📌', '✅', '➡️', '💬', '🦄', '🐱', '🌿', '🎂',
];

/**
 * Twemoji's file name for an emoji: its code points in hex, joined by `-`,
 * without the emoji presentation selector (U+FE0F) unless the sequence is
 * joined with a zero-width joiner, where Twemoji keeps it.
 */
export function twemojiName(emoji: string): string {
  const points = [...emoji].map((c) => c.codePointAt(0)!);
  const kept = points.includes(0x200d) ? points : points.filter((p) => p !== 0xfe0f);
  return kept.map((p) => p.toString(16)).join('-');
}

const IMAGES = import.meta.glob<string>('../assets/stickers/*.svg', { eager: true, import: 'default' });

/** The bundled image for an emoji, or undefined for one the palette doesn't have (drawn as text). */
export function stickerImage(emoji: string): string | undefined {
  return IMAGES[`../assets/stickers/${twemojiName(emoji)}.svg`];
}
