import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';

export default function HistoryPanel() {
  const past = useEditorStore((s) => s.past);
  const historyLabels = useEditorStore((s) => s.historyLabels);
  const undo = useEditorStore((s) => s.undo);
  const canUndo = useEditorStore((s) => s.past.length > 0);

  const jumpTo = (targetIdx: number) => {
    const steps = past.length - 1 - targetIdx;
    for (let i = 0; i < steps; i++) undo();
  };

  return (
    <CollapsiblePanel
      title="History"
      badge={past.length > 0 && <span className="dim">({past.length})</span>}
      headerExtra={
        <button className="link-btn" disabled={!canUndo} onClick={undo} title="Undo the last action">
          Undo
        </button>
      }
    >
      {past.length === 0 ? (
        <p className="dim small">No actions yet.</p>
      ) : (
        <div className="history-list">
          {[...historyLabels].reverse().map((label, revIdx) => {
            const idx = past.length - 1 - revIdx;
            return (
              <button key={idx} className="history-item" onClick={() => jumpTo(idx)} title={`Jump back to "${label}"`}>
                <span className="history-dot" />
                <span>{label}</span>
              </button>
            );
          })}
          <div className="history-item history-origin">
            <span className="history-dot is-origin" />
            <span className="dim">Initial state</span>
          </div>
        </div>
      )}
    </CollapsiblePanel>
  );
}
