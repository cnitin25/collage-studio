import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/itemBox', () => ({
  textHeight: (t: { fontSize: number }) => t.fontSize * 1.4,
  itemSize: (it: { width: number; height: number }) => ({ width: it.width, height: it.height }),
}));

const { useEditorStore } = await import('./useEditorStore');

const s = () => useEditorStore.getState();
const photo = { src: 'blob:test/photo', naturalWidth: 1200, naturalHeight: 800 };

/** The selected item's copy, as the system clipboard would hand it back. */
const copied = () => {
  const clip = s().copySelected()!;
  return { text: clip.text, token: clip.token };
};

beforeEach(() => {
  s().resetProject();
  useEditorStore.setState({ itemClipboard: null });
});

describe('copy', () => {
  it('gives a text item’s text for the system clipboard, nothing for a photo', () => {
    s().addImages([photo]);
    expect(s().copySelected()!.text).toBe('');
    s().addText();
    s().stopEditingText();
    expect(s().copySelected()!.text).toBe('Your text');
  });

  it('needs a selection, and records no undo step', () => {
    s().addImages([photo]);
    s().select(null);
    expect(s().copySelected()).toBeNull();
    s().select(s().items[0].id);
    s().copySelected();
    expect(s().historyLabels).toEqual(['Add photos']);
  });
});

describe('paste', () => {
  it('of the app’s own copy adds it one step further each time, selected, as one undo step', () => {
    s().addImages([photo]);
    const { x, assetId } = s().items[0] as { x: number; assetId: string };
    const clip = copied();
    expect(s().pasteFromClipboard(clip)).toBe(true);
    expect(s().pasteFromClipboard(clip)).toBe(true);
    const [, first, second] = s().items as { id: string; x: number; assetId: string }[];
    expect([first.x, second.x]).toEqual([x + 28, x + 56]);
    expect(first.assetId).toBe(assetId);
    expect(new Set(s().items.map((i) => i.id)).size).toBe(3);
    expect(s().selectedId).toBe(second.id);
    expect(s().historyLabels.slice(-2)).toEqual(['Paste', 'Paste']);
  });

  it('after a cut puts the item back where it was', () => {
    s().addImages([photo]);
    const { x, y } = s().items[0];
    const clip = s().cutSelected()!;
    expect(s().items).toEqual([]);
    expect(s().historyLabels.at(-1)).toBe('Cut');
    s().pasteFromClipboard({ text: clip.text, token: clip.token });
    expect([s().items[0].x, s().items[0].y]).toEqual([x, y]);
  });

  it('falls back to comparing the text where a browser drops the app’s own type', () => {
    s().addText();
    s().stopEditingText();
    s().updateItem(s().items[0].id, { fill: '#ff0000' });
    copied();
    s().pasteFromClipboard({ text: 'Your text', token: '' });
    expect(s().items[1]).toMatchObject({ type: 'text', fill: '#ff0000' });
  });

  it('of text another app copied makes a plain text box with it', () => {
    s().addImages([photo]);
    copied();
    s().pasteFromClipboard({ text: 'From an email', token: '' });
    expect(s().items[1]).toMatchObject({ type: 'text', text: 'From an email', fill: '#15171d' });
  });

  it('of another tab’s copy is that copy’s text, not this tab’s item', () => {
    s().addImages([photo]);
    copied();
    s().pasteFromClipboard({ text: 'Copied over there', token: 'clip_other' });
    expect(s().items[1]).toMatchObject({ type: 'text', text: 'Copied over there' });
  });

  it('of nothing does nothing', () => {
    expect(s().pasteFromClipboard({ text: '  ', token: '' })).toBe(false);
    expect(s().items).toEqual([]);
    expect(s().historyLabels).toEqual([]);
  });

  it('still works in another project', () => {
    s().addImages([photo]);
    const clip = copied();
    s().resetProject();
    s().pasteFromClipboard(clip);
    expect(s().items).toHaveLength(1);
  });
});
