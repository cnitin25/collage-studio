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
import { FRAMES, type FrameId } from '../style/frames';
import { ENHANCE_PRESETS, DEFAULT_PRESET_STRENGTH, NEUTRAL_FILTERS, scaleEnhanceFilters } from '../style/enhancePresets';
import type { SerializedState } from '../storage/projects';
import { uid } from '../utils/id';
import { revokeUnusedImageUrls } from '../utils/blobUrls';
import { shuffle } from '../utils/random';

interface Snapshot {
  items: CollageItem[];
  canvas: CanvasConfig;
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
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
  selectedId: string | null;
  croppingId: string | null;
  cropLocked: boolean;
  editingId: string | null; // text being edited inline
  requestedPanel: string | null; // panel title to auto-expand (e.g. after Add text)
  spacing: SpacingOptions;
  lastLayout: LayoutSpec | null;
  exportScale: number;
  exportFileName: string;
  exportFormat: 'png' | 'jpeg';
  styleClipboard: ImageStyle | null;
  currentProjectId: string;
  projectName: string;
  layoutLocked: boolean;
  snapEnabled: boolean;
  swapModeEnabled: boolean;
  lockAspectEnabled: boolean;
  autoSaveEnabled: boolean;
  importFailures: ImageLoadFailure[];
  savedRef: SavedRef;
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
  requestPanel: (title: string) => void;

  setSpacingLive: (patch: Partial<SpacingOptions>) => void;
  select: (id: string | null) => void;
  setExportScale: (scale: number) => void;
  setExportFileName: (name: string) => void;
  setExportFormat: (format: 'png' | 'jpeg') => void;
  setProjectName: (name: string) => void;
  flipItem: (id: string, axis: 'x' | 'y') => void;
  rotateItem: (id: string, deltaDeg: number) => void;
  alignItems: (anchor: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') => void;
  setView: (scale: number, x: number, y: number) => void;
  resetView: () => void;
  setLayoutLocked: (v: boolean) => void;
  setSnapEnabled: (v: boolean) => void;
  setSwapModeEnabled: (v: boolean) => void;
  setLockAspectEnabled: (v: boolean) => void;
  setAutoSaveEnabled: (v: boolean) => void;
  setImportFailures: (failures: ImageLoadFailure[]) => void;
  loadSerializedState: (state: SerializedState, id: string, name: string) => void;
  resetProject: () => void;
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
 * the same object for anything that didn't, so this needs no deep compare —
 * at the cost of reading "changed then changed back" as unsaved, which errs
 * on the side of asking. An empty canvas is never worth a prompt.
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

const INITIAL_ITEMS: CollageItem[] = [];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function snapshot(
  state: Pick<EditorState, 'items' | 'canvas' | 'spacing' | 'lastLayout'>,
): Snapshot {
  return {
    items: structuredClone(state.items),
    canvas: { ...state.canvas },
    spacing: { ...state.spacing },
    lastLayout: state.lastLayout ? { ...state.lastLayout } : null,
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
  const imageItems = s.items.filter((it) => it.type === 'image') as Draft<ImageItem>[];
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
    selectedId: null,
    croppingId: null,
    cropLocked: false,
    editingId: null,
    requestedPanel: null,
    spacing: DEFAULT_SPACING,
    lastLayout: null,
    exportScale: 1,
    exportFileName: fileNameForProject(DEFAULT_PROJECT_NAME),
    exportFormat: 'png',
    styleClipboard: null,
    currentProjectId: uid('proj'),
    projectName: DEFAULT_PROJECT_NAME,
    layoutLocked: false,
    snapEnabled: true,
    swapModeEnabled: true,
    lockAspectEnabled: false,
    autoSaveEnabled: false,
    importFailures: [],
    savedRef: {
      items: INITIAL_ITEMS,
      canvas: DEFAULT_CANVAS,
      spacing: DEFAULT_SPACING,
      lastLayout: null,
      projectName: DEFAULT_PROJECT_NAME,
    },
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        const base = s.items.length;
        images.forEach((img, i) => s.items.push(placeImage(img, s.canvas, base + i)));
        s.selectedId = s.items[s.items.length - 1]?.id ?? null;
      });
    },

