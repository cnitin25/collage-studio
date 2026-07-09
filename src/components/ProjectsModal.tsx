import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { listProjects, openProject, removeProject, type ProjectMeta } from '../storage/projects';
import { exportProjectFile, importProjectFile } from '../storage/projectFile';

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

  const refresh = async () => {
    setLoading(true);
    try {
      setProjects(await listProjects());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  if (!open) return null;

  const handleOpen = async (id: string) => {
    const res = await openProject(id);
    if (res) {
      loadSerializedState(res.state, res.meta.id, res.meta.name);
      onClose();
    }
  };

  const handleDelete = async (id: string) => {
    await removeProject(id);
    refresh();
  };

  const handleNew = () => {
    resetProject();
    onClose();
  };

  const handleExportFile = async () => {
    const st = useEditorStore.getState();
    if (st.items.length === 0) return;
    setExporting(true);
    try {
      await exportProjectFile({
        name: st.projectName.trim() || 'Untitled',
        canvas: st.canvas,
        items: st.items,
        spacing: st.spacing,
        lastLayout: st.lastLayout,
      });
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
      onClose();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Projects</h2>
          <button className="btn btn-accent" onClick={handleNew}>
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

        <div className="backup-row">
          <div className="backup-toggle">
            <label className="toggle-row" style={{ margin: 0 }}>
              <span>Auto-save every 30s</span>
              <input
                type="checkbox"
                checked={autoSaveEnabled}
                onChange={(e) => setAutoSaveEnabled(e.target.checked)}
              />
            </label>
          </div>
          <div className="backup-actions">
            <button className="btn" disabled={exporting} onClick={handleExportFile}>
              {exporting ? 'Exporting…' : 'Export file (.json)'}
            </button>
            <button className="btn" onClick={() => fileInputRef.current?.click()}>
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
                <button className="project-open-btn" onClick={() => handleOpen(p.id)}>
                  Open
                </button>
              </div>
              <button className="project-del" onClick={() => handleDelete(p.id)} aria-label="Delete">
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
