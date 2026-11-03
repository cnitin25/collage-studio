import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import type {
  CanvasConfig,
  CollageItem,
  EnhancePresetId,
  ImageItem,
  ImageStyle,
  StickerItem,
  TextItem,
} from '../types';
import type { LoadedImage } from '../utils/loadImage';
import type { ImageLoadFailure } from '../utils/loadImage';
import type { LayoutSpec, SpacingOptions } from '../layout/types';
import { computeLayout } from '../layout/strategies';
import { coverCrop, refitCrop } from '../utils/cover';
import { itemSize } from '../utils/itemBox';
import { scaledBy } from '../utils/scaleItem';
import { FRAMES, type FrameId } from '../style/frames';
import {
  ENHANCE_PRESETS,
  DEFAULT_PRESET_STRENGTH,
  NEUTRAL_FILTERS,
  keptEffects,
  scaleEnhanceFilters,
} from '../style/enhancePresets';
import type { SerializedState } from '../storage/projects';
import { uid } from '../utils/id';
import { shuffle } from '../utils/random';

/** 'new-version': one is installed and waiting. 'out-of-date': code this page
 *  loads on demand is gone from the server, as after a release. */
export type AppUpdate = 'new-version' | 'out-of-date';

interface Snapshot {
  items: CollageItem[];
  canvas: CanvasConfig;
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
}

/** What Copy or Cut took, for Paste. Kept across projects, like a clipboard. */
export interface ItemClipboard {
  /** In stacking order. */
  items: CollageItem[];
  /** What Copy put on the system clipboard as text: one text item's text, else ''. */
  text: string;
  /** Put there too, under the app's own type, to know this copy when it's pasted. */
  token: string;
  /** How far from the original the next paste lands (each one steps further). */
  offset: number;
}

/** The state as of the last save/load, by reference (see hasUnsavedChanges). */
export interface SavedRef {
  items: CollageItem[];
  canvas: CanvasConfig;
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
  projectName: string;
}

interface EditorState {
  canvas: CanvasConfig;
  items: CollageItem[];
  /** Everything selected, in the order it was selected. */
  selectedIds: string[];
  /** The one selected item — null when nothing, or several things, are
   * selected. Panels for a single item read this, so they step aside for a
   * multi-selection. Always set through setSelection. */
  selectedId: string | null;
  /** Phones: taps add to (or take from) the selection instead of replacing it. */
  multiSelectMode: boolean;
  croppingId: string | null;
  cropLocked: boolean;
  editingId: string | null; // text being edited inline
  requestedPanel: string | null; // panel title to auto-expand (e.g. after Add text)
  /** Optional spot inside requestedPanel to scroll to: a [data-panel-anchor] value. */
  requestedAnchor: string | null;
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
  exportScale: number;
  exportFileName: string;
  exportFormat: 'png' | 'jpeg';
  styleClipboard: ImageStyle | null;
  itemClipboard: ItemClipboard | null;
  currentProjectId: string;
  projectName: string;
  layoutLocked: boolean;
  snapEnabled: boolean;
  swapModeEnabled: boolean;
  lockAspectEnabled: boolean;
  autoSaveEnabled: boolean;
  importFailures: ImageLoadFailure[];
  savedRef: SavedRef;
  /** When the open project was last stored (ms), or null if it never was. */
  lastSavedAt: number | null;
  /** A slow operation in progress ("Adding photos… 2 of 5"), shown by App. */
  busyMessage: string | null;
  /** A newer version is waiting, or this page's code is out of date (utils/appUpdate). */
  appUpdate: AppUpdate | null;
  // view state (not part of undo history)
  viewScale: number;
  viewX: number;
  viewY: number;
  past: Snapshot[];
  future: Snapshot[];
  historyLabels: string[]; // parallel to past[]
  futureLabels: string[]; // parallel to future[]
  _pending: { snap: Snapshot; label: string } | null;

  canUndo: () => boolean;
  canRedo: () => boolean;

