import type { ClipShape } from '../types';

// Draws a closed path for the given shape into a 2D context, filling the w×h box.
// Used for the image clip, the border stroke, and the shadow caster so all three
// always agree. No fill/stroke here — the caller decides.

function roundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(rr, 0);
  ctx.arcTo(w, 0, w, h, rr);
  ctx.arcTo(w, h, 0, h, rr);
  ctx.arcTo(0, h, 0, 0, rr);
  ctx.arcTo(0, 0, w, 0, rr);
  ctx.closePath();
}

function heart(ctx: CanvasRenderingContext2D, w: number, h: number) {
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
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const px = (x - minX) * sx;
    const py = (y - minY) * sy;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

export function drawShapePath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  shape: ClipShape,
  radius: number,
): void {
  switch (shape) {
    case 'circle': {
      const r = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.closePath();
      break;
    }
    case 'ellipse':
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.closePath();
      break;
    case 'heart':
      heart(ctx, w, h);
      break;
    case 'rect':
    default:
      roundedRect(ctx, w, h, radius);
  }
}
