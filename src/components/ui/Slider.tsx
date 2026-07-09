import { useRef } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  /** called once when a drag/keyboard gesture begins */
  onStart?: () => void;
  /** called on every value change during the gesture */
  onChange: (value: number) => void;
  /** called once when the gesture ends */
  onEnd?: () => void;
}

/** Number of decimal places implied by a step value (0.01 -> 2, 1 -> 0). */
function decimalPlaces(step: number): number {
  const s = String(step);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
}

/**
 * A range input that fires onStart on the first change and onEnd when the
 * gesture finishes (pointer up, blur, or key up) — so a whole drag records a
 * single undo step instead of dozens. Also offers +/- buttons for one-step
 * nudges, each firing as its own complete, single-undo-step gesture.
 */
export default function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = 'px',
  disabled = false,
  onStart,
  onChange,
  onEnd,
}: Props) {
  const active = useRef(false);

  const begin = () => {
    if (!active.current) {
      active.current = true;
      onStart?.();
    }
  };
  const end = () => {
    if (active.current) {
      active.current = false;
      onEnd?.();
    }
  };

  const nudge = (delta: number) => {
    if (disabled) return;
    const raw = Math.max(min, Math.min(max, value + delta));
    const next = Number(raw.toFixed(decimalPlaces(step)));
    if (next === value) return;
    // A button click is already a single, atomic action — begin/change/end
    // fire together, producing exactly one undo step per click.
    onStart?.();
    onChange(next);
    onEnd?.();
  };

  return (
    <label className={`slider ${disabled ? 'is-disabled' : ''}`}>
      <span className="slider-head">
        <span>{label}</span>
        <span className="dim">
          {value}
          {suffix}
        </span>
      </span>
      <span className="slider-row">
        <button
          type="button"
          className="slider-step-btn"
          disabled={disabled || value <= min}
          onClick={() => nudge(-step)}
          aria-label={`Decrease ${label}`}
          tabIndex={-1}
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            begin();
            onChange(Number(e.target.value));
          }}
          onPointerUp={end}
          onKeyUp={end}
          onBlur={end}
        />
        <button
          type="button"
          className="slider-step-btn"
          disabled={disabled || value >= max}
          onClick={() => nudge(step)}
          aria-label={`Increase ${label}`}
          tabIndex={-1}
        >
          +
        </button>
      </span>
    </label>
  );
}