  addImages: (images: LoadedImage[]) => void;
  addText: () => void;
  addSticker: (emoji: string) => void;
  updateItem: (id: string, patch: Partial<CollageItem>) => void;
  removeSelected: () => void;
  duplicateSelected: () => void;
  /** Copy the selected item for Paste. Returns what to put on the system clipboard, or null with nothing selected. */
  copySelected: () => ItemClipboard | null;
  /** Copy, then delete, the selected item: one undo step. Returns as copySelected does. */
  cutSelected: () => ItemClipboard | null;
  /**
   * Paste what the system clipboard holds: the app's token and its text.
   * While that is what Copy put there, the copied item; text from another app
   * becomes a text box. Returns whether anything was pasted.
   */
  pasteFromClipboard: (from: { text: string; token: string }) => boolean;
  swapItems: (aId: string, bId: string) => void;
  replaceImage: (id: string, image: LoadedImage) => void;
  setBackground: (patch: Partial<CanvasConfig>) => void;
  setBackgroundLive: (patch: Partial<CanvasConfig>) => void;
  copyStyle: () => void;
  pasteStyle: () => void;
  applyStyleToAllPhotos: () => void;
  setCanvasSize: (width: number, height: number) => void;
  clearAll: () => void;
  applyLayout: (spec: LayoutSpec) => void;
  shufflePhotos: () => void;
  applyFrame: (frame: FrameId) => void;
  applyEnhancePreset: (preset: EnhancePresetId) => void;
  setEnhanceStrengthLive: (id: string, strengthPct: number) => void;
  resetEnhancements: (id: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  bringForward: (id: string) => void;
  sendBackward: (id: string) => void;

  beginChange: (label?: string) => void;
  updateItemLive: (id: string, patch: Partial<CollageItem>) => void;
  commitChange: () => void;

  startCrop: (id: string) => void;
  endCrop: () => void;
  setCropLocked: (v: boolean) => void;
  resetCrop: (id: string) => void;
  setCropZoom: (id: string, zoom: number) => void;

  startEditingText: (id: string) => void;
  stopEditingText: () => void;
  clearRequestedPanel: () => void;
  requestPanel: (title: string, anchor?: string) => void;

  setSpacingLive: (patch: Partial<SpacingOptions>) => void;
  /** Select an item — with its whole group — or nothing. */
  select: (id: string | null) => void;
  /** Add an item (and its group) to the selection, or take it out. */
  toggleSelected: (id: string) => void;
  /** Select these items and their groups; with `add`, as well as what is selected. */
  selectMany: (ids: string[], add?: boolean) => void;
  selectAll: () => void;
  setMultiSelectMode: (on: boolean) => void;
  /** One group of everything selected (two or more items). */
  groupSelected: () => void;
  ungroupSelected: () => void;
  /** Even gaps between the selected items (three or more) along an axis. */
  distributeSelection: (axis: 'x' | 'y') => void;
  /** Patch several items as one undo step: a multi-item move or resize. */
  updateItems: (patches: { id: string; patch: Partial<CollageItem> }[], label: string) => void;
  setExportScale: (scale: number) => void;
  setExportFileName: (name: string) => void;
  setExportFormat: (format: 'png' | 'jpeg') => void;
  setProjectName: (name: string) => void;
  flipItem: (id: string, axis: 'x' | 'y') => void;
  rotateItem: (id: string, deltaDeg: number) => void;
  /** Move the selection by a few px (arrow keys); a run of nudges is one undo step. */
  nudgeSelected: (dx: number, dy: number) => void;
  alignItems: (anchor: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void;
  setView: (scale: number, x: number, y: number) => void;
  resetView: () => void;
  setLayoutLocked: (v: boolean) => void;
  setSnapEnabled: (v: boolean) => void;
  setSwapModeEnabled: (v: boolean) => void;
  setLockAspectEnabled: (v: boolean) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setImportFailures: (failures: ImageLoadFailure[]) => void;
  setBusyMessage: (message: string | null) => void;
  setAppUpdate: (update: AppUpdate | null) => void;
  loadSerializedState: (state: SerializedState, id: string, name: string, savedAt?: number) => void;
  resetProject: () => void;
  /** Record a completed save of `ref` (the state as it was when the save began). */
  markSaved: (ref: SavedRef) => void;
  cancelChange: () => void;

  undo: () => void;
  redo: () => void;
}

const DEFAULT_CANVAS: CanvasConfig = {
  width: 1080,
  height: 1080,
  backgroundType: 'color',
  backgroundColor: '#f3f1ec',
  gradientFrom: '#ffd9c0',
  gradientTo: '#ff7a59',
  gradientAngle: 45,
  backgroundImageSrc: undefined,
  backgroundAssetId: undefined,
  backgroundBlur: 24,
  patternKind: 'dots',
  patternColor: '#d8d2c6',
  patternBg: '#f3f1ec',
  patternScale: 28,
  frameBorderWidth: 0,
  frameBorderColor: '#ffffff',
  frameCornerRadius: 0,
};

const DEFAULT_SPACING: SpacingOptions = { margin: 24, gutter: 12, padding: 0 };

export const DEFAULT_PROJECT_NAME = 'Collage';

/** Export file name derived from a project name — characters Windows/macOS
 *  refuse in a file name become '-', and a blank name falls back to the default. */
export function fileNameForProject(projectName: string): string {
  return projectName.replace(/[\\/:*?"<>|]+/g, '-').trim() || DEFAULT_PROJECT_NAME;
}

/** The export file name follows the project name until the user types their
 *  own. "Default" is read off the value itself (blank, or exactly what the
 *  current project name would produce) rather than a separate flag, so typing
 *  the derived name back — or clearing the field — re-links it. */
function renameProjectDraft(s: Draft<EditorState>, name: string): void {
  const fileNameIsDefault =
    s.exportFileName.trim() === '' || s.exportFileName === fileNameForProject(s.projectName);
  s.projectName = name;
  if (fileNameIsDefault) s.exportFileName = fileNameForProject(name);
}

const HISTORY_LIMIT = 60;

export function savedRefOf(s: SavedRef): SavedRef {
  return { items: s.items, canvas: s.canvas, spacing: s.spacing, lastLayout: s.lastLayout, projectName: s.projectName };
}

/**
 * True when the editor holds work that isn't in the last save/load. Compares
 * by reference: immer hands back a new object for anything that changed and
 * the same object for anything that didn't, so this needs no deep compare.
 * Undo and redo restore the very objects a step held, so undoing back to the
 * saved state reads as saved; changing a value back by hand still reads as
 * unsaved, which errs on the side of asking. An empty canvas is never worth a
 * prompt.
 */
export function hasUnsavedChanges(s: SavedRef & { savedRef: SavedRef }): boolean {
  if (s.items.length === 0) return false;
  const r = s.savedRef;
  return (
    s.items !== r.items ||
    s.canvas !== r.canvas ||
    s.spacing !== r.spacing ||
    s.lastLayout !== r.lastLayout ||
    s.projectName !== r.projectName
  );
}

/**
 * Auto-save's test: unsaved work, and also a saved collage that has since been
 * emptied. hasUnsavedChanges ignores an empty canvas because it's never worth a
 * prompt, but not storing one would bring a cleared collage back on the next
 * visit.
 */
export function needsSaving(s: SavedRef & { savedRef: SavedRef }): boolean {
  return hasUnsavedChanges(s) || (s.items.length === 0 && s.savedRef.items.length > 0);
}

const AUTO_SAVE_KEY = 'collage-studio-autosave';

/** Auto-save is on unless the user switched it off — a choice kept across visits. */
function storedAutoSave(): boolean {
  try {
    return localStorage.getItem(AUTO_SAVE_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * After undo/redo, keep the selection (and crop mode) on any item that still
 * exists. Clearing it unconditionally unmounted every selection-dependent
 * panel: undoing an Enhance preset collapsed Enhance & Adjust out from under
 * the user and left the inspector scrolled down to History.
 */
function keepLiveSelection(s: Draft<EditorState>) {
  const exists = (id: string | null) => !!id && s.items.some((i) => i.id === id);
  setSelection(s, s.selectedIds.filter(exists));
  if (!exists(s.croppingId) || s.croppingId !== s.selectedId) s.croppingId = null;
}

/** The selection, kept in step with `selectedId` (the one item, or null). */
function setSelection(s: Draft<EditorState>, ids: string[]): void {
  s.selectedIds = ids;
  s.selectedId = ids.length === 1 ? ids[0] : null;
}

/** An item and everything grouped with it, in stacking order. */
function withGroup(items: readonly CollageItem[], id: string): string[] {
  const groupId = items.find((i) => i.id === id)?.groupId;
  return groupId ? items.filter((i) => i.groupId === groupId).map((i) => i.id) : [id];
}

/** The selected items, in stacking order. */
function selectedItems(s: Pick<EditorState, 'items' | 'selectedIds'>): CollageItem[] {
  const ids = new Set(s.selectedIds);
  return s.items.filter((i) => ids.has(i.id));
}

/** Text for the system clipboard: a lone text item's own text, else nothing. */
function clipboardText(items: readonly CollageItem[]): string {
  return items.length === 1 && items[0].type === 'text' ? items[0].text : '';
}

/**
 * Copies of items, `offset` px down and right, with new ids — and new group
 * ids, so copies of a group make a group of their own rather than joining it.
 */
function copiesOf(items: readonly CollageItem[], offset: number): CollageItem[] {
  const groups = new Map<string, string>();
  return items.map((it) => {
    const copy = structuredClone<CollageItem>(it);
    copy.id = uid(it.type === 'image' ? 'img' : it.type === 'text' ? 'txt' : 'stk');
    copy.x += offset;
    copy.y += offset;
    if (it.groupId) {
      if (!groups.has(it.groupId)) groups.set(it.groupId, uid('grp'));
      copy.groupId = groups.get(it.groupId);
    }
    return copy;
  });
}

/** The axis-aligned box an item covers on the canvas, rotation included. */
function boundsOf(it: CollageItem): { left: number; top: number; right: number; bottom: number } {
  // Items rotate around their top-left corner (x, y) — Konva's default pivot
  // with no offset — so the box comes from the rotated corners.
  const { width: w, height: h } = itemSize(it);
  const rad = (it.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xs = [0, w * cos, -h * sin, w * cos - h * sin];
  const ys = [0, w * sin, h * cos, w * sin + h * cos];
  return { left: it.x + Math.min(...xs), top: it.y + Math.min(...ys), right: it.x + Math.max(...xs), bottom: it.y + Math.max(...ys) };
}

const INITIAL_ITEMS: CollageItem[] = [];

/** Nudges this close together (ms) on the same item merge into one undo step. */
const NUDGE_MERGE_MS = 1000;
/** The last nudge's item, time, and the history snapshot it pushed. */
let lastNudge: { id: string; at: number; snap: Snapshot } | null = null;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A history step: the state's own objects, not copies. immer never changes a
 * committed object — every edit produces new ones and leaves the old intact —
 * so keeping a reference is as safe as a copy and costs nothing: editing one
 * photo no longer copies every photo into history. It also means undoing to
 * the saved state restores the very objects that were saved, which is what
 * hasUnsavedChanges compares. Take it from get(), never from a draft.
 */
function snapshot(state: Pick<EditorState, 'items' | 'canvas' | 'spacing' | 'lastLayout'>): Snapshot {
  return { items: state.items, canvas: state.canvas, spacing: state.spacing, lastLayout: state.lastLayout };
}

/** Record `prev` as an undo step: oldest step out past the limit, redo branch gone. */
function pushStep(s: Draft<EditorState>, prev: Snapshot, label: string): void {
  if (s.past.length >= HISTORY_LIMIT) {
    s.past.shift();
    s.historyLabels.shift();
  }
  s.past.push(prev);
  s.historyLabels.push(label);
  s.future = [];
  s.futureLabels = [];
}

/** Photos that opened without their image: nothing was stored for them (openProject). */
function missingPhotos(items: CollageItem[], project: string): ImageLoadFailure[] {
  return items
    .filter((it) => it.type === 'image')
    .flatMap((photo, i) =>
      photo.src
        ? []
        : [
            {
              name: `Photo ${i + 1}`,
              reason: "Its image isn't in this browser's storage any more. It's marked on the canvas: select it and use Replace.",
              source: project,
            },
          ],
    );
}

/** How far a duplicate or a paste lands from the original, in canvas px. */
const PASTE_STEP = 28;

/** A text box with the editor's default look, centred across the canvas. */
function newTextItem(canvas: CanvasConfig, text: string): TextItem {
  const w = Math.min(680, canvas.width * 0.6);
  return {
    id: uid('txt'),
    type: 'text',
    x: Math.round((canvas.width - w) / 2),
    y: Math.round(canvas.height * 0.42),
    width: w,
    height: 90,
    rotation: 0,
    text,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontSize: 64,
    fontStyle: 'normal',
    fill: '#15171d',
    align: 'center',
  };
}

function placeImage(img: LoadedImage, canvas: CanvasConfig, index: number): ImageItem {
  const maxW = canvas.width * 0.55;
  const maxH = canvas.height * 0.55;
  const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  const width = Math.round(img.naturalWidth * ratio);
  const height = Math.round(img.naturalHeight * ratio);
  const offset = (index % 6) * 32;
  return {
    id: uid('img'),
    type: 'image',
    src: img.src,
    assetId: uid('asset'),
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
    x: Math.round((canvas.width - width) / 2) + offset,
    y: Math.round((canvas.height - height) / 2) + offset,
    width,
    height,
    rotation: 0,
  };
}

/** Layouts arrange only the PHOTOS; text and stickers float freely on top. */
function layoutToDraft(s: Draft<EditorState>, spec: LayoutSpec): void {
  // Plain array order — stable and correct because swapItems keeps array
  // position in sync with visual position (see swapItems). An earlier version
  // inferred order from current pixel position instead; that was unstable for
  // Mosaic, where a tall spanning cell's center sits ambiguously between rows,
  // so small margin/spacing changes could reshuffle photos unpredictably.
  const imageItems = s.items.filter((it): it is Draft<ImageItem> => it.type === 'image');
  if (imageItems.length === 0) return;
  const aspects = imageItems.map((it) => it.naturalWidth / it.naturalHeight);
  const rects = computeLayout(aspects, spec, {
    canvasWidth: s.canvas.width,
    canvasHeight: s.canvas.height,
    margin: s.spacing.margin,
    gutter: s.spacing.gutter,
    padding: s.spacing.padding,
  });
  const pad = s.spacing.padding;
  imageItems.forEach((item, i) => {
    const r = rects[i];
    if (!r) return;
    const innerW = Math.max(1, r.width - 2 * pad);
    const innerH = Math.max(1, r.height - 2 * pad);
    // Refit before overwriting width/height — it needs the old box. Spacing
    // sliders re-run this on every tick, so a plain cover-crop here reset
    // every photo's crop the moment any spacing value moved.
    item.crop = refitCrop(item.naturalWidth, item.naturalHeight, item.crop, item.width, item.height, innerW, innerH);
    item.x = r.x + pad;
    item.y = r.y + pad;
    item.width = innerW;
    item.height = innerH;
    item.rotation = 0;
  });
  s.lastLayout = spec;
}

export const useEditorStore = create<EditorState>()(
  immer((set, get) => ({
    canvas: DEFAULT_CANVAS,
    items: INITIAL_ITEMS,
    selectedIds: [],
    selectedId: null,
    multiSelectMode: false,
    croppingId: null,
    cropLocked: false,
    editingId: null,
    requestedPanel: null,
    requestedAnchor: null,
    spacing: DEFAULT_SPACING,
    lastLayout: null,
    exportScale: 1,
    exportFileName: fileNameForProject(DEFAULT_PROJECT_NAME),
    exportFormat: 'png',
    styleClipboard: null,
    itemClipboard: null,
    currentProjectId: uid('proj'),
    projectName: DEFAULT_PROJECT_NAME,
    layoutLocked: false,
    snapEnabled: true,
    swapModeEnabled: true,
    lockAspectEnabled: false,
    autoSaveEnabled: storedAutoSave(),
    importFailures: [],
    savedRef: {
      items: INITIAL_ITEMS,
      canvas: DEFAULT_CANVAS,
      spacing: DEFAULT_SPACING,
      lastLayout: null,
      projectName: DEFAULT_PROJECT_NAME,
    },
    lastSavedAt: null,
    busyMessage: null,
    appUpdate: null,
    viewScale: 1,
    viewX: 0,
    viewY: 0,
    past: [],
    future: [],
    historyLabels: [],
    futureLabels: [],
    _pending: null,

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    addImages: (images) => {
      const label = 'Add photos';
      if (images.length === 0) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const base = s.items.length;
        images.forEach((img, i) => s.items.push(placeImage(img, s.canvas, base + i)));
        setSelection(s, s.items.length ? [s.items[s.items.length - 1].id] : []);
      });
    },

    addText: () => {
      const label = "Add text";
      const prev = snapshot(get());
      const item = newTextItem(get().canvas, 'Your text');
      set((s) => {
        pushStep(s, prev, label);
        s.items.push(item);
        setSelection(s, [item.id]);
        s.editingId = item.id;
        s.requestedPanel = 'Insert';
      });
    },

    addSticker: (emoji) => {
      const label = "Add sticker";
      const prev = snapshot(get());
      const id = uid('stk');
      set((s) => {
        pushStep(s, prev, label);
        const size = Math.round(Math.min(s.canvas.width, s.canvas.height) * 0.18);
        const item: StickerItem = {
          id,
          type: 'sticker',
          emoji,
          fontSize: size,
          x: Math.round((s.canvas.width - size) / 2),
          y: Math.round((s.canvas.height - size) / 2),
          width: size,
          height: size,
          rotation: 0,
        };
        s.items.push(item);
        setSelection(s, [id]);
      });
    },

    updateItem: (id, patch) => {
      const label = 'Edit item';
      const current = get().items.find((it) => it.id === id);
      if (!current) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const item = s.items.find((it) => it.id === id);
        if (!item) return;
        const p = patch as Record<string, unknown>;
        // A genuine manual resize (from the Transformer) is a deliberate override —
        // once it happens, stop letting spacing/margin/padding changes silently
        // resize this photo back to the algorithm's computed size. A pure rotate
        // or move also passes width/height in its patch, so this only fires when
        // the VALUE actually changed, not merely when the key is present.
        if (item.type === 'image' && s.lastLayout) {
          const EPS = 0.5;
          const resized =
            (typeof p.width === 'number' && Math.abs(p.width - item.width) > EPS) ||
            (typeof p.height === 'number' && Math.abs(p.height - item.height) > EPS);
          if (resized) s.lastLayout = null;
        }
        Object.assign(item, p);
      });
    },

    removeSelected: () => {
      const ids = new Set(get().selectedIds);
      if (ids.size === 0) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, 'Delete');
        s.items = s.items.filter((it) => !ids.has(it.id));
        setSelection(s, []);
        s.croppingId = null;
        s.editingId = null;
      });
    },

    duplicateSelected: () => {
      const sel = selectedItems(get());
      if (sel.length === 0) return;
      const copies = copiesOf(sel, PASTE_STEP);
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, 'Duplicate');
        s.items.push(...copies);
        setSelection(s, copies.map((c) => c.id));
        s.croppingId = null;
      });
    },

    copySelected: () => {
      const sel = selectedItems(get());
      if (sel.length === 0) return null;
      // Committed state is frozen, so the items themselves can be kept, not copies.
      const clip = { items: sel, text: clipboardText(sel), token: uid('clip'), offset: PASTE_STEP };
      set({ itemClipboard: clip });
      return clip;
    },

    cutSelected: () => {
      const sel = selectedItems(get());
      if (sel.length === 0) return null;
      // Pasted after a cut, they go back where they were.
      const clip = { items: sel, text: clipboardText(sel), token: uid('clip'), offset: 0 };
      const ids = new Set(sel.map((i) => i.id));
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, 'Cut');
        s.itemClipboard = clip;
        s.items = s.items.filter((it) => !ids.has(it.id));
        setSelection(s, []);
        s.croppingId = null;
        s.editingId = null;
      });
      return clip;
    },

    pasteFromClipboard: ({ text, token }) => {
      const clip = get().itemClipboard;
      // The token says whose copy it is. A browser that drops the app's own
      // type leaves only the text: still what Copy put there means nothing
      // else was copied since.
      const fromCopy = clip !== null && (token ? token === clip.token : text === '' || text === clip.text);
      let pasted: CollageItem[];
      if (fromCopy) pasted = copiesOf(clip.items, clip.offset);
      else if (text.trim()) pasted = [newTextItem(get().canvas, text)];
      else return false;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, 'Paste');
        s.items.push(...pasted);
        setSelection(s, pasted.map((i) => i.id));
        s.croppingId = null;
        if (fromCopy && s.itemClipboard) s.itemClipboard.offset += PASTE_STEP;
      });
      return true;
    },

    swapItems: (aId, bId) => {
      const label = 'Swap photos';
      if (aId === bId) return;
      const items = get().items;
      const idxA = items.findIndex((i) => i.id === aId);
      const idxB = items.findIndex((i) => i.id === bId);
      if (idxA === -1 || idxB === -1) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const a = s.items[idxA];
        const b = s.items[idxB];
        const ga = { x: a.x, y: a.y, width: a.width, height: a.height, rotation: a.rotation };
        const gb = { x: b.x, y: b.y, width: b.width, height: b.height, rotation: b.rotation };
        Object.assign(a, gb);
        Object.assign(b, ga);
        // Each photo keeps its own crop zoom/centre, refitted to its new cell.
        if (a.type === 'image') a.crop = refitCrop(a.naturalWidth, a.naturalHeight, a.crop, ga.width, ga.height, a.width, a.height);
        if (b.type === 'image') b.crop = refitCrop(b.naturalWidth, b.naturalHeight, b.crop, gb.width, gb.height, b.width, b.height);
        // Also swap their ARRAY positions. layoutToDraft assigns cells in array
        // order, so without this, re-running it (from any spacing change) would
        // reassign geometry by the OLD order and silently undo the swap.
        const tmp = s.items[idxA];
        s.items[idxA] = s.items[idxB];
        s.items[idxB] = tmp;
      });
    },

    replaceImage: (id, image) => {
      const label = 'Replace image';
      const current = get().items.find((i) => i.id === id);
      if (!current || current.type !== 'image') return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const it = s.items.find((i) => i.id === id);
        if (!it || it.type !== 'image') return;
        it.src = image.src;
        it.naturalWidth = image.naturalWidth;
        it.naturalHeight = image.naturalHeight;
        it.assetId = uid('asset');
        it.crop = coverCrop(image.naturalWidth, image.naturalHeight, it.width, it.height);
      });
    },

    setBackground: (patch) => {
      const label = "Background";
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        Object.assign(s.canvas, patch);
      });
    },

    setBackgroundLive: (patch) =>
      set((s) => {
        Object.assign(s.canvas, patch);
      }),

    copyStyle: () => {
      const sel = get().items.find((i) => i.id === get().selectedId);
      if (!sel || sel.type !== 'image') return;
      set((s) => {
        s.styleClipboard = {
          borderWidth: sel.borderWidth,
          borderColor: sel.borderColor,
          borderStyle: sel.borderStyle,
          borderGlyph: sel.borderGlyph,
          cornerRadius: sel.cornerRadius,
          shadow: sel.shadow,
          frame: sel.frame,
          filters: sel.filters,
        };
      });
    },

    pasteStyle: () => {
      const label = 'Paste style';
      const { styleClipboard, selectedId } = get();
      if (!styleClipboard || !selectedId) return;
      const sel = get().items.find((i) => i.id === selectedId);
      if (!sel || sel.type !== 'image') return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const it = s.items.find((i) => i.id === selectedId);
        if (it && it.type === 'image') Object.assign(it, structuredClone(styleClipboard));
      });
    },

    applyStyleToAllPhotos: () => {
      const label = 'Apply style to all';
      const selId = get().selectedId;
      const sel = get().items.find((i) => i.id === selId);
      if (!sel || sel.type !== 'image') return;
      const style: ImageStyle = {
        borderWidth: sel.borderWidth,
        borderColor: sel.borderColor,
        borderStyle: sel.borderStyle,
        borderGlyph: sel.borderGlyph,
        cornerRadius: sel.cornerRadius,
        shadow: sel.shadow,
        frame: sel.frame,
        filters: sel.filters,
      };
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        s.items.forEach((it) => {
          if (it.type === 'image' && it.id !== selId) Object.assign(it, structuredClone(style));
        });
      });
    },

    setCanvasSize: (width, height) => {
      const label = 'Canvas size';
      const { width: w, height: h } = get().canvas;
      if (w === width && h === height) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        // A layout places the photos again. Everything else keeps its place in
        // the canvas: its centre moves with it, and it scales by the smaller
        // ratio, so nothing stretches and nothing that fitted falls outside.
        const k = Math.min(width / w, height / h);
        for (const it of s.items) {
          if (it.type === 'image' && s.lastLayout) continue;
          const size = itemSize(it);
          // Items turn about their top-left corner, so find the drawn centre.
          const r = (it.rotation * Math.PI) / 180;
          const [cos, sin] = [Math.cos(r), Math.sin(r)];
          const cx = (it.x + (size.width / 2) * cos - (size.height / 2) * sin) * (width / w);
          const cy = (it.y + (size.width / 2) * sin + (size.height / 2) * cos) * (height / h);
          Object.assign(it, scaledBy(it, k));
          const [hw, hh] = [(size.width * k) / 2, (size.height * k) / 2];
          it.x = cx - hw * cos + hh * sin;
          it.y = cy - hw * sin - hh * cos;
        }
        s.canvas.width = width;
        s.canvas.height = height;
        if (s.lastLayout) layoutToDraft(s, s.lastLayout);
      });
    },

    clearAll: () => {
      const label = 'Clear all';
      if (get().items.length === 0) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        s.items = [];
        setSelection(s, []);
        s.croppingId = null;
        s.editingId = null;
        s.lastLayout = null;
      });
    },

    applyLayout: (spec) => {
      const label = 'Layout';
      if (get().items.some((i) => i.type === 'image') === false) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        layoutToDraft(s, spec);
      });
    },

    shufflePhotos: () => {
      const imageIndices: number[] = [];
      get().items.forEach((it, idx) => {
        if (it.type === 'image') imageIndices.push(idx);
      });
      if (imageIndices.length < 2) return;

      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, 'Shuffle photos');

        // Permute only the image items' array positions; text/sticker items
        // keep their slot.
        const shuffled = shuffle(imageIndices.map((idx) => s.items[idx]));
        imageIndices.forEach((idx, k) => {
          s.items[idx] = shuffled[k];
        });

        // Reflow immediately if a layout is active, so the shuffle is visible
        // on canvas right away instead of requiring a manual layout re-click.
        if (s.lastLayout) layoutToDraft(s, s.lastLayout);
      });
    },

    applyFrame: (frame) => {
      const label = 'Frame';
      const selId = get().selectedId;
      if (!selId) return;
      const preset = FRAMES.find((f) => f.id === frame);
      if (!preset) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const it = s.items.find((i) => i.id === selId);
        if (!it || it.type !== 'image') return;
        // A frame is a solid border: left on 'glyph', Matte drew a ring of ✕s.
        it.borderStyle = 'solid';
        it.borderWidth = preset.style.borderWidth;
        it.borderColor = preset.style.borderColor;
        it.cornerRadius = preset.style.cornerRadius;
        it.shadow = preset.style.shadow;
        it.frame = frame;
      });
    },

    applyEnhancePreset: (preset) => {
      const selId = get().selectedId;
      if (!selId) return;
      const current = get().items.find((i) => i.id === selId);
      if (!current || current.type !== 'image') return;
      const recipe = ENHANCE_PRESETS.find((p) => p.id === preset);
      if (!recipe) return;
      const alreadyActive = current.filters?.presetId === preset;
      const label = alreadyActive ? 'Remove enhance' : 'Enhance';
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const it = s.items.find((i) => i.id === selId);
        if (!it || it.type !== 'image') return;
        it.filters = alreadyActive
          ? { ...NEUTRAL_FILTERS, ...keptEffects(it.filters) }
          : {
              ...scaleEnhanceFilters(recipe.filters, DEFAULT_PRESET_STRENGTH),
              ...keptEffects(it.filters),
              presetId: preset,
              presetStrength: DEFAULT_PRESET_STRENGTH,
            };
      });
    },

    setEnhanceStrengthLive: (id, strengthPct) =>
      set((s) => {
        const it = s.items.find((i) => i.id === id);
        if (!it || it.type !== 'image' || !it.filters?.presetId) return;
        const recipe = ENHANCE_PRESETS.find((p) => p.id === it.filters!.presetId);
        if (!recipe) return;
        it.filters = {
          ...scaleEnhanceFilters(recipe.filters, strengthPct),
          ...keptEffects(it.filters),
          presetId: it.filters.presetId,
          presetStrength: strengthPct,
        };
      }),

    resetEnhancements: (id) => {
      const label = 'Reset enhancements';
      const item = get().items.find((i) => i.id === id);
      if (!item || item.type !== 'image') return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const it = s.items.find((i) => i.id === id);
        if (it && it.type === 'image') it.filters = { ...NEUTRAL_FILTERS };
      });
    },

    bringToFront: (id) => {
      const label = 'Bring to front';
      const items = get().items;
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0 || idx === items.length - 1) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const [m] = s.items.splice(idx, 1);
        s.items.push(m);
      });
    },

    sendToBack: (id) => {
      const label = 'Send to back';
      const items = get().items;
      const idx = items.findIndex((it) => it.id === id);
      if (idx <= 0) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const [m] = s.items.splice(idx, 1);
        s.items.unshift(m);
      });
    },

    bringForward: (id) => {
      const label = 'Forward';
      const items = get().items;
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0 || idx === items.length - 1) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const [m] = s.items.splice(idx, 1);
        s.items.splice(idx + 1, 0, m);
      });
    },

    sendBackward: (id) => {
      const label = 'Backward';
      const items = get().items;
      const idx = items.findIndex((it) => it.id === id);
      if (idx <= 0) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const [m] = s.items.splice(idx, 1);
        s.items.splice(idx - 1, 0, m);
      });
    },

    beginChange: (label = 'Edit') => {
      if (get()._pending) return;
      const snap = snapshot(get());
      set((s) => {
        s._pending = { snap, label };
      });
    },

    updateItemLive: (id, patch) =>
      set((s) => {
        const item = s.items.find((it) => it.id === id);
        if (item) Object.assign(item, patch as Record<string, unknown>);
      }),

    commitChange: () => {
      const pending = get()._pending;
      if (!pending) return;
      set((s) => {
        pushStep(s, pending.snap, pending.label);
        s._pending = null;
      });
    },

    startCrop: (id) =>
      set((s) => {
        setSelection(s, [id]);
        s.croppingId = id;
        const it = s.items.find((i) => i.id === id);
        if (it && it.type === 'image' && !it.crop) {
          it.crop = coverCrop(it.naturalWidth, it.naturalHeight, it.width, it.height);
        }
      }),

    endCrop: () =>
      set((s) => {
        s.croppingId = null;
      }),

    setCropLocked: (v) =>
      set((s) => {
        s.cropLocked = v;
        if (v) {
          const it = s.items.find((i) => i.id === s.selectedId);
          if (it && it.type === 'image') {
            s.croppingId = it.id;
            if (!it.crop) it.crop = coverCrop(it.naturalWidth, it.naturalHeight, it.width, it.height);
          }
        } else {
          s.croppingId = null;
        }
      }),

    resetCrop: (id) => {
      const label = 'Reset crop';
      const it = get().items.find((i) => i.id === id);
      if (!it || it.type !== 'image') return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const item = s.items.find((i) => i.id === id);
        if (item && item.type === 'image') {
          item.crop = coverCrop(item.naturalWidth, item.naturalHeight, item.width, item.height);
        }
      });
    },

    setCropZoom: (id, zoom) =>
      set((s) => {
        const it = s.items.find((i) => i.id === id);
        if (!it || it.type !== 'image') return;
        const base = coverCrop(it.naturalWidth, it.naturalHeight, it.width, it.height);
        const z = Math.max(1, zoom);
        const cw = base.width / z;
        const ch = base.height / z;
        const cur = it.crop ?? base;
        const ccx = cur.x + cur.width / 2;
        const ccy = cur.y + cur.height / 2;
        const x = clamp(ccx - cw / 2, 0, it.naturalWidth - cw);
        const y = clamp(ccy - ch / 2, 0, it.naturalHeight - ch);
        it.crop = { x, y, width: cw, height: ch };
      }),

    startEditingText: (id) =>
      set((s) => {
        setSelection(s, [id]);
        s.editingId = id;
      }),

    clearRequestedPanel: () =>
      set((s) => {
        s.requestedPanel = null;
        s.requestedAnchor = null;
      }),

    requestPanel: (title, anchor) =>
      set((s) => {
        s.requestedPanel = title;
        s.requestedAnchor = anchor ?? null;
      }),

    stopEditingText: () =>
      set((s) => {
        s.editingId = null;
      }),

    setSpacingLive: (patch) =>
      set((s) => {
        s.spacing = { ...s.spacing, ...patch };
        if (s.lastLayout) layoutToDraft(s, s.lastLayout);
      }),

    select: (id) =>
      set((s) => {
        if (s.editingId && s.editingId !== id) s.editingId = null;
        setSelection(s, id ? withGroup(s.items, id) : []);
        // Selecting nothing ends a phone's Select more.
        if (!id) s.multiSelectMode = false;
        const it = s.selectedId ? s.items.find((i) => i.id === s.selectedId) : undefined;
        if (s.cropLocked && it && it.type === 'image') {
          s.croppingId = it.id;
          if (!it.crop) it.crop = coverCrop(it.naturalWidth, it.naturalHeight, it.width, it.height);
        } else if (s.croppingId !== s.selectedId) {
          s.croppingId = null;
        }
      }),

    toggleSelected: (id) =>
      set((s) => {
        const group = withGroup(s.items, id);
        const on = s.selectedIds.includes(id);
        setSelection(s, on ? s.selectedIds.filter((x) => !group.includes(x)) : [...s.selectedIds, ...group.filter((x) => !s.selectedIds.includes(x))]);
        s.editingId = null;
        if (s.croppingId !== s.selectedId) s.croppingId = null;
      }),

    selectMany: (ids, add = false) =>
      set((s) => {
        const next = add ? [...s.selectedIds] : [];
        for (const id of ids) for (const x of withGroup(s.items, id)) if (!next.includes(x)) next.push(x);
        setSelection(s, next);
        s.editingId = null;
        if (s.croppingId !== s.selectedId) s.croppingId = null;
      }),

    selectAll: () =>
      set((s) => {
        setSelection(s, s.items.map((i) => i.id));
        s.editingId = null;
        if (s.croppingId !== s.selectedId) s.croppingId = null;
      }),

    setMultiSelectMode: (on) => set({ multiSelectMode: on }),

    groupSelected: () => {
      const ids = new Set(get().selectedIds);
      if (ids.size < 2) return;
      const groupId = uid('grp');
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, 'Group');
        for (const it of s.items) if (ids.has(it.id)) it.groupId = groupId;
      });
    },

    ungroupSelected: () => {
      const ids = new Set(get().selectedIds);
      if (!get().items.some((i) => ids.has(i.id) && i.groupId)) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, 'Ungroup');
        for (const it of s.items) if (ids.has(it.id)) delete it.groupId;
      });
    },

    distributeSelection: (axis) => {
      const sel = selectedItems(get());
      if (sel.length < 3) return;
      const boxes = sel.map((it) => ({ id: it.id, ...boundsOf(it) }));
      const [lo, hi] = axis === 'x' ? (['left', 'right'] as const) : (['top', 'bottom'] as const);
      boxes.sort((a, b) => a[lo] - b[lo]);
      const span = boxes[boxes.length - 1][hi] - boxes[0][lo];
      const sizes = boxes.reduce((sum, b) => sum + (b[hi] - b[lo]), 0);
      const gap = (span - sizes) / (boxes.length - 1);
      // The two at the ends stay; the rest move to leave equal gaps.
      const target = new Map<string, number>();
      let at = boxes[0][lo];
      for (const b of boxes) {
        target.set(b.id, at - b[lo]);
        at += b[hi] - b[lo] + gap;
      }
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, axis === 'x' ? 'Distribute horizontally' : 'Distribute vertically');
        for (const it of s.items) {
          const d = target.get(it.id);
          if (d) it[axis] += d;
        }
      });
    },

    updateItems: (patches, label) => {
      if (patches.length === 0) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        for (const { id, patch } of patches) {
          const it = s.items.find((i) => i.id === id);
          if (!it) continue;
          // As updateItem: a photo resized by hand leaves the layout.
          if (it.type === 'image' && (patch.width !== undefined || patch.height !== undefined)) s.lastLayout = null;
          Object.assign(it, patch as Record<string, unknown>);
        }
      });
    },

    setExportScale: (scale) =>
      set((s) => {
        s.exportScale = scale;
      }),

    setExportFileName: (name) =>
      set((s) => {
        s.exportFileName = name;
      }),

    setExportFormat: (format) =>
      set((s) => {
        s.exportFormat = format;
      }),

    setProjectName: (name) =>
      set((s) => {
        renameProjectDraft(s, name);
      }),

    setLayoutLocked: (v) =>
      set((s) => {
        s.layoutLocked = v;
        if (v) {
          s.croppingId = null;
        }
      }),


    setSnapEnabled: (v) =>
      set((s) => {
        s.snapEnabled = v;
      }),

    setSwapModeEnabled: (v) =>
      set((s) => {
        s.swapModeEnabled = v;
      }),

    setLockAspectEnabled: (v) =>
      set((s) => {
        s.lockAspectEnabled = v;
      }),

    setAutoSaveEnabled: (v) => {
      set((s) => {
        s.autoSaveEnabled = v;
      });
      try {
        localStorage.setItem(AUTO_SAVE_KEY, v ? 'on' : 'off');
      } catch {
        // Storage blocked (private mode): the choice just lasts this session.
      }
    },

    setImportFailures: (failures) =>
      set((s) => {
        s.importFailures = failures;
      }),

    setAppUpdate: (update) => set({ appUpdate: update }),

    setBusyMessage: (message) =>
      set((s) => {
        s.busyMessage = message;
      }),


    // Switching projects discards the old past/future; the blob: URL
    // subscription at the bottom of this file then releases every URL only
    // the outgoing project could show.
    loadSerializedState: (state, id, name, savedAt) => {
      set((s) => {
        s.canvas = state.canvas;
        s.items = state.items;
        // What a previous project reported doesn't apply to this one; a photo
        // this one opened without does (it's marked on the canvas).
        s.importFailures = missingPhotos(state.items, name);
        s.spacing = state.spacing;
        s.lastLayout = state.lastLayout;
        setSelection(s, []);
        s.croppingId = null;
        s.editingId = null;
        s.past = [];
        s.future = [];
        s.futureLabels = [];
        s.historyLabels = [];
        s._pending = null;
        s.currentProjectId = id;
        s.lastSavedAt = savedAt ?? null;
        renameProjectDraft(s, name);
      });
      set({ savedRef: savedRefOf(get()) });
    },

    resetProject: () => {
      set((s) => {
        s.canvas = { ...DEFAULT_CANVAS };
        s.items = [];
        s.spacing = { ...DEFAULT_SPACING };
        s.lastLayout = null;
        setSelection(s, []);
        s.croppingId = null;
        s.editingId = null;
        s.past = [];
        s.future = [];
        s.futureLabels = [];
        s.historyLabels = [];
        s._pending = null;
        s.currentProjectId = uid('proj');
        s.lastSavedAt = null;
        renameProjectDraft(s, DEFAULT_PROJECT_NAME);
      });
      set({ savedRef: savedRefOf(get()) });
    },

    markSaved: (ref) => set({ savedRef: ref, lastSavedAt: Date.now() }),

    // Drops a beginChange() snapshot without recording it — for a gesture that
    // turned out to change nothing (e.g. focusing a text field, then leaving).
    cancelChange: () =>
      set((s) => {
        s._pending = null;
      }),

    undo: () => {
      if (get().past.length === 0) return;
      const current = snapshot(get());
      set((s) => {
        const prev = s.past.pop();
        const label = s.historyLabels.pop();
        if (!prev) return;
        s.future.push(current);
        s.futureLabels.push(label ?? 'Redo');
        s.items = prev.items;
        s.canvas = prev.canvas;
        s.spacing = prev.spacing;
        s.lastLayout = prev.lastLayout;
        keepLiveSelection(s);
        s.editingId = null;
        s._pending = null;
      });
    },

    redo: () => {
      if (get().future.length === 0) return;
      const current = snapshot(get());
      set((s) => {
        const next = s.future.pop();
        const label = s.futureLabels.pop();
        if (!next) return;
        s.past.push(current);
        s.historyLabels.push(label ?? 'Redo');
        s.items = next.items;
        s.canvas = next.canvas;
        s.spacing = next.spacing;
        s.lastLayout = next.lastLayout;
        keepLiveSelection(s);
        s.editingId = null;
        s._pending = null;
      });
    },

    flipItem: (id, axis) => {
      const label = axis === 'x' ? 'Flip horizontal' : 'Flip vertical';
      const item = get().items.find((i) => i.id === id);
      if (!item || item.type !== 'image') return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const it = s.items.find((i) => i.id === id);
        if (!it || it.type !== 'image') return;
        if (axis === 'x') it.flipX = !it.flipX;
        else it.flipY = !it.flipY;
      });
    },

    rotateItem: (id, deltaDeg) => {
      const label = deltaDeg > 0 ? 'Rotate right' : 'Rotate left';
      const item = get().items.find((i) => i.id === id);
      if (!item) return;
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, label);
        const it = s.items.find((i) => i.id === id);
        if (!it) return;
        // Items pivot on their top-left corner (x, y) — Konva's default with no
        // offset. Rotating in place means turning about the CENTRE instead, so
        // move (x, y) to where the corner lands after rotating about it.
        const { width: w, height: h } = itemSize(it);
        const rotate = (deg: number, px: number, py: number) => {
          const r = (deg * Math.PI) / 180;
          return { x: px * Math.cos(r) - py * Math.sin(r), y: px * Math.sin(r) + py * Math.cos(r) };
        };
        const toCentre = rotate(it.rotation, w / 2, h / 2);
        const cx = it.x + toCentre.x;
        const cy = it.y + toCentre.y;
        const next = ((it.rotation + deltaDeg) % 360 + 360) % 360;
        const toCentreAfter = rotate(next, w / 2, h / 2);
        it.x = cx - toCentreAfter.x;
        it.y = cy - toCentreAfter.y;
        it.rotation = next;
      });
    },

    nudgeSelected: (dx, dy) => {
      const st = get();
      const ids = new Set(selectedItems(st).map((i) => i.id));
      if (ids.size === 0) return;
      // The same selection keeps extending one step.
      const id = [...ids].join(',');
      const now = performance.now();
      const move = (s: Draft<EditorState>) => {
        for (const it of s.items) {
          if (!ids.has(it.id)) continue;
          it.x += dx;
          it.y += dy;
        }
      };
      // Holding an arrow key repeats ~30 times a second; a step each pushed
      // every real action out of the 60-step history within two seconds. So
      // a nudge extends the previous one's step while nothing else happened
      // in between — the top of the history is still that nudge's snapshot.
      const merge =
        lastNudge !== null &&
        lastNudge.id === id &&
        now - lastNudge.at < NUDGE_MERGE_MS &&
        st.past[st.past.length - 1] === lastNudge.snap &&
        st.future.length === 0;
      if (merge) {
        set(move);
        lastNudge!.at = now;
        return;
      }
      const prev = snapshot(st);
      set((s) => {
        pushStep(s, prev, 'Move');
        move(s);
      });
      const past = get().past;
      lastNudge = { id, at: now, snap: past[past.length - 1] };
    },

    alignItems: (anchor) => {
      const sel = selectedItems(get());
      if (sel.length === 0) return;
      // The drawn box (a text box is as tall as all its wrapped lines; a
      // rotated item covers its rotated corners).
      const boxes = new Map(sel.map((it) => [it.id, boundsOf(it)]));
      const all = [...boxes.values()];
      // One item lines up with the canvas; several with each other, inside
      // the box round them all.
      const frame =
        sel.length === 1
          ? { left: 0, top: 0, right: get().canvas.width, bottom: get().canvas.height }
          : {
              left: Math.min(...all.map((b) => b.left)),
              top: Math.min(...all.map((b) => b.top)),
              right: Math.max(...all.map((b) => b.right)),
              bottom: Math.max(...all.map((b) => b.bottom)),
            };
      const prev = snapshot(get());
      set((s) => {
        pushStep(s, prev, `Align ${anchor}`);
        for (const it of s.items) {
          const b = boxes.get(it.id);
          if (!b) continue;
          switch (anchor) {
            case 'left':      it.x += frame.left - b.left; break;
            case 'center-x':  it.x += (frame.left + frame.right) / 2 - (b.left + b.right) / 2; break;
            case 'right':     it.x += frame.right - b.right; break;
            case 'top':       it.y += frame.top - b.top; break;
            case 'center-y':  it.y += (frame.top + frame.bottom) / 2 - (b.top + b.bottom) / 2; break;
            case 'bottom':    it.y += frame.bottom - b.bottom; break;
          }
        }
      });
    },

    setView: (scale, x, y) =>
      set((s) => {
        s.viewScale = scale;
        s.viewX = x;
        s.viewY = y;
      }),

    resetView: () =>
      set((s) => {
        s.viewScale = 1;
        s.viewX = 0;
        s.viewY = 0;
      }),
  })),
);

