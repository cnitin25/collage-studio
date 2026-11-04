import { Fragment } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { useSelectedPhotos } from '../../hooks/useSelectedPhotos';
import { ENHANCE_PRESETS, hasColorStyle } from '../../style/enhancePresets';
import { hasAdjustments } from '../../utils/adjustments';
import type { ImageFilters, ImageItem } from '../../types';
import CollapsiblePanel from './CollapsiblePanel';
import PhotoScopeNote from './PhotoScopeNote';
import Slider from '../ui/Slider';
import Histogram from './Histogram';

/** The filters that are numbers, which a slider can set. */
type AdjustKey = {
  [K in keyof ImageFilters]-?: NonNullable<ImageFilters[K]> extends number ? K : never;
}[keyof ImageFilters];

interface AdjustSlider {
  key: Exclude<AdjustKey, 'presetStrength'>;
  label: string;
  min: number;
  max: number;
  suffix?: string;
}

/** -100 to 100, with no change in the middle. */
const BOTH_WAYS = { min: -100, max: 100 };

/** The Adjust sliders, by kind: the order the filters run in (utils/adjustments). */
const ADJUST_GROUPS: { title: string; sliders: AdjustSlider[] }[] = [
  {
    title: 'Light',
    sliders: [
      { key: 'exposure', label: 'Exposure', ...BOTH_WAYS },
      { key: 'brightness', label: 'Brightness', ...BOTH_WAYS },
      { key: 'contrast', label: 'Contrast', ...BOTH_WAYS },
      { key: 'highlights', label: 'Highlights', ...BOTH_WAYS },
      { key: 'shadows', label: 'Shadows', ...BOTH_WAYS },
    ],
  },
  {
    title: 'Color',
    sliders: [
      { key: 'warmth', label: 'Warmth', ...BOTH_WAYS },
      { key: 'vibrance', label: 'Vibrance', ...BOTH_WAYS },
      { key: 'saturation', label: 'Saturation', ...BOTH_WAYS },
      { key: 'hue', label: 'Hue', min: -180, max: 180, suffix: '°' },
    ],
  },
  {
    title: 'Detail & effects',
    sliders: [
      { key: 'sharpen', label: 'Sharpen', min: 0, max: 100 },
      { key: 'vignette', label: 'Vignette', ...BOTH_WAYS },
      { key: 'blur', label: 'Blur', min: 0, max: 40, suffix: 'px' },
    ],
  },
];

