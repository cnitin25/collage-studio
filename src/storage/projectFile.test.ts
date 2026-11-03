import { describe, expect, it } from 'vitest';
import type { ImageItem, StickerItem, TextItem } from '../types';
import { importProjectFile } from './projectFile';

// A 1x1 PNG, embedded the way an exported project file carries photos.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const photo = (extra: Record<string, unknown> = {}) => ({
  id: 'img_old',
  type: 'image',
  x: 10,
  y: 20,
  width: 300,
  height: 200,
  rotation: 0,
  naturalWidth: 1200,
  naturalHeight: 800,
  src: PNG,
  ...extra,
});

const project = (extra: Record<string, unknown> = {}) => ({
  fileVersion: 1,
  name: 'Trip',
  canvas: { width: 1080, height: 1080, backgroundType: 'color', backgroundColor: '#ffffff' },
  spacing: { margin: 24, gutter: 12, padding: 0 },
  lastLayout: { type: 'grid', cols: 2 },
  items: [photo()],
  ...extra,
});

const file = (content: unknown) =>
  new File([typeof content === 'string' ? content : JSON.stringify(content)], 'trip.collagestudio.json', {
    type: 'application/json',
  });

const open = (content: unknown) => importProjectFile(file(content));

describe('importProjectFile refuses', () => {
  it('a file that is not JSON', async () => {
    await expect(open('{"items": [')).rejects.toThrow('not valid JSON');
  });

  it('JSON that is not a project', async () => {
    await expect(open({ hello: 'world' })).rejects.toThrow('not a Collage Studio project');
    await expect(open([1, 2, 3])).rejects.toThrow('not a Collage Studio project');
  });

  it('a project saved by a newer version', async () => {
    await expect(open(project({ fileVersion: 2 }))).rejects.toThrow('newer version');
  });

  it('a canvas without a usable size', async () => {
    for (const size of [{ width: 0, height: 100 }, { width: 1080 }, { width: 50_000, height: 1080 }, { width: '1080', height: 1080 }]) {
      await expect(open(project({ canvas: { ...size, backgroundType: 'color' } }))).rejects.toThrow('canvas size');
    }
  });
});

describe('importProjectFile reads', () => {
  it('a photo, under a new id, with its embedded image turned back into a blob: URL', async () => {
    const out = await open(project());
    expect(out.name).toBe('Trip');
    expect(out.skipped).toEqual([]);
    const [img] = out.items as ImageItem[];
    expect(img).toMatchObject({ type: 'image', x: 10, y: 20, width: 300, height: 200, naturalWidth: 1200 });
    expect(img.id).not.toBe('img_old');
    expect(img.src).toMatch(/^blob:/);
    expect(img.assetId).toMatch(/^asset_/);
    expect((await (await fetch(img.src)).blob()).size).toBeGreaterThan(50);
  });

  it('text and stickers, filling in what an older file leaves out', async () => {
    const out = await open(
      project({
        items: [
          { type: 'text', x: 0, y: 0, width: 400, text: 'Hello', fontSize: 50 },
          { type: 'sticker', x: 5, y: 5, emoji: '🌴', fontSize: 80, width: 1, height: 1 },
        ],
      }),
    );
    const [text, sticker] = out.items as [TextItem, StickerItem];
    expect(text).toMatchObject({
      height: 70,
      rotation: 0,
      fontStyle: 'normal',
      fill: '#15171d',
      align: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    });
    expect(sticker).toMatchObject({ emoji: '🌴', width: 80, height: 80 });
  });

  it('text effects, clamped to what the editor can draw', async () => {
    const out = await open(
      project({
        items: [
          {
            type: 'text',
            x: 0,
            y: 0,
            width: 400,
            text: 'Hi',
            fontSize: 50,
            letterSpacing: 12,
            outlineColor: '#ff0000',
            outlineWidth: 900,
            shadow: { color: '#000', blur: 6, opacity: 0.5, offsetX: 2, offsetY: 3 },
            background: { color: '#ffd84d', opacity: 3, padding: 16, radius: 8 },
          },
          { type: 'text', x: 0, y: 0, width: 400, text: 'Broken', fontSize: 50, background: { color: '#fff', padding: 4 } },
        ],
      }),
    );
    const [styled, broken] = out.items as TextItem[];
    expect(styled).toMatchObject({
      letterSpacing: 12,
      outlineColor: '#ff0000',
      outlineWidth: 100,
      shadow: { color: '#000', blur: 6, opacity: 0.5, offsetX: 2, offsetY: 3 },
      background: { color: '#ffd84d', opacity: 1, padding: 16, radius: 8 },
    });
    expect(broken.background, 'a highlight missing fields is left out').toBeUndefined();
  });

  it('the layout and spacing, or safe defaults when they are missing or broken', async () => {
    const out = await open(project());
    expect(out.spacing).toEqual({ margin: 24, gutter: 12, padding: 0 });
    expect(out.lastLayout).toEqual({ type: 'grid', cols: 2 });
    const broken = await open(project({ spacing: { margin: 24 }, lastLayout: { type: 'hexagon' } }));
    expect(broken.spacing).toEqual({ margin: 24, gutter: 12, padding: 0 });
    expect(broken.lastLayout).toBeNull();
    const badCols = await open(project({ lastLayout: { type: 'grid', cols: 0 } }));
    expect(badCols.lastLayout).toEqual({ type: 'grid' });
  });
});

