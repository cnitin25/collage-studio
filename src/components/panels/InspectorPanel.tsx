import { useState } from 'react';
import { useEditorStore } from '../../store/useEditorStore';
import type { CanvasPreset } from '../../types';
import { AccordionContext } from './AccordionContext';
import LayoutPanel from './LayoutPanel';
import ArrangePanel from './ArrangePanel';
import AdjustPanel from './AdjustPanel';
import EnhancePresetsPanel from './EnhancePresetsPanel';
import CropPanel from './CropPanel';
import StylePanel from './StylePanel';
import InsertPanel from './InsertPanel';
import TextPanel from './TextPanel';
import BackgroundPanel from './BackgroundPanel';
import AlignPanel from './AlignPanel';
import HistoryPanel from './HistoryPanel';
import CustomSizeFields from './CustomSizeFields';
import FramePanel from './FramePanel';
import CollapsiblePanel from './CollapsiblePanel';

const PRESETS: CanvasPreset[] = [
  { label: 'Square', width: 1080, height: 1080 },
  { label: 'Portrait', width: 1080, height: 1350 },
  { label: 'Story', width: 1080, height: 1920 },
  { label: 'Landscape', width: 1350, height: 1080 },
  { label: 'Wide', width: 1920, height: 1080 },
];

// 300 DPI — standard photo-print resolution, so exports come out sharp at size.
const PRINT_PRESETS: CanvasPreset[] = [
  { label: '4×6"', width: 1200, height: 1800 },
  { label: '5×7"', width: 1500, height: 2100 },
  { label: '8×10"', width: 2400, height: 3000 },
  { label: 'A4', width: 2480, height: 3508 },
];

interface Props {
  open?: boolean;
  onClose?: () => void;
}

export default function InspectorPanel({ open: drawerOpen, onClose }: Props) {
  const canvas = useEditorStore((s) => s.canvas);
  const setCanvasSize = useEditorStore((s) => s.setCanvasSize);
  const clearAll = useEditorStore((s) => s.clearAll);
  const itemCount = useEditorStore((s) => s.items.length);
  const exportScale = useEditorStore((s) => s.exportScale);
  const setExportScale = useEditorStore((s) => s.setExportScale);
  const exportFileName = useEditorStore((s) => s.exportFileName);
  const setExportFileName = useEditorStore((s) => s.setExportFileName);
  const exportFormat = useEditorStore((s) => s.exportFormat);
  const setExportFormat = useEditorStore((s) => s.setExportFormat);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const setSnapEnabled = useEditorStore((s) => s.setSnapEnabled);
  const resetView = useEditorStore((s) => s.resetView);

  const [openId, setOpenId] = useState<string | null>('Canvas');

  const activePreset = PRESETS.find((p) => p.width === canvas.width && p.height === canvas.height);
  const activePrintPreset = PRINT_PRESETS.find(
    (p) => p.width === canvas.width && p.height === canvas.height,
  );

  return (
    <aside className={`inspector ${drawerOpen ? 'is-open' : ''}`}>
    <div className="inspector-drawer-head">
      <span>Tools</span>
      <button className="btn btn-ghost inspector-close" onClick={onClose} aria-label="Close tools" title="Close tools">
        ✕
      </button>
    </div>
    <AccordionContext.Provider value={{ openId, setOpenId }}>
      <CollapsiblePanel title="Canvas">
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={`preset ${activePreset?.label === p.label ? 'is-active' : ''}`}
              onClick={() => setCanvasSize(p.width, p.height)}
              title={`${p.label} — ${p.width} × ${p.height} px`}
            >
              <span className="preset-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
              <span className="preset-label">{p.label}</span>
            </button>
          ))}
        </div>

        <p className="subhead">Print (300 DPI)</p>
        <div className="preset-grid">
          {PRINT_PRESETS.map((p) => (
            <button
              key={p.label}
              className={`preset ${activePrintPreset?.label === p.label ? 'is-active' : ''}`}
              onClick={() => setCanvasSize(p.width, p.height)}
              title={`${p.label} — ${p.width} × ${p.height} px at 300 DPI`}
            >
              <span className="preset-shape" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
              <span className="preset-label">{p.label}</span>
            </button>
          ))}
        </div>

        <p className="dim small">{canvas.width} × {canvas.height} px</p>
        <CustomSizeFields width={canvas.width} height={canvas.height} onApply={setCanvasSize} />
        <label className="toggle-row" title="Snap edges/centers to the canvas and other items while dragging">
          <span>Snap &amp; guides</span>
          <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
        </label>
        <button
          className="btn btn-ghost full"
          style={{ marginTop: 10 }}
          onClick={resetView}
          title="Reset the canvas view to fit the window"
        >
          Reset zoom / pan
        </button>
      </CollapsiblePanel>

      <LayoutPanel />

      <InsertPanel />

      <AlignPanel />
      <ArrangePanel />

      <TextPanel />
      <CropPanel />
      <EnhancePresetsPanel />
      <AdjustPanel />
      <StylePanel />

      <BackgroundPanel />

      <FramePanel />

      <HistoryPanel />

      <CollapsiblePanel title="Export">
        <input
          className="text-input"
          style={{ minHeight: 0, marginBottom: 10 }}
          value={exportFileName}
          spellCheck={false}
          onChange={(e) => setExportFileName(e.target.value)}
          placeholder="File name"
        />
        <div className="chip-row" style={{ marginBottom: 10 }}>
          {(['png', 'jpeg'] as const).map((f) => (
            <button
              key={f}
              className={`chip ${exportFormat === f ? 'is-active' : ''}`}
              onClick={() => setExportFormat(f)}
              title={f === 'png' ? 'PNG — lossless, larger file' : 'JPEG — smaller file, slight quality loss'}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              className={`chip ${exportScale === n ? 'is-active' : ''}`}
              onClick={() => setExportScale(n)}
              title={`Export at ${n}× the canvas resolution (${canvas.width * n} × ${canvas.height * n} px)`}
            >
              {n}×
            </button>
          ))}
        </div>
        <p className="dim small">
          {canvas.width * exportScale} × {canvas.height * exportScale} px ·{' '}
          {exportFileName.trim() || 'collage'}.{exportFormat === 'jpeg' ? 'jpg' : 'png'}
        </p>
      </CollapsiblePanel>

      <section className="panel">
        <button
          className="btn btn-ghost full"
          onClick={clearAll}
          disabled={itemCount === 0}
          title="Remove every photo, text, and sticker from the canvas"
        >
          Clear canvas
        </button>
      </section>
    </AccordionContext.Provider>
    </aside>
  );
}
