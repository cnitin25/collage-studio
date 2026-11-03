import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/itemBox', () => ({
  textHeight: (t: { fontSize: number }) => t.fontSize * 1.4,
  itemSize: (it: { width: number; height: number }) => ({ width: it.width, height: it.height }),
}));

const { useEditorStore } = await import('./useEditorStore');

const s = () => useEditorStore.getState();
const photo = { src: 'blob:test/photo', naturalWidth: 1200, naturalHeight: 800 };
let clock = 0;

/** Three 100x100 photos at x = 0, 300, 700 (y = 0), nothing selected. */
function three(): string[] {
  s().addImages([photo, photo, photo]);
  const ids = s().items.map((i) => i.id);
  ids.forEach((id, i) => s().updateItem(id, { x: [0, 300, 700][i], y: 0, width: 100, height: 100, rotation: 0 }));
  s().select(null);
  return ids;
}

beforeEach(() => {
  s().resetProject();
  clock += 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

describe('selecting', () => {
  it('one item makes it the selected item; several leave no single one', () => {
    const [a, b] = three();
    s().select(a);
    expect([s().selectedIds, s().selectedId]).toEqual([[a], a]);
    s().toggleSelected(b);
    expect([s().selectedIds, s().selectedId]).toEqual([[a, b], null]);
    s().toggleSelected(a);
    expect([s().selectedIds, s().selectedId]).toEqual([[b], b]);
  });

  it('select all, and a box selection that adds to what is selected', () => {
    const [a, b, c] = three();
    s().selectAll();
    expect(s().selectedIds).toEqual([a, b, c]);
    s().select(a);
    s().selectMany([c], true);
    expect(s().selectedIds).toEqual([a, c]);
    s().selectMany([b]);
    expect(s().selectedIds).toEqual([b]);
  });

  it('keeps what still exists after an undo', () => {
    const [a, b] = three();
    s().selectMany([a, b]);
    s().removeSelected();
    s().undo();
    s().selectMany([a, b]);
    s().updateItem(a, { x: 5 });
    s().undo();
    expect(s().selectedIds).toEqual([a, b]);
  });
});

describe('groups', () => {
  it('select, toggle and delete together', () => {
    const [a, b, c] = three();
    s().selectMany([a, b]);
    s().groupSelected();
    expect(s().historyLabels.at(-1)).toBe('Group');
    s().select(a);
    expect(s().selectedIds).toEqual([a, b]);
    s().select(c);
    s().toggleSelected(b);
    expect(s().selectedIds, 'the whole group comes in').toEqual([c, a, b]);
    s().toggleSelected(a);
    expect(s().selectedIds, 'and goes out').toEqual([c]);
  });

  it('ungroup is one undo step, and needs a group', () => {
    const [a, b] = three();
    s().selectMany([a, b]);
    const steps = s().past.length;
    s().ungroupSelected();
    expect(s().past.length, 'nothing to ungroup').toBe(steps);
    s().groupSelected();
    s().ungroupSelected();
    expect(s().items.some((i) => i.groupId)).toBe(false);
    s().undo();
    expect(s().items.filter((i) => i.groupId)).toHaveLength(2);
  });

  it('copies of a group make a new group, not more members of the old one', () => {
    const [a, b] = three();
    s().selectMany([a, b]);
    s().groupSelected();
    const original = s().items[0].groupId;
    s().duplicateSelected();
    const copies = s().items.slice(3);
    expect(copies.map((i) => i.groupId)).toEqual([copies[0].groupId, copies[0].groupId]);
    expect(copies[0].groupId).not.toBe(original);
    expect(s().selectedIds).toEqual(copies.map((i) => i.id));
  });
});

describe('align and distribute', () => {
  it('one item aligns to the canvas; several to the box round them', () => {
    const [a, b, c] = three();
    s().updateItem(b, { y: 50 });
    s().selectMany([a, b, c]);
    s().alignItems('bottom');
    expect(s().items.map((i) => i.y)).toEqual([50, 50, 50]);
    s().select(a);
    s().alignItems('right');
    expect(s().items[0].x).toBe(1080 - 100);
  });

  it('aligns what is drawn: a rotated item by its rotated box', () => {
    const [a, b] = three();
    s().updateItem(b, { rotation: 90 }); // spans x 200..300 around its corner at 300
    s().selectMany([a, b]);
    s().alignItems('left');
    expect(s().items[1].x - 100, 'its drawn left edge').toBeCloseTo(0, 6);
    expect(s().items[0].x).toBe(0);
  });

  it('distributing leaves the ends and evens the gaps, as one step', () => {
    const [a, b, c] = three();
    s().selectMany([a, b, c]);
    const steps = s().past.length;
    s().distributeSelection('x');
    expect(s().items.map((i) => i.x)).toEqual([0, 350, 700]);
    expect(s().past.length).toBe(steps + 1);
  });

  it('needs three to distribute', () => {
    const [a, b] = three();
    s().selectMany([a, b]);
    const steps = s().past.length;
    s().distributeSelection('y');
    expect(s().past.length).toBe(steps);
  });
});

describe('moving several', () => {
  it('a run of nudges on the same selection is one step; a new selection starts another', () => {
    const [a, b, c] = three();
    s().selectMany([a, b]);
    for (let i = 0; i < 5; i++) {
      s().nudgeSelected(2, 0);
      clock += 30;
    }
    expect(s().items.map((i) => i.x)).toEqual([10, 310, 700]);
    expect(s().historyLabels.filter((l) => l === 'Move')).toHaveLength(1);
    s().selectMany([b, c]);
    s().nudgeSelected(0, 1);
    expect(s().historyLabels.filter((l) => l === 'Move')).toHaveLength(2);
  });

  it('updateItems applies every patch as one undo step', () => {
    const [a, b] = three();
    const steps = s().past.length;
    s().updateItems(
      [
        { id: a, patch: { x: 11 } },
        { id: b, patch: { x: 22, width: 150 } },
      ],
      'Transform',
    );
    expect(s().items.map((i) => i.x).slice(0, 2)).toEqual([11, 22]);
    expect(s().past.length).toBe(steps + 1);
    expect(s().historyLabels.at(-1)).toBe('Transform');
    s().undo();
    expect(s().items.map((i) => i.x).slice(0, 2)).toEqual([0, 300]);
  });
});
