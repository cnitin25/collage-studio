import { describe, expect, it } from 'vitest';
import { searchPanelCommands } from './commandIndex';
import { ENHANCE_PRESETS, NEUTRAL_FILTERS, scaleEnhanceFilters } from './enhancePresets';
import { FRAMES } from './frames';

const preset = (id: string) => ENHANCE_PRESETS.find((p) => p.id === id)!.filters;

describe('scaleEnhanceFilters', () => {
  it('is the full recipe at 100% and neutral at 0%', () => {
    expect(scaleEnhanceFilters(preset('vivid'), 100)).toEqual(preset('vivid'));
    expect(scaleEnhanceFilters(preset('vivid'), 0)).toEqual(NEUTRAL_FILTERS);
  });

  it('scales every number in the recipe, to one decimal', () => {
    const half = scaleEnhanceFilters(preset('warm'), 50);
    expect(half).toMatchObject({ brightness: 1.5, saturation: 5, warmth: 22.5 });
  });

  it('keeps grayscale and sepia whole: they have no partial strength', () => {
    expect(scaleEnhanceFilters(preset('antique'), 10).sepia).toBe(true);
  });

  it('clamps the strength to 0–100', () => {
    expect(scaleEnhanceFilters(preset('brighten'), 250)).toEqual(scaleEnhanceFilters(preset('brighten'), 100));
    expect(scaleEnhanceFilters(preset('brighten'), -5)).toEqual(NEUTRAL_FILTERS);
  });

  it('never blurs: blur is not part of any look', () => {
    for (const p of ENHANCE_PRESETS) expect(scaleEnhanceFilters(p.filters, 100).blur).toBe(0);
  });
});

describe('frame presets', () => {
  it('each have a unique id', () => {
    expect(new Set(FRAMES.map((f) => f.id)).size).toBe(FRAMES.length);
  });

  it('include "none": no border, corners or shadow', () => {
    const none = FRAMES.find((f) => f.id === 'none')!.style;
    expect(none).toMatchObject({ borderWidth: 0, cornerRadius: 0 });
    expect(none.shadow).toBeUndefined();
  });
});

describe('searchPanelCommands', () => {
  it('matches labels and keywords, ignoring case and surrounding space', () => {
    expect(searchPanelCommands('  JPEG ').map((c) => c.panel)).toEqual(['Export settings']);
    expect(searchPanelCommands('gradient').map((c) => c.panel)).toContain('Collage Background');
  });

  it('finds the photo adjustments by name', () => {
    for (const word of ['exposure', 'highlights', 'shadows', 'vibrance', 'sharpen', 'vignette'])
      expect(searchPanelCommands(word).map((c) => c.panel), word).toEqual(['Enhance & Adjust']);
  });

  it('finds nothing for an empty query or a word no command knows', () => {
    expect(searchPanelCommands('   ')).toEqual([]);
    expect(searchPanelCommands('quantum')).toEqual([]);
  });
});
