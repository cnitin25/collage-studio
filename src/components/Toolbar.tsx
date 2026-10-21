import { useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { useThemeStore } from '../store/useThemeStore';
import { useReplacePhoto } from '../hooks/useReplacePhoto';
import { isMac } from '../utils/platform';
import Icon, { type IconName } from './ui/Icon';

interface Props {
  onAddImages: () => void;
  onAddText: () => void;
  onExport: () => void;
  onSave: () => void;
  onOpenProjects: () => void;
  onClearCanvas: () => void;
  toolsOpen: boolean;
  onToggleTools: () => void;
}

const MOD = isMac() ? '⌘' : 'Ctrl+';

type ToolButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  /** Accessible name; also the tooltip unless `tip` says more. */
  label: string;
  tip?: string;
  /** Right-align the tooltip, for buttons near the window's right edge. */
  tipEnd?: boolean;
};

/**
 * Icon-only toolbar button. The name lives in aria-label; sighted mouse users
 * get it from the CSS tooltip (`data-tip`, see index.css), which replaces the
 * slower native `title` tooltip — so no `title` here, or both would show.
 */
function ToolButton({ icon, label, tip, tipEnd, className = '', ...rest }: ToolButtonProps) {
  return (
    <button
      className={`btn icon-btn ${className}`}
      aria-label={label}
      data-tip={tip ?? label}
      data-tip-align={tipEnd ? 'end' : undefined}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}

export default function Toolbar({
  onAddImages,
  onAddText,
  onExport,
  onSave,
  onOpenProjects,
  onClearCanvas,
  toolsOpen,
  onToggleTools,
}: Props) {
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
  const replace = useReplacePhoto();

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

  const themeLabel = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

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
        <ToolButton className="btn-accent" icon="plus" label="Add photos" tip="Add photos from your device" onClick={onAddImages} />
        {/* Wide layouts only — on a phone these live in the ⋯ menu and the
            selection bar, leaving the top row for what's used every time. */}
        <ToolButton
          className="toolbar-wide"
          icon="replace"
          label="Replace photo"
          tip={replace.available ? 'Replace the selected photo' : 'Replace photo — select a photo first'}
          onClick={replace.open}
          disabled={!replace.available}
        />
        {replace.input}
        <ToolButton className="toolbar-wide" icon="text" label="Add text" onClick={onAddText} />
        <div className="divider toolbar-wide" />
        <ToolButton icon="undo" label="Undo" tip={`Undo (${MOD}Z)`} onClick={undo} disabled={!canUndo} />
        <ToolButton icon="redo" label="Redo" tip={`Redo (${MOD}Shift+Z)`} onClick={redo} disabled={!canRedo} />

        {/* Desktop: inline (display:contents). Compact: hidden entirely, and
            at medium widths the .toolbar-mid-hide ones move to the ⋯ menu —
            the same actions are reachable there. */}
        <div className="toolbar-secondary">
          <div className="divider toolbar-mid-hide" />
          <ToolButton
            className="toolbar-mid-hide"
            icon="copy"
            label="Duplicate"
            tip={`Duplicate (${MOD}D)`}
            onClick={duplicateSelected}
            disabled={!selectedId}
          />
          <ToolButton
            className="toolbar-mid-hide"
            icon="trash"
            label="Delete"
            tip="Delete (Del)"
            onClick={removeSelected}
            disabled={!selectedId}
          />
          <ToolButton
            className="toolbar-mid-hide"
            icon="eraser"
            label="Clear canvas"
            tip="Clear canvas (undoable)"
            onClick={onClearCanvas}
            disabled={itemCount === 0}
          />
          <div className="divider" />
          <ToolButton icon="folder" label="Projects" tip="Open, save, or delete projects" onClick={onOpenProjects} />
          <ToolButton className="btn-primary" icon="save" label="Save" tip="Save to this browser" onClick={onSave} />
          <ToolButton
            className="btn-primary"
            icon="download"
            label="Export"
            tip="Export as an image"
            tipEnd
            onClick={onExport}
            disabled={itemCount === 0}
          />
          <div className="divider toolbar-mid-hide" />
          <ToolButton
            className="toolbar-mid-hide"
            icon={theme === 'dark' ? 'sun' : 'moon'}
            label="Toggle dark / light mode"
            tip={themeLabel}
            tipEnd
            onClick={toggleTheme}
          />
        </div>

        {/* Compact-only: Export stays one tap away — it's what the whole
            session is for — then the tools sheet toggle. */}
        <button
          className="btn btn-primary toolbar-compact toolbar-export"
          onClick={onExport}
          disabled={itemCount === 0}
          aria-label="Export image"
        >
          <span className="btn-icon"><Icon name="share" /></span>
          <span className="toolbar-export-label">Export</span>
        </button>
        <div className="divider toolbar-compact" />
        <button
          className="btn toolbar-compact toolbar-tools-toggle"
          onClick={onToggleTools}
          aria-expanded={toolsOpen}
          aria-label="Tools"
        >
          <span className="btn-icon"><Icon name="tools" /></span>
        </button>

        {/* Compact and medium widths. Items marked .menu-compact are on the
            toolbar at medium widths, so they only appear here on a phone. */}
        <div className="toolbar-overflow toolbar-compact" ref={menuRef}>
          <button
            className="btn icon-btn toolbar-overflow-toggle"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="More actions"
            data-tip="More actions"
            data-tip-align="end"
          >
            <Icon name="more" />
          </button>
          {menuOpen && (
            <div className="overflow-menu" role="menu">
              <button className="overflow-item menu-compact" role="menuitem" onClick={() => runFromMenu(onAddText)}>
                <Icon name="text" /> Add text
              </button>
              <button
                className="overflow-item menu-compact"
                role="menuitem"
                disabled={!replace.available}
                onClick={() => runFromMenu(replace.open)}
              >
                <Icon name="replace" /> Replace photo
              </button>
              <button
                className="overflow-item"
                role="menuitem"
                disabled={!selectedId}
                onClick={() => runFromMenu(duplicateSelected)}
              >
                <Icon name="copy" /> Duplicate
              </button>
              <button
                className="overflow-item"
                role="menuitem"
                disabled={!selectedId}
                onClick={() => runFromMenu(removeSelected)}
              >
                <Icon name="trash" /> Delete
              </button>
              <button
                className="overflow-item"
                role="menuitem"
                disabled={itemCount === 0}
                onClick={() => runFromMenu(onClearCanvas)}
              >
                <Icon name="eraser" /> Clear canvas
              </button>
              <div className="overflow-sep" role="separator" />
              <button className="overflow-item menu-compact" role="menuitem" onClick={() => runFromMenu(onOpenProjects)}>
                <Icon name="folder" /> Projects
              </button>
              <button className="overflow-item menu-compact" role="menuitem" onClick={() => runFromMenu(onSave)}>
                <Icon name="save" /> Save
              </button>
              <button className="overflow-item" role="menuitem" onClick={() => runFromMenu(toggleTheme)}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
