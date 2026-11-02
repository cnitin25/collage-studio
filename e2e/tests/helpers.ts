import { readFileSync } from 'node:fs';
import type { Download, Page } from '@playwright/test';

// Shared helpers for specs that drive the editor through its store. The store
// is exposed as window.__editorStore in dev builds only (see src/main.tsx),
// which is what `npm run test:e2e` runs against.

export type ImageKind = 'photo' | 'checker' | 'redblue' | 'solid';

/** Draw a test image in the page and add it to the canvas. Returns its item id.
 *  `fill` is the colour of a 'solid' image. */
export async function addImage(
  page: Page,
  kind: ImageKind = 'photo',
  w = 1200,
  h = 900,
  fill = '#00ff00',
): Promise<string> {
  return page.evaluate(
    async ({ kind, w, h, fill }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      if (kind === 'solid') {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, w, h);
      } else if (kind === 'checker') {
        // 1px checkerboard: maximum fine detail, so any resampling blur shows.
        const img = ctx.createImageData(w, h);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const v = (x + y) % 2 ? 255 : 0;
            const i = (y * w + x) * 4;
            img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
            img.data[i + 3] = 255;
          }
        ctx.putImageData(img, 0, 0);
      } else if (kind === 'redblue') {
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(0, 0, w / 2, h);
        ctx.fillStyle = '#0000ff';
        ctx.fillRect(w / 2, 0, w / 2, h);
      } else {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, '#ffb35e');
        g.addColorStop(1, '#4b2c6f');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff5dc';
        ctx.beginPath();
        ctx.arc(w * 0.3, h * 0.3, h * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
      const store = window.__editorStore;
      store.getState().addImages([{ src: URL.createObjectURL(blob), naturalWidth: w, naturalHeight: h }]);
      const items = store.getState().items;
      return items[items.length - 1].id;
    },
    { kind, w, h, fill },
  );
}

/** Pixel accessor handed to an analyzeExport() callback: [r, g, b, a] at (x, y). */
export type Px = (x: number, y: number) => [number, number, number, number];

/**
 * Decode a downloaded image in the page and run `analyze` over its pixels
 * there, returning only the result — a whole image's pixels are far too many
 * to ship back to the test. `analyze` is serialised, so it may only use its
 * arguments — pass anything else from the test in `arg`.
 */
export async function analyzeExport<T, A = undefined>(
  page: Page,
  download: Download,
  analyze: (px: Px, width: number, height: number, arg: A) => T,
  arg?: A,
): Promise<T> {
  const b64 = readFileSync((await download.path())).toString('base64');
  return page.evaluate(
    async ({ b64, src, arg }) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes]));
      const c = document.createElement('canvas');
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const px = (x: number, y: number) => {
        const i = (Math.round(y) * c.width + Math.round(x)) * 4;
        return [d[i], d[i + 1], d[i + 2], d[i + 3]];
      };
      // `analyze` arrives as source text: a function can't cross into the page.
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const run = new Function('px', 'w', 'h', 'arg', `return (${src})(px, w, h, arg);`) as (
        px: (x: number, y: number) => number[],
        w: number,
        h: number,
        arg: unknown,
      ) => unknown;
      return run(px, c.width, c.height, arg);
    },
    { b64, src: analyze.toString(), arg },
  ) as Promise<T>;
}

/** Run an expression against the store's current state: `s` is getState(). */
export function state<T>(page: Page, expr: string): Promise<T> {
  return page.evaluate<T>(`(() => { const s = window.__editorStore.getState(); return ${expr}; })()`);
}

/** Call store actions: `s` is getState(). */
export function act(page: Page, body: string): Promise<void> {
  return page.evaluate<void>(`(() => { const s = window.__editorStore.getState(); ${body}; })()`);
}

/** Keys currently in one of the app's IndexedDB object stores. */
export function idbKeys(page: Page, storeName: 'projects' | 'assets'): Promise<string[]> {
  return page.evaluate(
    async (storeName) =>
      // Opening a database that doesn't exist yet would create it — empty,
      // ahead of the app's own first open. Look it up first.
      !(await indexedDB.databases()).some((d) => d.name === 'collage-studio')
        ? []
        : new Promise<string[]>((resolve, reject) => {
            const req = indexedDB.open('collage-studio');
            req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
            req.onsuccess = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains(storeName)) {
                db.close();
                resolve([]);
                return;
              }
              const keysReq = db.transaction(storeName).objectStore(storeName).getAllKeys();
              keysReq.onsuccess = () => {
                db.close();
                resolve(keysReq.result as string[]);
              };
              keysReq.onerror = () => reject(keysReq.error ?? new Error('IndexedDB read failed'));
            };
          }),
    storeName,
  );
}

/** Canvas-to-screen geometry: the stage's page box and canvas px → screen px scale. */
export async function stageGeometry(page: Page) {
  const box = (await page.locator('.konvajs-content').boundingBox())!;
  const canvasWidth = await state<number>(page, 's.canvas.width');
  return { box, scale: box.width / canvasWidth };
}

/** Click Export with the given settings and return the downloaded file. */
export async function exportImage(page: Page, format: 'png' | 'jpeg', scale: number): Promise<Download> {
  await act(page, `s.setExportFormat('${format}'); s.setExportScale(${scale}); s.select(null)`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.toolbar-secondary').getByRole('button', { name: 'Export', exact: true }).click(),
  ]);
  return download;
}

export interface ImageStats {
  width: number;
  height: number;
  /** RGB of the pixel 3px in from the top-left corner */
  corner: [number, number, number];
  /** mean absolute horizontal luminance step over the centre third — higher = sharper */
  sharpness: number;
}

/**
 * Width, in image pixels, of the red→blue transition on the middle row of an
 * exported 'redblue' image — i.e. how far a blur has spread that edge.
 */
export async function redEdgeWidth(page: Page, download: Download): Promise<{ edge: number; imageWidth: number }> {
  const b64 = readFileSync((await download.path())).toString('base64');
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes]));
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    const row = ctx.getImageData(0, Math.floor(bmp.height / 2), bmp.width, 1).data;
    let edge = 0;
    // Only the central half: the photo's cell edges (margin) are elsewhere.
    for (let x = Math.floor(bmp.width / 4); x < (3 * bmp.width) / 4; x++) {
      const r = row[x * 4];
      if (r > 25 && r < 230) edge++;
    }
    return { edge, imageWidth: bmp.width };
  }, b64);
}

/** Decode a downloaded image in the browser and measure it. */
export async function imageStats(page: Page, download: Download, downscaleTo?: number): Promise<ImageStats> {
  const path = await download.path();
  const b64 = readFileSync(path).toString('base64');
  return page.evaluate(
    async ({ b64, downscaleTo }) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes]));
      const w = downscaleTo ?? bmp.width;
      const h = Math.round((bmp.height * w) / bmp.width);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, w, h);
      const d = ctx.getImageData(0, 0, w, h).data;
      const lum = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      };
      let sum = 0;
      let n = 0;
      for (let y = Math.floor(h / 3); y < (2 * h) / 3; y++)
        for (let x = Math.floor(w / 3); x < (2 * w) / 3; x++) {
          sum += Math.abs(lum(x + 1, y) - lum(x, y));
          n++;
        }
      const i = (3 * w + 3) * 4;
      return {
        width: bmp.width,
        height: bmp.height,
        corner: [d[i], d[i + 1], d[i + 2]] as [number, number, number],
        sharpness: sum / n,
      };
    },
    { b64, downscaleTo },
  );
}
