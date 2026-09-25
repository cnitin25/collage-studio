import { useEffect, useMemo, useRef } from 'react';
import { Group, Image as KonvaImage, Rect, Shape, Text } from 'react-konva';
import useImage from 'use-image';
import Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { ImageItem } from '../../types';
import { refitCrop } from '../../utils/cover';
import { drawShapePath } from '../../utils/shapes';
import { registerImageNode } from '../../utils/imageNodeRegistry';

interface Props {
  item: ImageItem;
  isCropping: boolean;
  isDropTarget: boolean;
  locked: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<ImageItem>) => void; // committed (history)
  onNodeDragMove: (id: string, node: Konva.Node) => void;
  onNodeDragEnd: (id: string, node: Konva.Node) => void;
  onCropPanStart: () => void;
  onCropPan: (crop: NonNullable<ImageItem['crop']>) => void; // live
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
  const nx = Math.max(1, Math.round(w / step));
  const ny = Math.max(1, Math.round(h / step));
  const sx = w / nx;
  const sy = h / ny;
  const pts: Array<{ key: string; x: number; y: number }> = [];
  for (let i = 0; i <= nx; i++) {
    pts.push({ key: `t${i}`, x: i * sx, y: 0 });
    pts.push({ key: `b${i}`, x: i * sx, y: h });
  }
  for (let j = 1; j < ny; j++) {
    pts.push({ key: `l${j}`, x: 0, y: j * sy });
    pts.push({ key: `r${j}`, x: w, y: j * sy });
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

export default function ImageNode({
  item,
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
  const [image] = useImage(item.src);
  const groupRef = useRef<Konva.Group>(null);
  const imgRef = useRef<Konva.Image>(null);

  const f = item.filters ?? {};
  const hasFilters = !!(
    f.brightness ||
    f.contrast ||
    f.saturation ||
    f.hue ||
    f.enhance ||
    f.grayscale ||
    f.sepia ||
    f.blur
  );

  const filters = useMemo(() => {
    const list: Array<typeof Konva.Filters.Brighten> = [];
    if (f.brightness) list.push(Konva.Filters.Brighten);
    if (f.contrast) list.push(Konva.Filters.Contrast);
    if (f.hue || f.saturation) list.push(Konva.Filters.HSL);
    if (f.enhance) list.push(Konva.Filters.Enhance);
    // Grayscale and sepia are mutually exclusive full-image recolors —
    // applied last among color ops, after any brightness/contrast/hue shift.
    if (f.grayscale) list.push(Konva.Filters.Grayscale);
    else if (f.sepia) list.push(Konva.Filters.Sepia);
    if (f.blur) list.push(Konva.Filters.Blur);
    return list;
  }, [f.brightness, f.contrast, f.saturation, f.hue, f.enhance, f.grayscale, f.sepia, f.blur]);

  // Expose the rendered node so sidebar panels (e.g. the histogram) can read
  // its current filtered/cropped pixels, not just the original source file.
  useEffect(() => {
    registerImageNode(item.id, imgRef.current);
    return () => registerImageNode(item.id, null);
  }, [item.id]);

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

  const handlePanStart = (e: KonvaEventObject<DragEvent>) => {
    if (!item.crop) return;
    const stage = e.target.getStage();
    const p = stage?.getPointerPosition();
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
    const dx = (p.x - panStart.current.px) / scale;
    const dy = (p.y - panStart.current.py) / scale;
    const c = panStart.current.crop;
    const fx = c.width / item.width;
    const fy = c.height / item.height;
    const nx = Math.max(0, Math.min(c.x - dx * fx, item.naturalWidth - c.width));
    const ny = Math.max(0, Math.min(c.y - dy * fy, item.naturalHeight - c.height));
    onCropPan({ x: nx, y: ny, width: c.width, height: c.height });
  };

  const handlePanEnd = () => {
    panStart.current = null;
    lockedAbs.current = null;
    onCropPanEnd();
  };

  const handleTransformEnd = () => {
    const g = groupRef.current;
    if (!g) return;
    const sx = g.scaleX();
    const sy = g.scaleY();
    g.scaleX(1);
    g.scaleY(1);
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
    onChange(patch);
  };

  const shape = item.clipShape ?? 'rect';
  const radius = shape === 'rect' ? item.cornerRadius ?? 0 : 0;
  const drawPath = (ctx: Konva.Context) =>
    drawShapePath(ctx as unknown as CanvasRenderingContext2D, item.width, item.height, shape, radius);

  return (
    <Group
      id={item.id}
      name="item"
      ref={groupRef}
      x={item.x}
      y={item.y}
      rotation={item.rotation}
      draggable={!isCropping && !locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) => {
        if (isCropping) return;
        onNodeDragMove(item.id, e.target);
      }}
      onDragEnd={(e) => {
        if (isCropping) return;
        onNodeDragEnd(item.id, e.target);
      }}
      onTransformEnd={handleTransformEnd}
    >
      {/* Shadow caster behind the photo (per-shape shadow renders reliably). */}
      {item.shadow && (
        <Shape
          width={item.width}
          height={item.height}
          fill={item.borderColor ?? '#000000'}
          shadowColor={item.shadow.color}
          shadowBlur={item.shadow.blur}
          shadowOpacity={item.shadow.opacity}
          shadowOffsetX={item.shadow.offsetX}
          shadowOffsetY={item.shadow.offsetY}
          listening={false}
          sceneFunc={(ctx, node) => {
            drawPath(ctx);
            ctx.fillStrokeShape(node);
          }}
        />
      )}

      {/* Clipped photo. */}
      <Group clipFunc={drawPath}>
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
          opacity={(item.opacity ?? 100) / 100}
          filters={filters}
          brightness={(f.brightness ?? 0) / 100}
          contrast={f.contrast ?? 0}
          saturation={(f.saturation ?? 0) / 50}
          hue={-(f.hue ?? 0)}
          enhance={(f.enhance ?? 0) / 100}
          // Konva blurs raw cache pixels, and the cache is made at the screen's
          // pixel ratio — scale so the blur is the same in canvas px on every
          // screen and in exports (CanvasStage re-scales it for 2x/3x export).
          blurRadius={(f.blur ?? 0) * Konva.pixelRatio}
          draggable={isCropping}
          dragBoundFunc={() =>
            lockedAbs.current ?? imgRef.current?.getAbsolutePosition() ?? { x: 0, y: 0 }
          }
          onDragStart={handlePanStart}
          onDragMove={handlePanMove}
          onDragEnd={handlePanEnd}
        />
      </Group>

      {/* Border, drawn on top so it isn't clipped away. */}
      {(item.borderWidth ?? 0) > 0 && (item.borderStyle ?? 'solid') !== 'glyph' && (
        <Shape
          width={item.width}
          height={item.height}
          stroke={item.borderColor ?? '#ffffff'}
          strokeWidth={item.borderWidth}
          dash={
            item.borderStyle === 'dashed'
              ? [(item.borderWidth ?? 1) * 2.4, (item.borderWidth ?? 1) * 1.6]
              : item.borderStyle === 'dotted'
                ? [0.01, (item.borderWidth ?? 1) * 1.9]
                : undefined
          }
          lineCap={item.borderStyle === 'dotted' ? 'round' : 'butt'}
          listening={false}
          sceneFunc={(ctx, node) => {
            drawPath(ctx);
            ctx.fillStrokeShape(node);
          }}
        />
      )}
      {(item.borderWidth ?? 0) > 0 && item.borderStyle === 'glyph' && (
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
        />
      )}
    </Group>
  );
}
