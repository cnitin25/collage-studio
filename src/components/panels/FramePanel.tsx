import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';
import Slider from '../ui/Slider';

const BORDER_COLORS = ['#ffffff', '#15171d', '#ff7a59', '#3b6ef5', '#2dba78', '#f5d04e'];

export default function FramePanel() {
  const canvas = useEditorStore((s) => s.canvas);
  const setBackground = useEditorStore((s) => s.setBackground);
  const setBackgroundLive = useEditorStore((s) => s.setBackgroundLive);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);

  return (
    <CollapsiblePanel title="Collage frame">
<p className="dim small" style={{ marginTop: 0 }}>
        Applies to the whole collage, not individual photos.
      </p>

      <div className="sliders">
        <Slider
          label="Corner radius"
          value={canvas.frameCornerRadius ?? 0}
          min={0}
          max={200}
          onStart={() => beginChange('Collage corner radius')}
          onChange={(v) => setBackgroundLive({ frameCornerRadius: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Border width"
          value={canvas.frameBorderWidth ?? 0}
          min={0}
          max={60}
          onStart={() => beginChange('Collage border')}
          onChange={(v) => setBackgroundLive({ frameBorderWidth: v })}
          onEnd={commitChange}
        />
      </div>

      <p className="subhead">Border color</p>
      <div className="swatch-row">
        {BORDER_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch ${canvas.frameBorderColor === c ? 'is-active' : ''}`}
            style={{ background: c }}
            onClick={() => setBackground({ frameBorderColor: c })}
            title={`Frame border color ${c}`}
            aria-label={`Frame border ${c}`}
          />
        ))}
        <label className="swatch swatch-custom" title="Custom border color">
          <input
            type="color"
            value={canvas.frameBorderColor ?? '#ffffff'}
            onChange={(e) => setBackground({ frameBorderColor: e.target.value })}
          />
        </label>
      </div>
    </CollapsiblePanel>
  );
}
