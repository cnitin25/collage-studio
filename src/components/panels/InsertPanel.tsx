import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';
import type { TextAlign } from '../../types';
import Slider from '../ui/Slider';

const STICKERS = [
  '⭐', '❤️', '✨', '🎉', '🌟', '🔥', '😍', '😎',
  '🥳', '🌈', '☀️', '🌸', '🍩', '🎈', '👑', '💯',
  '📌', '✅', '➡️', '💬', '🦄', '🐱', '🌿', '🎂',
];

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

export default function InsertPanel() {
  const addText = useEditorStore((s) => s.addText);
  const addSticker = useEditorStore((s) => s.addSticker);
  const selectedId = useEditorStore((s) => s.selectedId);
  const items = useEditorStore((s) => s.items);
  const updateItem = useEditorStore((s) => s.updateItem);
  const beginChange = useEditorStore((s) => s.beginChange);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const commitChange = useEditorStore((s) => s.commitChange);
  const startEditingText = useEditorStore((s) => s.startEditingText);

  const sel = items.find((i) => i.id === selectedId);
  const selText = sel && sel.type === 'text' ? sel : null;

  const isBold = selText ? selText.fontStyle.includes('bold') : false;
  const isItalic = selText ? selText.fontStyle.includes('italic') : false;
  const setStyle = (bold: boolean, italic: boolean) => {
    if (!selText) return;
    const parts = [bold ? 'bold' : '', italic ? 'italic' : ''].filter(Boolean);
    updateItem(selText.id, { fontStyle: parts.join(' ') || 'normal' });
  };

  return (
    <CollapsiblePanel title="Insert">
      <button className="btn btn-accent full" onClick={addText} title="Add an editable text box to the canvas">
        Add text
      </button>

      <p className="subhead">Stickers</p>
      <div className="emoji-grid">
        {STICKERS.map((e) => (
          <button key={e} className="emoji-btn" onClick={() => addSticker(e)} title={`Add ${e} sticker`} aria-label={`Add ${e}`}>
            {e}
          </button>
        ))}
      </div>

      {selText && (
        <>
          <p className="subhead" style={{ marginTop: 14 }}>Text</p>
          <textarea
            className="text-input"
            value={selText.text}
            rows={2}
            onChange={(e) => updateItem(selText.id, { text: e.target.value })}
            onFocus={() => startEditingText(selText.id)}
            onBlur={() => useEditorStore.getState().stopEditingText()}
          />

          <p className="subhead">Font</p>
          <div className="chip-row wrap">
            {FONTS.map((fnt) => (
              <button
                key={fnt.value}
                className={`chip ${selText.fontFamily === fnt.value ? 'is-active' : ''}`}
                onClick={() => updateItem(selText.id, { fontFamily: fnt.value })}
              >
                {fnt.label}
              </button>
            ))}
          </div>

          <div className="sliders" style={{ marginTop: 14 }}>
            <Slider
              label="Size"
              value={selText.fontSize}
              min={12}
              max={300}
              onStart={() => beginChange('Text size')}
              onChange={(v) => updateItemLive(selText.id, { fontSize: v })}
              onEnd={commitChange}
            />
          </div>

          <p className="subhead">Style</p>
          <div className="chip-row">
            <button className={`chip ${isBold ? 'is-active' : ''}`} onClick={() => setStyle(!isBold, isItalic)} title="Toggle bold">
              Bold
            </button>
            <button className={`chip ${isItalic ? 'is-active' : ''}`} onClick={() => setStyle(isBold, !isItalic)} title="Toggle italic">
              Italic
            </button>
          </div>

          <p className="subhead">Align</p>
          <div className="chip-row">
            {ALIGNS.map((a) => (
              <button
                key={a}
                className={`chip ${selText.align === a ? 'is-active' : ''}`}
                onClick={() => updateItem(selText.id, { align: a })}
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
                className={`swatch ${selText.fill === c ? 'is-active' : ''}`}
                style={{ background: c }}
                onClick={() => updateItem(selText.id, { fill: c })}
                title={`Text color ${c}`}
                aria-label={`Text ${c}`}
              />
            ))}
            <label className="swatch swatch-custom" title="Custom color">
              <input
                type="color"
                value={selText.fill}
                onChange={(e) => updateItem(selText.id, { fill: e.target.value })}
              />
            </label>
          </div>
        </>
      )}
    </CollapsiblePanel>
  );
}
