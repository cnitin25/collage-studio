import { useEditorStore } from '../store/useEditorStore';
import Icon, { type IconName } from './ui/Icon';

interface Toggle {
  key: string;
  icon: IconName;
  label: string;
  title: string;
  on: boolean;
  set: (v: boolean) => void;
}

/**
 * Editor modes as toggle buttons — highlighted while on. Lives in the status
 * bar on desktop (visible even with the tools panel collapsed) and at the foot
 * of the tools sheet on a phone, where the status bar is hidden. `stacked`
 * puts the label under the icon so five fit across a phone.
 */
export default function ModeToggles({ stacked = false }: { stacked?: boolean }) {
  // One selector each: subscribing to the whole store would re-render this
  // bar on every frame of a drag.
  const s = {
    snapEnabled: useEditorStore((st) => st.snapEnabled),
    setSnapEnabled: useEditorStore((st) => st.setSnapEnabled),
    layoutLocked: useEditorStore((st) => st.layoutLocked),
    setLayoutLocked: useEditorStore((st) => st.setLayoutLocked),
    swapModeEnabled: useEditorStore((st) => st.swapModeEnabled),
    setSwapModeEnabled: useEditorStore((st) => st.setSwapModeEnabled),
    lockAspectEnabled: useEditorStore((st) => st.lockAspectEnabled),
    setLockAspectEnabled: useEditorStore((st) => st.setLockAspectEnabled),
    cropLocked: useEditorStore((st) => st.cropLocked),
    setCropLocked: useEditorStore((st) => st.setCropLocked),
  };
  const toggles: Toggle[] = [
    {
      key: 'snap',
      icon: 'magnet',
      label: 'Snap',
      title: 'Snap edges/centers to the canvas and other items while dragging',
      on: s.snapEnabled,
      set: s.setSnapEnabled,
    },
    {
      key: 'lock',
      icon: 'lock',
      label: 'Lock layout',
      title: 'Lock layout: items can be selected but not moved or resized',
      on: s.layoutLocked,
      set: s.setLayoutLocked,
    },
    {
      key: 'swap',
      icon: 'replace',
      label: 'Swap',
      title: 'Swap two photos when you drag one onto another',
      on: s.swapModeEnabled,
      set: s.setSwapModeEnabled,
    },
    {
      key: 'ratio',
      icon: 'ratio',
      label: 'Lock ratio',
      title: "Resize photos proportionally, keeping each one's aspect ratio",
      on: s.lockAspectEnabled,
      set: s.setLockAspectEnabled,
    },
    {
      key: 'crop',
      icon: 'crop',
      label: 'Stay in crop',
      title: 'Keep crop mode active when you select another photo',
      on: s.cropLocked,
      set: s.setCropLocked,
    },
  ];

  return (
    <div className={`mode-toggles ${stacked ? 'is-stacked' : ''}`} role="group" aria-label="Editor modes">
      {toggles.map((t) => (
        <button
          key={t.key}
          className={`mode-toggle ${t.on ? 'is-active' : ''}`}
          aria-pressed={t.on}
          title={t.title}
          onClick={() => t.set(!t.on)}
        >
          <Icon name={t.icon} size={stacked ? 18 : 14} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
