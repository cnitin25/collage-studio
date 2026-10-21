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
import SelectionBar from './components/SelectionBar';
import { COMPACT_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import {
  useEditorStore,
  DEFAULT_PROJECT_NAME,
  fileNameForProject,
  hasUnsavedChanges,
  savedRefOf,
} from './store/useEditorStore';
import { useThemeStore } from './store/useThemeStore';
import { loadImageFiles } from './utils/loadImage';
import { canvasToBlob, maxExportScale, shareOrDownload } from './utils/exportStage';
import { saveProject } from './storage/projects';
import { requestPersistentStorage } from './storage/persistence';
import Icon from './components/ui/Icon';

function describeSaveError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return "the browser's storage for this site is full. Delete old projects, or use Projects → Export file to keep a copy.";
  }
  return err instanceof Error && err.message ? err.message : 'an unknown storage error.';
}

/** Save the editor's current state; marks it saved only once it's safely stored. */
async function saveCurrent(thumbnail: string | undefined) {
  const st = useEditorStore.getState();
  // Captured before the (async) save, so edits made while it runs still count
  // as unsaved afterwards.
  const ref = savedRefOf(st);
  const result = await saveProject({
    id: st.currentProjectId,
    name: st.projectName.trim() || DEFAULT_PROJECT_NAME,
    state: { canvas: st.canvas, items: st.items, spacing: st.spacing, lastLayout: st.lastLayout },
    thumbnail,
  });
  if (result.missingPhotos === 0) useEditorStore.getState().markSaved(ref);
  void requestPersistentStorage();
  return result;
}

