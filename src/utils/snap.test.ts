import { describe, expect, it } from 'vitest';
import { collectSnapTargets, computeSnap, nearestSnapTarget, type Box } from './snap';

const box = (x: number, y: number, width = 100, height = 100): Box => ({ x, y, width, height });

describe('computeSnap', () => {
  it('pulls an edge onto the canvas edge within the threshold, with a guide there', () => {
    expect(computeSnap(box(4, 300), [], 1000, 1000, 6)).toEqual({ x: 0, y: 300, guides: [{ axis: 'x', pos: 0 }] });
  });

  it('centres on the canvas', () => {
    const out = computeSnap(box(447, 452), [], 1000, 1000, 6);
    expect(out.x).toBe(450);
    expect(out.y).toBe(450);
    expect(out.guides).toEqual([
      { axis: 'x', pos: 500 },
      { axis: 'y', pos: 500 },
    ]);
  });

  it("lines up with another item's edges", () => {
    const other = box(600, 100, 200, 50);
    // Left edge 3px short of the other item's right edge (800).
    expect(computeSnap(box(797, 400), [other], 2000, 2000, 6).x).toBe(800);
  });

  it('leaves a box alone when nothing is within the threshold', () => {
    expect(computeSnap(box(120, 330), [], 1000, 1000, 6)).toEqual({ x: 120, y: 330, guides: [] });
  });

  it('takes the nearest of several targets', () => {
    // Right edge (205) is 5 from 200 (canvas centre); left edge (105) is 2 from
    // the other item's right edge (103): the closer one wins.
    const out = computeSnap(box(105, 700), [box(3, 0)], 400, 1000, 6);
    expect(out.x).toBe(103);
    expect(out.guides).toEqual([{ axis: 'x', pos: 103 }]);
  });
});

describe('snap targets', () => {
  it('are the canvas edges and centre, plus each item’s edges and centre', () => {
    expect(collectSnapTargets(1000, [box(100, 50, 200, 80)], 'x')).toEqual([0, 500, 1000, 100, 200, 300]);
    expect(collectSnapTargets(1000, [box(100, 50, 200, 80)], 'y')).toEqual([0, 500, 1000, 50, 90, 130]);
  });

  it('snap to the nearest target in range, or none', () => {
    expect(nearestSnapTarget(497, [0, 500, 1000], 6)).toBe(500);
    expect(nearestSnapTarget(480, [0, 500, 1000], 6)).toBeNull();
    expect(nearestSnapTarget(3, [0, 5], 6)).toBe(5);
  });
});
