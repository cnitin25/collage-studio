import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Stage, Layer, Group, Line, Rect, Shape, Transformer } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEditorStore } from '../../store/useEditorStore';
import ImageNode from './ImageNode';
import TextNode from './TextNode';
import StickerNode from './StickerNode';
import Background from './Background';
import SelectionActions from './SelectionActions';
import { drawShapePath } from '../../utils/shapes';
import type { CollageItem, ImageItem } from '../../types';
import { computeSnap, collectSnapTargets, nearestSnapTarget, type Box, type Guide } from '../../utils/snap';
import { itemSize } from '../../utils/itemBox';
import { scaledBy } from '../../utils/scaleItem';
import { UI_OVERLAY } from './overlay';
import { COARSE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { useStableCallback } from '../../hooks/useStableCallback';

export interface CanvasHandle {
  getStage: () => Konva.Stage | null;
  getDisplayScale: () => number;
  /**
   * Render the stage to a data URL at its TRUE canvas framing, ignoring any
   * current pan/zoom. Without this, toDataURL() would capture whatever is
   * currently visible in the viewport — if the user had panned or zoomed out,
   * the capture would be mostly empty space (transparent → solid black in JPEG).
   */
  exportDataURL: (opts: ExportOptions) => string | null;
  /**
   * Same rendering as exportDataURL, returned as a canvas — so a caller can
   * encode it with toBlob() instead of building a multi-megabyte data-URL string.
   */
  exportCanvas: (opts: Omit<ExportOptions, 'quality'>) => HTMLCanvasElement | null;
}

interface ExportOptions {
  mimeType: 'image/png' | 'image/jpeg';
  quality?: number;
  pixelRatioMultiplier?: number;
}

const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const ALL_ANCHORS = [
  'top-left', 'top-center', 'top-right', 'middle-left',
  'middle-right', 'bottom-left', 'bottom-center', 'bottom-right',
];
// Text has no independently resizable height — its height is always derived
// from fontSize (see itemBox below), so only the width-changing side handles
// are offered. Locking to corner/keepRatio anchors here fought with that
// derived height and produced runaway/zero-height boxes.
const TEXT_ANCHORS = ['middle-left', 'middle-right'];

/** Free rotation, but it settles on the eighth turns within a few degrees. */
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

const TOUCH_ANCHOR_SIZE = 12;
/** ~40 px touch target around a 12 px dot (hit stroke is centred on the edge). */
const touchAnchorStyle = (anchor: Konva.Rect) => anchor.hitStrokeWidth(28);

/** How far above its box the rotate handle sits: Konva's default. */
const ROTATE_HANDLE_OFFSET = 50;

/**
 * The stage is exactly the canvas's size, so for a photo at the top of the
 * canvas (or zoomed and panned past the stage's edge) the rotate handle's
 * usual spot above it is off the stage, where nothing can grab it. Then the
 * handle moves inside the box, `inside` screen px below its top edge (clear
 * of the top resize handle's grab area), or further down if that is off the
 * stage too — but never as far as the centre: from there Konva would turn the
 * photo half a turn the moment a drag began.
 */
function placeRotateHandle(tr: Konva.Transformer, stage: Konva.Stage, inside: number) {
  const onStage = () => {
    tr.forceUpdate();
    const handle = tr.findOne('.rotater');
    if (!handle) return true;
    const { x, y } = handle.getAbsolutePosition();
    const r = tr.anchorSize() / 2;
    return x >= r && y >= r && x <= stage.width() - r && y <= stage.height() - r;
  };
  tr.rotateAnchorOffset(ROTATE_HANDLE_OFFSET);
  if (tr.nodes().length === 0 || onStage()) return;
  const h = Math.abs(tr.findOne('.back')?.height() ?? 0);
  for (const depth of [Math.min(inside, h / 3), h / 3, h * 0.45]) {
    tr.rotateAnchorOffset(-depth);
    if (onStage()) return;
  }
  // Off the side of the stage, where no depth helps: back to the usual spot.
  tr.rotateAnchorOffset(ROTATE_HANDLE_OFFSET);
  tr.forceUpdate();
}

function itemBox(it: CollageItem): Box {
  return { x: it.x, y: it.y, ...itemSize(it) };
}

/** Whether two sets of snap guides draw the same lines. */
function sameGuides(a: Guide[], b: Guide[]): boolean {
  return a.length === b.length && a.every((g, i) => g.axis === b[i].axis && g.pos === b[i].pos);
}

interface CanvasStageProps {
  /** Show the tools panel at one section: the floating bar's Adjust button. */
  onOpenPanel: (title: string) => void;
}

const CanvasStage = forwardRef<CanvasHandle, CanvasStageProps>(function CanvasStage({ onOpenPanel }, ref) {
  const canvas = useEditorStore((s) => s.canvas);
  const items = useEditorStore((s) => s.items);
  const selectedId = useEditorStore((s) => s.selectedId);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  // Several items selected: they move, resize and rotate as one.
  const multi = selectedIds.length > 1;
  const croppingId = useEditorStore((s) => s.croppingId);
  const editingId = useEditorStore((s) => s.editingId);
  const layoutLocked = useEditorStore((s) => s.layoutLocked);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
  const swapModeEnabled = useEditorStore((s) => s.swapModeEnabled);
  const lockAspectEnabled = useEditorStore((s) => s.lockAspectEnabled);
  const viewScale = useEditorStore((s) => s.viewScale);
  const viewX = useEditorStore((s) => s.viewX);
  const viewY = useEditorStore((s) => s.viewY);
  const setView = useEditorStore((s) => s.setView);
  const select = useEditorStore((s) => s.select);
  const toggleSelected = useEditorStore((s) => s.toggleSelected);
  const selectMany = useEditorStore((s) => s.selectMany);
  const updateItems = useEditorStore((s) => s.updateItems);
  const updateItem = useEditorStore((s) => s.updateItem);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);
  const swapItems = useEditorStore((s) => s.swapItems);
  const startEditingText = useEditorStore((s) => s.startEditingText);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);

  const [display, setDisplay] = useState({ scale: 1 });
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [guides, setGuideState] = useState<Guide[]>([]);
  // A drag or resize reports guides on every pointer move, but they change
  // far less often: keeping the same array while they're unchanged spares the
  // stage a re-render per move.
  const setGuides = useCallback(
    (next: Guide[]) => setGuideState((prev) => (sameGuides(prev, next) ? prev : next)),
    [],
  );
  const isPanning = useRef(false);
  const spaceDown = useRef(false);

  // Touch devices get fatter Transformer handles; desktop mouse precision
  // (10px) is untouched. Tracks live so a hybrid device updates if input
  // type changes mid-session.
  const coarsePointer = useMediaQuery(COARSE_QUERY);

  useLayoutEffect(() => {
    const compute = () => {
      const el = wrapRef.current;
      if (!el) return;
      const pad = 48;
      const availW = el.clientWidth - pad;
      const availH = el.clientHeight - pad;
      const scale = Math.min(availW / canvas.width, availH / canvas.height, 1);
      setDisplay({ scale: Math.max(scale, 0.05) });
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [canvas.width, canvas.height]);

  const renderExport = ({ mimeType, pixelRatioMultiplier = 1 }: Omit<ExportOptions, 'quality'>) => {
    const stage = stageRef.current;
    if (!stage) return null;
    // Neutralize pan/zoom so the capture always frames the full canvas,
    // regardless of what the user currently has zoomed/panned to on screen.
    const savedScale = { x: stage.scaleX(), y: stage.scaleY() };
    const savedPos = { x: stage.x(), y: stage.y() };
    stage.scale({ x: display.scale, y: display.scale });
    stage.position({ x: 0, y: 0 });

    // Filtered images (and a blurred background) draw from a Konva cache
    // made at the screen's pixel ratio. A 2x/3x export would upscale that
    // cache and come out soft, so re-cache at export resolution for the
    // capture and restore afterwards. Blur needs nothing extra: Konva applies
    // blurRadius in the node's own units, whatever the cache's pixel ratio.
    const exportRatio = pixelRatioMultiplier;
    const recache =
      exportRatio > Konva.pixelRatio
        ? stage.find<Konva.Image>('Image').filter((n) => n.isCached())
        : [];
    recache.forEach((n) => n.cache({ pixelRatio: exportRatio }));

    // Editor-only visuals must never reach the file. Export and Save
    // deselect first, but auto-save runs on a timer and captures whatever
    // is on screen — selection handles, guides, a crop outline.
    const overlays = [trRef.current, ...stage.find(`.${UI_OVERLAY}`)].filter(
      (n): n is Konva.Node => !!n && n.visible(),
    );
    overlays.forEach((n) => n.visible(false));
    stage.batchDraw();

    let out: HTMLCanvasElement | null = null;
    try {
      const pixelRatio = (1 / display.scale) * pixelRatioMultiplier;
      const src = stage.toCanvas({ pixelRatio });
      if (mimeType === 'image/jpeg') {
        // JPEG has no transparency: anything transparent (the corners cut
        // off by a rounded collage frame) would otherwise encode as black.
        const flat = document.createElement('canvas');
        flat.width = src.width;
        flat.height = src.height;
        const ctx = flat.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, flat.width, flat.height);
          ctx.drawImage(src, 0, 0);
          out = flat;
        }
      } else {
        out = src;
      }
    } finally {
      overlays.forEach((n) => n.visible(true));
      recache.forEach((n) => n.cache());
      stage.scale(savedScale);
      stage.position(savedPos);
      stage.batchDraw();
    }
    return out;
  };

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
    getDisplayScale: () => display.scale * viewScale,
    exportCanvas: renderExport,
    exportDataURL: ({ quality, ...opts }) => renderExport(opts)?.toDataURL(opts.mimeType, quality) ?? null,
  }));

  // Keyboard: track Space for pan mode. Space belongs to the focused control
  // only when it means something there: typing in a field, or pressing a
  // control the keyboard moved to. A button focused by a mouse click keeps
  // that focus, and Space used to click it again — a second Duplicate when
  // the user meant to pan. (:focus-visible can't tell these apart: Chrome
  // turns it on for the focused element at the keypress itself.)
  useEffect(() => {
    let focusFromPointer = false;
    const onPointerDown = () => {
      focusFromPointer = true;
    };
    const onTab = (e: KeyboardEvent) => {
      if (e.key === 'Tab') focusFromPointer = false;
    };
    const ownsSpace = (t: EventTarget | null) => {
      if (!(t instanceof HTMLElement) || t === document.body) return false;
      if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
      if (t instanceof HTMLInputElement && !/^(checkbox|radio|range|button|submit|reset|color|file)$/.test(t.type)) {
        return true;
      }
      return !focusFromPointer;
    };
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || ownsSpace(e.target)) return;
      e.preventDefault();
      spaceDown.current = true;
      if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // A button clicks on Space's keyup; ours was a pan.
        if (spaceDown.current) e.preventDefault();
        spaceDown.current = false;
        isPanning.current = false;
        if (wrapRef.current) wrapRef.current.style.cursor = '';
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onTab, true);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onTab, true);
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Space+drag pan handling on the Stage
  const panStart = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // Two-finger touch = pinch-zoom + pan the canvas view, entirely separate
  // from one-finger touch (which keeps dragging items / box-selecting).
  // Writes through the same setView the wheel-zoom and Space+drag paths use,
  // so resetView() and export neutralization keep working unmodified.
  const gesture = useRef<{
    startDist: number;
    startScale: number;
    startCx: number;
    startCy: number;
    startViewX: number;
    startViewY: number;
  } | null>(null);

  // Relative to the STAGE, not the wrapper: the stage sits centred inside the
  // padded .canvas-area, and the pinch maths (like the wheel zoom's
  // getPointerPosition) works in stage coordinates. Measuring from the wrapper
  // anchored every pinch on a point offset from the user's fingers.
  const touchPoint = (t: Touch) => {
    const rect = stageRef.current?.container().getBoundingClientRect();
    return { x: t.clientX - (rect?.left ?? 0), y: t.clientY - (rect?.top ?? 0) };
  };

  // Konva reports the end of a pinch as a tap on whatever is under the
  // fingers, which would select it; ignore taps during and just after one.
  const suppressTapUntil = useRef(0);
  const selectFromCanvas = (id: string, evt?: Event) => {
    if (gesture.current || performance.now() < suppressTapUntil.current) return;
    // Shift, Ctrl or ⌘ — or Select more, on a phone — adds to the selection.
    const adding =
      (evt instanceof MouseEvent && (evt.shiftKey || evt.ctrlKey || evt.metaKey)) ||
      useEditorStore.getState().multiSelectMode;
    if (adding) toggleSelected(id);
    else select(id);
  };

  // A box dragged across empty canvas (mouse only) selects what it touches.
  // In canvas coordinates; `add` keeps what was already selected (Shift).
  const marquee = useRef<{ x0: number; y0: number; add: boolean } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<Box | null>(null);
  const finishMarquee = () => {
    const m = marquee.current;
    const stage = stageRef.current;
    marquee.current = null;
    setMarqueeBox(null);
    const p = stage?.getRelativePointerPosition();
    if (!m || !stage || !p) return;
    const box = { x: Math.min(m.x0, p.x), y: Math.min(m.y0, p.y), width: Math.abs(p.x - m.x0), height: Math.abs(p.y - m.y0) };
    // Less than a few screen px is a click, already handled on press.
    if (Math.max(box.width, box.height) * display.scale * viewScale < 4) return;
    const hits = stage
      .find('.item')
      .filter((n) => {
        const r = n.getClientRect({ relativeTo: stage });
        return r.x < box.x + box.width && r.x + r.width > box.x && r.y < box.y + box.height && r.y + r.height > box.y;
      })
      .map((n) => n.id());
    if (hits.length) selectMany(hits, m.add);
  };

  // Pinch listeners live on .canvas-area rather than the Konva stage, so a
  // pinch that starts in the margin around a small or zoomed-out canvas still
  // zooms. They're registered once and read the latest view through a ref.
  const latestView = useRef({ viewScale, viewX, viewY, displayScale: display.scale });
  latestView.current = { viewScale, viewX, viewY, displayScale: display.scale };

  // Ctrl/⌘+wheel (and a trackpad pinch, which arrives as one) zooms; a plain
  // wheel or two-finger scroll pans. Registered once; reads the view from the
  // store, which is current even between renders of a fast event stream.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const stage = stageRef.current;
      if (!stage) return;
      const { viewScale: vs, viewX: vx, viewY: vy } = useEditorStore.getState();
      const ds = latestView.current.displayScale;
      const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1; // lines / pages → px
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const pointer = stage.getPointerPosition();
        if (!pointer) return;
        // In proportion to how far the wheel or fingers moved. A fixed 10% per
        // event turned one gentle pinch (dozens of tiny events) into ~7x; the
        // cap keeps one mouse-wheel notch a modest step.
        const factor = Math.min(1.2, Math.max(1 / 1.2, Math.exp(-e.deltaY * px * 0.01)));
        const newScale = Math.max(0.1, Math.min(8, vs * factor));
        // Canvas point under the cursor, then the view offset that puts that
        // same point back under the cursor at the new scale. (Solving for
        // `mouseX - mouseX * newScale` instead only held from the neutral view —
        // once zoomed, zooming again anywhere else made the content jump.)
        const mouseX = (pointer.x / ds - vx) / vs;
        const mouseY = (pointer.y / ds - vy) / vs;
        setView(newScale, pointer.x / ds - mouseX * newScale, pointer.y / ds - mouseY * newScale);
      } else if (vs !== 1 || vx !== 0 || vy !== 0) {
        // Only once zoomed or moved: at the fitted view, a scroll that passes
        // over the canvas must not push it out of place.
        e.preventDefault();
        let dx = e.deltaX * px;
        let dy = e.deltaY * px;
        if (e.shiftKey && dx === 0) [dx, dy] = [dy, 0]; // Shift+wheel scrolls sideways
        setView(vs, vx - dx / ds, vy - dy / ds);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView]);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      // A second finger landing mid-drag would otherwise leave the item
      // jumping once the gesture ends — cancel any in-progress drag first.
      stageRef.current?.stopDrag();
      const v = latestView.current;
      const p0 = touchPoint(e.touches[0]);
      const p1 = touchPoint(e.touches[1]);
      gesture.current = {
        startDist: Math.hypot(p1.x - p0.x, p1.y - p0.y),
        startScale: v.viewScale,
        startCx: (p0.x + p1.x) / 2,
        startCy: (p0.y + p1.y) / 2,
        startViewX: v.viewX,
        startViewY: v.viewY,
      };
    };
    const onMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g || e.touches.length !== 2) return;
      e.preventDefault();
      const ds = latestView.current.displayScale;
      const p0 = touchPoint(e.touches[0]);
      const p1 = touchPoint(e.touches[1]);
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      const ratio = g.startDist > 0 ? dist / g.startDist : 1;
      const newScale = Math.max(0.1, Math.min(8, g.startScale * ratio));
      const contentX = (g.startCx / ds - g.startViewX) / g.startScale;
      const contentY = (g.startCy / ds - g.startViewY) / g.startScale;
      // Keep the content point that was under the fingers' starting midpoint
      // under their CURRENT midpoint (same correction as the wheel zoom).
      setView(newScale, cx / ds - contentX * newScale, cy / ds - contentY * newScale);
    };
    const onEnd = (e: TouchEvent) => {
      if (gesture.current && e.touches.length < 2) {
        gesture.current = null;
        suppressTapUntil.current = performance.now() + 350;
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [setView]);

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const te = e.evt as TouchEvent;
    // A second finger belongs to the canvas-area pinch handler above, not a tap.
    if ('touches' in te && te.touches.length >= 2) return;
    if (spaceDown.current) {
      isPanning.current = true;
      if (wrapRef.current) wrapRef.current.style.cursor = 'grabbing';
      const stage = stageRef.current;
      const p = stage?.getPointerPosition();
      if (p) panStart.current = { px: p.x, py: p.y, ox: viewX, oy: viewY };
      return;
    }
    if (croppingId) return;
    const target = e.target;
    const clickedEmpty = target === target.getStage() || target.name() === 'background';
    if (!clickedEmpty) return;
    const evt = e.evt;
    const add = evt instanceof MouseEvent && (evt.shiftKey || evt.ctrlKey || evt.metaKey);
    if (!add) select(null);
    const p = evt instanceof MouseEvent ? stageRef.current?.getRelativePointerPosition() : null;
    if (p && !layoutLocked) marquee.current = { x0: p.x, y0: p.y, add };
  };

  const handleStageMM = () => {
    if (gesture.current) return;
    const m = marquee.current;
    if (m) {
      const p = stageRef.current?.getRelativePointerPosition();
      if (p) setMarqueeBox({ x: Math.min(m.x0, p.x), y: Math.min(m.y0, p.y), width: Math.abs(p.x - m.x0), height: Math.abs(p.y - m.y0) });
      return;
    }
    if (!isPanning.current || !panStart.current) return;
    const stage = stageRef.current;
    const p = stage?.getPointerPosition();
    if (!p) return;
    const dx = (p.x - panStart.current.px) / display.scale;
    const dy = (p.y - panStart.current.py) / display.scale;
    setView(viewScale, panStart.current.ox + dx, panStart.current.oy + dy);
  };

  const handleStageMU = () => {
    if (gesture.current) return;
    if (marquee.current) finishMarquee();
    if (isPanning.current) {
      isPanning.current = false;
      panStart.current = null;
      if (wrapRef.current) wrapRef.current.style.cursor = spaceDown.current ? 'grab' : '';
    }
  };

  useEffect(() => {
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) stageRef.current?.batchDraw();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    if (selectedIds.length === 0 || editingId || layoutLocked) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    tr.nodes(selectedIds.map((id) => stage.findOne<Konva.Node>(`#${id}`)).filter((n): n is Konva.Node => !!n));
    placeRotateHandle(tr, stage, coarsePointer ? 44 : 28);
    tr.getLayer()?.batchDraw();
    // The view and the stage's size move the handle on screen too.
  }, [selectedIds, editingId, layoutLocked, items, viewScale, viewX, viewY, display.scale, coarsePointer]);

  // A box drag can end outside the stage, where the stage hears no mouseup.
  useEffect(() => {
    const onUp = () => {
      if (marquee.current) finishMarquee();
    };
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  });

  const isCroppingSelected = !!croppingId && croppingId === selectedId;

  // Several items resized or rotated together: write each back, as one undo
  // step. (A lone item handles its own transform end — see ImageNode.)
  const finishMultiTransform = () => {
    const tr = trRef.current;
    if (!multi || !tr) return;
    const patches = tr.nodes().flatMap((node) => {
      const it = items.find((i) => i.id === node.id());
      if (!it) return [];
      const s = node.scaleX(); // ratio kept: one scale for both axes
      node.scale({ x: 1, y: 1 });
      const patch: Partial<CollageItem> = Object.assign(
        { x: node.x(), y: node.y(), rotation: node.rotation() },
        Math.abs(s - 1) > 1e-6 ? scaledBy(it, s) : {},
      );
      return [{ id: it.id, patch }];
    });
    updateItems(patches, 'Transform');
  };

  // A selection of several moves together (the Transformer drags every node
  // it holds). Each node reports its own dragend; the first writes them all,
  // as one undo step, and the rest find nothing left to do.
  const multiDrag = useRef(false);

  const handleNodeDragMove = (id: string, node: Konva.Node) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (multi && selectedIds.includes(id)) {
      // Snapping and swapping are for one item; together, they just move.
      multiDrag.current = true;
      return;
    }
    const box = itemBox(item);
    box.x = node.x();
    box.y = node.y();

    if (snapEnabled) {
      const others = items.filter((i) => i.id !== id).map(itemBox);
      // 6 screen px at the current zoom, as resize snapping already is: in
      // canvas px alone, zoomed in it pulled from far away, zoomed out barely.
      const threshold = 6 / (display.scale * viewScale);
      const snapped = computeSnap(box, others, canvas.width, canvas.height, threshold);
      node.position({ x: snapped.x, y: snapped.y });
      box.x = snapped.x;
      box.y = snapped.y;
      setGuides(snapped.guides);
    }

    if (item.type === 'image' && swapModeEnabled) {
      const cx = box.x + item.width / 2;
      const cy = box.y + item.height / 2;
      const target = items.find(
        (it) =>
          it.id !== id &&
          it.type === 'image' &&
          cx >= it.x &&
          cx <= it.x + it.width &&
          cy >= it.y &&
          cy <= it.y + it.height,
      );
      setDropTargetId(target ? target.id : null);
    }
  };

  const handleNodeDragEnd = (id: string, node: Konva.Node) => {
    setGuides([]);
    if (multi && selectedIds.includes(id)) {
      if (!multiDrag.current) return;
      multiDrag.current = false;
      const nodes = trRef.current?.nodes() ?? [node];
      updateItems(nodes.map((n) => ({ id: n.id(), patch: { x: n.x(), y: n.y() } })), 'Move');
      return;
    }
    const item = items.find((i) => i.id === id);
    if (swapModeEnabled && item?.type === 'image' && dropTargetId && dropTargetId !== id) {
      swapItems(id, dropTargetId);
    } else {
      updateItem(id, { x: node.x(), y: node.y() });
    }
    setDropTargetId(null);
  };

  // The item nodes are memoized: they get the same functions on every render
  // (the store's actions already are), so only an item that changed re-renders.
  const onItemSelect = useStableCallback((id: string, e?: KonvaEventObject<Event>) => selectFromCanvas(id, e?.evt));
  const onItemDragMove = useStableCallback(handleNodeDragMove);
  const onItemDragEnd = useStableCallback(handleNodeDragEnd);
  const onCropPanStart = useCallback(() => beginChange('Crop'), [beginChange]);
  const onCropPan = useCallback(
    (id: string, crop: NonNullable<ImageItem['crop']>) => updateItemLive(id, { crop }),
    [updateItemLive],
  );

  const selected = items.find((i) => i.id === selectedId);
  const isTextSelected = selected?.type === 'text';
  const lockRatio = selected
    ? selected.type === 'sticker'
      ? true
      : isTextSelected
        ? false
        : lockAspectEnabled
    : false;
  const scale = display.scale;

  return (
    <div ref={wrapRef} className="canvas-area">
      <Stage
        ref={stageRef}
        width={canvas.width * scale}
        height={canvas.height * scale}
        scaleX={scale * viewScale}
        scaleY={scale * viewScale}
        x={viewX * scale}
        y={viewY * scale}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMM}
        onMouseUp={handleStageMU}
        onTouchStart={handleStageMouseDown}
        onTouchMove={handleStageMM}
        onTouchEnd={handleStageMU}
        className="stage-surface"
      >
        <Layer>
          <Group
            clipFunc={(ctx) =>
              drawShapePath(
                ctx as unknown as CanvasRenderingContext2D,
                canvas.width,
                canvas.height,
                'rect',
                canvas.frameCornerRadius ?? 0,
              )
            }
          >
            <Background canvas={canvas} />
            {items.map((item) => {
              if (item.type === 'text') {
                return (
                  <TextNode
                    key={item.id}
                    item={item}
                    // On touch, text is edited in a docked field and the
                    // node stays visible, updating live (TextEditOverlay).
                    isEditing={editingId === item.id && !coarsePointer}
                    locked={layoutLocked}
                    onSelect={onItemSelect}
                    inSelection={multi && selectedIds.includes(item.id)}
                    onChange={updateItem}
                    onStartEdit={startEditingText}
                    onNodeDragMove={onItemDragMove}
                    onNodeDragEnd={onItemDragEnd}
                  />
                );
              }
              if (item.type === 'sticker') {
                return (
                  <StickerNode
                    key={item.id}
                    item={item}
                    locked={layoutLocked}
                    onSelect={onItemSelect}
                    inSelection={multi && selectedIds.includes(item.id)}
                    onChange={updateItem}
                    onNodeDragMove={onItemDragMove}
                    onNodeDragEnd={onItemDragEnd}
                  />
                );
              }
              // Defensive: skip anything that isn't a recognized type rather
              // than crash ImageNode with data it doesn't expect. Covers
              // stale items from old saved projects/exported files (e.g. a
              // since-removed item type) gracefully.
              if (item.type !== 'image') return null;
              return (
                <ImageNode
                  key={item.id}
                  item={item}
                  isCropping={croppingId === item.id}
                  isDropTarget={dropTargetId === item.id}
                  locked={layoutLocked}
                  onSelect={onItemSelect}
                  inSelection={multi && selectedIds.includes(item.id)}
                  onChange={updateItem}
                  onNodeDragMove={onItemDragMove}
                  onNodeDragEnd={onItemDragEnd}
                  onCropPanStart={onCropPanStart}
                  onCropPan={onCropPan}
                  onCropPanEnd={commitChange}
                />
              );
            })}
          </Group>

          {/* Collage-wide border, drawn over the photos. Its path is inset by
              half the width so the whole stroke is inside the canvas (centred
              on the edge, half of it was cut off — and none at a rounded
              corner, so corners came out twice as thick as the sides), and
              it's clipped to the frame so a radius smaller than the border
              still gives a clean rounded corner. */}
          {(canvas.frameBorderWidth ?? 0) > 0 && (
            <Group
              listening={false}
              clipFunc={(ctx) =>
                drawShapePath(
                  ctx as unknown as CanvasRenderingContext2D,
                  canvas.width,
                  canvas.height,
                  'rect',
                  canvas.frameCornerRadius ?? 0,
                )
              }
            >
              <Shape
                width={canvas.width}
                height={canvas.height}
                stroke={canvas.frameBorderColor ?? '#ffffff'}
                strokeWidth={canvas.frameBorderWidth}
                listening={false}
                sceneFunc={(ctx, node) => {
                  drawShapePath(
                    ctx as unknown as CanvasRenderingContext2D,
                    canvas.width,
                    canvas.height,
                    'rect',
                    canvas.frameCornerRadius ?? 0,
                    (canvas.frameBorderWidth ?? 0) / 2,
                  );
                  ctx.fillStrokeShape(node);
                }}
              />
            </Group>
          )}

          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <Line
                key={`gx${i}`}
                points={[g.pos, 0, g.pos, canvas.height]}
                stroke="#ff7a59"
                strokeWidth={1 / (scale * viewScale)}
                listening={false}
                name={UI_OVERLAY}
              />
            ) : (
              <Line
                key={`gy${i}`}
                points={[0, g.pos, canvas.width, g.pos]}
                stroke="#ff7a59"
                strokeWidth={1 / (scale * viewScale)}
                listening={false}
                name={UI_OVERLAY}
              />
            ),
          )}

          <Transformer
            ref={trRef}
            rotateEnabled={!isCroppingSelected}
            rotationSnaps={ROTATION_SNAPS}
            rotationSnapTolerance={4}
            // Several items scale together from the corners, keeping their shapes.
            keepRatio={multi || lockRatio}
            enabledAnchors={
              isCroppingSelected
                ? []
                : multi
                  ? CORNER_ANCHORS
                  : isTextSelected
                    ? TEXT_ANCHORS
                    : lockRatio
                      ? CORNER_ANCHORS
                      : ALL_ANCHORS
            }
            onTransformEnd={() => {
              setGuides([]);
              finishMultiTransform();
            }}
            anchorStroke="#ff7a59"
            anchorFill="#ffffff"
            // Touch: small round handles set just outside the box (padding),
            // so they don't sit on a photo's rounded corners; the grab area
            // is a wide invisible hit stroke instead of a big visible square,
            // which covered the corners of anything shown small on a phone.
            anchorSize={coarsePointer ? TOUCH_ANCHOR_SIZE : 10}
            anchorCornerRadius={coarsePointer ? TOUCH_ANCHOR_SIZE / 2 : 0}
            anchorStyleFunc={coarsePointer ? touchAnchorStyle : undefined}
            padding={coarsePointer ? TOUCH_ANCHOR_SIZE / 2 : 0}
            borderStroke="#ff7a59"
            borderStrokeWidth={isCroppingSelected ? 3 : 1}
            borderDash={[4, 4]}
            boundBoxFunc={(oldBox, newBox) => {
              // Text only resizes horizontally (see TEXT_ANCHORS above), so its
              // height — a derived value, not a user-set one — must never gate
              // a width resize. Without this, a small fontSize (auto-height
              // under 24px) would silently reject every resize attempt.
              if (newBox.width < 24 || (!isTextSelected && newBox.height < 24)) return oldBox;

              // Resize snapping only for axis-aligned, non-ratio-locked boxes —
              // once rotated or ratio-locked, "left edge"/"right edge" stop being
              // independent and single-axis snapping would distort the shape.
              const rot = ((newBox.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
              const axisAligned = rot < 0.001 || rot > Math.PI * 2 - 0.001;
              const stage = stageRef.current;
              if (!snapEnabled || lockRatio || !axisAligned || !stage || !selected) {
                setGuides([]);
                return newBox;
              }

              const sx = stage.scaleX() || 1;
              const sy = stage.scaleY() || 1;
              const ox = stage.x();
              const oy = stage.y();
              const toLocalX = (abs: number) => (abs - ox) / sx;
              const toLocalY = (abs: number) => (abs - oy) / sy;
              const thresholdX = 6 / sx;
              const thresholdY = 6 / sy;

              const others = items.filter((i) => i.id !== selected.id).map(itemBox);
              const xTargets = collectSnapTargets(canvas.width, others, 'x');
              const yTargets = collectSnapTargets(canvas.height, others, 'y');

              const eps = 0.01;
              const leftMoving = Math.abs(newBox.x - oldBox.x) > eps;
              const rightMoving = Math.abs(newBox.x + newBox.width - (oldBox.x + oldBox.width)) > eps;
              const topMoving = Math.abs(newBox.y - oldBox.y) > eps;
              const bottomMoving = Math.abs(newBox.y + newBox.height - (oldBox.y + oldBox.height)) > eps;

              let outX = newBox.x;
              let outWidth = newBox.width;
              let outY = newBox.y;
              let outHeight = newBox.height;
              const newGuides: Guide[] = [];

              if (leftMoving) {
                const snapped = nearestSnapTarget(toLocalX(newBox.x), xTargets, thresholdX);
                if (snapped != null) {
                  const rightFixed = toLocalX(newBox.x + newBox.width);
                  outX = snapped * sx + ox;
                  outWidth = (rightFixed - snapped) * sx;
                  newGuides.push({ axis: 'x', pos: snapped });
                }
              } else if (rightMoving) {
                const snapped = nearestSnapTarget(toLocalX(newBox.x + newBox.width), xTargets, thresholdX);
                if (snapped != null) {
                  const leftFixed = toLocalX(newBox.x);
                  outWidth = (snapped - leftFixed) * sx;
                  newGuides.push({ axis: 'x', pos: snapped });
                }
              }

              if (topMoving) {
                const snapped = nearestSnapTarget(toLocalY(newBox.y), yTargets, thresholdY);
                if (snapped != null) {
                  const bottomFixed = toLocalY(newBox.y + newBox.height);
                  outY = snapped * sy + oy;
                  outHeight = (bottomFixed - snapped) * sy;
                  newGuides.push({ axis: 'y', pos: snapped });
                }
              } else if (bottomMoving) {
                const snapped = nearestSnapTarget(toLocalY(newBox.y + newBox.height), yTargets, thresholdY);
                if (snapped != null) {
                  const topFixed = toLocalY(newBox.y);
                  outHeight = (snapped - topFixed) * sy;
                  newGuides.push({ axis: 'y', pos: snapped });
                }
              }

              setGuides(newGuides);
              if (outWidth < 24 || (!isTextSelected && outHeight < 24)) return oldBox;
              return { ...newBox, x: outX, y: outY, width: outWidth, height: outHeight };
            }}
          />
          {marqueeBox && (
            <Rect
              {...marqueeBox}
              name={UI_OVERLAY}
              listening={false}
              fill="rgba(255, 122, 89, 0.08)"
              stroke="#ff7a59"
              strokeWidth={1 / (scale * viewScale)}
              dash={[4 / (scale * viewScale), 4 / (scale * viewScale)]}
            />
          )}
        </Layer>
      </Stage>
      <SelectionActions transformerRef={trRef} onOpenPanel={onOpenPanel} />
    </div>
  );
});

export default CanvasStage;
