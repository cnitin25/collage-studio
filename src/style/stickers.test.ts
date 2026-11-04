import { describe, expect, it } from 'vitest';
import { STICKERS, stickerImage, twemojiName } from './stickers';

describe('sticker images', () => {
  it('names an emoji’s image by its code points, without the presentation selector', () => {
    expect(twemojiName('⭐')).toBe('2b50');
    expect(twemojiName('🌟')).toBe('1f31f');
    expect(twemojiName('❤️')).toBe('2764');
    expect(twemojiName('➡️')).toBe('27a1');
  });

  it('keeps the selector inside a joined sequence, as Twemoji names those', () => {
    expect(twemojiName('🏳️‍🌈')).toBe('1f3f3-fe0f-200d-1f308');
  });

  it('has a bundled image for every sticker in the palette', () => {
    for (const emoji of STICKERS) expect(stickerImage(emoji), emoji).toBeTruthy();
  });

  it('has none for an emoji outside the palette, which is drawn as text', () => {
    expect(stickerImage('🦖')).toBeUndefined();
  });
});
