import type { ClipShape } from '../types';

// Draws a closed path for the given shape into a 2D context, filling the w×h box.
// Used for the image clip, the border stroke, and the shadow caster so all three
// always agree. No fill/stroke here — the caller decides.
//
// `inset` shrinks the shape inside its box. Borders pass half their width, so
// the whole stroke lands inside the item: centred on the edge, half of it was
// cut off at the canvas edge and spilled into the gaps between photos.

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function heart(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number) {
  // Parametric heart, sampled and fitted to the box (robust vs hand-tuned beziers).
  const N = 80;
  const pts: Array<[number, number]> = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push([x, y]);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const sx = w / (maxX - minX);
  const sy = h / (maxY - minY);
  pts.forEach(([x, y], i) => {
    const px = x0 + (x - minX) * sx;
    const py = y0 + (y - minY) * sy;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

/** Add the shape's outline to the current path, without starting a new one. */
export function traceShapePath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shape: ClipShape,
  radius: number,
  inset = 0,
): void {
  const iw = Math.max(0, w - 2 * inset);
  const ih = Math.max(0, h - 2 * inset);
  const cx = inset + iw / 2;
  const cy = inset + ih / 2;
  switch (shape) {
    case 'circle': {
      const r = Math.min(iw, ih) / 2;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.closePath();
      break;
    }
    case 'ellipse':
      ctx.moveTo(cx + iw / 2, cy);
      ctx.ellipse(cx, cy, iw / 2, ih / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
      break;
    case 'heart':
      heart(ctx, inset, inset, iw, ih);
      break;
    case 'rect':
    default:
      roundedRect(ctx, inset, inset, iw, ih, radius - inset);
  }
}

export function drawShapePath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shape: ClipShape,
  radius: number,
  inset = 0,
): void {
  ctx.beginPath();
  traceShapePath(ctx, w, h, shape, radius, inset);
}
