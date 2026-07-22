export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Guide {
  axis: 'x' | 'y';
  pos: number; // canvas coordinate of the guide line
}

/**
 * Snap the dragged box so one of its edges/center lines up with the canvas
 * edges/center or another item's edges/center. Returns the adjusted top-left
 * plus any guide lines to draw. Threshold is in canvas pixels.
 */
export function computeSnap(
  dragged: Box,
  others: Box[],
  canvasW: number,
  canvasH: number,
  threshold: number,
): { x: number; y: number; guides: Guide[] } {
  const xTargets = [0, canvasW / 2, canvasW];
  const yTargets = [0, canvasH / 2, canvasH];
  for (const o of others) {
    xTargets.push(o.x, o.x + o.width / 2, o.x + o.width);
    yTargets.push(o.y, o.y + o.height / 2, o.y + o.height);
  }

  const dxs = [dragged.x, dragged.x + dragged.width / 2, dragged.x + dragged.width];
  const dys = [dragged.y, dragged.y + dragged.height / 2, dragged.y + dragged.height];

  let bestX: { delta: number; pos: number; dist: number } | null = null;
  for (const ref of dxs) {
    for (const t of xTargets) {
      const dist = Math.abs(ref - t);
      if (dist <= threshold && (!bestX || dist < bestX.dist)) {
        bestX = { delta: t - ref, pos: t, dist };
      }
    }
  }

  let bestY: { delta: number; pos: number; dist: number } | null = null;
  for (const ref of dys) {
    for (const t of yTargets) {
      const dist = Math.abs(ref - t);
      if (dist <= threshold && (!bestY || dist < bestY.dist)) {
        bestY = { delta: t - ref, pos: t, dist };
      }
    }
  }

  const guides: Guide[] = [];
  let x = dragged.x;
  let y = dragged.y;
  if (bestX) {
    x += bestX.delta;
    guides.push({ axis: 'x', pos: bestX.pos });
  }
  if (bestY) {
    y += bestY.delta;
    guides.push({ axis: 'y', pos: bestY.pos });
  }
  return { x, y, guides };
}

/** Canvas-edge/center plus other items' edge/center positions along one axis. */
export function collectSnapTargets(canvasSize: number, others: Box[], axis: 'x' | 'y'): number[] {
  const targets = [0, canvasSize / 2, canvasSize];
  for (const o of others) {
    if (axis === 'x') targets.push(o.x, o.x + o.width / 2, o.x + o.width);
    else targets.push(o.y, o.y + o.height / 2, o.y + o.height);
  }
  return targets;
}

/** Nearest target within threshold, or null if none is close enough. */
export function nearestSnapTarget(value: number, targets: number[], threshold: number): number | null {
  let best: { pos: number; dist: number } | null = null;
  for (const t of targets) {
    const dist = Math.abs(value - t);
    if (dist <= threshold && (!best || dist < best.dist)) best = { pos: t, dist };
  }
  return best ? best.pos : null;
}
