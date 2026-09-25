import { useRef } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';
import Slider from '../ui/Slider';
import { coverCrop, refitCrop, type CropRect } from '../../utils/cover';

export default function CropArrangePanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const items = useEditorStore((s) => s.items);
  const canvas = useEditorStore((s) => s.canvas);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const flipItem = useEditorStore((s) => s.flipItem);
  const rotateItem = useEditorStore((s) => s.rotateItem);
  const beginChange = useEditorStore((s) => s.beginChange);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const commitChange = useEditorStore((s) => s.commitChange);

  const croppingId = useEditorStore((s) => s.croppingId);
  const startCrop = useEditorStore((s) => s.startCrop);
  const endCrop = useEditorStore((s) => s.endCrop);
  const resetCrop = useEditorStore((s) => s.resetCrop);
  const setCropZoom = useEditorStore((s) => s.setCropZoom);

  // Captures the aspect ratio + center point once, at gesture start, so
  // repeated onChange ticks during one drag resize FROM a fixed origin
  // rather than re-deriving from the already-mutated live value each tick.
  const resizeBasis = useRef<{
    aspect: number;
    cx: number;
    cy: number;
    width: number;
    height: number;
    crop: CropRect | undefined;
  } | null>(null);

  const sel = items.find((i) => i.id === selectedId);
  if (!sel) return null;
  const id = sel.id;
  const isImage = sel.type === 'image';
  const cropping = isImage && croppingId === sel.id;

  const startResize = () => {
    if (sel.type !== 'image' || sel.height === 0) return;
    resizeBasis.current = {
      aspect: sel.width / sel.height,
      cx: sel.x + sel.width / 2,
      cy: sel.y + sel.height / 2,
      width: sel.width,
      height: sel.height,
      crop: sel.crop,
    };
    beginChange('Resize');
  };

  const changeResize = (newWidth: number) => {
    if (sel.type !== 'image' || !resizeBasis.current) return;
    const { aspect, cx, cy, width, height, crop } = resizeBasis.current;
    const newHeight = Math.max(1, newWidth / aspect);
    const patch: Record<string, unknown> = {
      x: cx - newWidth / 2,
      y: cy - newHeight / 2,
      width: newWidth,
      height: newHeight,
    };
    // Refit from the crop at gesture start (not the live one), so clamping
    // near the photo's edges can't accumulate drift over a long drag.
    if (crop) patch.crop = refitCrop(sel.naturalWidth, sel.naturalHeight, crop, width, height, newWidth, newHeight);
    updateItemLive(id, patch);
  };

  const endResize = () => {
    resizeBasis.current = null;
    commitChange();
  };

  const base = isImage ? coverCrop(sel.naturalWidth, sel.naturalHeight, sel.width, sel.height) : null;
  const zoom = isImage && sel.crop && base ? base.width / sel.crop.width : 1;

  return (
    <CollapsiblePanel title="Crop and Arrange">
      {isImage && (
        <>
          <div className="sliders" style={{ marginTop: 14 }}>
            <Slider
              label="Size (width)"
              value={Math.round(sel.width)}
              min={20}
              max={Math.round(Math.max(canvas.width, canvas.height) * 2)}
              onStart={startResize}
              onChange={changeResize}
              onEnd={endResize}
            />
          </div>

          <p className="subhead">Crop</p>
          <div className="chip-row">
            <button
              className={`chip ${cropping ? 'is-active' : ''}`}
              onClick={() => (cropping ? endCrop() : startCrop(id))}
              title={cropping ? 'Finish cropping this photo' : 'Start cropping this photo'}
            >
              {cropping ? 'Done' : 'Crop photo'}
            </button>
            <button className="chip" onClick={() => resetCrop(id)} title="Reset to a centered, uncropped fit">
              Reset
            </button>
          </div>
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
                  onChange={(v) => setCropZoom(id, v)}
                  onEnd={commitChange}
                />
              </div>
              <p className="dim small">Drag the photo on the canvas to reposition.</p>
            </>
          )}
        </>
      )}

      <div className="btn-grid-2" style={{ marginTop: isImage ? 18 : 0 }}>
        <button className="btn" onClick={() => bringToFront(id)} title="Move to the very top of the stack">Bring to front</button>
        <button className="btn" onClick={() => sendToBack(id)} title="Move to the very bottom of the stack">Send to back</button>
        <button className="btn" onClick={() => bringForward(id)} title="Move up one layer">Forward</button>
        <button className="btn" onClick={() => sendBackward(id)} title="Move down one layer">Backward</button>
      </div>

      <p className="subhead">Rotate</p>
      <div className="chip-row">
        <button className="chip" onClick={() => rotateItem(id, -90)} title="Rotate 90° counter-clockwise">↺ 90°</button>
        <button className="chip" onClick={() => rotateItem(id, 90)} title="Rotate 90° clockwise">↻ 90°</button>
      </div>

      {isImage && (
        <>
          <p className="subhead">Flip</p>
          <div className="chip-row">
            <button className="chip" onClick={() => flipItem(id, 'x')} title="Flip horizontally (mirror left-right)">Flip H</button>
            <button className="chip" onClick={() => flipItem(id, 'y')} title="Flip vertically (mirror top-bottom)">Flip V</button>
          </div>

          <div className="sliders" style={{ marginTop: 14 }}>
            <Slider
              label="Opacity"
              suffix="%"
              value={sel.opacity ?? 100}
              min={0}
              max={100}
              onStart={() => beginChange('Opacity')}
              onChange={(v) => updateItemLive(id, { opacity: v })}
              onEnd={commitChange}
            />
          </div>
        </>
      )}
    </CollapsiblePanel>
  );
}
