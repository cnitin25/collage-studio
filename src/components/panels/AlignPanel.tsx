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

export default function AlignPanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const alignItems = useEditorStore((s) => s.alignItems);

  if (!selectedId) return null;

  return (
    <CollapsiblePanel title="Align to canvas">
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
    </CollapsiblePanel>
  );
}
