import { memo } from 'react';
import { Image as KonvaImage, Text as KonvaText } from 'react-konva';
import useImage from 'use-image';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { StickerItem } from '../../types';
import { stickerImage } from '../../style/stickers';

// Memoized, with callbacks that take the item's id (see TextNode).
interface Props {
  item: StickerItem;
  locked: boolean;
  onSelect: (id: string, e?: KonvaEventObject<Event>) => void;
  /** One of several selected items: the selection is transformed as a whole (CanvasStage). */
  inSelection: boolean;
  onChange: (id: string, patch: Partial<StickerItem>) => void;
  onNodeDragMove: (id: string, node: Konva.Node) => void;
  onNodeDragEnd: (id: string, node: Konva.Node) => void;
}

function StickerNode({
  item,
  inSelection,
  locked,
  onSelect,
  onChange,
  onNodeDragMove,
  onNodeDragEnd,
}: Props) {
  // A palette emoji is drawn from its bundled image (style/stickers), a
  // fontSize square; any other emoji, from an older project or a project
  // file, as text in the device's emoji font.
  const src = stickerImage(item.emoji);
  const [image] = useImage(src ?? '');

  const shared = {
    id: item.id,
    name: 'item',
    x: item.x,
    y: item.y,
    rotation: item.rotation,
    opacity: (item.opacity ?? 100) / 100,
    draggable: !locked,
    onClick: (e: KonvaEventObject<MouseEvent>) => onSelect(item.id, e),
    onTap: (e: KonvaEventObject<TouchEvent>) => onSelect(item.id, e),
    onDragMove: (e: KonvaEventObject<DragEvent>) => onNodeDragMove(item.id, e.target),
    onDragEnd: (e: KonvaEventObject<DragEvent>) => onNodeDragEnd(item.id, e.target),
    onTransformEnd: (e: KonvaEventObject<Event>) => {
      const node = e.target;
      if (inSelection) return;
      const sx = node.scaleX();
      node.scaleX(1);
      node.scaleY(1);
      const fs = Math.max(8, item.fontSize * sx);
      onChange(item.id, { x: node.x(), y: node.y(), rotation: node.rotation(), fontSize: fs, width: fs, height: fs });
    },
  };

  if (src) return <KonvaImage {...shared} image={image} width={item.fontSize} height={item.fontSize} />;
  return <KonvaText {...shared} text={item.emoji} fontSize={item.fontSize} />;
}

export default memo(StickerNode);
