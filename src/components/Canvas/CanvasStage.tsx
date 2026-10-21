import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Stage, Layer, Group, Line, Shape, Transformer } from 'react-konva';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEditorStore } from '../../store/useEditorStore';
import ImageNode from './ImageNode';
import TextNode from './TextNode';
import StickerNode from './StickerNode';
import Background from './Background';
import { drawShapePath } from '../../utils/shapes';
import type { CollageItem } from '../../types';
import { computeSnap, collectSnapTargets, nearestSnapTarget, type Box, type Guide } from '../../utils/snap';
import { itemSize } from '../../utils/itemBox';
import { UI_OVERLAY } from './overlay';
import { COARSE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';

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

const TOUCH_ANCHOR_SIZE = 12;
/** ~40 px touch target around a 12 px dot (hit stroke is centred on the edge). */
const touchAnchorStyle = (anchor: Konva.Rect) => anchor.hitStrokeWidth(28);

function itemBox(it: CollageItem): Box {
  return { x: it.x, y: it.y, ...itemSize(it) };
}

const CanvasStage = forwardRef<CanvasHandle>(function CanvasStage(_props, ref) {
  const canvas = useEditorStore((s) => s.canvas);
  const items = useEditorStore((s) => s.items);
  const selectedId = useEditorStore((s) => s.selectedId);
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
  const [guides, setGuides] = useState<Guide[]>([]);
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
    // capture and restore afterwards. Blur runs on raw cache pixels, so its
    // radius has to scale with the cache too (ImageNode/Background set it
    // as canvas px × Konva.pixelRatio for the on-screen cache).
    const exportRatio = pixelRatioMultiplier;
    const recache =
      exportRatio > Konva.pixelRatio
        ? stage.find<Konva.Image>('Image').filter((n) => n.isCached())
        : [];
    const savedBlur = recache.map((n) => n.blurRadius());
    recache.forEach((n, i) => {
      n.blurRadius((savedBlur[i] / Konva.pixelRatio) * exportRatio);
      n.cache({ pixelRatio: exportRatio });
    });

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
      recache.forEach((n, i) => {
        n.blurRadius(savedBlur[i]);
        n.cache();
      });
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

  // Keyboard: track Space for pan mode
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        spaceDown.current = true;
        if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false;
        isPanning.current = false;
        if (wrapRef.current) wrapRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  // Ctrl+scroll to zoom, Space+drag to pan
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.max(0.1, Math.min(8, viewScale * factor));
      // Canvas point under the cursor, then the view offset that puts that
      // same point back under the cursor at the new scale. (Solving for
      // `mouseX - mouseX * newScale` instead only held from the neutral view —
      // once zoomed, zooming again anywhere else made the content jump.)
      const mouseX = (pointer.x / display.scale - viewX) / viewScale;
      const mouseY = (pointer.y / display.scale - viewY) / viewScale;
      setView(
        newScale,
        pointer.x / display.scale - mouseX * newScale,
        pointer.y / display.scale - mouseY * newScale,
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [display.scale, viewScale, viewX, viewY, setView]);

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
  const selectFromCanvas = (id: string) => {
    if (gesture.current || performance.now() < suppressTapUntil.current) return;
    select(id);
  };

  // Pinch listeners live on .canvas-area rather than the Konva stage, so a
  // pinch that starts in the margin around a small or zoomed-out canvas still
  // zooms. They're registered once and read the latest view through a ref.
  const latestView = useRef({ viewScale, viewX, viewY, displayScale: display.scale });
  latestView.current = { viewScale, viewX, viewY, displayScale: display.scale };
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
    const clickedEmpty = target === target.getStage() || target.attrs.name === 'background';
    if (clickedEmpty) select(null);
  };

  const handleStageMM = () => {
    if (gesture.current) return;
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
    if (isPanning.current) {
      isPanning.current = false;
      panStart.current = null;
      if (wrapRef.current) wrapRef.current.style.cursor = spaceDown.current ? 'grab' : '';
    }
  };

  useEffect(() => {
    let cancelled = false;
    document.fonts?.ready.then(() => {
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
    if (!selectedId || editingId || layoutLocked) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = stage.findOne<Konva.Node>(`#${selectedId}`);
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, editingId, layoutLocked, items]);

  const isCroppingSelected = !!croppingId && croppingId === selectedId;

  const handleNodeDragMove = (id: string, node: Konva.Node) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const box = itemBox(item);
    box.x = node.x();
    box.y = node.y();

    if (snapEnabled) {
      const others = items.filter((i) => i.id !== id).map(itemBox);
      const threshold = 6 / display.scale;
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
    const item = items.find((i) => i.id === id);
    if (swapModeEnabled && item?.type === 'image' && dropTargetId && dropTargetId !== id) {
      swapItems(id, dropTargetId);
    } else {
      updateItem(id, { x: node.x(), y: node.y() });
    }
    setDropTargetId(null);
  };

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
                    onSelect={() => selectFromCanvas(item.id)}
                    onChange={(patch) => updateItem(item.id, patch)}
                    onStartEdit={() => startEditingText(item.id)}
                    onNodeDragMove={handleNodeDragMove}
                    onNodeDragEnd={handleNodeDragEnd}
                  />
                );
              }
              if (item.type === 'sticker') {
                return (
                  <StickerNode
                    key={item.id}
                    item={item}
                    locked={layoutLocked}
                    onSelect={() => selectFromCanvas(item.id)}
                    onChange={(patch) => updateItem(item.id, patch)}
                    onNodeDragMove={handleNodeDragMove}
                    onNodeDragEnd={handleNodeDragEnd}
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
                  onSelect={() => selectFromCanvas(item.id)}
                  onChange={(patch) => updateItem(item.id, patch)}
                  onNodeDragMove={handleNodeDragMove}
                  onNodeDragEnd={handleNodeDragEnd}
                  onCropPanStart={() => beginChange('Crop')}
                  onCropPan={(crop) => updateItemLive(item.id, { crop })}
                  onCropPanEnd={commitChange}
                />
              );
            })}
          </Group>

          {/* Collage-wide border, drawn on top so it isn't clipped by the group above. */}
          {(canvas.frameBorderWidth ?? 0) > 0 && (
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
                );
                ctx.fillStrokeShape(node);
              }}
            />
          )}

          {guides.map((g, i) =>
            g.axis === 'x' ? (
              <Line
                key={`gx${i}`}
                points={[g.pos, 0, g.pos, canvas.height]}
                stroke="#ff7a59"
                strokeWidth={1 / scale}
                listening={false}
                name={UI_OVERLAY}
              />
            ) : (
              <Line
                key={`gy${i}`}
                points={[0, g.pos, canvas.width, g.pos]}
                stroke="#ff7a59"
                strokeWidth={1 / scale}
                listening={false}
                name={UI_OVERLAY}
              />
            ),
          )}

          <Transformer
            ref={trRef}
            rotateEnabled={!isCroppingSelected}
            keepRatio={lockRatio}
            enabledAnchors={
              isCroppingSelected ? [] : isTextSelected ? TEXT_ANCHORS : lockRatio ? CORNER_ANCHORS : ALL_ANCHORS
            }
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
            onTransformEnd={() => setGuides([])}
          />
        </Layer>
      </Stage>
    </div>
  );
});

export default CanvasStage;
