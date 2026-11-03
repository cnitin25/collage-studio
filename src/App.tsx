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
  needsSaving,
  savedRefOf,
} from './store/useEditorStore';
import { useThemeStore } from './store/useThemeStore';
import { importPhotos } from './utils/importPhotos';
import { canvasToBlob, maxExportScale, shareOrDownload } from './utils/exportStage';
import { saveProject, type SaveResult } from './storage/projects';
import { requestPersistentStorage } from './storage/persistence';
import { confirmRestore, rememberProject, restoreLastProject } from './storage/session';
import Icon from './components/ui/Icon';

/** The app's own clipboard type: marks what Copy put there, so Paste knows it. */
const CLIPBOARD_TYPE = 'application/x-collage-studio-item';

function describeSaveError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'QuotaExceededError') {
    return "the browser's storage for this site is full. Delete old projects, or use Projects → Export file to keep a copy.";
  }
  return err instanceof Error && err.message ? err.message : 'an unknown storage error.';
}

/** Saves still writing: leaving the page now could lose them (see beforeunload). */
let savesInFlight = 0;

/** Save the editor's current state; marks it saved only once it's safely stored. */
async function saveCurrent(thumbnail: string | undefined) {
  const st = useEditorStore.getState();
  // Captured before the (async) save, so edits made while it runs still count
  // as unsaved afterwards.
  const ref = savedRefOf(st);
  savesInFlight++;
  let result: SaveResult;
  try {
    result = await saveProject({
      id: st.currentProjectId,
      name: st.projectName.trim() || DEFAULT_PROJECT_NAME,
      state: { canvas: st.canvas, items: st.items, spacing: st.spacing, lastLayout: st.lastLayout },
      thumbnail,
    });
  } finally {
    savesInFlight--;
  }
  if (result.missingPhotos === 0) useEditorStore.getState().markSaved(ref);
  rememberProject(st.currentProjectId);
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
  const busyMessage = useEditorStore((s) => s.busyMessage);

  const [projectsOpen, setProjectsOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; error: boolean; action?: ToastAction } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((text: string, error = false, action?: ToastAction) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, error, action });
    // Errors, and anything with a button to press, stay up long enough to act
    // on; anything else long enough to read (a short "Saved" goes quickly).
    const readTime = Math.min(6000, Math.max(1800, text.length * 55));
    toastTimer.current = window.setTimeout(() => setToast(null), error ? 8000 : action ? 6000 : readTime);
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

  // Auto-save every 30 s when there's unsaved work, and whenever the page is
  // hidden. Phones rarely deliver beforeunload: switching apps can be the last
  // thing the page ever sees before it's evicted, so that's when to save.
  const autoSaveNow = useRef<() => void>(() => {});
  useEffect(() => {
    const autoSave = () => {
      const st = useEditorStore.getState();
      if (!st.autoSaveEnabled || !needsSaving(st)) return;
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
    autoSaveNow.current = autoSave;
    const timer = window.setInterval(autoSave, 30_000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [showToast]);

  // Reopen whatever was open last time. Confirmed two frames later, once it
  // has rendered: a project that crashes the editor must not reopen on every
  // load (session.ts).
  useEffect(() => {
    void restoreLastProject().then((r) => {
      if (r.kind === 'restored') {
        showToast(`Reopened “${r.name}”`);
        requestAnimationFrame(() => requestAnimationFrame(confirmRestore));
      } else if (r.kind === 'skipped') {
        showToast("Your last project didn't open cleanly last time, so it wasn't reopened. It's in Projects.", true);
      }
    });
  }, [showToast]);

  const toggleAutoSave = useCallback(() => {
    const on = !useEditorStore.getState().autoSaveEnabled;
    useEditorStore.getState().setAutoSaveEnabled(on);
    if (on) {
      showToast('Auto-save is on');
      autoSaveNow.current(); // anything unsaved goes now, not in 30 s
    } else {
      showToast('Auto-save is off — use Save to keep your changes', false, {
        label: 'Turn on',
        run: () => {
          useEditorStore.getState().setAutoSaveEnabled(true);
          autoSaveNow.current();
        },
      });
    }
  }, [showToast]);

  // Closing the tab with unsaved work — or mid-save, which unloading would
  // cut short — gets the browser's "Leave site?" prompt.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (savesInFlight === 0 && !hasUnsavedChanges(useEditorStore.getState())) return;
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

  const onDrop = useCallback(
    (files: File[]) => {
      void importPhotos(files);
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
  });

  const handleExport = useCallback(async () => {
    const handle = canvasRef.current;
    if (!handle) return;
    const setBusy = useEditorStore.getState().setBusyMessage;
    // A 3× print-size render can take seconds, with the page frozen while it
    // draws; without this the button looked dead.
    setBusy('Preparing image…');
    let blob: Blob | null = null;
    let fileName = '';
    let scale: number;
    try {
      // Deselect so the transformer handles aren't baked into the export. Two
      // frames: one for that, one for the busy indicator to paint before the
      // render blocks the page.
      select(null);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const st = useEditorStore.getState();
      const name = exportFileName.trim() || fileNameForProject(st.projectName);
      const isJpg = exportFormat === 'jpeg';
      const mimeType = isJpg ? 'image/jpeg' : 'image/png';
      fileName = `${name}.${isJpg ? 'jpg' : 'png'}`;
      // Past the browser's canvas limit the render comes back blank rather than
      // failing, so stay under it and say so.
      scale = Math.min(exportScale, maxExportScale(st.canvas.width, st.canvas.height));
      const rendered = handle.exportCanvas({ mimeType, pixelRatioMultiplier: scale });
      blob = rendered ? await canvasToBlob(rendered, mimeType, 0.95) : null;
    } catch (err) {
      // E.g. a canvas the browser won't read back (SecurityError), or out of
      // memory. Uncaught, the click just did nothing.
      showToast(`Couldn't create the image: ${err instanceof Error ? err.message : 'unknown error'}`, true);
      return;
    } finally {
      setBusy(null);
    }
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

  // Keyboard shortcuts. None while the Projects dialog is open: Delete or
  // Ctrl+Z there acted on the canvas hidden behind it.
  useEffect(() => {
    if (projectsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      // Save and Export work from a text field too, as in any editor.
      if (mod && key === 's' && !e.shiftKey) {
        e.preventDefault();
        void handleSave();
        return;
      }
      if (mod && key === 'e' && e.shiftKey) {
        e.preventDefault();
        if (useEditorStore.getState().items.length) void handleExport();
        return;
      }
      const target = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      // Brackets: one layer up or down; with Shift (which types {}), to the top or bottom.
      const up = e.key === ']' || e.key === '}';
      const down = e.key === '[' || e.key === '{';
      const selId = useEditorStore.getState().selectedId;
      if (mod && (up || down) && selId) {
        e.preventDefault();
        const st = useEditorStore.getState();
        if (up) (e.shiftKey ? st.bringToFront : st.bringForward)(selId);
        else (e.shiftKey ? st.sendToBack : st.sendBackward)(selId);
        return;
      }
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
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        st.nudgeSelected(dx, dy);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectsOpen, undo, redo, removeSelected, select, duplicateSelected, handleSave, handleExport]);

  // Copy, cut and paste, through the browser's own clipboard events: Copy
  // needs no permission, and a paste can bring in what another app copied —
  // images (a screenshot) become photos, text becomes a text box. Text fields,
  // and text selected on the page, keep the browser's behaviour.
  useEffect(() => {
    if (projectsOpen) return;
    const inField = (t: EventTarget | null) =>
      t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    const onCopyOrCut = (e: ClipboardEvent) => {
      if (inField(e.target) || window.getSelection()?.toString()) return;
      const st = useEditorStore.getState();
      const clip = e.type === 'cut' ? st.cutSelected() : st.copySelected();
      if (!clip || !e.clipboardData) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', clip.text);
      e.clipboardData.setData(CLIPBOARD_TYPE, clip.token);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (inField(e.target) || !e.clipboardData) return;
      const data = e.clipboardData;
      e.preventDefault();
      const files = Array.from(data.files);
      if (files.length) void importPhotos(files);
      else useEditorStore.getState().pasteFromClipboard({ text: data.getData('text/plain'), token: data.getData(CLIPBOARD_TYPE) });
    };
    document.addEventListener('copy', onCopyOrCut);
    document.addEventListener('cut', onCopyOrCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopyOrCut);
      document.removeEventListener('cut', onCopyOrCut);
      document.removeEventListener('paste', onPaste);
    };
  }, [projectsOpen]);

  return (
    <div className={`app ${toolsOpen ? 'sheet-open' : ''} ${toolsOpen && sheetExpanded ? 'sheet-expanded' : ''}`}>
      <Toolbar
        onAddImages={open}
        onAddText={addText}
        onExport={() => void handleExport()}
        onSave={() => void handleSave()}
        onOpenProjects={() => setProjectsOpen(true)}
        onClearCanvas={handleClearCanvas}
        onToggleAutoSave={toggleAutoSave}
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
              const { ref, ...rootProps } = getRootProps();
              // Typed only by the props' index signature (any).
              const dropzoneRef = ref as React.Ref<HTMLElement> | undefined;
              return {
                ...rootProps,
                ref: (node: HTMLDivElement | null) => {
                  stageHostRef.current = node;
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
      {projectsOpen && <ProjectsModal onClose={() => setProjectsOpen(false)} />}
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
      {/* aria-live, not role="status": that role is the toast's. */}
      {busyMessage && (
        <div className="busy-indicator" aria-live="polite">
          <span className="busy-spinner" aria-hidden />
          {busyMessage}
        </div>
      )}
    </div>
  );
}
