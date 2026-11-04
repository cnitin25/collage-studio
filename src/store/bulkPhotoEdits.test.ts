import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageItem } from '../types';
import { NEUTRAL_FILTERS } from '../style/enhancePresets';

vi.mock('../utils/itemBox', () => ({
  textHeight: (t: { fontSize: number }) => t.fontSize * 1.4,
  itemSize: (it: { width: number; height: number }) => ({ width: it.width, height: it.height }),
}));

const { useEditorStore } = await import('./useEditorStore');

const s = () => useEditorStore.getState();
const source = { src: 'blob:test/photo', naturalWidth: 1200, naturalHeight: 800 };
const photo = (id: string) => s().items.find((i) => i.id === id) as ImageItem;
const filters = (id: string) => photo(id).filters ?? {};
let clock = 0;

/** Three photos and a text box, nothing selected. */
function collage() {
  s().addImages([source, source, source]);
  const [a, b, c] = s().items.map((i) => i.id);
  s().addText();
  s().stopEditingText();
  const text = s().items[3].id;
  s().select(null);
  return { a, b, c, text };
}

beforeEach(() => {
  s().resetProject();
  clock += 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

describe('a preset on several photos', () => {
  it('reaches every selected photo and no other, as one undo step', () => {
    const { a, b, c } = collage();
    s().selectMany([a, b]);
    const steps = s().past.length;
    s().applyEnhancePreset('auto');
    expect(filters(a).presetId).toBe('auto');
    expect(filters(b).presetId).toBe('auto');
    expect(filters(c).presetId).toBeUndefined();
    expect(s().past.length).toBe(steps + 1);
    s().undo();
    expect(filters(a).presetId).toBeUndefined();
    expect(filters(b).presetId).toBeUndefined();
  });

  it('leaves text in the selection alone', () => {
    const { a, b, text } = collage();
    const before = s().items.find((i) => i.id === text);
    s().selectMany([a, b, text]);
    s().applyEnhancePreset('vivid');
    expect(filters(a).presetId).toBe('vivid');
    expect(s().items.find((i) => i.id === text)).toBe(before);
  });

  it('with only some photos on it, brings in the rest and keeps their chosen strength', () => {
    const { a, b } = collage();
    s().select(a);
    s().applyEnhancePreset('vivid');
    s().setEnhanceStrengthLive(a, 25);
    const kept = photo(a).filters;
    s().selectMany([a, b]);
    s().applyEnhancePreset('vivid');
    expect(photo(a).filters, 'already on it: untouched').toBe(kept);
    expect(filters(b)).toMatchObject({ presetId: 'vivid', presetStrength: 60 });
  });

  it('with every photo on it, takes it off them all and keeps their effects', () => {
    const { a, b } = collage();
    s().updateItem(a, { filters: { vignette: -30 } });
    s().selectMany([a, b]);
    s().applyEnhancePreset('warm');
    s().applyEnhancePreset('warm');
    expect(filters(a).presetId).toBeUndefined();
    expect(filters(b).presetId).toBeUndefined();
    expect(filters(a)).toMatchObject({ warmth: 0, vignette: -30 });
    expect(s().historyLabels.at(-1)).toBe('Remove enhance');
  });
});

describe('grayscale and sepia on several photos', () => {
  it('turns on for them all when only some have it, and off only when all do', () => {
    const { a, b } = collage();
    s().updateItem(a, { filters: { grayscale: true } });
    s().selectMany([a, b]);
    s().toggleColorStyle('grayscale');
    expect([filters(a).grayscale, filters(b).grayscale]).toEqual([true, true]);
    s().toggleColorStyle('grayscale');
    expect([filters(a).grayscale, filters(b).grayscale]).toEqual([false, false]);
  });

  it('replaces the other colour style and takes the photo off its preset, keeping its values', () => {
    const { a, b } = collage();
    s().updateItem(a, { filters: { sepia: true } });
    s().select(b);
    s().applyEnhancePreset('vivid');
    const contrast = filters(b).contrast;
    s().selectMany([a, b]);
    s().toggleColorStyle('grayscale');
    expect(filters(a)).toMatchObject({ grayscale: true, sepia: false });
    expect(filters(b)).toMatchObject({ grayscale: true, sepia: false, contrast });
    expect(filters(b).presetId).toBeUndefined();
    expect(filters(b).presetStrength).toBeUndefined();
  });

  it('is one undo step, named after the style', () => {
    const { a, b } = collage();
    s().selectMany([a, b]);
    const steps = s().past.length;
    s().toggleColorStyle('sepia');
    expect(s().past.length).toBe(steps + 1);
    expect(s().historyLabels.at(-1)).toBe('Sepia');
  });

  it('turns a photo\'s sepia from a preset into its own, as the unlit chip promises', () => {
    const { a } = collage();
    s().select(a);
    s().applyEnhancePreset('antique');
    s().toggleColorStyle('sepia');
    expect(filters(a).sepia).toBe(true);
    expect(filters(a).presetId).toBeUndefined();
  });
});

describe('the other bulk edits', () => {
  it('Reset clears every selected photo, and no other, as one undo step', () => {
    const { a, b, c } = collage();
    for (const id of [a, b, c]) s().updateItem(id, { filters: { brightness: 40, blur: 2 } });
    s().selectMany([a, b]);
    const steps = s().past.length;
    s().resetEnhancements();
    expect(filters(a)).toEqual(NEUTRAL_FILTERS);
    expect(filters(b)).toEqual(NEUTRAL_FILTERS);
    expect(filters(c).brightness).toBe(40);
    expect(s().past.length).toBe(steps + 1);
  });

  it('a frame reaches every selected photo, as one undo step', () => {
    const { a, b, c } = collage();
    s().selectMany([a, b]);
    const steps = s().past.length;
    s().applyFrame('matte');
    expect(photo(a).frame).toBe('matte');
    expect(photo(b).frame).toBe('matte');
    expect(photo(c).frame).toBeUndefined();
    expect(photo(b).borderWidth).toBe(photo(a).borderWidth);
    expect(s().past.length).toBe(steps + 1);
  });

  it('Paste puts the copied style on every selected photo, as one undo step', () => {
    const { a, b, c } = collage();
    s().updateItem(a, { filters: { brightness: 30 }, borderWidth: 12, borderColor: '#ff0000' });
    s().select(a);
    s().copyStyle();
    s().selectMany([b, c]);
    const steps = s().past.length;
    s().pasteStyle();
    for (const id of [b, c]) {
      expect(photo(id)).toMatchObject({ borderWidth: 12, borderColor: '#ff0000' });
      expect(filters(id).brightness).toBe(30);
    }
    expect(s().past.length).toBe(steps + 1);
    expect(photo(b).filters, 'each photo owns its filters').not.toBe(photo(c).filters);
  });

  it('records nothing when the selection has no photo in it', () => {
    const { text } = collage();
    s().select(text);
    s().copyStyle();
    const steps = s().past.length;
    s().applyEnhancePreset('vivid');
    s().toggleColorStyle('grayscale');
    s().resetEnhancements();
    s().applyFrame('matte');
    s().pasteStyle();
    expect(s().past.length).toBe(steps);
  });
});
