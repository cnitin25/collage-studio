import { useEditorStore } from '../store/useEditorStore';
import { useReplacePhoto } from '../hooks/useReplacePhoto';
import Icon, { type IconName } from './ui/Icon';

interface Props {
  /** Open the tools sheet at a given panel title. */
  onOpenPanel: (title: string) => void;
}

interface Action {
  key: string;
  icon: IconName;
  label: string;
  run: () => void;
  active?: boolean;
  danger?: boolean;
}

/**
 * Phone-only actions for the current selection, docked where the thumbnail
 * strip sits. Deliberately fixed in place: an earlier toolbar that floated
 * over the selected photo was removed (see README.old.md).
 */
export default function SelectionBar({ onOpenPanel }: Props) {
  const selected = useEditorStore((s) => s.items.find((i) => i.id === s.selectedId));
  const croppingId = useEditorStore((s) => s.croppingId);
  const startCrop = useEditorStore((s) => s.startCrop);
  const endCrop = useEditorStore((s) => s.endCrop);
  const startEditingText = useEditorStore((s) => s.startEditingText);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const select = useEditorStore((s) => s.select);
  const replace = useReplacePhoto();

  if (!selected) return null;
  const cropping = croppingId === selected.id;

  const common: Action[] = [
    { key: 'dup', icon: 'copy', label: 'Duplicate', run: duplicateSelected },
    { key: 'del', icon: 'trash', label: 'Delete', run: removeSelected, danger: true },
  ];
  let actions: Action[];
  if (selected.type === 'image') {
    actions = [
      {
        key: 'crop',
        icon: cropping ? 'check' : 'crop',
        label: cropping ? 'Done' : 'Crop',
        run: () => (cropping ? endCrop() : startCrop(selected.id)),
        active: cropping,
      },
      { key: 'replace', icon: 'replace', label: 'Replace', run: replace.open },
      { key: 'adjust', icon: 'adjust', label: 'Adjust', run: () => onOpenPanel('Enhance & Adjust') },
      { key: 'border', icon: 'border', label: 'Border', run: () => onOpenPanel('Photo Border') },
      ...common,
    ];
  } else if (selected.type === 'text') {
    actions = [
      { key: 'edit', icon: 'edit', label: 'Edit', run: () => startEditingText(selected.id) },
      { key: 'font', icon: 'font', label: 'Style', run: () => onOpenPanel('Insert') },
      ...common,
    ];
  } else {
    // A sticker has no panel of its own: it's sized with its handles.
    actions = common;
  }

  return (
    <div className="selection-bar" role="toolbar" aria-label="Selected item">
      {actions.map((a) => (
        <button
          key={a.key}
          className={`selbar-btn ${a.active ? 'is-active' : ''} ${a.danger ? 'is-danger' : ''}`}
          onClick={a.run}
        >
          <Icon name={a.icon} size={20} />
          <span>{a.label}</span>
        </button>
      ))}
      <button className="selbar-btn selbar-done" onClick={() => select(null)} aria-label="Deselect">
        <Icon name="close" size={20} />
        <span>Close</span>
      </button>
      {replace.input}
    </div>
  );
}
