import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../../store/useEditorStore';
import { DEFAULT_LINE_HEIGHT, type TextItem } from '../../types';
import { COARSE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';

interface Props {
  hostRef: RefObject<HTMLDivElement>;
  getStage: () => Konva.Stage | null;
}

/**
 * Text editing. With a mouse: a textarea laid over the text node, matching
 * its position, size and rotation at any zoom. On touch: a field docked under
 * the toolbar instead (see TextEditDock) — an in-place overlay there is often
 * under the keyboard, below 16px (so iOS zooms the page), and offers no way to
 * type a second line.
 */
export default function TextEditOverlay({ hostRef, getStage }: Props) {
  const editingId = useEditorStore((s) => s.editingId);
  const items = useEditorStore((s) => s.items);
  const coarse = useMediaQuery(COARSE_QUERY);

  const item = items.find((i) => i.id === editingId && i.type === 'text') as TextItem | undefined;
  if (!item) return null;
  if (coarse) return <TextEditDock key={item.id} item={item} />;
  return <InPlaceEditor key={item.id} item={item} hostRef={hostRef} getStage={getStage} />;
}

function InPlaceEditor({ item, hostRef, getStage }: Props & { item: TextItem }) {
  const updateItem = useEditorStore((s) => s.updateItem);
  const stopEditingText = useEditorStore((s) => s.stopEditingText);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const [val, setVal] = useState(item.text);

  useEffect(() => {
    const t = setTimeout(() => {
      taRef.current?.focus();
      taRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

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
        lineHeight: item.lineHeight ?? DEFAULT_LINE_HEIGHT,
        color: item.fill,
        textAlign: item.align,
        transform: `rotate(${node.getAbsoluteRotation()}deg)`,
        transformOrigin: 'top left',
      }}
    />
  );
}

/**
 * Touch text editor, docked below the toolbar where the keyboard can't cover
 * it. Edits apply to the canvas live (the text node stays visible — see
 * CanvasStage), recorded as one undo step, or none if nothing changed: the
 * same session pattern as the Insert panel's text box. Enter types a new line;
 * Done finishes, Cancel restores the original text.
 */
function TextEditDock({ item }: { item: TextItem }) {
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const beginChange = useEditorStore((s) => s.beginChange);
  const commitChange = useEditorStore((s) => s.commitChange);
  const cancelChange = useEditorStore((s) => s.cancelChange);
  const stopEditingText = useEditorStore((s) => s.stopEditingText);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const session = useRef<{ id: string; textAtStart: string } | null>(null);
  const [viewportTop, setViewportTop] = useState(0);

  /** One undo step if the text changed, none if not. Safe to call twice. */
  const finish = () => {
    const sess = session.current;
    if (!sess) return;
    session.current = null;
    const now = useEditorStore.getState().items.find((i) => i.id === sess.id);
    // An empty Konva text has nothing left to tap; keep a space, as the
    // in-place editor does.
    if (now?.type === 'text' && now.text === '') updateItemLive(sess.id, { text: ' ' });
    const final = useEditorStore.getState().items.find((i) => i.id === sess.id);
    if (final?.type === 'text' && final.text !== sess.textAtStart) commitChange();
    else cancelChange();
  };

  // Layout effect, not a timeout: iOS only raises the keyboard for a focus()
  // that happens while the tap that started editing is still being handled.
  useLayoutEffect(() => {
    session.current = { id: item.id, textAtStart: item.text };
    beginChange('Edit text');
    taRef.current?.focus();
    taRef.current?.select();
    return finish;
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // iOS can pan the visual viewport while the keyboard is up; follow it so the
  // dock stays under the toolbar rather than scrolling off the top.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => setViewportTop(vv.offsetTop);
    vv.addEventListener('resize', onChange);
    vv.addEventListener('scroll', onChange);
    return () => {
      vv.removeEventListener('resize', onChange);
      vv.removeEventListener('scroll', onChange);
    };
  }, []);

  const done = () => {
    finish();
    stopEditingText();
  };
  const cancel = () => {
    const sess = session.current;
    if (sess) updateItemLive(sess.id, { text: sess.textAtStart });
    done();
  };
  // Buttons act on pointerdown-without-blur: otherwise the textarea's blur
  // ends editing first, the dock unmounts, and the tap lands on the canvas.
  const keepFocus = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault();

  return (
    <div className="text-edit-dock" style={{ transform: `translateY(${viewportTop}px)` }}>
      <textarea
        ref={taRef}
        className="text-edit-dock-input"
        value={item.text}
        rows={2}
        aria-label="Edit text"
        onChange={(e) => updateItemLive(item.id, { text: e.target.value })}
        onBlur={done}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        style={{ fontFamily: item.fontFamily, textAlign: item.align }}
      />
      <div className="text-edit-dock-actions">
        <button className="btn btn-ghost" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={cancel}>
          Cancel
        </button>
        <button className="btn btn-accent" onPointerDown={keepFocus} onMouseDown={keepFocus} onClick={done}>
          Done
        </button>
      </div>
    </div>
  );
}
