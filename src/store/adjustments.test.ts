import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImageItem } from '../types';
import { NEUTRAL_FILTERS } from '../style/enhancePresets';

vi.mock('../utils/itemBox', () => ({
  textHeight: (t: { fontSize: number }) => t.fontSize * 1.4,
  itemSize: (it: { width: number; height: number }) => ({ width: it.width, height: it.height }),
}));

const { useEditorStore } = await import('./useEditorStore');

const s = () => useEditorStore.getState();
const photo = () => s().items[0] as ImageItem;
let clock = 0;

/** One selected photo with every new adjustment, and a blur, set by hand. */
function adjusted(): string {
  s().addImages([{ src: 'blob:test/photo', naturalWidth: 1200, naturalHeight: 800 }]);
  const id = s().items[0].id;
  s().updateItem(id, {
    filters: { exposure: 20, highlights: -30, shadows: 30, vibrance: 15, sharpen: 40, vignette: -30, blur: 2 },
  });
  s().select(id);
  return id;
}

beforeEach(() => {
  s().resetProject();
  clock += 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

describe('presets and the new adjustments', () => {
  it('a preset replaces the look, but keeps sharpening, vignette and blur', () => {
    adjusted();
    s().applyEnhancePreset('vivid');
    expect(photo().filters).toMatchObject({
      exposure: 0,
      highlights: 0,
      shadows: 0,
      vibrance: 0,
      sharpen: 40,
      vignette: -30,
      blur: 2,
      presetId: 'vivid',
    });
  });

  it('Strength recomputes the look and leaves them alone too', () => {
    const id = adjusted();
    s().applyEnhancePreset('vivid');
    s().setEnhanceStrengthLive(id, 30);
    expect(photo().filters).toMatchObject({ sharpen: 40, vignette: -30, blur: 2, presetStrength: 30 });
  });

  it('taking the preset off again keeps them', () => {
    adjusted();
    s().applyEnhancePreset('vivid');
    s().applyEnhancePreset('vivid');
    expect(photo().filters).toMatchObject({ contrast: 0, saturation: 0, sharpen: 40, vignette: -30, blur: 2 });
    expect(photo().filters?.presetId).toBeUndefined();
  });

  it('Reset clears every adjustment, the new ones included, in one undo step', () => {
    const id = adjusted();
    const before = s().past.length;
    s().resetEnhancements(id);
    expect(photo().filters).toEqual(NEUTRAL_FILTERS);
    expect(s().past.length).toBe(before + 1);
  });
});