    addText: () => {
      const label = "Add text";
      const prev = snapshot(get());
      const id = uid('txt');
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        const w = Math.min(680, s.canvas.width * 0.6);
        const item: TextItem = {
          id,
          type: 'text',
          x: Math.round((s.canvas.width - w) / 2),
          y: Math.round(s.canvas.height * 0.42),
          width: w,
          height: 90,
          rotation: 0,
          text: 'Your text',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: 64,
          fontStyle: 'normal',
          fill: '#15171d',
          align: 'center',
        };
        s.items.push(item);
        s.selectedId = id;
        s.editingId = id;
        s.requestedPanel = 'Insert';
      });
    },

    addSticker: (emoji) => {
      const label = "Add sticker";
      const prev = snapshot(get());
      const id = uid('stk');
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        s.selectedId = id;
      });
    },

    updateItem: (id, patch) => {
      const label = 'Edit item';
      const current = get().items.find((it) => it.id === id);
      if (!current) return;
      const prev = snapshot(get());
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
      const label = 'Delete';
      const { selectedId } = get();
      if (!selectedId) return;
      const prev = snapshot(get());
      const removed = get().items.filter((it) => it.id === selectedId);
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        s.items = s.items.filter((it) => it.id !== selectedId);
        s.selectedId = null;
        s.croppingId = null;
        s.editingId = null;
      });
      const after = get();
      revokeUnusedImageUrls(removed, [after.items, ...after.past.map((p) => p.items), ...after.future.map((p) => p.items)]);
    },

    duplicateSelected: () => {
      const label = 'Duplicate';
      const sel = get().items.find((i) => i.id === get().selectedId);
      if (!sel) return;
      const prev = snapshot(get());
      const copy = structuredClone(sel);
      copy.id = uid(sel.type === 'image' ? 'img' : sel.type === 'text' ? 'txt' : 'stk');
      copy.x += 28;
      copy.y += 28;
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        s.items.push(copy);
        s.selectedId = copy.id;
        s.croppingId = null;
      });
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
      const removed = [structuredClone(current)]; // old state, for blob URL cleanup
      const prev = snapshot(get());
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        const it = s.items.find((i) => i.id === id);
        if (!it || it.type !== 'image') return;
        it.src = image.src;
        it.naturalWidth = image.naturalWidth;
        it.naturalHeight = image.naturalHeight;
        it.assetId = uid('asset');
        it.crop = coverCrop(image.naturalWidth, image.naturalHeight, it.width, it.height);
      });
      const after = get();
      revokeUnusedImageUrls(removed, [after.items, ...after.past.map((p) => p.items), ...after.future.map((p) => p.items)]);
    },

    setBackground: (patch) => {
      const label = "Background";
      const prev = snapshot(get());
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        s.canvas.width = width;
        s.canvas.height = height;
        if (s.lastLayout) layoutToDraft(s, s.lastLayout);
      });
    },

    clearAll: () => {
      const label = 'Clear all';
      if (get().items.length === 0) return;
      const prev = snapshot(get());
      const removed = get().items;
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        s.items = [];
        s.selectedId = null;
        s.croppingId = null;
        s.editingId = null;
        s.lastLayout = null;
      });
      const after = get();
      revokeUnusedImageUrls(removed, [after.items, ...after.past.map((p) => p.items), ...after.future.map((p) => p.items)]);
    },

    applyLayout: (spec) => {
      const label = 'Layout';
      if (get().items.some((i) => i.type === 'image') === false) return;
      const prev = snapshot(get());
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push('Shuffle photos');
        s.future = [];
        s.futureLabels = [];

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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        const it = s.items.find((i) => i.id === selId);
        if (!it || it.type !== 'image') return;
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        const it = s.items.find((i) => i.id === selId);
        if (!it || it.type !== 'image') return;
        it.filters = alreadyActive
          ? { ...NEUTRAL_FILTERS }
          : {
              ...scaleEnhanceFilters(recipe.filters, DEFAULT_PRESET_STRENGTH),
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) {
          s.past.shift();
          s.historyLabels.shift();
        }
        s.past.push(pending.snap);
        s.historyLabels.push(pending.label);
        s.future = [];
        s.futureLabels = [];
        s._pending = null;
      });
    },

    startCrop: (id) =>
      set((s) => {
        s.selectedId = id;
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        s.selectedId = id;
        s.editingId = id;
      }),

    clearRequestedPanel: () =>
      set((s) => {
        s.requestedPanel = null;
      }),

    requestPanel: (title) =>
      set((s) => {
        s.requestedPanel = title;
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
        s.selectedId = id;
        const it = id ? s.items.find((i) => i.id === id) : undefined;
        if (s.cropLocked && it && it.type === 'image') {
          s.croppingId = id;
          if (!it.crop) it.crop = coverCrop(it.naturalWidth, it.naturalHeight, it.width, it.height);
        } else if (s.croppingId !== id) {
          s.croppingId = null;
        }
      }),

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

    setAutoSaveEnabled: (v) =>
      set((s) => {
        s.autoSaveEnabled = v;
      }),

    setImportFailures: (failures) =>
      set((s) => {
        s.importFailures = failures;
      }),


    // Switching projects/history entirely discards the old past/future, so
    // every blob: URL still held by the outgoing items is now unreachable —
    // safe to revoke unconditionally against the freshly loaded items.
    loadSerializedState: (state, id, name) => {
      const removed = get().items;
      set((s) => {
        s.canvas = state.canvas;
        s.items = state.items;
        s.spacing = state.spacing;
        s.lastLayout = state.lastLayout;
        s.selectedId = null;
        s.croppingId = null;
        s.editingId = null;
        s.past = [];
        s.future = [];
        s.futureLabels = [];
        s.historyLabels = [];
        s._pending = null;
        s.currentProjectId = id;
        renameProjectDraft(s, name);
      });
      set({ savedRef: savedRefOf(get()) });
      revokeUnusedImageUrls(removed, [get().items]);
    },

    resetProject: () => {
      const removed = get().items;
      set((s) => {
        s.canvas = { ...DEFAULT_CANVAS };
        s.items = [];
        s.spacing = { ...DEFAULT_SPACING };
        s.lastLayout = null;
        s.selectedId = null;
        s.croppingId = null;
        s.editingId = null;
        s.past = [];
        s.future = [];
        s.futureLabels = [];
        s.historyLabels = [];
        s._pending = null;
        s.currentProjectId = uid('proj');
        renameProjectDraft(s, DEFAULT_PROJECT_NAME);
      });
      set({ savedRef: savedRefOf(get()) });
      revokeUnusedImageUrls(removed, [get().items]);
    },

    markSaved: (ref) => set({ savedRef: ref }),

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
        s.selectedId = null;
        s.croppingId = null;
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
        s.selectedId = null;
        s.croppingId = null;
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
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
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        const it = s.items.find((i) => i.id === id);
        if (!it) return;
        it.rotation = ((it.rotation + deltaDeg) % 360 + 360) % 360;
      });
    },

    alignItems: (anchor) => {
      const selId = get().selectedId;
      if (!selId) return;
      const sel = get().items.find((i) => i.id === selId);
      if (!sel) return;
      const { width: cw, height: ch } = get().canvas;
      const label = `Align ${anchor}`;
      const prev = snapshot(get());
      set((s) => {
        if (s.past.length >= HISTORY_LIMIT) { s.past.shift(); s.historyLabels.shift(); }
        s.past.push(prev);
        s.historyLabels.push(label);
        s.future = [];
        s.futureLabels = [];
        const it = s.items.find((i) => i.id === selId);
        if (!it) return;
        const iw = it.type === 'sticker' ? it.fontSize : it.width;
        const ih = it.type === 'sticker' ? it.fontSize : it.type === 'text' ? it.fontSize * 1.3 : it.height;

        // Items rotate around their top-left corner (item.x, item.y) — Konva's
        // default pivot when no offsetX/offsetY is set (see ImageNode/StickerNode/
        // TextNode). So the visual bounding box after rotation is not simply
        // [x, x+iw] x [y, y+ih]; it has to be derived from the rotated corners.
        const rad = (it.rotation * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const corners = [
          { x: 0, y: 0 },
          { x: iw, y: 0 },
          { x: 0, y: ih },
          { x: iw, y: ih },
        ].map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
        const minX = Math.min(...corners.map((p) => p.x));
        const maxX = Math.max(...corners.map((p) => p.x));
        const minY = Math.min(...corners.map((p) => p.y));
        const maxY = Math.max(...corners.map((p) => p.y));

        switch (anchor) {
          case 'left':      it.x = -minX; break;
          case 'center-x':  it.x = cw / 2 - (minX + maxX) / 2; break;
          case 'right':     it.x = cw - maxX; break;
          case 'top':       it.y = -minY; break;
          case 'center-y':  it.y = ch / 2 - (minY + maxY) / 2; break;
          case 'bottom':    it.y = ch - maxY; break;
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
