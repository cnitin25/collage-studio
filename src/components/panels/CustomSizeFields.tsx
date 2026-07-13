import { useState } from 'react';

interface Props {
  width: number;
  height: number;
  onApply: (w: number, h: number) => void;
}

const MIN = 200;
const MAX = 6000;

const clamp = (n: number) => Math.max(MIN, Math.min(MAX, Math.round(n) || MIN));

export default function CustomSizeFields({ width, height, onApply }: Props) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));

  // Keep the fields in sync when a preset changes the canvas elsewhere.
  if (String(width) !== w && document.activeElement?.tagName !== 'INPUT') setW(String(width));
  if (String(height) !== h && document.activeElement?.tagName !== 'INPUT') setH(String(height));

  const apply = () => {
    const cw = clamp(Number(w));
    const ch = clamp(Number(h));
    setW(String(cw));
    setH(String(ch));
    if (cw !== width || ch !== height) onApply(cw, ch);
  };

  return (
    <div className="custom-size">
      <div className="custom-size-fields">
        <label className="custom-size-field">
          <span>W</span>
          <input
            type="number"
            min={MIN}
            max={MAX}
            value={w}
            onChange={(e) => setW(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), apply())}
          />
        </label>
        <span className="custom-size-x">×</span>
        <label className="custom-size-field">
          <span>H</span>
          <input
            type="number"
            min={MIN}
            max={MAX}
            value={h}
            onChange={(e) => setH(e.target.value)}
            onBlur={apply}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), apply())}
          />
        </label>
        <button className="btn" onClick={apply} title="Apply this custom canvas size">Apply</button>
      </div>
      <p className="dim small">Custom size, {MIN}–{MAX}px per side</p>
    </div>
  );
}
