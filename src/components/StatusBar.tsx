import { useEditorStore } from '../store/useEditorStore';
import ModeToggles from './ModeToggles';

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function ratioLabel(w: number, h: number): string {
  const rw = Math.round(w);
  const rh = Math.round(h);
  if (rw <= 0 || rh <= 0) return '';
  const d = gcd(rw, rh) || 1;
  return `${rw / d}:${rh / d}`;
}

export default function StatusBar() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const items = useEditorStore((s) => s.items);
  const canvas = useEditorStore((s) => s.canvas);
  const viewScale = useEditorStore((s) => s.viewScale);
  const croppingId = useEditorStore((s) => s.croppingId);

  const sel = items.find((i) => i.id === selectedId);

  let primary: string;
  let secondary: string | null = null;

  if (!sel) {
    primary = `Canvas ${canvas.width} × ${canvas.height} px`;
    secondary = `Zoom ${Math.round(viewScale * 100)}%`;
  } else if (sel.type === 'image') {
    const w = Math.round(sel.width);
    const h = Math.round(sel.height);
    primary = `Photo ${w} × ${h} px`;
    const bits = [ratioLabel(w, h)];
    if (Math.round(sel.rotation) % 360 !== 0) bits.push(`${Math.round(sel.rotation)}°`);
    if (croppingId === sel.id) bits.push('cropping…');
    bits.push(`original ${sel.naturalWidth} × ${sel.naturalHeight} px`);
    secondary = bits.filter(Boolean).join(' · ');
  } else if (sel.type === 'text') {
    primary = `Text box ${Math.round(sel.width)} px wide`;
    secondary = `${Math.round(sel.fontSize)}px font`;
  } else {
    primary = `Sticker ${Math.round(sel.fontSize)} px`;
    secondary = null;
  }

  return (
    <div className="status-bar">
      <span className="status-primary">{primary}</span>
      {secondary && <span className="status-secondary">{secondary}</span>}
      <ModeToggles />
    </div>
  );
}
