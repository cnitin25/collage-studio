import type { PatternKind } from '../types';

/** Build a tileable pattern canvas for use as a Konva fillPatternImage. */
export function makePatternCanvas(
  kind: PatternKind,
  fg: string,
  bg: string,
  size: number,
): HTMLCanvasElement {
  const tile = Math.max(8, Math.round(size));
  const canvas = document.createElement('canvas');
  canvas.width = tile;
  canvas.height = tile;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, tile, tile);
  ctx.fillStyle = fg;
  ctx.strokeStyle = fg;

  switch (kind) {
    case 'dots': {
      const r = Math.max(1, tile * 0.14);
      ctx.beginPath();
      ctx.arc(tile / 2, tile / 2, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'grid': {
      ctx.lineWidth = Math.max(1, tile * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tile, 0);
      ctx.moveTo(0, 0);
      ctx.lineTo(0, tile);
      ctx.stroke();
      break;
    }
    case 'stripes': {
      ctx.lineWidth = Math.max(1, tile * 0.18);
      ctx.beginPath();
      ctx.moveTo(-tile, tile);
      ctx.lineTo(tile, -tile);
      ctx.moveTo(0, tile * 2);
      ctx.lineTo(tile * 2, 0);
      ctx.stroke();
      break;
    }
    case 'checker': {
      const half = tile / 2;
      ctx.fillRect(0, 0, half, half);
      ctx.fillRect(half, half, half, half);
      break;
    }
  }
  return canvas;
}
