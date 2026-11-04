import { describe, expect, it } from 'vitest';
import type { ImageItem, StickerItem, TextItem } from '../types';
import { scaledBy } from './scaleItem';

const base = { x: 0, y: 0, rotation: 0 };
const text: TextItem = {
  ...base,
  id: 't',
  type: 'text',
  text: 'Hello',
  width: 300,
  height: 70,
  fontFamily: 'Inter',
  fontSize: 50,
  fontStyle: 'normal',
  fill: '#ffffff',
  align: 'center',
};

describe('scaledBy', () => {
  it('scales a photo’s box', () => {
    const photo: ImageItem = { ...base, id: 'p', type: 'image', src: 'blob:x', naturalWidth: 1200, naturalHeight: 800, width: 300, height: 200 };
    expect(scaledBy(photo, 0.5)).toEqual({ width: 150, height: 100 });
  });

  it('scales a sticker by its glyph size', () => {
    const sticker: StickerItem = { ...base, id: 's', type: 'sticker', emoji: '🌟', fontSize: 100, width: 100, height: 100 };
    expect(scaledBy(sticker, 2)).toEqual({ fontSize: 200, width: 200, height: 200 });
  });

  it('scales a text box’s font with its width, so it keeps its wrapping', () => {
    expect(scaledBy(text, 0.5)).toEqual({ width: 150, fontSize: 25 });
  });

  it('scales text effects with the font, so the text looks the same, only smaller', () => {
    const styled: TextItem = {
      ...text,
      letterSpacing: 4,
      outlineColor: '#000000',
      outlineWidth: 6,
      shadow: { color: '#000000', blur: 10, opacity: 0.6, offsetX: 3, offsetY: -4 },
      background: { color: '#ffcc00', opacity: 0.8, padding: 12, radius: 8 },
    };
    expect(scaledBy(styled, 0.5)).toEqual({
      width: 150,
      fontSize: 25,
      letterSpacing: 2,
      outlineWidth: 3,
      // Colour and opacity are kept: only lengths scale.
      shadow: { color: '#000000', blur: 5, opacity: 0.6, offsetX: 1.5, offsetY: -2 },
      background: { color: '#ffcc00', opacity: 0.8, padding: 6, radius: 4 },
    });
  });

  it('leaves effects a text doesn’t have unset', () => {
    const patch = scaledBy({ ...text, outlineWidth: 0, letterSpacing: 0 }, 2);
    expect(Object.keys(patch).sort()).toEqual(['fontSize', 'width']);
  });
});