describe('importProjectFile leaves out and reports', () => {
  it('a photo that links to the internet instead of embedding the image', async () => {
    const out = await open(project({ items: [photo({ src: 'https://example.com/a.jpg' })] }));
    expect(out.items).toEqual([]);
    expect(out.skipped).toEqual([{ name: 'Photo 1', reason: expect.stringContaining('outside address') as string }]);
  });

  it('a photo whose size or position is missing', async () => {
    const out = await open(project({ items: [photo({ naturalWidth: undefined }), photo({ x: 'left' })] }));
    expect(out.items).toEqual([]);
    expect(out.skipped.map((s) => s.name)).toEqual(['Photo 1', 'Photo 2']);
  });

  it('an item of a kind this version does not know', async () => {
    const out = await open(project({ items: [{ type: 'video', x: 0, y: 0 }] }));
    expect(out.skipped).toEqual([{ name: 'An item', reason: expect.stringContaining('"video"') as string }]);
  });

  it('a background that links to the internet; a dead blob: one is dropped silently', async () => {
    const linked = await open(project({ canvas: { width: 100, height: 100, backgroundImageSrc: 'https://x.test/b.png' } }));
    expect(linked.skipped).toEqual([{ name: 'Background image', reason: expect.stringContaining('outside address') as string }]);
    expect(linked.canvas.backgroundImageSrc).toBeUndefined();
    const dead = await open(project({ canvas: { width: 100, height: 100, backgroundImageSrc: 'blob:http://x/1' } }));
    expect(dead.skipped).toEqual([]);
    expect(dead.canvas.backgroundImageSrc).toBeUndefined();
  });
});

describe('importProjectFile keeps out of the editor', () => {
  it('fields it does not know, on items and on the canvas', async () => {
    const out = await open(
      project({
        canvas: { width: 1080, height: 1080, backgroundType: 'color', backgroundColor: '#fff', onload: 'x' },
        items: [photo({ evil: '<script>', __proto__polluted: true })],
      }),
    );
    expect(out.canvas).not.toHaveProperty('onload');
    expect(out.items[0]).not.toHaveProperty('evil');
    expect(out.items[0]).not.toHaveProperty('__proto__polluted');
  });

  it('out-of-range numbers and unknown choices', async () => {
    const out = await open(
      project({
        items: [
          photo({
            opacity: 500,
            borderStyle: 'wavy',
            clipShape: 'star',
            filters: { brightness: 999, blur: -3, presetId: 'nope', grayscale: 'yes' },
          }),
        ],
      }),
    );
    const [img] = out.items as ImageItem[];
    expect(img.opacity).toBe(100);
    expect(img.borderStyle).toBeUndefined();
    expect(img.clipShape).toBeUndefined();
    expect(img.filters).toEqual({ brightness: 100, blur: 0 });
  });

  it('photo adjustments, clamped to what the editor offers', async () => {
    const out = await open(
      project({
        items: [
          photo({
            filters: { exposure: 300, highlights: -400, shadows: 40, vibrance: 'lots', sharpen: -5, vignette: -250 },
          }),
        ],
      }),
    );
    const [img] = out.items as ImageItem[];
    expect(img.filters).toEqual({ exposure: 100, highlights: -100, shadows: 40, sharpen: 0, vignette: -100 });
  });

  it('a crop that reaches outside the photo, and a shadow missing a field', async () => {
    const out = await open(
      project({
        items: [
          photo({
            crop: { x: 1000, y: 0, width: 400, height: 300 },
            shadow: { color: '#000', blur: 10, opacity: 0.5, offsetX: 0 },
          }),
        ],
      }),
    );
    const [img] = out.items as ImageItem[];
    expect(img.crop).toBeUndefined();
    expect(img.shadow).toBeUndefined();
  });
});
