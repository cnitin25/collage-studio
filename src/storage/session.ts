import { DEFAULT_PROJECT_NAME, needsSaving, useEditorStore } from '../store/useEditorStore';
import { uid } from '../utils/id';
import type { SerializedState } from './projects';
import { openProject, saveProject } from './projects';

// Reopening the last project on load. The id of the open project is kept in
// localStorage; projects themselves are in IndexedDB (projects.ts).

const LAST_PROJECT_KEY = 'collage-studio-last-project';
/** Set while a reopen is rendering; still set on the next load = it crashed. */
const RESTORE_PENDING_KEY = 'collage-studio-restore-pending';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked (private mode): nothing is reopened next time.
  }
}

/** Remember the open project, so the next visit can reopen it. */
export function rememberProject(id: string): void {
  write(LAST_PROJECT_KEY, id);
}

// Opening, importing or starting a project changes the id; a first save of a
// new project calls rememberProject itself (its id never changed).
useEditorStore.subscribe((s, prev) => {
  if (s.currentProjectId !== prev.currentProjectId) rememberProject(s.currentProjectId);
});

export type RestoreResult =
  | { kind: 'none' }
  | { kind: 'restored'; name: string }
  /** The last reopen crashed the editor, so it wasn't tried again. */
  | { kind: 'skipped' };

let crashed = false;
let restoring: Promise<RestoreResult> | null = null;

/** The error boundary caught a crash: a reopen in progress must not be confirmed. */
export function noteCrash(): void {
  crashed = true;
}

/**
 * Reopen the project that was open last time, unless the editor already has
 * work in it. Safe to call more than once (StrictMode runs effects twice).
 */
export function restoreLastProject(): Promise<RestoreResult> {
  restoring ??= restore();
  return restoring;
}

/** The reopened project has rendered: it isn't one that crashes the editor. */
export function confirmRestore(): void {
  if (!crashed) write(RESTORE_PENDING_KEY, null);
}

/**
 * After a crash: store any unsaved work as a new project. The editor's state
 * lives outside React, so it survives a render crash intact. Never written
 * over the original — the crash may have come from this very state, and the
 * last good save must stay openable. Resolves to its name, or null when there
 * was nothing unsaved.
 */
export async function saveRecoveryCopy(): Promise<string | null> {
  const st = useEditorStore.getState();
  if (!needsSaving(st)) return null;
  const name = `${st.projectName.trim() || DEFAULT_PROJECT_NAME} (recovered)`;
  await saveProject({
    id: uid('proj'),
    name,
    state: { canvas: st.canvas, items: st.items, spacing: st.spacing, lastLayout: st.lastLayout },
  });
  return name;
}

function pristine(): boolean {
  const s = useEditorStore.getState();
  return s.items.length === 0 && s.past.length === 0 && s.future.length === 0;
}

function releaseUrls(state: SerializedState): void {
  for (const it of state.items) if (it.type === 'image' && it.src) URL.revokeObjectURL(it.src);
  if (state.canvas.backgroundImageSrc) URL.revokeObjectURL(state.canvas.backgroundImageSrc);
}

async function restore(): Promise<RestoreResult> {
  // A reopen that never confirmed means that project crashed the editor while
  // rendering. Reopening it on every load would be a crash loop, so leave it
  // in Projects for the user to open (or delete) instead.
  if (read(RESTORE_PENDING_KEY)) {
    write(RESTORE_PENDING_KEY, null);
    write(LAST_PROJECT_KEY, null);
    return { kind: 'skipped' };
  }
  const id = read(LAST_PROJECT_KEY);
  if (!id || !pristine()) return { kind: 'none' };
  const res = await openProject(id).catch(() => null);
  if (!res) return { kind: 'none' };
  // The user started working while it loaded: theirs wins.
  if (!pristine()) {
    releaseUrls(res.state);
    return { kind: 'none' };
  }
  write(RESTORE_PENDING_KEY, id);
  useEditorStore.getState().loadSerializedState(res.state, res.meta.id, res.meta.name, res.meta.updatedAt);
  return { kind: 'restored', name: res.meta.name };
}
