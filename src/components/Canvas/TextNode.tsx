import { useRef } from 'react';
import { Shape, Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { DEFAULT_LINE_HEIGHT, type TextItem } from '../../types';
import { drawShapePath } from '../../utils/shapes';

interface Props {
  item: TextItem;
  isEditing: boolean;
  locked: boolean;
  onSelect: (e?: KonvaEventObject<Event>) => void;
  /** One of several selected items: the selection is transformed as a whole (CanvasStage). */
  inSelection: boolean;
  onChange: (patch: Partial<TextItem>) => void;
  onStartEdit: () => void;
  onNodeDragMove: (id: string, node: Konva.Node) => void;
  onNodeDragEnd: (id: string, node: Konva.Node) => void;
}

export default function TextNode({
  item,
  inSelection,
  isEditing,
  locked,
  onSelect,
  onChange,
  onStartEdit,
  onNodeDragMove,
  onNodeDragEnd,
}: Props) {
  const ref = useRef<Konva.Text>(null);
  const opacity = (item.opacity ?? 100) / 100;
  const outline = item.outlineWidth && item.outlineColor ? { color: item.outlineColor, width: item.outlineWidth } : null;
  const { shadow, background } = item;

  return (
    <>
      {background && (
        // The highlight: a box round the lines of text, under it. Its own
        // shape rather than part of the text node, so the node's box — what
        // selection, snapping, alignment and the text editor use — stays the
        // text's. It reads the text node at every draw, so it follows a drag
        // or a resize live, without waiting for a render.
        <Shape
          listening={false}
          visible={!isEditing}
          fill={background.color}
          opacity={background.opacity * opacity}
          sceneFunc={(ctx, shape) => {
            const t = ref.current;
            if (!t) return;
            const m = t.getTransform().getMatrix();
            ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
            const lines = t.getTextWidth();
            const box = t.width();
            const left = t.align() === 'center' ? (box - lines) / 2 : t.align() === 'right' ? box - lines : 0;
            const p = background.padding;
            ctx.translate(left - p, -p);
            drawShapePath(ctx as unknown as CanvasRenderingContext2D, lines + 2 * p, t.height() + 2 * p, 'rect', background.radius);
            ctx.fillStrokeShape(shape);
          }}
        />
      )}
      <KonvaText
        id={item.id}
        name="item"
        ref={ref}
        text={item.text}
        x={item.x}
        y={item.y}
        width={item.width}
        fontSize={item.fontSize}
        fontFamily={item.fontFamily}
        fontStyle={item.fontStyle}
        lineHeight={item.lineHeight ?? DEFAULT_LINE_HEIGHT}
        letterSpacing={item.letterSpacing ?? 0}
        fill={item.fill}
        // Stroked first and filled over, so only its outer half shows: twice
        // the width, and the letters keep their full weight.
        stroke={outline?.color}
        strokeWidth={outline ? outline.width * 2 : 0}
        strokeEnabled={!!outline}
        fillAfterStrokeEnabled
        lineJoin="round"
        // With an outline too, Konva draws fill and outline together and
        // shadows the result once, so the shadow stays under the outline.
        shadowEnabled={!!shadow}
        shadowColor={shadow?.color}
        shadowBlur={shadow?.blur}
        shadowOpacity={shadow?.opacity}
        shadowOffsetX={shadow?.offsetX}
        shadowOffsetY={shadow?.offsetY}
        opacity={opacity}
        align={item.align}
        rotation={item.rotation}
        visible={!isEditing}
        draggable={!locked}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onStartEdit}
        onDblTap={onStartEdit}
        onDragMove={(e) => onNodeDragMove(item.id, e.target)}
        onDragEnd={(e) => onNodeDragEnd(item.id, e.target)}
        // Rewrap as the box is dragged: left scaled, the glyphs were squashed or
        // stretched until release, then jumped to the new wrapping.
        onTransform={() => {
          const node = ref.current;
          if (!node || inSelection) return;
          node.setAttrs({ width: Math.max(20, node.width() * node.scaleX()), scaleX: 1, scaleY: 1 });
        }}
        onTransformEnd={() => {
          const node = ref.current;
          if (!node || inSelection) return;
          const sx = node.scaleX();
          node.scaleX(1);
          node.scaleY(1);
          // Resizing the box only rewraps the text (width); font size is left
          // untouched so box and text size can be changed independently.
          onChange({
            x: node.x(),
            y: node.y(),
            rotation: node.rotation(),
            width: Math.max(20, node.width() * sx),
          });
        }}
      />
    </>
  );
}
