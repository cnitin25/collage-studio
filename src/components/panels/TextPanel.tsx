import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';
import type { TextAlign } from '../../types';
import Slider from '../ui/Slider';

const FONTS = [
  { label: 'Sans', value: 'Inter, system-ui, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Mono', value: 'ui-monospace, "Courier New", monospace' },
  { label: 'Display', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Script', value: '"Dancing Script", cursive' },
  { label: 'Brush', value: 'Pacifico, cursive' },
  { label: 'Hand', value: 'Caveat, cursive' },
  { label: 'Formal', value: '"Great Vibes", cursive' },
];

const COLORS = ['#15171d', '#ffffff', '#ff7a59', '#3b6ef5', '#2dba78', '#f5d04e'];
const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

export default function TextPanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const items = useEditorStore((s) => s.items);
  const updateItem = useEditorStore((s) => s.updateItem);
  const beginChange = useEditorStore((s) => s.beginChange);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const commitChange = useEditorStore((s) => s.commitChange);
  const startEditingText = useEditorStore((s) => s.startEditingText);

  const sel = items.find((i) => i.id === selectedId);
  if (!sel || sel.type !== 'text') return null;

  const isBold = sel.fontStyle.includes('bold');
  const isItalic = sel.fontStyle.includes('italic');
  const setStyle = (bold: boolean, italic: boolean) => {
    const parts = [bold ? 'bold' : '', italic ? 'italic' : ''].filter(Boolean);
    updateItem(sel.id, { fontStyle: parts.join(' ') || 'normal' });
  };

  return (
    <CollapsiblePanel title="Text">
<textarea
        className="text-input"
        value={sel.text}
        rows={2}
        onChange={(e) => updateItem(sel.id, { text: e.target.value })}
        onFocus={() => startEditingText(sel.id)}
        onBlur={() => useEditorStore.getState().stopEditingText()}
      />

      <p className="subhead">Font</p>
      <div className="chip-row wrap">
        {FONTS.map((fnt) => (
          <button
            key={fnt.value}
            className={`chip ${sel.fontFamily === fnt.value ? 'is-active' : ''}`}
            onClick={() => updateItem(sel.id, { fontFamily: fnt.value })}
          >
            {fnt.label}
          </button>
        ))}
      </div>

      <div className="sliders" style={{ marginTop: 14 }}>
        <Slider
          label="Size"
          value={sel.fontSize}
          min={12}
          max={300}
          onStart={() => beginChange('Text size')}
          onChange={(v) => updateItemLive(sel.id, { fontSize: v })}
          onEnd={commitChange}
        />
      </div>

      <p className="subhead">Style</p>
      <div className="chip-row">
        <button className={`chip ${isBold ? 'is-active' : ''}`} onClick={() => setStyle(!isBold, isItalic)}>
          Bold
        </button>
        <button className={`chip ${isItalic ? 'is-active' : ''}`} onClick={() => setStyle(isBold, !isItalic)}>
          Italic
        </button>
      </div>

      <p className="subhead">Align</p>
      <div className="chip-row">
        {ALIGNS.map((a) => (
          <button
            key={a}
            className={`chip ${sel.align === a ? 'is-active' : ''}`}
            onClick={() => updateItem(sel.id, { align: a })}
          >
            {a[0].toUpperCase() + a.slice(1)}
          </button>
        ))}
      </div>

      <p className="subhead">Color</p>
      <div className="swatch-row">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${sel.fill === c ? 'is-active' : ''}`}
            style={{ background: c }}
            onClick={() => updateItem(sel.id, { fill: c })}
            aria-label={`Text ${c}`}
          />
        ))}
        <label className="swatch swatch-custom" title="Custom color">
          <input
            type="color"
            value={sel.fill}
            onChange={(e) => updateItem(sel.id, { fill: e.target.value })}
          />
        </label>
      </div>
    </CollapsiblePanel>
  );
}
