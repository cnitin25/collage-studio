import { useRef } from 'react';
import { Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { StickerItem } from '../../types';

interface Props {
  item: StickerItem;
  locked: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<StickerItem>) => void;
  onNodeDragMove: (id: string, node: Konva.Node) => void;
  onNodeDragEnd: (id: string, node: Konva.Node) => void;
}

export default function StickerNode({
  item,
  locked,
  onSelect,
  onChange,
  onNodeDragMove,
  onNodeDragEnd,
}: Props) {
  const ref = useRef<Konva.Text>(null);

  return (
    <KonvaText
      id={item.id}
      name="item"
      ref={ref}
      text={item.emoji}
      x={item.x}
      y={item.y}
      fontSize={item.fontSize}
      rotation={item.rotation}
      draggable={!locked}
      onClick={onSelect}
      onTap={onSelect}
      onDragMove={(e) => onNodeDragMove(item.id, e.target)}
      onDragEnd={(e) => onNodeDragEnd(item.id, e.target)}
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
        const sx = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        const fs = Math.max(8, item.fontSize * sx);
        onChange({ x: node.x(), y: node.y(), rotation: node.rotation(), fontSize: fs, width: fs, height: fs });
      }}
    />
  );
}
