import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';

export default function HistoryPanel() {
  const past = useEditorStore((s) => s.past);
  const future = useEditorStore((s) => s.future);
  const historyLabels = useEditorStore((s) => s.historyLabels);
  const futureLabels = useEditorStore((s) => s.futureLabels);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = past.length > 0;

  // Jump backward to right before past[idx]'s action, or forward to the
  // state produced by future[idx]'s action — future is nearest-first from
  // the end of the array, so redo() (which pops the end) walks toward it.
  const jumpToPast = (targetIdx: number) => {
    const steps = past.length - 1 - targetIdx;
    for (let i = 0; i < steps; i++) undo();
  };
  const jumpToFuture = (targetIdx: number) => {
    const steps = future.length - targetIdx;
    for (let i = 0; i < steps; i++) redo();
  };

  const totalSteps = past.length + future.length;

  return (
    <CollapsiblePanel
      title="History"
      badge={totalSteps > 0 && <span className="dim">({totalSteps})</span>}
      headerExtra={
        <button className="link-btn" disabled={!canUndo} onClick={undo} title="Undo the last action">
          Undo
        </button>
      }
    >
      {totalSteps === 0 ? (
        <p className="dim small">No actions yet.</p>
      ) : (
        <div className="history-list">
          {futureLabels.map((label, idx) => (
            <button
              key={`future-${idx}`}
              className="history-item history-future"
              onClick={() => jumpToFuture(idx)}
              title={`Jump forward to "${label}"`}
            >
              <span className="history-dot" />
              <span>{label}</span>
            </button>
          ))}
          <div className="history-item history-current">
            <span className="history-dot is-current" />
            <span className="dim">Current</span>
          </div>
          {[...historyLabels].reverse().map((label, revIdx) => {
            const idx = past.length - 1 - revIdx;
            return (
              <button key={`past-${idx}`} className="history-item" onClick={() => jumpToPast(idx)} title={`Jump back to "${label}"`}>
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
