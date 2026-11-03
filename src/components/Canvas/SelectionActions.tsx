import { useEffect, useRef, type RefObject } from 'react';
import type Konva from 'konva';
import { useEditorStore } from '../../store/useEditorStore';
import { COARSE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { MOD } from '../../utils/platform';
import ToolButton from '../ui/ToolButton';

const GAP = 10;

/**
 * Quick actions for two or more selected items, floating just above them:
 * group, align, distribute, duplicate and delete. Phones use the docked
 * SelectionBar instead.
 *
 * It follows the selection by reading the Transformer every frame while it
 * is shown, and hides in any frame where Konva says the selection is being
 * dragged or transformed. Nothing is remembered between frames, so it can't
 * get stuck hidden — the bug that sank the floating toolbar this app once
 * had (README.old.md), which tracked "busy" in a flag.
 */
export default function SelectionActions({ transformerRef }: { transformerRef: RefObject<Konva.Transformer | null> }) {
  const count = useEditorStore((s) => s.selectedIds.length);
  // All in one group already: offer Ungroup instead of Group.
  const grouped = useEditorStore((s) => {
    const sel = s.items.filter((i) => s.selectedIds.includes(i.id));
    return sel.length > 1 && !!sel[0].groupId && sel.every((i) => i.groupId === sel[0].groupId);
  });
  const groupSelected = useEditorStore((s) => s.groupSelected);
  const ungroupSelected = useEditorStore((s) => s.ungroupSelected);
  const alignItems = useEditorStore((s) => s.alignItems);
  const distributeSelection = useEditorStore((s) => s.distributeSelection);
  const duplicateSelected = useEditorStore((s) => s.duplicateSelected);
  const removeSelected = useEditorStore((s) => s.removeSelected);
  const coarse = useMediaQuery(COARSE_QUERY);
  const ref = useRef<HTMLDivElement>(null);
  const shown = count > 1 && !coarse;

  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const place = () => {
      frame = requestAnimationFrame(place);
      const el = ref.current;
      const tr = transformerRef.current;
      const parent = el?.offsetParent;
      const stage = tr?.getStage();
      if (!el || !tr || !stage || !(parent instanceof HTMLElement) || tr.nodes().length < 2) return;
      const busy = tr.isTransforming() || tr.nodes().some((n) => n.isDragging());
      el.style.visibility = busy ? 'hidden' : '';
      if (busy) return;
      // The Transformer's box includes its handles, rotate handle too, so
      // the bar never covers one.
      const box = tr.getClientRect();
      const stageRect = stage.container().getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const left = stageRect.left - parentRect.left + box.x;
      const top = stageRect.top - parentRect.top + box.y;
      let x = left + box.width / 2 - el.offsetWidth / 2;
      let y = top - GAP - el.offsetHeight;
      if (y < 4) y = top + box.height + GAP; // no room above: below
      x = Math.max(4, Math.min(x, parent.clientWidth - el.offsetWidth - 4));
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [shown, transformerRef]);

  if (!shown) return null;
  return (
    <div ref={ref} className="selection-actions" role="toolbar" aria-label="Selection">
      {grouped ? (
        <ToolButton icon="ungroup" label="Ungroup" tip={`Ungroup (${MOD}Shift+G)`} onClick={ungroupSelected} />
      ) : (
        <ToolButton icon="group" label="Group" tip={`Group (${MOD}G)`} onClick={groupSelected} />
      )}
      <span className="divider" />
      <ToolButton icon="alignLeft" label="Align left edges" onClick={() => alignItems('left')} />
      <ToolButton icon="alignCenterX" label="Align centres" onClick={() => alignItems('center-x')} />
      <ToolButton icon="alignRight" label="Align right edges" onClick={() => alignItems('right')} />
      <ToolButton icon="alignTop" label="Align top edges" onClick={() => alignItems('top')} />
      <ToolButton icon="alignCenterY" label="Align middles" onClick={() => alignItems('center-y')} />
      <ToolButton icon="alignBottom" label="Align bottom edges" onClick={() => alignItems('bottom')} />
      <ToolButton
        icon="distributeX"
        label="Distribute horizontally"
        tip={count < 3 ? 'Distribute horizontally — select three or more' : 'Distribute horizontally'}
        disabled={count < 3}
        onClick={() => distributeSelection('x')}
      />
      <ToolButton
        icon="distributeY"
        label="Distribute vertically"
        tip={count < 3 ? 'Distribute vertically — select three or more' : 'Distribute vertically'}
        disabled={count < 3}
        onClick={() => distributeSelection('y')}
      />
      <span className="divider" />
      <ToolButton icon="copy" label="Duplicate" tip={`Duplicate (${MOD}D)`} onClick={duplicateSelected} />
      <ToolButton icon="trash" label="Delete" tip="Delete (Del)" tipEnd onClick={removeSelected} />
    </div>
  );
}
