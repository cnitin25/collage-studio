import { test, expect, type Page } from '@playwright/test';
import { act, addImage, idbKeys, state } from './helpers';

// Saving defaults and recovery: auto-save is on unless switched off (and the
// choice is remembered), the last project reopens on load, and no save can
// lose a photo — to another tab's cleanup, or to a background type switch.

async function ready(page: Page) {
  await page.waitForFunction(() => !!window.__editorStore);
}

async function save(page: Page) {
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast')).toHaveText('Saved');
}

/** What a phone does when the user switches apps: the page goes hidden. */
async function hidePage(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/** The current project's stored record, read straight from IndexedDB. */
async function storedProject(page: Page) {
  const id = await state<string>(page, 's.currentProjectId');
  return page.evaluate(
    (id) =>
      new Promise<{ items: number; assetIds: string[] } | null>((resolve, reject) => {
        const req = indexedDB.open('collage-studio');
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('projects').objectStore('projects').get(id);
          get.onsuccess = () => {
            db.close();
            const p = get.result as { state: { items: { assetId: string }[] } } | undefined;
            resolve(p ? { items: p.state.items.length, assetIds: p.state.items.map((i) => i.assetId) } : null);
          };
          get.onerror = () => reject(get.error ?? new Error('IndexedDB read failed'));
        };
      }),
    id,
  );
}

const autoSaveToggle = (page: Page) => page.getByRole('button', { name: 'Auto-save', exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await ready(page);
});

test('auto-save is on by default, and switching it off is remembered', async ({ page }) => {
  await expect(autoSaveToggle(page)).toHaveAttribute('aria-pressed', 'true');
  await autoSaveToggle(page).click();
  await expect(autoSaveToggle(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.toast')).toContainText('Auto-save is off');

  await page.reload();
  await ready(page);
  await expect(autoSaveToggle(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await state<boolean>(page, 's.autoSaveEnabled')).toBe(false);
});

test('the toolbar toggle and the Projects checkbox are one setting', async ({ page }) => {
  await autoSaveToggle(page).click();
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Projects', exact: true }).click();
  const box = page.getByRole('checkbox', { name: /Auto-save/ });
  await expect(box).not.toBeChecked();
  await box.check();
  await page.keyboard.press('Escape');
  await expect(autoSaveToggle(page)).toHaveAttribute('aria-pressed', 'true');
});

test('the last project reopens after a reload, exactly as saved', async ({ page }) => {
  await addImage(page);
  await act(page, "s.setProjectName('Beach trip')");
  await save(page);

  await page.reload();
  await ready(page);
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(1);
  expect(await state<string>(page, 's.projectName')).toBe('Beach trip');
  // Nothing to save or prompt for: it is the saved state.
  expect(await state<boolean>(page, 's.items === s.savedRef.items')).toBe(true);
  await expect(page.locator('.toast')).toContainText('Beach trip');
});

test('after New project, a reload starts empty instead of reopening the old one', async ({ page }) => {
  await addImage(page);
  await save(page);
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project' }).click();

  await page.reload();
  await ready(page);
  await page.waitForTimeout(800);
  expect(await state<number>(page, 's.items.length')).toBe(0);
});

test('a project that crashed while reopening is not reopened again', async ({ page }) => {
  await addImage(page);
  await save(page);
  // What a crash during the reopen leaves behind: a restore never confirmed.
  const id = await state<string>(page, 's.currentProjectId');
  await page.evaluate((id) => localStorage.setItem('collage-studio-restore-pending', id), id);

  await page.reload();
  await ready(page);
  await expect(page.locator('.toast')).toContainText("didn't open cleanly");
  expect(await state<number>(page, 's.items.length')).toBe(0);

  // Not forced on the user at the next load either; it waits in Projects.
  await page.reload();
  await ready(page);
  await page.waitForTimeout(800);
  expect(await state<number>(page, 's.items.length')).toBe(0);
});

test("two tabs saving at once can't delete each other's photos", async ({ page }) => {
  const other = await page.context().newPage();
  await other.goto('/');
  await ready(other);

  await addImage(page);
  await addImage(page);
  // Slow this tab's second photo read: its first photo is stored but its
  // project record isn't yet — the window another tab's cleanup fell into.
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    let reads = 0;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('blob:') && ++reads === 2) await new Promise((r) => setTimeout(r, 1500));
      return original(input, init);
    };
  });
  await page.locator('.toolbar-secondary').getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(500);
  await addImage(other);
  await save(other);
  await expect(page.locator('.toast')).toHaveText('Saved', { timeout: 10_000 });

  const stored = (await storedProject(page))!;
  const keys = await idbKeys(page, 'assets');
  expect(stored.assetIds).toHaveLength(2);
  expect(stored.assetIds.filter((a) => !keys.includes(a)), 'photos missing from storage').toEqual([]);
});

