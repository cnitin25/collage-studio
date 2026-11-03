import { useEditorStore } from '../../store/useEditorStore';
import CollapsiblePanel from './CollapsiblePanel';

type Anchor = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

const ALIGNS: { anchor: Anchor; label: string; icon: string }[] = [
  { anchor: 'left',     label: 'Left',           icon: '⇤' },
  { anchor: 'center-x', label: 'Center H',       icon: '↔' },
  { anchor: 'right',    label: 'Right',          icon: '⇥' },
  { anchor: 'top',      label: 'Top',            icon: '⇡' },
  { anchor: 'center-y', label: 'Center V',       icon: '↕' },
  { anchor: 'bottom',   label: 'Bottom',         icon: '⇣' },
];

/** One item lines up with the canvas; several, with each other. */
export default function AlignPanel() {
  const count = useEditorStore((s) => s.selectedIds.length);
  const alignItems = useEditorStore((s) => s.alignItems);
  const distributeSelection = useEditorStore((s) => s.distributeSelection);

  if (count === 0) return null;

  return (
    <CollapsiblePanel title="Photo Alignment">
      <p className="dim small" style={{ marginTop: 0 }}>
        {count === 1 ? 'Line the selection up with the canvas.' : `Line the ${count} selected items up with each other.`}
      </p>
      <div className="btn-grid-3">
        {ALIGNS.map((a) => (
          <button
            key={a.anchor}
            className="btn align-btn"
            title={a.label}
            onClick={() => alignItems(a.anchor)}
          >
            <span className="align-icon">{a.icon}</span>
            <span className="align-label">{a.label}</span>
          </button>
        ))}
      </div>
      {count > 1 && (
        <div className="btn-grid-2" style={{ marginTop: 10 }}>
          <button
            className="btn"
            disabled={count < 3}
            onClick={() => distributeSelection('x')}
            title={count < 3 ? 'Select three or more to space them evenly' : 'Even gaps across'}
          >
            Distribute ↔
          </button>
          <button
            className="btn"
            disabled={count < 3}
            onClick={() => distributeSelection('y')}
            title={count < 3 ? 'Select three or more to space them evenly' : 'Even gaps down'}
          >
            Distribute ↕
          </button>
        </div>
      )}
    </CollapsiblePanel>
  );
}
