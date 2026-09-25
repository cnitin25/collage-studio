import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store/useEditorStore';

interface Props {
  value: string;
  /** undo-history label for the whole picker session */
  label: string;
  /** apply a colour without recording history (a *Live store action) */
  onLive: (color: string) => void;
}

/**
 * A native colour input that records ONE undo step per picker session.
 *
 * React's onChange for <input type="color"> is the `input` event, which fires
 * continuously while the user drags inside the picker — wiring it straight to
 * a history-recording action wrote dozens of undo steps per colour choice and
 * pushed real history out of the 60-step limit. Like the Slider, this opens a
 * change on the first input, applies each value live, and commits once when
 * the browser fires the native `change` event (the picker was committed or
 * closed), or on blur/unmount as a fallback.
 */
export default function ColorInput({ value, label, onLive }: Props) {
  const beginChange = useEditorStore((s) => s.beginChange);
  const active = useRef(false);
  const ref = useRef<HTMLInputElement>(null);

  // Stable for the component's life, so the listener below can be removed.
  const finish = useRef(() => {
    if (!active.current) return;
    active.current = false;
    useEditorStore.getState().commitChange();
  }).current;

  useEffect(() => {
    const el = ref.current;
    // React has no prop for an input's native `change` event (its onChange is
    // `input`), so listen for it directly.
    el?.addEventListener('change', finish);
    return () => {
      el?.removeEventListener('change', finish);
      finish(); // unmounted mid-session, e.g. its panel collapsed
    };
  }, [finish]);

  return (
    <input
      ref={ref}
      type="color"
      value={value}
      onChange={(e) => {
        if (!active.current) {
          active.current = true;
          beginChange(label);
        }
        onLive(e.target.value);
      }}
      onBlur={finish}
    />
  );
}