test('an uploaded background survives switching the background type before saving', async ({ page }) => {
  await addImage(page);
  await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 200;
    c.getContext('2d')!.fillRect(0, 0, 300, 200);
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!)));
    const store = window.__editorStore;
    store.getState().setBackground({
      backgroundType: 'image',
      backgroundImageSrc: URL.createObjectURL(blob),
      backgroundAssetId: 'asset_upload',
    });
    store.getState().setBackground({ backgroundType: 'gradient' });
  });
  await save(page);

  await page.reload();
  await ready(page);
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(1);
  expect(await state<string>(page, 's.canvas.backgroundAssetId')).toBe('asset_upload');
  const src = await state<string>(page, 's.canvas.backgroundImageSrc');
  expect(src).toMatch(/^blob:/);
  const bytes = await page.evaluate(async (src) => (await (await fetch(src)).blob()).size, src);
  expect(bytes).toBeGreaterThan(100);
});

test("a database that exists without the app's stores is repaired, not left failing every save", async ({ page }) => {
  // Something opened it before the app ever did: version 1, no stores.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.open('collage-studio');
        req.onsuccess = () => {
          req.result.close();
          resolve();
        };
      }),
  );
  await addImage(page);
  await save(page);
  expect(await idbKeys(page, 'projects')).toHaveLength(1);
});

test('clearing a saved collage is saved too, so reopening it does not bring the photos back', async ({ page }) => {
  await addImage(page);
  await save(page);
  await act(page, 's.clearAll()');
  await hidePage(page);
  await expect.poll(async () => (await storedProject(page))?.items).toBe(0);
});

/** Size and type of the photo a blob: URL points at, read in the page. */
const photoAt = (page: Page, src: string) =>
  page.evaluate(async (src) => {
    const blob = await (await fetch(src)).blob();
    return { size: blob.size, type: blob.type };
  }, src);

test('saving works where IndexedDB cannot store a Blob, as in a Safari private window', async ({ page }) => {
  // What Safari does in a private window (WebKit bugs 188438 and 268037):
  // any record holding a Blob is refused.
  await page.evaluate(() => {
    for (const method of ['put', 'add'] as const) {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- re-applied to each call's own store
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
        const value: unknown = args[0];
        const fields = typeof value === 'object' && value !== null ? Object.values(value) : [];
        if (value instanceof Blob || fields.some((v) => v instanceof Blob)) {
          throw new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError');
        }
        return original.apply(this, args);
      };
    }
  });
  await addImage(page);
  const before = await photoAt(page, await state<string>(page, 's.items[0].src'));
  await save(page);

  await page.reload();
  await ready(page);
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(1);
  expect(await photoAt(page, await state<string>(page, 's.items[0].src'))).toEqual(before);
});

test('photos stored as Blobs by earlier versions still open', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', "WebKit's test contexts can't store a Blob in IndexedDB at all");
  await addImage(page);
  const before = await photoAt(page, await state<string>(page, 's.items[0].src'));
  await save(page);
  // Rewrite every stored photo the way earlier versions stored it.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('collage-studio');
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('assets', 'readwrite');
          const store = tx.objectStore('assets');
          const all = store.getAll();
          all.onsuccess = () => {
            type Rec = { id: string; blob?: Blob; bytes?: ArrayBuffer; type?: string };
            for (const rec of all.result as Rec[]) {
              const blob = rec.blob ?? new Blob([rec.bytes!], { type: rec.type });
              store.put({ id: rec.id, blob });
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
        };
      }),
  );

  await page.reload();
  await ready(page);
  await expect.poll(() => state<number>(page, 's.items.length')).toBe(1);
  expect(await photoAt(page, await state<string>(page, 's.items[0].src'))).toEqual(before);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the auto-save toggle stays on the toolbar, finger-sized', async ({ page }) => {
    await expect(autoSaveToggle(page)).toBeVisible();
    const box = (await autoSaveToggle(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await autoSaveToggle(page).tap();
    expect(await state<boolean>(page, 's.autoSaveEnabled')).toBe(false);
  });

  for (const width of [360, 390, 412]) {
    test(`at ${width}px every toolbar control fits, none overlapping`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const boxes: { name: string; x: number; right: number }[] = [];
      for (const el of await page.locator('.toolbar button, .toolbar input, .toolbar .divider').all()) {
        if (!(await el.isVisible())) continue;
        const box = (await el.boundingBox())!;
        boxes.push({ name: (await el.getAttribute('aria-label')) ?? 'divider', x: box.x, right: box.x + box.width });
      }
      boxes.sort((a, b) => a.x - b.x);
      expect(boxes.length).toBeGreaterThanOrEqual(7);
      for (const [i, b] of boxes.entries()) {
        expect(b.right, b.name).toBeLessThanOrEqual(width);
        if (i > 0) expect(b.x, `${b.name} overlaps ${boxes[i - 1].name}`).toBeGreaterThanOrEqual(boxes[i - 1].right - 0.5);
      }
    });
  }

  test('with the name field hidden, the ⋯ menu renames the project', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Project name' })).toBeHidden();
    await page.locator('.toolbar-overflow-toggle').click();
    page.once('dialog', (d) => d.accept('Birthday'));
    await page.locator('.overflow-menu').getByRole('menuitem', { name: 'Rename project…' }).click();
    expect(await state<string>(page, 's.projectName')).toBe('Birthday');
  });
});
