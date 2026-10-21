import { useEffect, useState } from 'react';

/**
 * The compact (phone) layout: narrow windows, plus touch devices held in
 * landscape, whose width alone would otherwise put them on the desktop
 * layout with ~230 px of canvas height. Must match the `@media` lists of the
 * responsive block at the bottom of index.css.
 */
export const COMPACT_QUERY = '(max-width: 768px), (pointer: coarse) and (max-height: 500px)';
/**
 * Within the compact layout, the tools panel is a bottom sheet when there's
 * height to spare and a side panel on a landscape phone, where half the height
 * would leave a sliver of each.
 */
export const BOTTOM_SHEET_QUERY = '(max-width: 768px) and (min-height: 501px)';
/** Touch-first input — sizing and text-editing decisions, independent of layout. */
export const COARSE_QUERY = '(pointer: coarse)';

function matches(query: string): boolean {
  return window.matchMedia?.(query).matches ?? false;
}

/** Live result of a CSS media query; updates on resize, rotation or input change. */
export function useMediaQuery(query: string): boolean {
  const [value, setValue] = useState(() => matches(query));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setValue(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return value;
}
