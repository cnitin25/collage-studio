import { useRef } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';
import Slider from '../ui/Slider';
import { coverCrop } from '../../utils/cover';

export default function ArrangePanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const items = useEditorStore((s) => s.items);
  const canvas = useEditorStore((s) => s.canvas);
  const bringToFront = useEditorStore((s) => s.bringToFront);
  const sendToBack = useEditorStore((s) => s.sendToBack);
  const bringForward = useEditorStore((s) => s.bringForward);
  const sendBackward = useEditorStore((s) => s.sendBackward);
  const updateItem = useEditorStore((s) => s.updateItem);
  const flipItem = useEditorStore((s) => s.flipItem);
  const rotateItem = useEditorStore((s) => s.rotateItem);
  const beginChange = useEditorStore((s) => s.beginChange);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const commitChange = useEditorStore((s) => s.commitChange);

  // Captures the aspect ratio + center point once, at gesture start, so
  // repeated onChange ticks during one drag resize FROM a fixed origin
  // rather than re-deriving from the already-mutated live value each tick.
  const resizeBasis = useRef<{ aspect: number; cx: number; cy: number } | null>(null);

  const sel = items.find((i) => i.id === selectedId);
  if (!sel) return null;
  const id = sel.id;

  const startResize = () => {
    if (sel.type !== 'image' || sel.height === 0) return;
    resizeBasis.current = {
      aspect: sel.width / sel.height,
      cx: sel.x + sel.width / 2,
      cy: sel.y + sel.height / 2,
    };
    beginChange('Resize');
  };

  const changeResize = (newWidth: number) => {
    if (sel.type !== 'image' || !resizeBasis.current) return;
    const { aspect, cx, cy } = resizeBasis.current;
    const newHeight = Math.max(1, newWidth / aspect);
    const patch: Record<string, unknown> = {
      x: cx - newWidth / 2,
      y: cy - newHeight / 2,
      width: newWidth,
      height: newHeight,
    };
    if (sel.crop) patch.crop = coverCrop(sel.naturalWidth, sel.naturalHeight, newWidth, newHeight);
    updateItemLive(id, patch);
  };

  const endResize = () => {
    resizeBasis.current = null;
    commitChange();
  };

  return (
    <CollapsiblePanel title="Arrange">
<div className="btn-grid-2">
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

      {sel.type === 'image' && (
        <>
          <p className="subhead">Flip</p>
          <div className="chip-row">
            <button className="chip" onClick={() => flipItem(id, 'x')} title="Flip horizontally (mirror left-right)">Flip H</button>
            <button className="chip" onClick={() => flipItem(id, 'y')} title="Flip vertically (mirror top-bottom)">Flip V</button>
          </div>

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

          <label className="toggle-row">
            <span>Lock aspect ratio</span>
            <input
              type="checkbox"
              checked={!!sel.lockAspect}
              onChange={(e) => updateItem(id, { lockAspect: e.target.checked })}
            />
          </label>
        </>
      )}
    </CollapsiblePanel>
  );
}
