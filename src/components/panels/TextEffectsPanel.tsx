import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';
import Slider from '../ui/Slider';
import ColorInput from '../ui/ColorInput';
import { DEFAULT_LINE_HEIGHT, type ShadowStyle, type TextBackground } from '../../types';

const DEFAULT_SHADOW: ShadowStyle = { color: '#000000', blur: 8, opacity: 0.45, offsetX: 4, offsetY: 4 };
const DEFAULT_HIGHLIGHT: TextBackground = { color: '#ffd84d', opacity: 1, padding: 16, radius: 10 };
const SWATCHES = ['#ffffff', '#15171d', '#ff7a59', '#3b6ef5', '#ffd84d'];

/** Preset swatches plus a custom picker: one undo step per pick or picker session. */
function Swatches({ value, label, onPick, onLive }: { value: string; label: string; onPick: (c: string) => void; onLive: (c: string) => void }) {
  return (
    <div className="swatch-row">
      {SWATCHES.map((c) => (
        <button
          key={c}
          className={`swatch ${value === c ? 'is-active' : ''}`}
          style={{ background: c }}
          onClick={() => onPick(c)}
          title={`${label} ${c}`}
          aria-label={`${label} ${c}`}
        />
      ))}
      <label className="swatch swatch-custom" title={`Custom ${label.toLowerCase()}`}>
        <ColorInput value={value} label={label} onLive={onLive} />
      </label>
    </div>
  );
}

/**
 * Spacing, outline, shadow and highlight for the selected text box. Every
 * slider drag, toggle, swatch or picker session is one undo step.
 */
export default function TextEffectsPanel() {
  const sel = useEditorStore((s) => s.items.find((i) => i.id === s.selectedId));
  const updateItem = useEditorStore((s) => s.updateItem);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);
  if (!sel || sel.type !== 'text') return null;

  const id = sel.id;
  const { shadow, background } = sel;
  const outlineWidth = sel.outlineWidth ?? 0;
  const outlineColor = sel.outlineColor ?? '#ffffff';
  // A shadow as distance and direction; stored as an x/y offset.
  const distance = shadow ? Math.round(Math.hypot(shadow.offsetX, shadow.offsetY)) : 0;
  const direction = shadow && distance > 0 ? Math.round(((Math.atan2(shadow.offsetY, shadow.offsetX) * 180) / Math.PI + 360) % 360) : 45;
  const setShadowLive = (patch: Partial<ShadowStyle>) => shadow && updateItemLive(id, { shadow: { ...shadow, ...patch } });
  const setOffsetLive = (d: number, angle: number) => {
    const a = (angle * Math.PI) / 180;
    setShadowLive({ offsetX: Math.round(d * Math.cos(a) * 10) / 10, offsetY: Math.round(d * Math.sin(a) * 10) / 10 });
  };
  const setBackgroundLive = (patch: Partial<TextBackground>) =>
    background && updateItemLive(id, { background: { ...background, ...patch } });
  const gesture = (label: string) => ({ onStart: () => beginChange(label), onEnd: commitChange });

  return (
    <CollapsiblePanel title="Text Effects">
      <div className="sliders">
        <Slider
          label="Letter spacing"
          value={sel.letterSpacing ?? 0}
          min={-10}
          max={60}
          {...gesture('Letter spacing')}
          onChange={(v) => updateItemLive(id, { letterSpacing: v })}
        />
        <Slider
          label="Line spacing"
          suffix="%"
          value={Math.round((sel.lineHeight ?? DEFAULT_LINE_HEIGHT) * 100)}
          min={80}
          max={300}
          step={5}
          {...gesture('Line spacing')}
          onChange={(v) => updateItemLive(id, { lineHeight: v / 100 })}
        />
        <Slider
          label="Outline"
          value={outlineWidth}
          min={0}
          max={20}
          {...gesture('Outline')}
          onChange={(v) => updateItemLive(id, { outlineWidth: v, outlineColor })}
        />
      </div>
      {outlineWidth > 0 && (
        <Swatches
          value={outlineColor}
          label="Outline colour"
          onPick={(c) => updateItem(id, { outlineColor: c })}
          onLive={(c) => updateItemLive(id, { outlineColor: c })}
        />
      )}

      <div className="chip-row" style={{ marginTop: 14 }}>
        <button
          className={`chip ${shadow ? 'is-active' : ''}`}
          aria-pressed={!!shadow}
          onClick={() => updateItem(id, { shadow: shadow ? undefined : DEFAULT_SHADOW })}
          title="A soft shadow under the text"
        >
          Shadow
        </button>
        <button
          className={`chip ${background ? 'is-active' : ''}`}
          aria-pressed={!!background}
          onClick={() => updateItem(id, { background: background ? undefined : DEFAULT_HIGHLIGHT })}
          title="A coloured box behind the text"
        >
          Highlight
        </button>
      </div>

      {shadow && (
        <>
          <p className="subhead">Shadow</p>
          <div className="sliders">
            <Slider label="Shadow blur" value={shadow.blur} min={0} max={40} {...gesture('Shadow')} onChange={(v) => setShadowLive({ blur: v })} />
            <Slider label="Distance" value={distance} min={0} max={40} {...gesture('Shadow')} onChange={(v) => setOffsetLive(v, direction)} />
            <Slider
              label="Direction"
              suffix="°"
              value={direction}
              min={0}
              max={359}
              {...gesture('Shadow')}
              onChange={(v) => setOffsetLive(Math.max(distance, 1), v)}
            />
            <Slider
              label="Shadow opacity"
              suffix="%"
              value={Math.round(shadow.opacity * 100)}
              min={0}
              max={100}
              {...gesture('Shadow')}
              onChange={(v) => setShadowLive({ opacity: v / 100 })}
            />
          </div>
          <Swatches
            value={shadow.color}
            label="Shadow colour"
            onPick={(c) => updateItem(id, { shadow: { ...shadow, color: c } })}
            onLive={(c) => setShadowLive({ color: c })}
          />
        </>
      )}

      {background && (
        <>
          <p className="subhead">Highlight</p>
          <div className="sliders">
            <Slider label="Padding" value={background.padding} min={0} max={80} {...gesture('Highlight')} onChange={(v) => setBackgroundLive({ padding: v })} />
            <Slider label="Roundness" value={background.radius} min={0} max={80} {...gesture('Highlight')} onChange={(v) => setBackgroundLive({ radius: v })} />
            <Slider
              label="Highlight opacity"
              suffix="%"
              value={Math.round(background.opacity * 100)}
              min={0}
              max={100}
              {...gesture('Highlight')}
              onChange={(v) => setBackgroundLive({ opacity: v / 100 })}
            />
          </div>
          <Swatches
            value={background.color}
            label="Highlight colour"
            onPick={(c) => updateItem(id, { background: { ...background, color: c } })}
            onLive={(c) => setBackgroundLive({ color: c })}
          />
        </>
      )}
    </CollapsiblePanel>
  );
}
