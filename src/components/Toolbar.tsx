import { useEditorStore } from '../store/useEditorStore';

interface Props {
  onAddImages: () => void;
  onAddText: () => void;
  onExport: () => void;
  onSave: () => void;
  onOpenProjects: () => void;
}

export default function Toolbar({ onAddImages, onAddText, onExport, onSave, onOpenProjects }: Props) {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const selectedId = useEditorStore((s) => s.selectedId);
  const itemCount = useEditorStore((s) => s.items.length);
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden />
        <input
          className="project-name-input"
          value={projectName}
          spellCheck={false}
          onChange={(e) => setProjectName(e.target.value)}
          aria-label="Project name"
        />
      </div>

      <div className="toolbar-actions">
        <button className="btn btn-accent" onClick={onAddImages}>Add photos</button>
        <button className="btn" onClick={onAddText}>Add text</button>
        <div className="divider" />
        <button className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <button className="btn" onClick={duplicateSelected} disabled={!selectedId} title="Duplicate (Ctrl+D)">Duplicate</button>
        <button className="btn" onClick={removeSelected} disabled={!selectedId} title="Delete (Del)">Delete</button>
        <div className="divider" />
        <button className="btn" onClick={onOpenProjects}>Projects</button>
        <button className="btn btn-primary" onClick={onSave}>Save</button>
        <button className="btn btn-primary" onClick={onExport} disabled={itemCount === 0}>Export</button>
      </div>
    </header>
  );
}
