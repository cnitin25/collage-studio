import { useEditorStore } from '../store/useEditorStore';
import { useThemeStore } from '../store/useThemeStore';

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
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

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
        <button className="btn btn-accent" onClick={onAddImages} title="Add photos from your device">Add photos</button>
        <button className="btn" onClick={onAddText} title="Add an editable text box to the canvas">Add text</button>
        <div className="divider" />
        <button className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
        <button className="btn" onClick={duplicateSelected} disabled={!selectedId} title="Duplicate (Ctrl+D)">Duplicate</button>
        <button className="btn" onClick={removeSelected} disabled={!selectedId} title="Delete (Del)">Delete</button>
        <div className="divider" />
        <button className="btn" onClick={onOpenProjects} title="Open, save, or delete saved projects">Projects</button>
        <button className="btn btn-primary" onClick={onSave} title="Save this project to the browser">Save</button>
        <button className="btn btn-primary" onClick={onExport} disabled={itemCount === 0} title="Export the collage as an image file">Export</button>
        <div className="divider" />
        <button
          className="btn"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle dark / light mode"
        >
          {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
    </header>
  );
}
