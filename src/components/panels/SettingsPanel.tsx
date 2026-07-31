import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';

export default function SettingsPanel() {
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const setSnapEnabled = useEditorStore((s) => s.setSnapEnabled);
  const layoutLocked = useEditorStore((s) => s.layoutLocked);
  const setLayoutLocked = useEditorStore((s) => s.setLayoutLocked);
  const swapModeEnabled = useEditorStore((s) => s.swapModeEnabled);
  const setSwapModeEnabled = useEditorStore((s) => s.setSwapModeEnabled);
  const cropLocked = useEditorStore((s) => s.cropLocked);
  const setCropLocked = useEditorStore((s) => s.setCropLocked);
  const lockAspectEnabled = useEditorStore((s) => s.lockAspectEnabled);
  const setLockAspectEnabled = useEditorStore((s) => s.setLockAspectEnabled);

  return (
    <CollapsiblePanel title="Settings">
      <p className="subhead">Canvas</p>
      <label className="toggle-row" title="Snap edges/centers to the canvas and other items while dragging">
        <span>Snap &amp; guides</span>
        <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
      </label>

      <p className="subhead">Layout</p>
      <label className="toggle-row">
        <span>Lock layout</span>
        <input
          type="checkbox"
          checked={layoutLocked}
          onChange={(e) => setLayoutLocked(e.target.checked)}
        />
      </label>
      <label className="toggle-row" title="Swap two photos when you drag one onto another">
        <span>Swap on drag</span>
        <input
          type="checkbox"
          checked={swapModeEnabled}
          onChange={(e) => setSwapModeEnabled(e.target.checked)}
        />
      </label>

      <p className="subhead">Crop &amp; Arrange</p>
      <label className="toggle-row" title="Resize every photo proportionally, keeping its aspect ratio">
        <span>Lock aspect ratio</span>
        <input
          type="checkbox"
          checked={lockAspectEnabled}
          onChange={(e) => setLockAspectEnabled(e.target.checked)}
        />
      </label>
      <label className="toggle-row" title="Keep crop mode active when you select another photo">
        <span>Stay in crop mode</span>
        <input
          type="checkbox"
          checked={cropLocked}
          onChange={(e) => setCropLocked(e.target.checked)}
        />
      </label>
    </CollapsiblePanel>
  );
}
