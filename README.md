# Collage Studio

An offline, browser-based photo collage editor. Drop in photos, arrange them
with layout tools, edit and style each one, add text/stickers, and export a
finished collage — all client-side, with no server and no account. Photos
never leave your device.

## What it does

- **Import** — drag-and-drop or click to browse; multiple photos at once,
  including HEIC/HEIF (converted to JPEG automatically, fully offline).
- **Layout** — Grid, Justified, and Mosaic auto-layout strategies with
  ranked suggestions, plus manual free placement, resize, rotate, and drag-
  to-swap. Outer margin, spacing, and per-cell padding are adjustable live.
- **Per-photo editing** — crop (drag + zoom), brightness/contrast/
  saturation/blur/warmth, one-click enhance presets (Brighten, Darken,
  Antique, Vivid, Warm, Auto) with an adjustable strength, grayscale/sepia,
  borders (solid/dashed/dotted/glyph) and frame presets, corner rounding,
  clip shapes (rectangle/circle/oval/heart), and **replace photo** (swap in a
  different image while keeping that item's position, size, crop, and style).
  A photo keeps its crop zoom and framing when it's resized, swapped, or
  reflowed by a layout/spacing change — and is cropped, never stretched, to a
  new shape. Dragging a crop follows the pointer on flipped and rotated
  photos too, and the 90° rotate buttons turn an item about its centre.
- **Text & stickers** — editable text boxes with font/size/weight/color
  controls (including bundled calligraphy fonts), and an emoji sticker
  palette.
- **Backgrounds** — solid color, gradient, image (with blur), or generated
  pattern (dots/grid/stripes/checker).
- **Collage-wide styling** — a frame (corner radius + border) around the
  whole canvas, independent of per-photo borders.
- **Canvas sizing** — social-media presets (square, portrait, story,
  landscape, wide) and print presets (4×6, 5×7, 8×10, A4 at 300 DPI), or a
  custom pixel size.
- **Projects** — save/open/delete projects in the browser (IndexedDB),
  each with a thumbnail; optional auto-save every 30s (only when something
  changed). A project can also be exported to/imported from a single portable
  `.json` file (photos and background image embedded) for backup or moving to
  another browser/device.
  - Opening another project, starting a new one, importing, or closing the tab
    asks first if there are unsaved changes; deleting a project always asks.
  - A save that fails (e.g. the browser's storage for the site is full) says
    so — it is never reported as "Saved" with photos missing.
  - Stored photos no saved project uses any more (deleted projects, replaced
    photos) are cleaned up automatically, so storage doesn't only ever grow.
- **Export** — PNG or JPEG, at 1×/2×/3× the canvas resolution, with filtered
  photos rendered at full export resolution. JPEG has no transparency, so
  areas outside a rounded collage frame come out white. The file name
  defaults to the project name (new projects are called "Collage") and
  follows it as you rename the project, until you type a file name of your own.
- **Offline install (PWA)** — the built app installs and runs with no
  network connection.
- **Responsive layout** — on narrow/touch viewports the inspector becomes a
  slide-over drawer and secondary toolbar actions collapse into an overflow
  menu; desktop keeps the fixed side panel.
- **Histogram** — live R/G/B value distribution for the whole selected
  photo, reflecting current crop/filter edits.
- **Zoom & pan** — Ctrl+scroll or two-finger pinch zooms about the point
  under the cursor/fingers; Space+drag pans.
- **Undo/redo, keyboard shortcuts, dark/light theme.** A colour picker
  session, a slider drag, or a text-box edit is one undo step each.

## Who it's for

A single-user, no-signup tool for quickly assembling a photo collage
(social media post, print, invite, etc.) without uploading photos anywhere.

## Running it

```bash
npm install
npm run dev      # dev server, printed URL (default http://localhost:5173)
```

```bash
npm run build     # production build -> dist/
npm run preview   # serve the build locally (offline/PWA install only works here, not in dev)
```

```bash
cd e2e && npm install   # first time only
npm run test:e2e        # Playwright e2e suite (spins up the dev server itself)
```

The suite reuses anything already listening on port 5173 — if another app's
dev server is running there, every test runs against *that* app and fails.
Stop it first.

To use it from another device on the same network (e.g. a phone), run
`npm run dev:lan` (development) or `npm run build && npm run preview:lan`
(closer to production), then open the `Network:` URL Vite prints.

## How it's built

- **Vite + React 18 + TypeScript**
- **react-konva / konva** — canvas rendering, transforms, filters, export
- **Zustand + immer** — editor state, with a bounded undo/redo history
- **IndexedDB** (via a small wrapper in `src/storage/`) — project + image
  persistence
- **react-dropzone**, **heic2any** — file ingestion, including HEIC decode

## Project structure

```
src/
  types/index.ts          data model shared by store, canvas, and storage
  store/
    useEditorStore.ts      canvas/items state, undo/redo, all editing actions
    useThemeStore.ts        dark/light theme, persisted to localStorage
  layout/                  Grid / Justified / Mosaic layout algorithms
  style/                   frame presets, enhance presets
  storage/                 IndexedDB projects + assets, portable file import/export
  utils/                   image loading, HEIC conversion, cropping, palette, blob URLs
  components/
    Toolbar.tsx             top bar — undo/redo, save/export, theme toggle;
                             collapses secondary actions into an overflow
                             menu on narrow viewports
    App.tsx                 dropzone, keyboard shortcuts, export/save wiring
    ErrorBoundary.tsx        catches render crashes, offers a safe reload
    Canvas/                  Konva stage and per-item node renderers
    panels/                  right-hand inspector — one collapsible panel per
                             feature area (becomes a slide-over drawer on
                             narrow/touch viewports)
e2e/                        standalone Playwright project (its own
                             package.json); `npm run test:e2e` at the repo
                             root drives it
  tests/
    mobile.spec.ts           responsive drawer, overflow menu, pinch-zoom
                             (incl. zooming about the fingers)
    canvas.spec.ts           histogram, wheel zoom, text alignment, rotation,
                             crop dragging, colour-picker undo, photo memory
                             release, clean auto-save previews
    storage.spec.ts          save failures, storage cleanup, unsaved-changes
                             prompts, portable file round trip
    editing.spec.ts          crop kept on resize/reflow, Insert-panel text box
    export.spec.ts           export sharpness, blur at 1x vs 3x, JPEG corners
    export-filename.spec.ts  export file name following the project name
    helpers.ts               store access, generated test images, image metrics
```

## Known limitations

- Single-user, single-browser: projects saved via IndexedDB stay on that
  device/browser and aren't synced elsewhere (use the portable `.json`
  export to move a project to another device or browser).
- The Playwright suite (`e2e/`) covers the mobile responsive layout,
  project storage, cropping, the Insert panel, and export output; the rest
  of the editor is verified manually plus TypeScript's compiler checks
  (`npm run build`).
- Konva is split into its own vendor chunk (`vite.config.ts`) so app-code
  updates don't force a re-download of it, but it still loads on first
  visit since the canvas is needed immediately — there's no further win
  available from deferring it. HEIC decoding (`heic2any`, ~1.3MB) is
  already lazy-loaded and only fetched the first time a HEIC file is used.
