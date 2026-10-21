import { useRef } from 'react';
import { COARSE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';

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
  const coarse = useMediaQuery(COARSE_QUERY);
  // Touch gesture on the track (coarse pointers only; see the overlay below).
  const touch = useRef<{ x: number; y: number; start: number; width: number; dragging: boolean } | null>(null);

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

  /** Snap a raw value to the step grid and the min/max range. */
  const snap = (raw: number) => {
    const stepped = min + Math.round((raw - min) / step) * step;
    return Number(Math.max(min, Math.min(max, stepped)).toFixed(decimalPlaces(step)));
  };

  // A native range input jumps to wherever a finger lands, so a swipe meant
  // to scroll the tools panel that happened to start on a slider changed its
  // value. On touch the input therefore takes no pointer input; this overlay
  // waits to see the gesture's direction. Vertical: let the browser scroll
  // (touch-action: pan-y), value untouched. Horizontal: drag the value
  // relative to where the finger started — no jump, and no need to hit the
  // thumb exactly. A tap changes nothing; the − / + buttons step.
  const onTouchDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled) return;
    const width = e.currentTarget.getBoundingClientRect().width;
    touch.current = { x: e.clientX, y: e.clientY, start: value, width, dragging: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onTouchMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const t = touch.current;
    if (!t) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (!t.dragging) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) >= Math.abs(dx)) {
        touch.current = null; // a scroll; the browser has it
        return;
      }
      t.dragging = true;
      begin();
    }
    const next = snap(t.start + (dx / Math.max(1, t.width)) * (max - min));
    if (next !== value) onChange(next);
  };
  const onTouchEnd = () => {
    if (touch.current?.dragging) end();
    touch.current = null;
  };

  return (
    // A div, not a <label>: a label forwards any click inside it to its first
    // control — here the − button — so tapping the track or the name stepped
    // the value down. The input is named by aria-label instead.
    <div className={`slider ${disabled ? 'is-disabled' : ''}`}>
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
        <span className={`slider-track ${coarse ? 'is-touch' : ''}`}>
          <input
            type="range"
            aria-label={label}
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
          {coarse && (
            <span
              className="slider-touch"
              aria-hidden
              onPointerDown={onTouchDown}
              onPointerMove={onTouchMove}
              onPointerUp={onTouchEnd}
              onPointerCancel={onTouchEnd}
            />
          )}
        </span>
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
    </div>
  );
}