// ---- blob: URL lifetime -------------------------------------------------
//
// Every photo (and uploaded background) is an object URL, which pins its whole
// file in memory until revoked. One URL can be shared — a duplicated item, a
// photo reused as the background, an undo snapshot of a deleted item — so it
// may only be revoked once NOTHING can show it again: not the canvas, not any
// undo/redo step, not an in-progress gesture's snapshot.
//
// This used to be done ad hoc in five actions, which missed the common case:
// history silently discarding snapshots (the 60-step limit shifting the oldest
// off, or a new action clearing the redo branch). Those URLs leaked for the
// rest of the session. Tracking it here, off the history itself, covers every
// path at once.

function collectBlobUrls(into: Set<string>, items: CollageItem[], canvas?: CanvasConfig): void {
  for (const it of items) if (it.type === 'image' && it.src.startsWith('blob:')) into.add(it.src);
  if (canvas?.backgroundImageSrc?.startsWith('blob:')) into.add(canvas.backgroundImageSrc);
}

const trackedBlobUrls = new Set<string>();

useEditorStore.subscribe((s, prev) => {
  // Cheap, every change: remember any URL that has appeared on the canvas.
  if (s.items !== prev.items || s.canvas !== prev.canvas) collectBlobUrls(trackedBlobUrls, s.items, s.canvas);

  // A URL can only become unreachable when a snapshot is dropped, which always
  // changes past/future (or ends a gesture), or when the clipboard lets go of
  // an item. Only then pay for the full scan.
  const historyChanged =
    s.past !== prev.past ||
    s.future !== prev.future ||
    (prev._pending !== null && s._pending === null) ||
    s.itemClipboard?.items !== prev.itemClipboard?.items;
  if (!historyChanged) return;

  const reachable = new Set<string>();
  collectBlobUrls(reachable, s.items, s.canvas);
  for (const snap of s.past) collectBlobUrls(reachable, snap.items, snap.canvas);
  for (const snap of s.future) collectBlobUrls(reachable, snap.items, snap.canvas);
  if (s._pending) collectBlobUrls(reachable, s._pending.snap.items, s._pending.snap.canvas);
  // A copied photo must still paste after everything else showing it is gone.
  if (s.itemClipboard) collectBlobUrls(reachable, s.itemClipboard.items);

  for (const url of trackedBlobUrls) {
    if (!reachable.has(url)) {
      URL.revokeObjectURL(url);
      trackedBlobUrls.delete(url);
    }
  }
});
