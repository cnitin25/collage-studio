import { useMemo } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import { suggestLayouts } from '../../layout/suggest';
import type { LayoutType, Rect } from '../../layout/types';
import type { ImageItem } from '../../types';
import CollapsiblePanel from './CollapsiblePanel';
import Slider from '../ui/Slider';

const STRATEGIES: { type: LayoutType; label: string }[] = [
  { type: 'grid', label: 'Grid' },
  { type: 'justified', label: 'Justified' },
  { type: 'mosaic', label: 'Mosaic' },
];

function Thumb({ rects, cw, ch }: { rects: Rect[]; cw: number; ch: number }) {
  const W = 70;
  const H = Math.max(36, Math.round((W * ch) / cw));
  const sx = W / cw;
  const sy = H / ch;
  return (
    <svg className="thumb" viewBox={`0 0 ${W} ${H}`} width={W} height={H} preserveAspectRatio="none">
      <rect x={0} y={0} width={W} height={H} fill="var(--panel-hi)" />
      {rects.map((r, i) => (
        <rect
          key={i}
          x={r.x * sx}
          y={r.y * sy}
          width={Math.max(1, r.width * sx)}
          height={Math.max(1, r.height * sy)}
          rx={1.5}
          fill="#5a6173"
          stroke="var(--panel)"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

export default function LayoutPanel() {
  const items = useEditorStore((s) => s.items);
  const canvas = useEditorStore((s) => s.canvas);
  const spacing = useEditorStore((s) => s.spacing);
  const lastLayout = useEditorStore((s) => s.lastLayout);
  const applyLayout = useEditorStore((s) => s.applyLayout);
  const setSpacingLive = useEditorStore((s) => s.setSpacingLive);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);
  const layoutLocked = useEditorStore((s) => s.layoutLocked);
  const setLayoutLocked = useEditorStore((s) => s.setLayoutLocked);

  const imageItems = items.filter((it): it is ImageItem => it.type === 'image');
  const hasItems = imageItems.length > 0;

  const suggestions = useMemo(() => {
    if (imageItems.length < 2) return [];
    const aspects = imageItems.map((it) => it.naturalWidth / it.naturalHeight);
    return suggestLayouts(
      aspects,
      {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        margin: spacing.margin,
        gutter: spacing.gutter,
        padding: spacing.padding,
      },
      3,
    );
  }, [imageItems, canvas.width, canvas.height, spacing]);

  return (
    <CollapsiblePanel title="Layout">
      <div className="chip-row">
        {STRATEGIES.map((s) => (
          <button
            key={s.type}
            className={`chip ${lastLayout?.type === s.type ? 'is-active' : ''}`}
            disabled={!hasItems}
            onClick={() => applyLayout({ type: s.type })}
          >
            {s.label}
          </button>
        ))}
      </div>

      {suggestions.length > 0 && (
        <>
          <p className="subhead">Suggested</p>
          <div className="suggestion-row">
            {suggestions.map((sg, i) => (
              <button
                key={i}
                className="suggestion"
                title={`${sg.label} · ${Math.round(sg.score * 100)}% fit`}
                onClick={() => applyLayout(sg.spec)}
              >
                <Thumb rects={sg.rects} cw={canvas.width} ch={canvas.height} />
                <span className="suggestion-label">{Math.round(sg.score * 100)}% fit</span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="sliders">
        <Slider
          label="Outer margin"
          value={spacing.margin}
          min={0}
          max={140}
          disabled={!hasItems}
          onStart={() => beginChange('Outer margin')}
          onChange={(v) => setSpacingLive({ margin: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Spacing"
          value={spacing.gutter}
          min={0}
          max={80}
          disabled={!hasItems}
          onStart={() => beginChange('Spacing')}
          onChange={(v) => setSpacingLive({ gutter: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Padding"
          value={spacing.padding}
          min={0}
          max={60}
          disabled={!hasItems}
          onStart={() => beginChange('Padding')}
          onChange={(v) => setSpacingLive({ padding: v })}
          onEnd={commitChange}
        />
      </div>
      {!hasItems && <p className="dim small">Add photos to arrange them.</p>}
      {hasItems && !lastLayout && (
        <p className="dim small">
          Custom sizes — spacing won't reflow until you click a layout above.
        </p>
      )}

      <label className="toggle-row">
        <span>Lock layout</span>
        <input
          type="checkbox"
          checked={layoutLocked}
          onChange={(e) => setLayoutLocked(e.target.checked)}
        />
      </label>
    </CollapsiblePanel>
  );
}
