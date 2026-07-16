import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Stage, Layer, Group, Line, Shape, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEditorStore } from '../../store/useEditorStore';
import ImageNode from './ImageNode';
import TextNode from './TextNode';
import StickerNode from './StickerNode';
import Background from './Background';
import { drawShapePath } from '../../utils/shapes';
import type { CollageItem } from '../../types';
import { computeSnap, type Box, type Guide } from '../../utils/snap';

export interface CanvasHandle {
  getStage: () => Konva.Stage | null;
  getDisplayScale: () => number;
  /**
   * Render the stage to a data URL at its TRUE canvas framing, ignoring any
   * current pan/zoom. Without this, toDataURL() would capture whatever is
   * currently visible in the viewport — if the user had panned or zoomed out,
   * the capture would be mostly empty space (transparent → solid black in JPEG).
   */
  exportDataURL: (opts: {
    mimeType: 'image/png' | 'image/jpeg';
    quality?: number;
    pixelRatioMultiplier?: number;
  }) => string | null;
}

const CORNER_ANCHORS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
const ALL_ANCHORS = [
  'top-left', 'top-center', 'top-right', 'middle-left',
  'middle-right', 'bottom-left', 'bottom-center', 'bottom-right',
];

function itemBox(it: CollageItem): Box {
  if (it.type === 'sticker') return { x: it.x, y: it.y, width: it.fontSize, height: it.fontSize };
  if (it.type === 'text') return { x: it.x, y: it.y, width: it.width, height: it.fontSize * 1.3 };
  return { x: it.x, y: it.y, width: it.width, height: it.height };
}

const CanvasStage = forwardRef<CanvasHandle>(function CanvasStage(_props, ref) {
  const canvas = useEditorStore((s) => s.canvas);
  const items = useEditorStore((s) => s.items);
  const selectedId = useEditorStore((s) => s.selectedId);
  const croppingId = useEditorStore((s) => s.croppingId);
  const editingId = useEditorStore((s) => s.editingId);
  const layoutLocked = useEditorStore((s) => s.layoutLocked);
  const snapEnabled = useEditorStore((s) => s.snapEnabled);
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
  const [coarsePointer, setCoarsePointer] = useState(
    () => window.matchMedia?.('(pointer: coarse)').matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const onChange = () => setCoarsePointer(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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

  useImperativeHandle(ref, () => ({
    getStage: () => stageRef.current,
    getDisplayScale: () => display.scale * viewScale,
    exportDataURL: ({ mimeType, quality, pixelRatioMultiplier = 1 }) => {
      const stage = stageRef.current;
      if (!stage) return null;
      // Neutralize pan/zoom so the capture always frames the full canvas,
      // regardless of what the user currently has zoomed/panned to on screen.
      const savedScale = { x: stage.scaleX(), y: stage.scaleY() };
      const savedPos = { x: stage.x(), y: stage.y() };
      stage.scale({ x: display.scale, y: display.scale });
      stage.position({ x: 0, y: 0 });
      stage.batchDraw();
      let uri: string | null = null;
      try {
        const pixelRatio = (1 / display.scale) * pixelRatioMultiplier;
        uri = stage.toDataURL({ mimeType, quality, pixelRatio });
      } finally {
        stage.scale(savedScale);
        stage.position(savedPos);
        stage.batchDraw();
      }
      return uri;
    },
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
      const mouseX = (pointer.x / display.scale - viewX) / viewScale;
      const mouseY = (pointer.y / display.scale - viewY) / viewScale;
      setView(newScale, mouseX - mouseX * newScale, mouseY - mouseY * newScale);
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

  const touchPoint = (t: Touch) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    return { x: t.clientX - (rect?.left ?? 0), y: t.clientY - (rect?.top ?? 0) };
  };

  const handleStageMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const te = e.evt as TouchEvent;
    if ('touches' in te && te.touches.length === 2) {
      // A second finger landing mid-drag would otherwise leave the item
      // jumping once the gesture ends — cancel any in-progress drag first.
      stageRef.current?.stopDrag();
      const p0 = touchPoint(te.touches[0]);
      const p1 = touchPoint(te.touches[1]);
      gesture.current = {
        startDist: Math.hypot(p1.x - p0.x, p1.y - p0.y),
        startScale: viewScale,
        startCx: (p0.x + p1.x) / 2,
        startCy: (p0.y + p1.y) / 2,
        startViewX: viewX,
        startViewY: viewY,
      };
      return;
    }
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

  const handleStageMM = (e?: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const te = e?.evt as TouchEvent | undefined;
    if (gesture.current && te && 'touches' in te && te.touches.length === 2) {
      te.preventDefault();
      const g = gesture.current;
      const p0 = touchPoint(te.touches[0]);
      const p1 = touchPoint(te.touches[1]);
      const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      const ratio = g.startDist > 0 ? dist / g.startDist : 1;
      const newScale = Math.max(0.1, Math.min(8, g.startScale * ratio));
      const contentX = (g.startCx / display.scale - g.startViewX) / g.startScale;
      const contentY = (g.startCy / display.scale - g.startViewY) / g.startScale;
      const panDX = (cx - g.startCx) / display.scale;
      const panDY = (cy - g.startCy) / display.scale;
      setView(newScale, contentX - contentX * newScale + panDX, contentY - contentY * newScale + panDY);
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

  const handleStageMU = (e?: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const te = e?.evt as TouchEvent | undefined;
    if (gesture.current) {
      if (!te || !('touches' in te) || te.touches.length < 2) gesture.current = null;
      return;
    }
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

    if (item.type === 'image') {
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
    if (item?.type === 'image' && dropTargetId && dropTargetId !== id) {
      swapItems(id, dropTargetId);
    } else {
      updateItem(id, { x: node.x(), y: node.y() });
    }
    setDropTargetId(null);
  };

  const selected = items.find((i) => i.id === selectedId);
  const lockRatio = selected
    ? selected.type === 'text' || selected.type === 'sticker'
      ? true
      : !!selected.lockAspect
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
                    isEditing={editingId === item.id}
                    locked={layoutLocked}
                    onSelect={() => select(item.id)}
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
                    onSelect={() => select(item.id)}
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
                  onSelect={() => select(item.id)}
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
              />
            ) : (
              <Line
                key={`gy${i}`}
                points={[0, g.pos, canvas.width, g.pos]}
                stroke="#ff7a59"
                strokeWidth={1 / scale}
                listening={false}
              />
            ),
          )}

          <Transformer
            ref={trRef}
            rotateEnabled={!isCroppingSelected}
            keepRatio={lockRatio}
            enabledAnchors={isCroppingSelected ? [] : lockRatio ? CORNER_ANCHORS : ALL_ANCHORS}
            anchorStroke="#ff7a59"
            anchorFill="#ffffff"
            anchorSize={coarsePointer ? 22 : 10}
            borderStroke="#ff7a59"
            borderStrokeWidth={isCroppingSelected ? 3 : 1}
            borderDash={[4, 4]}
            boundBoxFunc={(oldBox, newBox) =>
              newBox.width < 24 || newBox.height < 24 ? oldBox : newBox
            }
          />
        </Layer>
      </Stage>
    </div>
  );
});

export default CanvasStage;