interface ToastAction {
  label: string;
  run: () => void;
}

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
  const clearAll = useEditorStore((s) => s.clearAll);
  const requestPanel = useEditorStore((s) => s.requestPanel);
  const resetView = useEditorStore((s) => s.resetView);
  const hasSelection = useEditorStore((s) => s.selectedId !== null);
  const zoomed = useEditorStore((s) => s.viewScale !== 1 || s.viewX !== 0 || s.viewY !== 0);
  const zoomPercent = useEditorStore((s) => Math.round(s.viewScale * 100));
  const compact = useMediaQuery(COMPACT_QUERY);

  const [projectsOpen, setProjectsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean; action?: ToastAction } | null>(null);
  const toastTimer = useRef<number>();
  const showToast = useCallback((text: string, error = false, action?: ToastAction) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, error, action });
    // Errors, and anything with a button to press, stay up long enough to act on.
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 8000 : action ? 6000 : 1800);
  }, []);
  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const [toolsOpen, setToolsOpen] = useState(false);
  // Phone bottom sheet: half height (canvas visible above it) or expanded.
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const closeTools = useCallback(() => {
    setToolsOpen(false);
    setSheetExpanded(false);
  }, []);
  /** Open the tools panel scrolled to one section (or a spot in it) — the selection bar's buttons. */
  const openPanel = useCallback(
    (title: string, anchor?: string) => {
      requestPanel(title, anchor);
      setToolsOpen(true);
    },
    [requestPanel],
  );
  // Desktop-only: collapses the always-visible sidebar to reclaim canvas
  // width. Distinct from toolsOpen, which drives the mobile slide-in drawer.
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const theme = useThemeStore((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Match the phone's status bar / browser chrome to the toolbar (--panel).
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#181b22' : '#ffffff');
  }, [theme]);

  // Auto-save every 30 s when there's canvas content, and whenever the page is
  // hidden. Phones rarely deliver beforeunload: switching apps can be the last
  // thing the page ever sees before it's evicted, so that's when to save.
  useEffect(() => {
    const autoSave = () => {
      const st = useEditorStore.getState();
      if (!st.autoSaveEnabled || !hasUnsavedChanges(st)) return;
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
      // A background save that fails must still say so — silently dropping it
      // is how a full disk goes unnoticed until the project won't reopen.
      saveCurrent(thumbnail).catch((err) => showToast(`Auto-save failed: ${describeSaveError(err)}`, true));
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') autoSave();
    };
    // pagehide covers browsers that unload without a visibility change first;
    // when one did fire, it has already saved.
    const onPageHide = () => {
      if (document.visibilityState !== 'hidden') autoSave();
    };
    const timer = window.setInterval(autoSave, 30_000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [showToast]);

  // Closing the tab with unsaved work gets the browser's "Leave site?" prompt.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges(useEditorStore.getState())) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
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
    try {
      const { missingPhotos } = await saveCurrent(thumbnail);
      if (missingPhotos > 0) {
        showToast(
          `Saved, but ${missingPhotos} photo${missingPhotos === 1 ? '' : 's'} couldn't be stored and won't reopen.`,
          true,
        );
      } else {
        showToast('Saved');
      }
    } catch (err) {
      showToast(`Couldn't save: ${describeSaveError(err)}`, true);
    }
  }, [select, showToast]);

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

  const handleExport = useCallback(async () => {
    const handle = canvasRef.current;
    if (!handle) return;
    // Deselect so the transformer handles aren't baked into the export.
    select(null);
    await new Promise((r) => requestAnimationFrame(r));
    const st = useEditorStore.getState();
    const name = exportFileName.trim() || fileNameForProject(st.projectName);
    const isJpg = exportFormat === 'jpeg';
    const mimeType = isJpg ? 'image/jpeg' : 'image/png';
    const fileName = `${name}.${isJpg ? 'jpg' : 'png'}`;
    // Past the browser's canvas limit the render comes back blank rather than
    // failing, so stay under it and say so.
    const scale = Math.min(exportScale, maxExportScale(st.canvas.width, st.canvas.height));
    const rendered = handle.exportCanvas({ mimeType, pixelRatioMultiplier: scale });
    const blob = rendered ? await canvasToBlob(rendered, mimeType, 0.95) : null;
    if (!blob || blob.size === 0) {
      showToast("Couldn't create the image — try a smaller size in Export settings.", true);
      return;
    }
    const result = await shareOrDownload(blob, fileName);
    if (result === 'needs-gesture') {
      // Rendering outlasted the tap that started it; sharing needs a fresh one.
      showToast('Your image is ready', false, {
        label: 'Save / share',
        run: () => void shareOrDownload(blob, fileName),
      });
    } else if (result !== 'cancelled' && scale < exportScale) {
      showToast(`Exported at ${scale}× — the largest this device can make at this canvas size.`);
    }
  }, [select, exportScale, exportFileName, exportFormat, showToast]);

  // Clearing is a single undo step, so offer Undo instead of asking first.
  const handleClearCanvas = useCallback(() => {
    if (useEditorStore.getState().items.length === 0) return;
    clearAll();
    showToast('Canvas cleared', false, { label: 'Undo', run: undo });
  }, [clearAll, undo, showToast]);

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
    <div className={`app ${toolsOpen ? 'sheet-open' : ''} ${toolsOpen && sheetExpanded ? 'sheet-expanded' : ''}`}>
      <Toolbar
        onAddImages={open}
        onAddText={addText}
        onExport={handleExport}
        onSave={handleSave}
        onOpenProjects={() => setProjectsOpen(true)}
        onClearCanvas={handleClearCanvas}
        toolsOpen={toolsOpen}
        onToggleTools={() => (toolsOpen ? closeTools() : setToolsOpen(true))}
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
                  <p className="empty-title">
                    <span className="copy-pointer">Drop photos to start</span>
                    <span className="copy-touch">Tap to add photos</span>
                  </p>
                  <p className="empty-sub">
                    <span className="copy-pointer">or click to browse — </span>
                    <span className="copy-touch">from your gallery or camera — </span>
                    everything stays on your device
                  </p>
                </div>
              </div>
            )}
            {zoomed && itemCount > 0 && (
              <button className="fit-chip" onClick={resetView} title="Fit the whole canvas on screen">
                <Icon name="fit" size={16} /> {zoomPercent}% · Fit
              </button>
            )}
            {isDragActive && itemCount > 0 && (
              <div className="drag-overlay">Drop to add photos</div>
            )}
          </div>
          {/* On a phone the selection's actions take the strip's place. */}
          {compact && hasSelection ? <SelectionBar onOpenPanel={openPanel} /> : <ThumbnailStrip keepSlot={compact} />}
        </div>
        {toolsOpen && <div className="drawer-scrim" onClick={closeTools} />}
        <button
          className={`inspector-collapse-toggle ${panelCollapsed ? 'is-collapsed' : ''}`}
          onClick={() => setPanelCollapsed((v) => !v)}
          title={panelCollapsed ? 'Show tools panel' : 'Hide tools panel'}
          aria-label={panelCollapsed ? 'Show tools panel' : 'Hide tools panel'}
        >
          {panelCollapsed ? '‹' : '›'}
        </button>
        <InspectorPanel
          open={toolsOpen}
          onClose={closeTools}
          collapsed={panelCollapsed}
          expanded={sheetExpanded}
          onSetExpanded={setSheetExpanded}
        />
      </div>
      <StatusBar />
      <ProjectsModal open={projectsOpen} onClose={() => setProjectsOpen(false)} />
      {toast && (
        <div className={`toast ${toast.error ? 'is-error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.text}
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                toast.action!.run();
                dismissToast();
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
      <ImportWarningBanner />
    </div>
  );
}
