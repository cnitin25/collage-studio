import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';
import { coverCrop } from '../../utils/cover';
import Slider from '../ui/Slider';

export default function CropPanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const croppingId = useEditorStore((s) => s.croppingId);
  const items = useEditorStore((s) => s.items);
  const startCrop = useEditorStore((s) => s.startCrop);
  const endCrop = useEditorStore((s) => s.endCrop);
  const resetCrop = useEditorStore((s) => s.resetCrop);
  const setCropZoom = useEditorStore((s) => s.setCropZoom);
  const cropLocked = useEditorStore((s) => s.cropLocked);
  const setCropLocked = useEditorStore((s) => s.setCropLocked);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);

  const sel = items.find((i) => i.id === selectedId);
  if (!sel || sel.type !== 'image') return null;

  const cropping = croppingId === sel.id;
  const base = coverCrop(sel.naturalWidth, sel.naturalHeight, sel.width, sel.height);
  const zoom = sel.crop ? base.width / sel.crop.width : 1;

  return (
    <CollapsiblePanel title="Crop">
<div className="chip-row">
        <button
          className={`chip ${cropping ? 'is-active' : ''}`}
          onClick={() => (cropping ? endCrop() : startCrop(sel.id))}
          title={cropping ? 'Finish cropping this photo' : 'Start cropping this photo'}
        >
          {cropping ? 'Done' : 'Crop photo'}
        </button>
        <button className="chip" onClick={() => resetCrop(sel.id)} title="Reset to a centered, uncropped fit">
          Reset
        </button>
      </div>
      <label className="toggle-row" title="Keep crop mode active when you select another photo">
        <span>Stay in crop mode</span>
        <input
          type="checkbox"
          checked={cropLocked}
          onChange={(e) => setCropLocked(e.target.checked)}
        />
      </label>
      {cropping && (
        <>
          <div className="sliders" style={{ marginTop: 14 }}>
            <Slider
              label="Zoom"
              suffix="×"
              value={Number(zoom.toFixed(2))}
              min={1}
              max={3}
              step={0.01}
              onStart={() => beginChange('Crop zoom')}
              onChange={(v) => setCropZoom(sel.id, v)}
              onEnd={commitChange}
            />
          </div>
          <p className="dim small">Drag the photo on the canvas to reposition.</p>
        </>
      )}
    </CollapsiblePanel>
  );
}
