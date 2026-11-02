import { useEffect, useRef, useState } from 'react';
import { useEditorStore, DEFAULT_PROJECT_NAME, hasUnsavedChanges } from '../store/useEditorStore';
import { listProjects, openProject, removeProject, type ProjectMeta } from '../storage/projects';
import { exportProjectFile, importProjectFile } from '../storage/projectFile';
import { projectsMayBeCleared } from '../storage/persistence';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProjectsModal({ open, onClose }: Props) {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadSerializedState = useEditorStore((s) => s.loadSerializedState);
  const resetProject = useEditorStore((s) => s.resetProject);
  const currentProjectId = useEditorStore((s) => s.currentProjectId);
  const autoSaveEnabled = useEditorStore((s) => s.autoSaveEnabled);
  const setAutoSaveEnabled = useEditorStore((s) => s.setAutoSaveEnabled);
  const setImportFailures = useEditorStore((s) => s.setImportFailures);

  const refresh = async () => {
    setLoading(true);
    try {
      setProjects(await listProjects());
    } finally {
      setLoading(false);
    }
  };

  const [mayBeCleared, setMayBeCleared] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  // The caller passes a new function each render; the key handler below must
  // not re-subscribe (and bounce focus out and back) every time it does.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    refresh();
    projectsMayBeCleared().then(setMayBeCleared);
  }, [open]);

  // A modal dialog: focus moves in and stays in, Escape closes it, and focus
  // goes back where it was afterwards. Captured on the document so the
  // editor's own shortcuts (window listeners) never see these keys.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        const focusable = Array.from(
          dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex="0"]'),
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const at = document.activeElement;
        if (e.shiftKey && (at === first || at === dialog)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (at === last || !dialog.contains(at))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  /** Every action that replaces the editor's contents goes through this. */
  const okToDiscard = () =>
    !hasUnsavedChanges(useEditorStore.getState()) ||
    window.confirm('This collage has unsaved changes. Discard them?');

  const handleOpen = async (id: string) => {
    if (!okToDiscard()) return;
    const res = await openProject(id);
    if (res) {
      loadSerializedState(res.state, res.meta.id, res.meta.name, res.meta.updatedAt);
      onClose();
    }
  };

  const handleDelete = async (p: ProjectMeta) => {
    if (!window.confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    await removeProject(p.id);
    // Deleting the open project closes it. Left on screen, auto-save would
    // quietly store it again — the deletion undone behind the user's back.
    if (p.id === useEditorStore.getState().currentProjectId) resetProject();
    refresh();
  };

  const handleNew = () => {
    if (!okToDiscard()) return;
    resetProject();
    onClose();
  };

  const handleExportFile = async () => {
    const st = useEditorStore.getState();
    if (st.items.length === 0) return;
    setExporting(true);
    setImportError(null);
    try {
      await exportProjectFile({
        name: st.projectName.trim() || DEFAULT_PROJECT_NAME,
        canvas: st.canvas,
        items: st.items,
        spacing: st.spacing,
        lastLayout: st.lastLayout,
      });
    } catch (err) {
      setImportError(`Couldn't export the file: ${err instanceof Error ? err.message : 'an unknown error.'}`);
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    try {
      const imported = await importProjectFile(file);
      loadSerializedState(
        { canvas: imported.canvas, items: imported.items, spacing: imported.spacing, lastLayout: imported.lastLayout },
        `proj_${Date.now().toString(36)}`,
        imported.name,
      );
      setImportFailures(imported.skipped.map((p) => ({ ...p, source: file.name })));
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="projects-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="projects-title">Projects</h2>
          <button className="btn btn-accent" onClick={handleNew} title="Start a new, empty project">
            New project
          </button>
        </div>

        {loading && <p className="dim small">Loading…</p>}
        {!loading && projects.length === 0 && (
          <p className="dim small">No saved projects yet. Use “Save” to store one here.</p>
        )}

        <p className="storage-note">
          Projects are stored locally in this browser (IndexedDB) — nothing is uploaded.
          They stay on this device and browser only: not synced to other devices, and
          cleared if you clear this site's browsing data.
        </p>
        {mayBeCleared && (
          <p className="storage-note is-warning">
            Safari deletes a site's saved data if you don't open it for 7 days. To keep
            projects, add Collage Studio to your Home Screen (Share → Add to Home Screen),
            or use Export file below.
          </p>
        )}

        <div className="backup-row">
          <div className="backup-toggle">
            <label className="toggle-row" style={{ margin: 0 }} title="Automatically save this project every 30 seconds">
              <span>Auto-save every 30s</span>
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              />
            </label>
          </div>
          <div className="backup-actions">
            <button
              className="btn"
              disabled={exporting}
              onClick={handleExportFile}
              title="Download this project as a portable file (photos included)"
            >
              {exporting ? 'Exporting…' : 'Export file (.json)'}
            </button>
            <button
              className="btn"
              onClick={() => okToDiscard() && fileInputRef.current?.click()}
              title="Reopen a project from an exported file"
            >
              Import file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={handleImportFile}
            />
          </div>
        </div>
        <p className="dim small" style={{ marginBottom: 16 }}>
          Export saves a single portable file (photos included) you can keep anywhere —
          outside the browser — and reopen later, even on another device or browser.
        </p>
        {importError && <p className="import-error">{importError}</p>}

        <div className="project-grid">
          {projects.map((p) => (
            <div key={p.id} className={`project-card ${p.id === currentProjectId ? 'is-current' : ''}`}>
              <button
                className="project-thumb"
                onClick={() => handleOpen(p.id)}
                style={p.thumbnail ? { backgroundImage: `url(${p.thumbnail})` } : undefined}
                aria-label={`Open ${p.name}`}
              >
                <span className="project-open-hint">Open</span>
                {!p.thumbnail && <span className="project-thumb-placeholder">No preview</span>}
              </button>
              <div className="project-meta">
                <div>
                  <span className="project-name">{p.name}</span>
                  <span className="dim small" style={{ margin: 0, display: 'block' }}>
                    {new Date(p.updatedAt).toLocaleDateString()}{' '}
                    {new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <button className="project-open-btn" onClick={() => handleOpen(p.id)} title={`Open "${p.name}"`}>
                  Open
                </button>
              </div>
              <button
                className="project-del"
                onClick={() => handleDelete(p)}
                title={`Delete "${p.name}"`}
                aria-label="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
