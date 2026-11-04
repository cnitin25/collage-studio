import { memo, useEffect, useMemo, useRef } from 'react';
import { Group, Image as KonvaImage, Rect, Shape, Text } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { ImageItem } from '../../types';
import { refitCrop } from '../../utils/cover';
import { drawShapePath, traceShapePath } from '../../utils/shapes';
import { registerImageNode } from '../../utils/imageNodeRegistry';
import { filterPipeline, hasAdjustments } from '../../utils/adjustments';
import { UI_OVERLAY } from './overlay';

// Memoized, with callbacks that take the item's id (see TextNode).
interface Props {
  item: ImageItem;
  isCropping: boolean;
  isDropTarget: boolean;
  locked: boolean;
  onSelect: (id: string, e?: KonvaEventObject<Event>) => void;
  /** One of several selected items: the selection is transformed as a whole (CanvasStage). */
  inSelection: boolean;
  onChange: (id: string, patch: Partial<ImageItem>) => void; // committed (history)
  onNodeDragMove: (id: string, node: Konva.Node) => void;
  onNodeDragEnd: (id: string, node: Konva.Node) => void;
  onCropPanStart: () => void;
  onCropPan: (id: string, crop: NonNullable<ImageItem['crop']>) => void; // live
  onCropPanEnd: () => void;
}

const MIN = 24;

/** Decorative border made of repeated glyphs tiled around the perimeter. */
function GlyphBorder({
  w,
  h,
  glyph,
  color,
  weight,
}: {
  w: number;
  h: number;
  glyph: string;
  color: string;
  weight: number;
}) {
  const fs = Math.max(12, weight * 1.8);
  const step = fs * 1.1;
  // Glyph centres run round a rectangle inset by half a glyph, so the border
  // sits inside the photo like the solid ones do.
  const inset = fs / 2;
  const iw = Math.max(0, w - fs);
  const ih = Math.max(0, h - fs);
  const nx = Math.max(1, Math.round(iw / step));
  const ny = Math.max(1, Math.round(ih / step));
  const sx = iw / nx;
  const sy = ih / ny;
  const pts: Array<{ key: string; x: number; y: number }> = [];
  for (let i = 0; i <= nx; i++) {
    pts.push({ key: `t${i}`, x: inset + i * sx, y: inset });
    pts.push({ key: `b${i}`, x: inset + i * sx, y: h - inset });
  }
  for (let j = 1; j < ny; j++) {
    pts.push({ key: `l${j}`, x: inset, y: inset + j * sy });
    pts.push({ key: `r${j}`, x: w - inset, y: inset + j * sy });
  }
  return (
    <Group listening={false}>
      {pts.map((p) => (
        <Text
          key={p.key}
          text={glyph}
          x={p.x}
          y={p.y}
          fontSize={fs}
          fontStyle="bold"
          fill={color}
          width={fs}
          height={fs}
          offsetX={fs / 2}
          offsetY={fs / 2}
          align="center"
          verticalAlign="middle"
        />
      ))}
    </Group>
  );
}

/**
 * Stands in for a photo whose image is gone (nothing stored for it, or it no
 * longer loads), so the gap explains itself. Editor-only, like the other
 * overlays: an export shows the gap, not this.
 */
function MissingPhoto({ w, h }: { w: number; h: number }) {
  const fontSize = Math.max(11, Math.min(26, Math.min(w, h) / 9));
  return (
    <Group name={`${UI_OVERLAY} missing-photo`} listening={false}>
      <Rect width={w} height={h} fill="#e4e6eb" />
      <Rect
        x={1.5}
        y={1.5}
        width={Math.max(0, w - 3)}
        height={Math.max(0, h - 3)}
        stroke="#8a909c"
        strokeWidth={3}
        dash={[10, 7]}
      />
      <Text
        width={w}
        height={h}
        padding={10}
        align="center"
        verticalAlign="middle"
        lineHeight={1.35}
        fontFamily="Inter, system-ui, sans-serif"
        fontSize={fontSize}
        fill="#4a4f5a"
        text={'Photo missing\nSelect it and use Replace'}
      />
    </Group>
  );
}

