import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useThemeStore } from '../store/useThemeStore';

interface Props {
  onAddImages: () => void;
  onAddText: () => void;
  onExport: () => void;
  onSave: () => void;
  onOpenProjects: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
}

export default function Toolbar({
  onAddImages,
  onAddText,
  onExport,
  onSave,
  onOpenProjects,
  toolsOpen,
  onToggleTools,
}: Props) {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const canUndo = useEditorStore((s) => s.past.length > 0);
  const canRedo = useEditorStore((s) => s.future.length > 0);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const clearAll = useEditorStore((s) => s.clearAll);
  const selectedId = useEditorStore((s) => s.selectedId);
  const itemCount = useEditorStore((s) => s.items.length);
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Closes the overflow menu on an outside tap/click or Escape — the same
  // dismissal surface a mobile user expects from any dropdown.
  useEffect(() => {
    if (!menuOpen) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const runFromMenu = (fn: () => void) => {
    fn();
    setMenuOpen(false);
  };

  const handleClearCanvas = () => {
    if (itemCount === 0) return;
    if (window.confirm('Clear the entire canvas? This removes every photo, text box, and sticker.')) {
      clearAll();
    }
  };

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
        <button className="btn btn-accent" onClick={onAddImages} title="Add photos from your device">
          <span className="btn-icon" aria-hidden>＋</span>
          <span className="btn-label">Add photos</span>
        </button>
        <button className="btn" onClick={onAddText} title="Add an editable text box to the canvas">
          <span className="btn-icon" aria-hidden>T</span>
          <span className="btn-label">Add text</span>
        </button>
        <div className="divider" />
        <button className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <span className="btn-icon" aria-hidden>↶</span>
          <span className="btn-label">Undo</span>
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <span className="btn-icon" aria-hidden>↷</span>
          <span className="btn-label">Redo</span>
        </button>

        {/* Desktop: inline (display:contents). Compact: hidden entirely —
            the same actions are reachable via the overflow menu below. */}
        <div className="toolbar-secondary">
          <button className="btn" onClick={duplicateSelected} disabled={!selectedId} title="Duplicate (Ctrl+D)">
            Duplicate
          </button>
          <button className="btn" onClick={removeSelected} disabled={!selectedId} title="Delete (Del)">
            Delete
          </button>
          <button
            className="btn"
            onClick={handleClearCanvas}
            disabled={itemCount === 0}
            title="Remove every photo, text, and sticker from the canvas"
          >
            Clear canvas
          </button>
          <div className="divider" />
          <button className="btn" onClick={onOpenProjects} title="Open, save, or delete saved projects">
            Projects
          </button>
          <button className="btn btn-primary" onClick={onSave} title="Save this project to the browser">
            Save
          </button>
          <button
            className="btn btn-primary"
            onClick={onExport}
            disabled={itemCount === 0}
            title="Export the collage as an image file"
          >
            Export
          </button>
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

        {/* Compact-only: tools drawer toggle + overflow menu for the actions hidden above */}
        <div className="divider toolbar-tools-divider" />
        <button
          className="btn toolbar-tools-toggle"
          onClick={onToggleTools}
          aria-expanded={toolsOpen}
          aria-label="Tools"
          title="Open tools panel"
        >
          <span className="btn-icon" aria-hidden>⚙</span>
        </button>

        <div className="toolbar-overflow" ref={menuRef}>
          <button
            className="btn toolbar-overflow-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="More actions"
            title="More actions"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="overflow-menu" role="menu">
              <button
                className="overflow-item"
                role="menuitem"
                disabled={!selectedId}
                onClick={() => runFromMenu(duplicateSelected)}
              >
                ⧉ Duplicate
              </button>
              <button
                className="overflow-item"
                role="menuitem"
                disabled={!selectedId}
                onClick={() => runFromMenu(removeSelected)}
              >
                🗑 Delete
              </button>
              <button
                className="overflow-item"
                role="menuitem"
                disabled={itemCount === 0}
                onClick={() => runFromMenu(handleClearCanvas)}
              >
                🧹 Clear canvas
              </button>
              <button className="overflow-item" role="menuitem" onClick={() => runFromMenu(onOpenProjects)}>
                ▤ Projects
              </button>
              <button className="overflow-item" role="menuitem" onClick={() => runFromMenu(onSave)}>
                💾 Save
              </button>
              <button
                className="overflow-item"
                role="menuitem"
                disabled={itemCount === 0}
                onClick={() => runFromMenu(onExport)}
              >
                ⭳ Export
              </button>
              <button className="overflow-item" role="menuitem" onClick={() => runFromMenu(toggleTheme)}>
                {theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
