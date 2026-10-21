import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * An always-visible, finger-sized scrollbar for `target`. Phone browsers only
 * show a thin overlay scrollbar while scrolling, and won't let a page widen,
 * pin or drag it, so swiping the content was the only way to scroll — and a
 * swipe that starts on a control operates the control. This rail gives the
 * panel a place to scroll from that can't touch anything.
 *
 * Drag the thumb to scroll; tap the track to jump there (and keep dragging).
 * Pointer-only: the target still scrolls natively for touch, wheel, keyboard
 * and assistive tech, so the rail itself is aria-hidden.
 */
export default function ScrollRail({ target }: { target: RefObject<HTMLElement> }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ top: 0, size: 0, scrollable: false });
  const drag = useRef<{ y: number; scrollTop: number; ratio: number } | null>(null);

  useEffect(() => {
    const el = target.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const update = () => {
      const H = track.clientHeight;
      const { scrollHeight, clientHeight, scrollTop } = el;
      const scrollable = scrollHeight > clientHeight + 1;
      const size = scrollable ? Math.max(40, (H * clientHeight) / scrollHeight) : H;
      const top = scrollable ? ((H - size) * scrollTop) / (scrollHeight - clientHeight) : 0;
      setThumb({ top, size, scrollable });
    };
    // Content height changes without the container resizing (a section
    // switch, a panel expanding, a histogram drawing), so watch the children
    // too, re-subscribing as they come and go.
    const ro = new ResizeObserver(update);
    const observeChildren = () => {
      ro.observe(el);
      ro.observe(track);
      Array.from(el.children).forEach((c) => ro.observe(c));
    };
    const mo = new MutationObserver(() => {
      observeChildren();
      update();
    });
    observeChildren();
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [target]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = target.current;
    const track = trackRef.current;
    if (!el || !track || !thumb.scrollable) return;
    e.preventDefault();
    const range = el.scrollHeight - el.clientHeight;
    const travel = Math.max(1, track.clientHeight - thumb.size);
    // Tapped the track rather than the thumb: centre the thumb there first.
    const y = e.clientY - track.getBoundingClientRect().top;
    if (y < thumb.top || y > thumb.top + thumb.size) {
      el.scrollTop = ((y - thumb.size / 2) / travel) * range;
    }
    drag.current = { y: e.clientY, scrollTop: el.scrollTop, ratio: range / travel };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = target.current;
    if (!d || !el) return;
    el.scrollTop = d.scrollTop + (e.clientY - d.y) * d.ratio;
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      ref={trackRef}
      className={`scroll-rail ${thumb.scrollable ? 'is-scrollable' : ''}`}
      aria-hidden
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {thumb.scrollable && (
        <div
          className="scroll-rail-thumb"
          style={{ height: thumb.size, transform: `translateY(${thumb.top}px)` }}
        />
      )}
    </div>
  );
}
