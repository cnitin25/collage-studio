import { useEditorStore } from '../store/useEditorStore';

export default function ImportWarningBanner() {
  const failures = useEditorStore((s) => s.importFailures);
  const setImportFailures = useEditorStore((s) => s.setImportFailures);

  if (failures.length === 0) return null;

  return (
    <div className="import-warning">
      <div className="import-warning-head">
        <span className="import-warning-title">
          {failures.length === 1 ? "1 photo couldn't be added" : `${failures.length} photos couldn't be added`}
        </span>
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
