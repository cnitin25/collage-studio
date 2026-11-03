import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollageItem, ImageItem, StickerItem, TextItem } from '../types';

// Sizes as drawn, like the real itemBox: a text box is as tall as its font
// makes it, whatever its stored height says, and a sticker is one glyph.
const drawnSize = (it: CollageItem) =>
  it.type === 'text'
    ? { width: it.width, height: it.fontSize * 1.4 }
    : it.type === 'sticker'
      ? { width: it.fontSize, height: it.fontSize }
      : { width: it.width, height: it.height };

vi.mock('../utils/itemBox', () => ({
  textHeight: (t: { fontSize: number }) => t.fontSize * 1.4,
  itemSize: drawnSize,
}));

const { useEditorStore } = await import('./useEditorStore');

const s = () => useEditorStore.getState();
const photo = { src: 'blob:test/photo', naturalWidth: 1200, naturalHeight: 800 };
const centre = (it: CollageItem) => {
  const { width, height } = drawnSize(it);
  return { x: it.x + width / 2, y: it.y + height / 2 };
};
let clock = 0;

/** A text box centred on (250, 240) and a sticker on (750, 750), on a 1000x1000 canvas. */
function textAndSticker(): [string, string] {
  s().setCanvasSize(1000, 1000);
  s().addText();
  s().addSticker('🌟');
  const [text, sticker] = s().items.map((i) => i.id);
  s().updateItem(text, { x: 100, y: 205, width: 300, fontSize: 50 });
  s().updateItem(sticker, { x: 700, y: 700, width: 100, height: 100, fontSize: 100 });
  return [text, sticker];
}

beforeEach(() => {
  s().resetProject();
  clock += 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

describe('changing the canvas size', () => {
  it('moves text and stickers with the canvas, keeping their place in it', () => {
    textAndSticker();
    s().setCanvasSize(1000, 2000);
    const [t, st] = s().items as [TextItem, StickerItem];
    expect(centre(t)).toEqual({ x: 250, y: 480 });
    expect([t.width, t.fontSize]).toEqual([300, 50]); // the width didn't change, so neither does the size
    expect(centre(st)).toEqual({ x: 750, y: 1500 });
  });

  it('shrinks them to fit a smaller canvas, without stretching them', () => {
    textAndSticker();
    s().setCanvasSize(500, 1000);
    const [t, st] = s().items as [TextItem, StickerItem];
    expect(centre(t)).toEqual({ x: 125, y: 240 });
    expect([t.width, t.fontSize]).toEqual([150, 25]);
    expect(centre(st)).toEqual({ x: 375, y: 750 });
    expect([st.width, st.height, st.fontSize]).toEqual([50, 50, 50]);
  });

  it('scales everything up for a larger canvas of the same shape', () => {
    textAndSticker();
    s().setCanvasSize(2000, 2000);
    const [t, st] = s().items as [TextItem, StickerItem];
    expect(centre(t)).toEqual({ x: 500, y: 480 });
    expect(t.fontSize).toBe(100);
    expect(st.fontSize).toBe(200);
  });

  it('leaves photos to the layout when there is one', () => {
    s().setCanvasSize(1000, 1000);
    s().addImages([photo, photo]);
    s().applyLayout({ type: 'grid' });
    s().setCanvasSize(1000, 2000);
    const boxes = () =>
      s()
        .items.filter((i) => i.type === 'image')
        .map(({ x, y, width, height }) => ({ x, y, width, height }));
    const resized = boxes();
    s().applyLayout({ type: 'grid' });
    expect(resized).toEqual(boxes());
  });

  it('moves a freely placed photo like the rest, keeping its shape and its crop', () => {
    s().setCanvasSize(1000, 1000);
    s().addImages([photo]);
    const id = s().items[0].id;
    const crop = { x: 100, y: 0, width: 800, height: 800 };
    s().updateItem(id, { x: 600, y: 100, width: 300, height: 300, crop });
    expect(s().lastLayout).toBeNull();
    s().setCanvasSize(2000, 1000);
    const p = s().items[0] as ImageItem;
    expect(centre(p)).toEqual({ x: 1500, y: 250 });
    expect([p.width, p.height]).toEqual([300, 300]);
    expect(p.crop).toEqual(crop);
  });

  it('keeps a rotated item turning about the same place in the canvas', () => {
    s().setCanvasSize(1000, 1000);
    s().addSticker('🌟');
    const id = s().items[0].id;
    s().updateItem(id, { x: 400, y: 300, width: 100, height: 100, fontSize: 100, rotation: 90 });
    // Items turn about their top-left corner: at 90° the box hangs to the left.
    const drawnCentre = (it: CollageItem) => {
      const r = (it.rotation * Math.PI) / 180;
      return {
        x: it.x + (it.width / 2) * Math.cos(r) - (it.height / 2) * Math.sin(r),
        y: it.y + (it.width / 2) * Math.sin(r) + (it.height / 2) * Math.cos(r),
      };
    };
    const before = drawnCentre(s().items[0]);
    s().setCanvasSize(2000, 2000);
    const after = drawnCentre(s().items[0]);
    expect(after.x).toBeCloseTo(before.x * 2, 6);
    expect(after.y).toBeCloseTo(before.y * 2, 6);
    expect(s().items[0].rotation).toBe(90);
  });

  it('is one undo step', () => {
    textAndSticker();
    const before = s().items;
    s().setCanvasSize(500, 500);
    s().undo();
    expect(s().items).toBe(before);
    expect([s().canvas.width, s().canvas.height]).toEqual([1000, 1000]);
  });
});
