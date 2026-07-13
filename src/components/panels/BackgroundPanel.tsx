import { useRef, useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { BackgroundType, PatternKind } from '../../types';
import { extractPalette } from '../../utils/palette';
import { loadImageFile } from '../../utils/loadImage';
import Slider from '../ui/Slider';
import CollapsiblePanel from './CollapsiblePanel';

const TYPES: { id: BackgroundType; label: string }[] = [
  { id: 'color', label: 'Color' },
  { id: 'gradient', label: 'Gradient' },
  { id: 'image', label: 'Image' },
  { id: 'pattern', label: 'Pattern' },
];

const COLOR_SWATCHES = ['#f3f1ec', '#ffffff', '#111318', '#1d1f27', '#ff7a59', '#3b6ef5', '#2dba78'];
const PATTERNS: PatternKind[] = ['dots', 'grid', 'stripes', 'checker'];

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <label className="color-field">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export default function BackgroundPanel() {
  const canvas = useEditorStore((s) => s.canvas);
  const items = useEditorStore((s) => s.items);
  const selectedId = useEditorStore((s) => s.selectedId);
  const setBackground = useEditorStore((s) => s.setBackground);
  const setBackgroundLive = useEditorStore((s) => s.setBackgroundLive);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);

  const fileRef = useRef<HTMLInputElement>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const photos = items.filter((i) => i.type === 'image');
  const type = canvas.backgroundType;

  const paletteSource = (() => {
    const sel = items.find((i) => i.id === selectedId);
    if (sel && sel.type === 'image') return sel.src;
    return photos[0]?.src ?? null;
  })();

  const runExtract = async () => {
    if (!paletteSource) return;
    setLoading(true);
    try {
      setPalette(await extractPalette(paletteSource, 6));
    } finally {
      setLoading(false);
    }
  };

  const applyPaletteColor = (hex: string) => {
    if (type === 'gradient') setBackground({ gradientFrom: hex });
    else if (type === 'pattern') setBackground({ patternColor: hex });
    else setBackground({ backgroundType: 'color', backgroundColor: hex });
  };

  const setImportFailures = useEditorStore((s) => s.setImportFailures);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const loaded = await loadImageFile(file);
      setBackground({ backgroundType: 'image', backgroundImageSrc: loaded.src });
    } catch (err) {
      setImportFailures([
        { name: file.name, reason: err instanceof Error ? err.message : 'Could not load this image.' },
      ]);
    }
  };

  return (
    <CollapsiblePanel title="Background">

      <div className="chip-row wrap">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={`chip ${type === t.id ? 'is-active' : ''}`}
            onClick={() => setBackground({ backgroundType: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      {type === 'color' && (
        <div className="swatch-row" style={{ marginTop: 14 }}>
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              className={`swatch ${canvas.backgroundColor === c ? 'is-active' : ''}`}
              style={{ background: c }}
              onClick={() => setBackground({ backgroundType: 'color', backgroundColor: c })}
              title={`Background color ${c}`}
              aria-label={`Background ${c}`}
            />
          ))}
          <label className="swatch swatch-custom" title="Custom color">
            <input
              type="color"
              value={canvas.backgroundColor}
              onChange={(e) => setBackground({ backgroundType: 'color', backgroundColor: e.target.value })}
            />
          </label>
        </div>
      )}

      {type === 'gradient' && (
        <div style={{ marginTop: 14 }}>
          <div className="color-row">
            <ColorField label="From" value={canvas.gradientFrom ?? '#ffffff'} onChange={(c) => setBackground({ gradientFrom: c })} />
            <ColorField label="To" value={canvas.gradientTo ?? '#000000'} onChange={(c) => setBackground({ gradientTo: c })} />
          </div>
          <div className="sliders" style={{ marginTop: 12 }}>
            <Slider
              label="Angle"
              suffix="°"
              value={canvas.gradientAngle ?? 45}
              min={0}
              max={360}
              onStart={() => beginChange('Gradient angle')}
              onChange={(v) => setBackgroundLive({ gradientAngle: v })}
              onEnd={commitChange}
            />
          </div>
        </div>
      )}

      {type === 'image' && (
        <div style={{ marginTop: 14 }}>
          {photos.length > 0 ? (
            <div className="bg-thumbs">
              {photos.map((p) => (
                <button
                  key={p.id}
                  className={`bg-thumb ${canvas.backgroundImageSrc === (p as { src: string }).src ? 'is-active' : ''}`}
                  onClick={() => setBackground({ backgroundType: 'image', backgroundImageSrc: (p as { src: string }).src })}
                  style={{ backgroundImage: `url(${(p as { src: string }).src})` }}
                  title="Use this photo as the background"
                  aria-label="Use as background"
                />
              ))}
            </div>
          ) : (
            <p className="dim small">Add photos, or upload an image below.</p>
          )}
          <button className="btn full" style={{ marginTop: 10 }} onClick={() => fileRef.current?.click()}>
            Upload image
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
          <div className="sliders" style={{ marginTop: 12 }}>
            <Slider
              label="Blur"
              value={canvas.backgroundBlur ?? 0}
              min={0}
              max={80}
              onStart={() => beginChange('Background blur')}
              onChange={(v) => setBackgroundLive({ backgroundBlur: v })}
              onEnd={commitChange}
            />
          </div>
        </div>
      )}

      {type === 'pattern' && (
        <div style={{ marginTop: 14 }}>
          <div className="chip-row wrap">
            {PATTERNS.map((p) => (
              <button
                key={p}
                className={`chip ${canvas.patternKind === p ? 'is-active' : ''}`}
                onClick={() => setBackground({ patternKind: p })}
              >
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="color-row" style={{ marginTop: 12 }}>
            <ColorField label="Color" value={canvas.patternColor ?? '#000000'} onChange={(c) => setBackground({ patternColor: c })} />
            <ColorField label="Base" value={canvas.patternBg ?? '#ffffff'} onChange={(c) => setBackground({ patternBg: c })} />
          </div>
          <div className="sliders" style={{ marginTop: 12 }}>
            <Slider
              label="Scale"
              value={canvas.patternScale ?? 28}
              min={10}
              max={80}
              onStart={() => beginChange('Pattern scale')}
              onChange={(v) => setBackgroundLive({ patternScale: v })}
              onEnd={commitChange}
            />
          </div>
        </div>
      )}

      <div className="panel-head" style={{ marginTop: 18, marginBottom: 8 }}>
        <p className="subhead" style={{ margin: 0 }}>Auto palette</p>
        <button
          className="link-btn"
          disabled={!paletteSource || loading}
          onClick={runExtract}
          title="Pull a color palette from the selected (or first) photo"
        >
          {loading ? 'Reading…' : 'From photo'}
        </button>
      </div>
      {palette.length > 0 && (
        <div className="swatch-row">
          {palette.map((c, i) => (
            <button
              key={`${c}-${i}`}
              className="swatch"
              style={{ background: c }}
              onClick={() => applyPaletteColor(c)}
              title={`Use ${c}`}
              aria-label={`Use ${c}`}
            />
          ))}
        </div>
      )}
    </CollapsiblePanel>
  );
}
