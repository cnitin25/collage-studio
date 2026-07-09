import { useEditorStore } from '../../store/useEditorStore';
import Slider from '../ui/Slider';
import CollapsiblePanel from './CollapsiblePanel';

export default function AdjustPanel() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const items = useEditorStore((s) => s.items);
  const beginChange = useEditorStore((s) => s.beginChange);
  const updateItemLive = useEditorStore((s) => s.updateItemLive);
  const commitChange = useEditorStore((s) => s.commitChange);

  const sel = items.find((i) => i.id === selectedId);
  if (!sel || sel.type !== 'image') return null;

  const f = sel.filters ?? {};
  const setLive = (patch: Partial<typeof f>) =>
    updateItemLive(sel.id, { filters: { ...sel.filters, ...patch } });

  return (
    <CollapsiblePanel title="Adjust">
      <div className="sliders">
        <Slider
          label="Brightness"
          suffix=""
          value={f.brightness ?? 0}
          min={-100}
          max={100}
          onStart={() => beginChange('Brightness')}
          onChange={(v) => setLive({ brightness: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Contrast"
          suffix=""
          value={f.contrast ?? 0}
          min={-100}
          max={100}
          onStart={() => beginChange('Contrast')}
          onChange={(v) => setLive({ contrast: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Saturation"
          suffix=""
          value={f.saturation ?? 0}
          min={-100}
          max={100}
          onStart={() => beginChange('Saturation')}
          onChange={(v) => setLive({ saturation: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Warmth (hue)"
          suffix=""
          value={f.hue ?? 0}
          min={-180}
          max={180}
          onStart={() => beginChange('Hue')}
          onChange={(v) => setLive({ hue: v })}
          onEnd={commitChange}
        />
        <Slider
          label="Blur"
          value={f.blur ?? 0}
          min={0}
          max={40}
          onStart={() => beginChange('Blur')}
          onChange={(v) => setLive({ blur: v })}
          onEnd={commitChange}
        />
      </div>
    </CollapsiblePanel>
  );
}
