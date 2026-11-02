import { beforeEach, describe, expect, it, vi } from 'vitest';

// itemBox measures text with Konva, which needs a real canvas; the history
// never depends on the exact height, so a plain estimate stands in.
vi.mock('../utils/itemBox', () => ({
  textHeight: (t: { fontSize: number }) => t.fontSize * 1.4,
  itemSize: (it: { type: string; width: number; height: number; fontSize?: number }) =>
    it.type === 'sticker' ? { width: it.fontSize, height: it.fontSize } : { width: it.width, height: it.height },
}));

const { useEditorStore, hasUnsavedChanges, needsSaving, savedRefOf } = await import('./useEditorStore');

const s = () => useEditorStore.getState();
const photo = (w = 1200, h = 800) => ({ src: 'blob:test/photo', naturalWidth: w, naturalHeight: h });
const firstId = () => s().items[0].id;
let clock = 0;

beforeEach(() => {
  s().resetProject();
  // Nudges merge by time: run them on a clock the tests move by hand.
  clock += 10_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});

describe('undo and redo', () => {
  it('record one labelled step per action and walk back and forth through it', () => {
    s().addImages([photo()]);
    const added = s().items;
    s().updateItem(firstId(), { width: 500 });
    expect(s().historyLabels).toEqual(['Add photos', 'Edit item']);

    s().undo();
    expect(s().items[0].width).toBe(added[0].width);
    s().undo();
    expect(s().items).toEqual([]);
    expect(s().canUndo()).toBe(false);

    s().redo();
    s().redo();
    expect(s().items[0].width).toBe(500);
    expect(s().canRedo()).toBe(false);
  });

  it('drop the redo branch when a new action follows an undo', () => {
    s().addImages([photo()]);
    s().updateItem(firstId(), { width: 500 });
    s().undo();
    s().updateItem(firstId(), { height: 99 });
    expect(s().canRedo()).toBe(false);
    expect(s().future).toEqual([]);
    expect(s().futureLabels).toEqual([]);
  });

  it('keep 60 steps, dropping the oldest, labels in step with them', () => {
    s().addImages([photo()]);
    for (let i = 0; i < 70; i++) s().updateItem(firstId(), { x: i });
    expect(s().past).toHaveLength(60);
    expect(s().historyLabels).toHaveLength(60);
    expect(s().historyLabels).not.toContain('Add photos');
  });

  it('restore a snapshot that later edits never reached', () => {
    s().addImages([photo()]);
    s().updateItem(firstId(), { filters: { brightness: 10 } });
    s().updateItem(firstId(), { filters: { brightness: 80 } });
    s().undo();
    const [img] = s().items;
    expect(img.type === 'image' ? img.filters : undefined).toEqual({ brightness: 10 });
  });

  it('keep the selection on an item that still exists, and drop it when it is gone', () => {
    s().addImages([photo()]);
    const id = firstId();
    s().updateItem(id, { width: 400 });
    s().select(id);
    s().undo();
    expect(s().selectedId).toBe(id);
    s().undo();
    expect(s().selectedId).toBeNull();
  });
});

describe('a gesture (beginChange … commitChange)', () => {
  it('is one step however many live updates it makes', () => {
    s().addImages([photo()]);
    s().beginChange('Resize');
    for (let w = 300; w <= 400; w += 10) s().updateItemLive(firstId(), { width: w });
    s().commitChange();
    expect(s().historyLabels).toEqual(['Add photos', 'Resize']);
    s().undo();
    expect(s().items[0].width).not.toBe(400);
  });

  it('records nothing when cancelled', () => {
    s().addImages([photo()]);
    s().beginChange('Edit text');
    s().cancelChange();
    s().commitChange();
    expect(s().historyLabels).toEqual(['Add photos']);
  });

  it('keeps the state from before the first beginChange if a second one follows', () => {
    s().addImages([photo()]);
    const before = s().items[0].width;
    s().beginChange('Drag');
    s().updateItemLive(firstId(), { width: 111 });
    s().beginChange('Drag again');
    s().updateItemLive(firstId(), { width: 222 });
    s().commitChange();
    expect(s().historyLabels.at(-1)).toBe('Drag');
    s().undo();
    expect(s().items[0].width).toBe(before);
  });
});

describe('arrow-key nudges', () => {
  it('a run on one item within a second is one "Move" step', () => {
    s().addImages([photo()]);
    s().select(firstId());
    const x = s().items[0].x;
    for (let i = 0; i < 20; i++) {
      s().nudgeSelected(1, 0);
      clock += 30;
    }
    expect(s().items[0].x).toBe(x + 20);
    expect(s().historyLabels).toEqual(['Add photos', 'Move']);
    s().undo();
    expect(s().items[0].x).toBe(x);
  });

  it('a pause, another action, or an undo in between starts a new step', () => {
    s().addImages([photo()]);
    s().select(firstId());
    s().nudgeSelected(1, 0);
    clock += 1500;
    s().nudgeSelected(1, 0);
    expect(s().historyLabels.filter((l) => l === 'Move')).toHaveLength(2);

    s().updateItem(firstId(), { width: 300 });
    s().nudgeSelected(0, 1);
    expect(s().historyLabels.filter((l) => l === 'Move')).toHaveLength(3);

    s().undo();
    s().nudgeSelected(0, 1);
    expect(s().historyLabels.at(-1)).toBe('Move');
    expect(s().canRedo()).toBe(false);
  });
});

describe('unsaved changes', () => {
  const markSaved = () => s().markSaved(savedRefOf(s()));

  it('are none right after a save, and some after an edit', () => {
    s().addImages([photo()]);
    markSaved();
    expect(hasUnsavedChanges(s())).toBe(false);
    s().updateItem(firstId(), { width: 400 });
    expect(hasUnsavedChanges(s())).toBe(true);
  });

  it('are never reported for an empty canvas, but a cleared saved collage still needs saving', () => {
    expect(hasUnsavedChanges(s())).toBe(false);
    s().addImages([photo()]);
    markSaved();
    s().clearAll();
    expect(hasUnsavedChanges(s())).toBe(false);
    expect(needsSaving(s())).toBe(true);
  });

  it('are none after opening a project, which also starts a fresh history', () => {
    s().addImages([photo()]);
    const state = { canvas: s().canvas, items: s().items, spacing: s().spacing, lastLayout: s().lastLayout };
    s().loadSerializedState(state, 'proj_x', 'Trip', 1);
    expect(hasUnsavedChanges(s())).toBe(false);
    expect(s().past).toEqual([]);
    expect(s().projectName).toBe('Trip');
  });
});
