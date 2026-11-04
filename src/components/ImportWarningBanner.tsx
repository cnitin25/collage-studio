import { useEditorStore } from '../store/useEditorStore';

export default function ImportWarningBanner() {
  const failures = useEditorStore((s) => s.importFailures);
  const setImportFailures = useEditorStore((s) => s.setImportFailures);

  if (failures.length === 0) return null;

  const n = failures.length;
  const source = failures[0].source;
  const title =
    source && failures.every((f) => f.source === source)
      ? `${n === 1 ? '1 part' : `${n} parts`} of “${source}” couldn't be opened`
      : n === 1
        ? "1 photo couldn't be added"
        : `${n} photos couldn't be added`;

  return (
    <div className="import-warning" role="alert">
      <div className="import-warning-head">
        <span className="import-warning-title">{title}</span>
        <button className="import-warning-close" onClick={() => setImportFailures([])} title="Dismiss" aria-label="Dismiss">
          ✕
        </button>
      </div>
      <ul className="import-warning-list">
        {failures.map((f, i) => (
          <li key={`${f.name}-${i}`}>
            <span className="import-warning-name">{f.name}</span>
            <span className="import-warning-reason">{f.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
