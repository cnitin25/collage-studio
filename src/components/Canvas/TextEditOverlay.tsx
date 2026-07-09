import { useEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../../store/useEditorStore';
import type { TextItem } from '../../types';

interface Props {
  hostRef: RefObject<HTMLDivElement>;
  getStage: () => Konva.Stage | null;
}

/**
 * Renders a textarea on top of the text node being edited. Position/size/rotation
 * are derived from the Konva node so it lines up with the canvas at any zoom.
 */
export default function TextEditOverlay({ hostRef, getStage }: Props) {
  const editingId = useEditorStore((s) => s.editingId);
  const items = useEditorStore((s) => s.items);
  const updateItem = useEditorStore((s) => s.updateItem);
  const stopEditingText = useEditorStore((s) => s.stopEditingText);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const [val, setVal] = useState('');

  const item = items.find((i) => i.id === editingId && i.type === 'text') as TextItem | undefined;

  useEffect(() => {
    if (item) {
      setVal(item.text);
      const t = setTimeout(() => {
        taRef.current?.focus();
        taRef.current?.select();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [editingId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null;
  const stage = getStage();
  const host = hostRef.current;
  if (!stage || !host) return null;
  const node = stage.findOne<Konva.Text>(`#${item.id}`);
  if (!node) return null;

  const scale = stage.scaleX();
  const containerRect = stage.container().getBoundingClientRect();
  const hostRect = host.getBoundingClientRect();
  const abs = node.getAbsolutePosition();
  const left = containerRect.left - hostRect.left + abs.x;
  const top = containerRect.top - hostRect.top + abs.y;

  const commit = () => {
    updateItem(item.id, { text: val.length ? val : ' ' });
    stopEditingText();
  };

  return (
    <textarea
      ref={taRef}
      className="text-edit"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          stopEditingText();
        }
      }}
      style={{
        left,
        top,
        width: item.width * scale,
        fontSize: item.fontSize * scale,
        fontFamily: item.fontFamily,
        fontWeight: item.fontStyle.includes('bold') ? 700 : 400,
        fontStyle: item.fontStyle.includes('italic') ? 'italic' : 'normal',
        color: item.fill,
        textAlign: item.align,
        transform: `rotate(${node.getAbsoluteRotation()}deg)`,
        transformOrigin: 'top left',
      }}
    />
  );
}
