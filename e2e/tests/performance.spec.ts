import { test, expect, type Page } from '@playwright/test';
import type Konva from 'konva';
import { act, addImage, state } from './helpers';

// What the editor does on every pointer move. Dragging one item mustn't
// re-render the others: re-rendering an item node rebinds every one of its
// Konva event handlers, which with 30 photos came to some 340 rebinds per
// move of a drag, and visible stutter on a slower phone.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__editorStore);
});

/** Page position of an item's centre, as drawn. */
async function centreOf(page: Page, id: string) {
  return page.evaluate((id) => {
    const K = window.Konva;
    const stage = K.stages[K.stages.length - 1];
    const r = stage.findOne('#' + id)!.getClientRect();
    const c = stage.container().getBoundingClientRect();
    return { x: c.left + r.x + r.width / 2, y: c.top + r.y + r.height / 2 };
  }, id);
}

/** From now on, count the event handlers bound on items other than `id` (and their parts). */
function countOtherItemsBinds(page: Page, id: string) {
  return page.evaluate((id) => {
    const w = window as unknown as { __binds: number };
    w.__binds = 0;
    const proto = window.Konva.Node.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- re-applied to each call's own node
    const on = proto.on;
    proto.on = function (this: typeof proto, ...args: Parameters<typeof on>) {
      const owner = this.hasName('item') ? this : this.findAncestor('.item');
      if (owner && owner.id() !== id) w.__binds++;
      return on.apply(this, args);
    } as typeof on;
  }, id);
}

test('dragging one item re-renders none of the others', async ({ page }) => {
  for (let i = 0; i < 6; i++) await addImage(page);
  // Swap off: dropping on another photo would swap the two and lay every
  // photo out again, which rightly re-renders them all.
  await act(
    page,
    "s.applyLayout({ type: 'grid' }); s.addText(); s.stopEditingText(); s.addSticker('🌟'); s.setSwapModeEnabled(false); s.select(null)",
  );
  expect(await state<boolean>(page, 's.snapEnabled'), 'snapping re-renders the stage as guides come and go').toBe(true);
  // A photo re-renders, rightly, when its image finishes loading: let them all load first.
  await page.waitForFunction(() => {
    const K = window.Konva;
    const photos = K.stages[K.stages.length - 1].find<Konva.Image>('Image').filter((n) => !!n.findAncestor('.item'));
    return photos.length === 6 && photos.every((n) => !!n.image());
  });
  const dragged = await state<string>(page, 's.items[0].id');
  const x = () => state<number>(page, `s.items.find((i) => i.id === '${dragged}').x`);
  const before = await x();
  const p = await centreOf(page, dragged);

  await countOtherItemsBinds(page, dragged);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 90, p.y + 45, { steps: 24 });
  await page.mouse.up();

  expect(await x()).toBeGreaterThan(before + 50);
  expect(await page.evaluate(() => (window as unknown as { __binds: number }).__binds)).toBe(0);
});