function ImageNode({
  item,
  inSelection,
  isCropping,
  isDropTarget,
  locked,
  onSelect,
  onChange,
  onNodeDragMove,
  onNodeDragEnd,
  onCropPanStart,
  onCropPan,
  onCropPanEnd,
}: Props) {
  const [image, status] = useImage(item.src);
  // Nothing was stored for it (openProject found no image), or it no longer loads.
  const missing = !item.src || status === 'failed';
  const groupRef = useRef<Konva.Group>(null);
  const imgRef = useRef<Konva.Image>(null);
  const borderRef = useRef<Konva.Shape>(null);

  const f = item.filters ?? {};
  const hasFilters = hasAdjustments(item.filters);
  // Rebuilt whenever the filters change: they are replaced, never edited in
  // place, so moving or resizing the photo keeps the same object and skips this.
  const filters = useMemo(() => filterPipeline(item.filters ?? {}), [item.filters]);

  // Expose the rendered node so sidebar panels (e.g. the histogram) can read
  // its current filtered/cropped pixels, not just the original source file.
  // Registered only once the image has loaded: before that the node draws
  // nothing, and a histogram read from it came back empty and stayed empty.
  // Unregistered, the histogram falls back to reading the source file.
  useEffect(() => {
    registerImageNode(item.id, image ? imgRef.current : null);
    return () => registerImageNode(item.id, null);
  }, [item.id, image]);

  // (Re)cache the image so Konva filters have a base to work on. Clear when none.
  useEffect(() => {
    const node = imgRef.current;
    if (!node || !image) return;
    if (hasFilters) node.cache();
    else node.clearCache();
    node.getLayer()?.batchDraw();
  }, [
    image,
    item.width,
    item.height,
    item.crop?.x,
    item.crop?.y,
    item.crop?.width,
    item.crop?.height,
    hasFilters,
  ]);

  // ---- crop pan (drag the photo to reposition the visible region) ----
  const panStart = useRef<{ px: number; py: number; crop: NonNullable<ImageItem['crop']> } | null>(
    null,
  );
  const lockedAbs = useRef<{ x: number; y: number } | null>(null);

  // Where the pointer went DOWN. Konva fires dragstart on the first move, so
  // measuring from the dragstart position dropped that first step and left
  // the photo trailing the pointer for the rest of the drag.
  const pressPoint = useRef<{ x: number; y: number } | null>(null);
  const handlePress = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    pressPoint.current = e.target.getStage()?.getPointerPosition() ?? null;
  };

  const handlePanStart = (e: KonvaEventObject<DragEvent>) => {
    if (!item.crop) return;
    const stage = e.target.getStage();
    const p = pressPoint.current ?? stage?.getPointerPosition();
    if (!p) return;
    lockedAbs.current = e.target.getAbsolutePosition();
    panStart.current = { px: p.x, py: p.y, crop: { ...item.crop } };
    onCropPanStart();
  };

  const handlePanMove = (e: KonvaEventObject<DragEvent>) => {
    const stage = e.target.getStage();
    const p = stage?.getPointerPosition();
    if (!stage || !p || !panStart.current) return;
    const scale = stage.scaleX() || 1;
    const sdx = (p.x - panStart.current.px) / scale;
    const sdy = (p.y - panStart.current.py) / scale;
    // Pointer movement is in canvas axes; the crop lives in the photo's own
    // axes. Undo the item's rotation, then its flips, so the photo follows the
    // pointer — otherwise a flipped photo moved against the drag, and a
    // rotated one moved along the wrong axis.
    const r = (-item.rotation * Math.PI) / 180;
    let dx = sdx * Math.cos(r) - sdy * Math.sin(r);
    let dy = sdx * Math.sin(r) + sdy * Math.cos(r);
    if (item.flipX) dx = -dx;
    if (item.flipY) dy = -dy;
    const c = panStart.current.crop;
    const fx = c.width / item.width;
    const fy = c.height / item.height;
    const nx = Math.max(0, Math.min(c.x - dx * fx, item.naturalWidth - c.width));
    const ny = Math.max(0, Math.min(c.y - dy * fy, item.naturalHeight - c.height));
    onCropPan(item.id, { x: nx, y: ny, width: c.width, height: c.height });
  };

  const handlePanEnd = () => {
    panStart.current = null;
    pressPoint.current = null;
    lockedAbs.current = null;
    onCropPanEnd();
  };

  // While a handle is dragged Konva scales the whole group, so the photo used
  // to stretch until release. Recrop it to the box it's being dragged to (a
  // crop of that aspect, scaled, comes out undistorted), and counter-scale the
  // border so its width stays even. handleTransformEnd bakes in the same crop.
  const handleTransform = () => {
    if (inSelection) return;
    const g = groupRef.current;
    const img = imgRef.current;
    if (!g || !img) return;
    const sx = g.scaleX();
    const sy = g.scaleY();
    if (Math.abs(sx - 1) < 1e-6 && Math.abs(sy - 1) < 1e-6) return; // rotating
    const w = Math.max(MIN, item.width * sx);
    const h = Math.max(MIN, item.height * sy);
    img.crop(refitCrop(item.naturalWidth, item.naturalHeight, item.crop, item.width, item.height, w, h));
    if (img.isCached()) img.cache(); // filters draw from the cache
    borderRef.current?.setAttrs({ width: w, height: h, scaleX: 1 / sx, scaleY: 1 / sy });
  };

  const handleTransformEnd = () => {
    if (inSelection) return;
    const g = groupRef.current;
    if (!g) return;
    const sx = g.scaleX();
    const sy = g.scaleY();
    g.scaleX(1);
    g.scaleY(1);
    // Its size comes back through props on the re-render; the scale doesn't.
    borderRef.current?.scale({ x: 1, y: 1 });
    const width = Math.max(MIN, item.width * sx);
    const height = Math.max(MIN, item.height * sy);
    const patch: Partial<ImageItem> = {
      x: g.x(),
      y: g.y(),
      width,
      height,
      rotation: g.rotation(),
    };
    // Always crop to the new box: keeps any crop zoom/centre the user set, and
    // for a never-cropped photo crops it to its new shape instead of letting
    // Konva stretch the whole image into it.
    patch.crop = refitCrop(item.naturalWidth, item.naturalHeight, item.crop, item.width, item.height, width, height);
    onChange(item.id, patch);
  };

  const shape = item.clipShape ?? 'rect';
  const radius = shape === 'rect' ? item.cornerRadius ?? 0 : 0;
  const opacity = (item.opacity ?? 100) / 100;
  const borderWidth = item.borderWidth ?? 0;
  const drawPath = (ctx: Konva.Context, inset = 0) =>
    drawShapePath(ctx as unknown as CanvasRenderingContext2D, item.width, item.height, shape, radius, inset);

  return (
    <Group
      id={item.id}
      name="item"
      ref={groupRef}
      x={item.x}
      y={item.y}
      rotation={item.rotation}
      draggable={!isCropping && !locked}
      onClick={(e) => onSelect(item.id, e)}
      onTap={(e) => onSelect(item.id, e)}
      onDragMove={(e) => {
        if (isCropping) return;
        onNodeDragMove(item.id, e.target);
      }}
      onDragEnd={(e) => {
        if (isCropping) return;
        onNodeDragEnd(item.id, e.target);
      }}
      onTransform={handleTransform}
      onTransformEnd={handleTransformEnd}
    >
      {/* Shadow caster behind the photo (per-shape shadow renders reliably).
          Shadow only: the caster's own fill lies under the photo, where a
          translucent photo showed it, so the photo's shape is clipped out
          (even-odd, inside a margin wider than any blur). The shadow fades
          with the photo. */}
      {item.shadow && (
        <Shape
          width={item.width}
          height={item.height}
          fill="#000000"
          shadowColor={item.shadow.color}
          shadowBlur={item.shadow.blur}
          shadowOpacity={item.shadow.opacity * opacity}
          shadowOffsetX={item.shadow.offsetX}
          shadowOffsetY={item.shadow.offsetY}
          listening={false}
          sceneFunc={(ctx, node) => {
            const sh = item.shadow!;
            const pad = 3 * sh.blur + Math.abs(sh.offsetX) + Math.abs(sh.offsetY) + 10;
            ctx.save();
            ctx.beginPath();
            ctx.rect(-pad, -pad, item.width + 2 * pad, item.height + 2 * pad);
            traceShapePath(ctx as unknown as CanvasRenderingContext2D, item.width, item.height, shape, radius);
            ctx.clip('evenodd');
            drawPath(ctx);
            ctx.fillStrokeShape(node);
            ctx.restore();
          }}
        />
      )}

      {/* Clipped photo, and its border: inset by half its width so the whole
          stroke sits inside the photo (centred on the edge, half of it
          spilled into the gaps between photos and was cut off at the canvas
          edge), and clipped with it, so a corner radius smaller than the
          border still leaves a rounded corner. */}
      <Group clipFunc={(ctx) => drawPath(ctx)}>
        <KonvaImage
          ref={imgRef}
          image={image}
          x={item.flipX ? item.width : 0}
          y={item.flipY ? item.height : 0}
          width={item.width}
          height={item.height}
          scaleX={item.flipX ? -1 : 1}
          scaleY={item.flipY ? -1 : 1}
          crop={item.crop}
          opacity={opacity}
          filters={filters}
          // Konva's own filters read these off the node (utils/adjustments).
          contrast={f.contrast ?? 0}
          saturation={(f.saturation ?? 0) / 50}
          hue={-(f.hue ?? 0)}
          enhance={(f.enhance ?? 0) / 100}
          // In canvas px: Konva scales it to the cache's pixel ratio itself, so
          // it's the same on every screen and in 2x/3x exports.
          blurRadius={f.blur ?? 0}
          draggable={isCropping}
          dragBoundFunc={() =>
            lockedAbs.current ?? imgRef.current?.getAbsolutePosition() ?? { x: 0, y: 0 }
          }
          onMouseDown={handlePress}
          onTouchStart={handlePress}
          onDragStart={handlePanStart}
          onDragMove={handlePanMove}
          onDragEnd={handlePanEnd}
        />
        {missing && <MissingPhoto w={item.width} h={item.height} />}
        {borderWidth > 0 && (item.borderStyle ?? 'solid') !== 'glyph' && (
          <Shape
            ref={borderRef}
            width={item.width}
            height={item.height}
            stroke={item.borderColor ?? '#ffffff'}
            strokeWidth={borderWidth}
            dash={
              item.borderStyle === 'dashed'
                ? [borderWidth * 2.4, borderWidth * 1.6]
                : item.borderStyle === 'dotted'
                  ? [0.01, borderWidth * 1.9]
                  : undefined
            }
            lineCap={item.borderStyle === 'dotted' ? 'round' : 'butt'}
            listening={false}
            // The node's own size, not item's: mid-resize it's the live box.
            sceneFunc={(ctx, node) => {
              drawShapePath(
                ctx as unknown as CanvasRenderingContext2D,
                node.width(),
                node.height(),
                shape,
                radius,
                borderWidth / 2,
              );
              ctx.fillStrokeShape(node);
            }}
          />
        )}
      </Group>
      {borderWidth > 0 && item.borderStyle === 'glyph' && (
        <GlyphBorder
          w={item.width}
          h={item.height}
          glyph={item.borderGlyph || '✕'}
          color={item.borderColor ?? '#ffffff'}
          weight={item.borderWidth ?? 1}
        />
      )}

      {/* Crop-mode hint outline. */}
      {isCropping && (
        <Rect
          x={0}
          y={0}
          width={item.width}
          height={item.height}
          cornerRadius={radius}
          stroke="#ff7a59"
          strokeWidth={2}
          dash={[6, 4]}
          listening={false}
          name={UI_OVERLAY}
        />
      )}

      {/* Swap drop-target highlight. */}
      {isDropTarget && (
        <Rect
          x={0}
          y={0}
          width={item.width}
          height={item.height}
          cornerRadius={radius}
          fill="rgba(255,122,89,0.22)"
          stroke="#ff7a59"
          strokeWidth={3}
          listening={false}
          name={UI_OVERLAY}
        />
      )}
    </Group>
  );
}

export default memo(ImageNode);
