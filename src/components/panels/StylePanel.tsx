import { useEditorStore } from '../../store/useEditorStore';
import { FRAMES } from '../../style/frames';
import { extractPalette } from '../../utils/palette';
import Slider from '../ui/Slider';
import CollapsiblePanel from './CollapsiblePanel';

const BORDER_COLORS = ['#ffffff', '#15171d', '#ff7a59', '#3b6ef5', '#2dba78', '#f5d04e'];

export default function StylePanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const items = useEditorStore((s) => s.items);
  const applyFrame = useEditorStore((s) => s.applyFrame);
  const updateItem = useEditorStore((s) => s.updateItem);
  const beginChange = useEditorStore((s) => s.beginChange);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const commitChange = useEditorStore((s) => s.commitChange);
  const copyStyle = useEditorStore((s) => s.copyStyle);
  const pasteStyle = useEditorStore((s) => s.pasteStyle);
  const applyStyleToAllPhotos = useEditorStore((s) => s.applyStyleToAllPhotos);
  const hasClipboard = useEditorStore((s) => s.styleClipboard !== null);
  const photoCount = useEditorStore((s) => s.items.filter((i) => i.type === 'image').length);

  const sel = items.find((i) => i.id === selectedId);
  if (!sel || sel.type !== 'image') return null;

  const autoBorderColor = async () => {
    const colors = await extractPalette(sel.src, 4);
    if (colors[0]) updateItem(sel.id, { borderColor: colors[0] });
  };

  return (
    <CollapsiblePanel title="Photo Border">

      <p className="subhead" style={{ marginTop: 0 }}>Shape</p>
      <div className="chip-row wrap">
        {(
          [
            ['rect', 'Rectangle'],
            ['circle', 'Circle'],
            ['ellipse', 'Oval'],
            ['heart', 'Heart'],
          ] as const
        ).map(([sh, label]) => (
          <button
            key={sh}
            className={`chip ${(sel.clipShape ?? 'rect') === sh ? 'is-active' : ''}`}
            onClick={() => updateItem(sel.id, { clipShape: sh })}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="subhead">Frame</p>
      <div className="chip-row wrap">
        {FRAMES.map((fr) => (
          <button
            key={fr.id}
            className={`chip ${sel.frame === fr.id ? 'is-active' : ''}`}
            onClick={() => applyFrame(fr.id)}
          >
            {fr.label}
          </button>
        ))}
      </div>

      <div className="sliders" style={{ marginTop: 16 }}>
        <Slider
          label="Border"
          value={sel.borderWidth ?? 0}
          min={0}
          max={40}
          onStart={() => beginChange('Border width')}
          onChange={(v) => updateItemLive(sel.id, { borderWidth: v })}
          onEnd={commitChange}
        />
        {(sel.clipShape ?? 'rect') === 'rect' && (
          <Slider
            label="Corners"
            value={sel.cornerRadius ?? 0}
            min={0}
            max={160}
            onStart={() => beginChange('Corner radius')}
            onChange={(v) => updateItemLive(sel.id, { cornerRadius: v })}
            onEnd={commitChange}
          />
        )}
      </div>

      <p className="subhead">Border style</p>
      <div className="chip-row wrap">
        {(['solid', 'dashed', 'dotted', 'glyph'] as const).map((bs) => (
          <button
            key={bs}
            className={`chip ${(sel.borderStyle ?? 'solid') === bs ? 'is-active' : ''}`}
            onClick={() => updateItem(sel.id, { borderStyle: bs })}
          >
            {bs[0].toUpperCase() + bs.slice(1)}
          </button>
        ))}
      </div>
      {sel.borderStyle === 'glyph' && (
        <div className="chip-row wrap" style={{ marginTop: 8 }}>
          {['✕', 'O', '/', '\\', '•', '＋', '★', '~'].map((g) => (
            <button
              key={g}
              className={`chip ${(sel.borderGlyph || '✕') === g ? 'is-active' : ''}`}
              onClick={() => updateItem(sel.id, { borderGlyph: g })}
              title={`Use "${g}" as the border glyph`}
              aria-label={`Border glyph ${g}`}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      <div className="panel-head" style={{ marginTop: 16 }}>
        <p className="subhead" style={{ margin: 0 }}>Border color</p>
        <button className="link-btn" onClick={autoBorderColor} title="Set the border color from this photo's dominant color">
          Auto from photo
        </button>
      </div>
      <div className="swatch-row">
        {BORDER_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${sel.borderColor === c ? 'is-active' : ''}`}
            style={{ background: c }}
            onClick={() => updateItem(sel.id, { borderColor: c })}
            title={`Border color ${c}`}
            aria-label={`Border ${c}`}
          />
        ))}
        <label className="swatch swatch-custom" title="Custom border color">
          <input
            type="color"
            value={sel.borderColor ?? '#ffffff'}
            onChange={(e) => updateItem(sel.id, { borderColor: e.target.value })}
          />
        </label>
      </div>

      <p className="subhead">Apply style</p>
      <div className="chip-row">
        <button className="chip" onClick={copyStyle} title="Copy this photo's border, corners, shadow, frame, and adjustments">
          Copy
        </button>
        <button
          className="chip"
          disabled={!hasClipboard}
          onClick={pasteStyle}
          title="Paste the copied style onto this photo"
        >
          Paste
        </button>
      </div>
      <button
        className="btn full"
        style={{ marginTop: 8 }}
        disabled={photoCount < 2}
        onClick={applyStyleToAllPhotos}
        title="Apply this photo's style to every photo in the collage"
      >
        Apply to all photos
      </button>
    </CollapsiblePanel>
  );
}
