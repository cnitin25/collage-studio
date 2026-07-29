import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import Toolbar from './components/Toolbar';
import InspectorPanel from './components/panels/InspectorPanel';
import CanvasStage, { type CanvasHandle } from './components/Canvas/CanvasStage';
import TextEditOverlay from './components/Canvas/TextEditOverlay';
import ProjectsModal from './components/ProjectsModal';
import ThumbnailStrip from './components/ThumbnailStrip';
import StatusBar from './components/StatusBar';
import ImportWarningBanner from './components/ImportWarningBanner';
import { useEditorStore } from './store/useEditorStore';
import { useThemeStore } from './store/useThemeStore';
import { loadImageFiles } from './utils/loadImage';
import { downloadDataURL } from './utils/exportStage';
import { saveProject } from './storage/projects';

export default function App() {
  const canvasRef = useRef<CanvasHandle>(null);
  const stageHostRef = useRef<HTMLDivElement>(null);
  const addImages = useEditorStore((s) => s.addImages);
  const addText = useEditorStore((s) => s.addText);
  const select = useEditorStore((s) => s.select);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const itemCount = useEditorStore((s) => s.items.length);
  const exportScale = useEditorStore((s) => s.exportScale);
  const exportFileName = useEditorStore((s) => s.exportFileName);
  const exportFormat = useEditorStore((s) => s.exportFormat);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);

  const [projectsOpen, setProjectsOpen] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  // Desktop-only: collapses the always-visible sidebar to reclaim canvas
  // width. Distinct from toolsOpen, which drives the mobile slide-in drawer.
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Auto-save every 30 s when there's canvas content
  useEffect(() => {
    const timer = window.setInterval(() => {
      const st = useEditorStore.getState();
      if (!st.autoSaveEnabled || st.items.length === 0) return;
      const handle = canvasRef.current;
      let thumbnail: string | undefined;
      try {
        thumbnail =
          handle?.exportDataURL({
            mimeType: 'image/jpeg',
            quality: 0.6,
            pixelRatioMultiplier: 320 / st.canvas.width,
          }) ?? undefined;
      } catch {
        thumbnail = undefined;
      }
      saveProject({
        id: st.currentProjectId,
        name: st.projectName.trim() || 'Untitled',
        state: { canvas: st.canvas, items: st.items, spacing: st.spacing, lastLayout: st.lastLayout },
        thumbnail,
      }).catch(() => {});
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSave = useCallback(async () => {
    const handle = canvasRef.current;
    const st = useEditorStore.getState();
    let thumbnail: string | undefined;
    if (handle && st.items.length) {
      select(null);
      await new Promise((r) => requestAnimationFrame(r));
      try {
        const uri = handle.exportDataURL({
          mimeType: 'image/jpeg',
          quality: 0.7,
          pixelRatioMultiplier: 320 / st.canvas.width,
        });
        thumbnail = uri ?? undefined;
      } catch {
        thumbnail = undefined;
      }
    }
    await saveProject({
      id: st.currentProjectId,
      name: st.projectName.trim() || 'Untitled',
      state: { canvas: st.canvas, items: st.items, spacing: st.spacing, lastLayout: st.lastLayout },
      thumbnail,
    });
    setSavedToast(true);
    window.setTimeout(() => setSavedToast(false), 1800);
  }, [select]);

  const setImportFailures = useEditorStore((s) => s.setImportFailures);

  const onDrop = useCallback(
    async (files: File[]) => {
      const { images, failures } = await loadImageFiles(files);
      if (images.length) addImages(images);
      setImportFailures(failures);
    },
    [addImages, setImportFailures],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  const handleExport = useCallback(() => {
    const handle = canvasRef.current;
    if (!handle) return;
    // Deselect so the transformer handles aren't baked into the export.
    select(null);
    requestAnimationFrame(() => {
      const name = exportFileName.trim() || 'collage';
      const isJpg = exportFormat === 'jpeg';
      const uri = handle.exportDataURL({
        mimeType: isJpg ? 'image/jpeg' : 'image/png',
        quality: 0.95,
        pixelRatioMultiplier: exportScale,
      });
      if (uri) downloadDataURL(uri, `${name}.${isJpg ? 'jpg' : 'png'}`);
    });
  }, [select, exportScale, exportFileName, exportFormat]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        removeSelected();
      } else if (e.key === 'Escape') {
        if (useEditorStore.getState().croppingId) useEditorStore.getState().endCrop();
        else select(null);
      } else if (e.key.startsWith('Arrow')) {
        const st = useEditorStore.getState();
        if (!st.selectedId || st.layoutLocked || st.croppingId || st.editingId) return;
        const item = st.items.find((i) => i.id === st.selectedId);
        if (!item) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.updateItem(item.id, { x: item.x + dx, y: item.y + dy });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, removeSelected, select, duplicateSelected]);

  return (
    <div className="app">
      <Toolbar
        onAddImages={open}
        onAddText={addText}
        onExport={handleExport}
        onSave={handleSave}
        onOpenProjects={() => setProjectsOpen(true)}
        toolsOpen={toolsOpen}
        onToggleTools={() => setToolsOpen((v) => !v)}
      />
      <div className="workspace">
        <div className="stage-col">
          <div
            className="stage-host"
            {...(() => {
              // getRootProps() returns its own `ref` for drag-state tracking,
              // which would silently clobber stageHostRef (spread order) —
              // merge both so the dropzone and TextEditOverlay's position
              // math share the same DOM node.
              const { ref: dropzoneRef, ...rootProps } = getRootProps();
              return {
                ...rootProps,
                ref: (node: HTMLDivElement | null) => {
                  (stageHostRef as { current: HTMLDivElement | null }).current = node;
                  if (typeof dropzoneRef === 'function') dropzoneRef(node);
                  else if (dropzoneRef) (dropzoneRef as { current: HTMLElement | null }).current = node;
                },
              };
            })()}
          >
            <input {...getInputProps()} />
            <CanvasStage ref={canvasRef} />
            <TextEditOverlay hostRef={stageHostRef} getStage={() => canvasRef.current?.getStage() ?? null} />
            {itemCount === 0 && (
              <div className="empty-state" onClick={open}>
                <div className="empty-card">
                  <div className="empty-icon" aria-hidden>＋</div>
                  <p className="empty-title">Drop photos to start</p>
                  <p className="empty-sub">or click to browse — everything stays on your device</p>
                </div>
              </div>
            )}
            {isDragActive && itemCount > 0 && (
              <div className="drag-overlay">Drop to add photos</div>
            )}
          </div>
          <ThumbnailStrip />
        </div>
        {toolsOpen && <div className="drawer-scrim" onClick={() => setToolsOpen(false)} />}
        <button
          className={`inspector-collapse-toggle ${panelCollapsed ? 'is-collapsed' : ''}`}
          onClick={() => setPanelCollapsed((v) => !v)}
          title={panelCollapsed ? 'Show tools panel' : 'Hide tools panel'}
          aria-label={panelCollapsed ? 'Show tools panel' : 'Hide tools panel'}
        >
          {panelCollapsed ? '‹' : '›'}
        </button>
        <InspectorPanel open={toolsOpen} onClose={() => setToolsOpen(false)} collapsed={panelCollapsed} />
      </div>
      <StatusBar />
      <ProjectsModal open={projectsOpen} onClose={() => setProjectsOpen(false)} />
      {savedToast && <div className="toast">Saved</div>}
      <ImportWarningBanner />
    </div>
  );
}
