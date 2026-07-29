import { useRef } from 'react';
import { Text as KonvaText } from 'react-konva';
import type Konva from 'konva';
import type { TextItem } from '../../types';

interface Props {
  item: TextItem;
  isEditing: boolean;
  locked: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<TextItem>) => void;
  onStartEdit: () => void;
  onNodeDragMove: (id: string, node: Konva.Node) => void;
  onNodeDragEnd: (id: string, node: Konva.Node) => void;
}

export default function TextNode({
  item,
  isEditing,
  locked,
  onSelect,
  onChange,
  onStartEdit,
  onNodeDragMove,
  onNodeDragEnd,
}: Props) {
  const ref = useRef<Konva.Text>(null);

  return (
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
      fill={item.fill}
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
      onTransformEnd={() => {
        const node = ref.current;
        if (!node) return;
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
  );
}
