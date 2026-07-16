import { useEditorStore } from '../../store/useEditorStore';
import { ENHANCE_PRESETS } from '../../style/enhancePresets';
import CollapsiblePanel from './CollapsiblePanel';
import Slider from '../ui/Slider';
import Histogram from './Histogram';

export default function EnhancePresetsPanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const items = useEditorStore((s) => s.items);
  const applyEnhancePreset = useEditorStore((s) => s.applyEnhancePreset);
  const setEnhanceStrengthLive = useEditorStore((s) => s.setEnhanceStrengthLive);
  const resetEnhancements = useEditorStore((s) => s.resetEnhancements);
  const updateItem = useEditorStore((s) => s.updateItem);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);

  const sel = items.find((i) => i.id === selectedId);
  if (!sel || sel.type !== 'image') return null;

  const setLive = (patch: Partial<NonNullable<typeof sel.filters>>) =>
    updateItemLive(sel.id, { filters: { ...sel.filters, ...patch } });

  const f = sel.filters ?? {};
  const activePreset = f.presetId;
  const activeRecipe = ENHANCE_PRESETS.find((p) => p.id === activePreset);
  const isRecolor = activeRecipe?.filters.grayscale || activeRecipe?.filters.sepia;

  const isDefault = !(
    f.brightness ||
    f.contrast ||
    f.saturation ||
    f.hue ||
    f.enhance ||
    f.grayscale ||
    f.sepia ||
    f.blur
  );

  return (
    <CollapsiblePanel
      title="Enhance & Adjust"
      headerExtra={
        <button
          className="panel-reset-btn"
          disabled={isDefault}
          onClick={() => resetEnhancements(sel.id)}
          title="Clear all enhancements and filters on this photo"
        >
          Reset
        </button>
      }
    >
      <p className="subhead" style={{ marginTop: 0 }}>Histogram</p>
      <Histogram item={sel} />

      <p className="subhead">Presets</p>
      <div className="chip-row wrap">
        {ENHANCE_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`chip ${activePreset === p.id ? 'is-active' : ''}`}
            onClick={() => applyEnhancePreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

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

      <p className="subhead">Color style</p>
      <div className="chip-row">
        <button
          className={`chip ${!activePreset && f.grayscale ? 'is-active' : ''}`}
          onClick={() =>
            updateItem(sel.id, {
              filters: { ...f, grayscale: !f.grayscale, sepia: false, presetId: undefined, presetStrength: undefined },
            })
          }
          title="Toggle black & white"
        >
          Grayscale
        </button>
        <button
          className={`chip ${!activePreset && f.sepia ? 'is-active' : ''}`}
          onClick={() =>
            updateItem(sel.id, {
              filters: { ...f, sepia: !f.sepia, grayscale: false, presetId: undefined, presetStrength: undefined },
            })
          }
          title="Toggle a warm, antique tone"
        >
          Sepia
        </button>
      </div>
      <p className="dim small">
        Presets set a starting look at 60% strength — fine-tune with Strength
        above, or the sliders below. Grayscale/Sepia toggle independently.
      </p>

      <p className="subhead">Adjust</p>
      <div className="sliders">
        <Slider
          label="Brightness"
          value={f.brightness ?? 0}
          min={-100}
          max={100}
          onStart={() => beginChange('Brightness')}
          onChange={(v) => setLive({ brightness: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Contrast"
          value={f.contrast ?? 0}
          min={-100}
          max={100}
          onStart={() => beginChange('Contrast')}
          onChange={(v) => setLive({ contrast: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Saturation"
          value={f.saturation ?? 0}
          min={-100}
          max={100}
          onStart={() => beginChange('Saturation')}
          onChange={(v) => setLive({ saturation: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Warmth (hue)"
          value={f.hue ?? 0}
          min={-180}
          max={180}
          onStart={() => beginChange('Hue')}
          onChange={(v) => setLive({ hue: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Blur"
          value={f.blur ?? 0}
          min={0}
          max={40}
          onStart={() => beginChange('Blur')}
          onChange={(v) => setLive({ blur: v })}
          onEnd={commitChange}
        />
      </div>
    </CollapsiblePanel>
  );
}