/** Preset chips for the selected photos: one lights up when they all have it. */
function PresetChips({ photos }: { photos: ImageItem[] }) {
  const applyEnhancePreset = useEditorStore((s) => s.applyEnhancePreset);
  return (
    <>
      <p className="subhead">Presets</p>
      <div className="chip-row wrap">
        {ENHANCE_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`chip ${photos.every((photo) => photo.filters?.presetId === p.id) ? 'is-active' : ''}`}
            onClick={() => applyEnhancePreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** Grayscale and Sepia for the selected photos: lit when they all have it. */
function ColorStyleChips({ photos }: { photos: ImageItem[] }) {
  const toggleColorStyle = useEditorStore((s) => s.toggleColorStyle);
  return (
    <>
      <p className="subhead">Color style</p>
      <div className="chip-row">
        <button
          className={`chip ${photos.every((p) => hasColorStyle(p.filters, 'grayscale')) ? 'is-active' : ''}`}
          onClick={() => toggleColorStyle('grayscale')}
          title="Toggle black & white"
        >
          Grayscale
        </button>
        <button
          className={`chip ${photos.every((p) => hasColorStyle(p.filters, 'sepia')) ? 'is-active' : ''}`}
          onClick={() => toggleColorStyle('sepia')}
          title="Toggle a warm, antique tone"
        >
          Sepia
        </button>
      </div>
    </>
  );
}

function ResetButton({ disabled, title }: { disabled: boolean; title: string }) {
  const resetEnhancements = useEditorStore((s) => s.resetEnhancements);
  return (
    <button className="panel-reset-btn" disabled={disabled} onClick={resetEnhancements} title={title}>
      Reset
    </button>
  );
}

/** A selection of several: the one-click looks, for every photo in it. */
function SeveralPhotos({ photos }: { photos: ImageItem[] }) {
  return (
    <CollapsiblePanel
      title="Enhance & Adjust"
      headerExtra={
        <ResetButton
          disabled={!photos.some((p) => hasAdjustments(p.filters))}
          title="Clear all enhancements and filters on the selected photos"
        />
      }
    >
      <PhotoScopeNote photoCount={photos.length} />
      <PresetChips photos={photos} />
      <ColorStyleChips photos={photos} />
      <p className="dim small">
        Each photo keeps its own Sharpen, Vignette and Blur when a preset is
        applied. Select one photo for Strength and the sliders.
      </p>
    </CollapsiblePanel>
  );
}

function OnePhoto({ sel }: { sel: ImageItem }) {
  const setEnhanceStrengthLive = useEditorStore((s) => s.setEnhanceStrengthLive);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);

  // A value set by hand ends the preset: its Strength slider recomputes every
  // value from the recipe, which would silently throw this adjustment away.
  const setLive = (patch: Partial<ImageFilters>) =>
    updateItemLive(sel.id, {
      filters: { ...sel.filters, ...patch, presetId: undefined, presetStrength: undefined },
    });

  const f = sel.filters ?? {};
  const activePreset = f.presetId;
  const activeRecipe = ENHANCE_PRESETS.find((p) => p.id === activePreset);
  const isRecolor = activeRecipe?.filters.grayscale || activeRecipe?.filters.sepia;

  const isDefault = !hasAdjustments(f);

  return (
    <CollapsiblePanel
      title="Enhance & Adjust"
      headerExtra={<ResetButton disabled={isDefault} title="Clear all enhancements and filters on this photo" />}
    >
      <p className="subhead" style={{ marginTop: 0 }}>Histogram</p>
      <Histogram item={sel} />

      <PresetChips photos={[sel]} />

      {activePreset && (
        <div className="sliders" style={{ marginTop: 14 }}>
          <Slider
            label="Strength"
            suffix="%"
            value={f.presetStrength ?? 0}
            min={0}
            max={100}
            onStart={() => beginChange('Enhance strength')}
            onChange={(v) => setEnhanceStrengthLive(sel.id, v)}
            onEnd={commitChange}
          />
        </div>
      )}
      {isRecolor && (
        <p className="dim small">
          Grayscale/sepia recoloring itself can't be partially blended —
          strength here only affects the accompanying brightness/contrast.
        </p>
      )}

      <ColorStyleChips photos={[sel]} />
      <p className="dim small">
        Presets set a starting look at 60% strength — fine-tune with Strength
        above, or the sliders below. They leave Sharpen, Vignette and Blur as
        they are. Grayscale/Sepia toggle independently.
      </p>

      {ADJUST_GROUPS.map((group) => (
        <Fragment key={group.title}>
          <p className="subhead">{group.title}</p>
          <div className="sliders">
            {group.sliders.map((slider) => (
              <Slider
                key={slider.key}
                label={slider.label}
                suffix={slider.suffix ?? ''}
                value={f[slider.key] ?? 0}
                min={slider.min}
                max={slider.max}
                onStart={() => beginChange(slider.label)}
                onChange={(v) => setLive({ [slider.key]: v })}
                onEnd={commitChange}
              />
            ))}
          </div>
        </Fragment>
      ))}
    </CollapsiblePanel>
  );
}

export default function EnhancePresetsPanel() {
  const isOneItem = useEditorStore((s) => s.selectedId !== null);
  const photos = useSelectedPhotos();
  if (photos.length === 0) return null;
  return isOneItem ? <OnePhoto sel={photos[0]} /> : <SeveralPhotos photos={photos} />;
}
