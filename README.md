# Collage Studio

An offline, browser-based photo collage editor. Drop in photos, arrange them
with layout tools, edit and style each one, add text/stickers, and export a
finished collage — all client-side, with no server and no account. Photos
never leave your device.

## What it does

- **Import** — drag-and-drop or click to browse; multiple photos at once,
  including HEIC/HEIF (converted to JPEG automatically, fully offline).
  Photos larger than 4096 px on their long side are scaled down to 4096 on
  import (still sharp for every preset at 1×–2× export), and a batch is
  decoded two at a time — so a phone can hold a full collage of camera photos
  without running out of memory.
- **Layout** — Grid, Justified, and Mosaic auto-layout strategies with
  ranked suggestions, plus manual free placement, resize, rotate, and drag-
  to-swap. Outer margin, spacing, and per-cell padding are adjustable live.
  Suggested layouts are ranked for the current photo order (layouts place
  photos in order), so Shuffle re-ranks them — the panel says so.
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
  landscape, wide) and print presets (4×6, 5×7, 8×10, A4 at 300 DPI, portrait
  or landscape), or a custom pixel size. Each preset's icon is drawn at its
  real proportions.
- **Editor modes** — Snap, Lock layout, Swap, Lock ratio and Stay in crop are
  toggle buttons in the status bar (highlighted while on), so they stay
  visible even with the tools panel collapsed; on a phone they sit at the
  foot of the Tools sheet.
- **Command search** — the search box at the top of the tools panel stays
  pinned there while the panels scroll.
- **Projects** — save/open/delete projects in the browser (IndexedDB),
  each with a thumbnail; optional auto-save every 30s (only when something
  changed), and also the moment the page is hidden — switching apps on a
  phone, where the tab may never get another chance. After the first save
  the app asks the browser for persistent storage; where Safari would still
  clear the site after 7 days unused, the Projects dialog says so and suggests
  Add to Home Screen or Export file. A project can also be exported to/imported from a single portable
  `.json` file (photos and background image embedded) for backup or moving to
  another browser/device.
  - Opening another project, starting a new one, importing, or closing the tab
    asks first if there are unsaved changes; deleting a project always asks.
  - A save that fails (e.g. the browser's storage for the site is full) says
    so — it is never reported as "Saved" with photos missing.
  - Stored photos no saved project uses any more (deleted projects, replaced
    photos) are cleaned up automatically, so storage doesn't only ever grow.
  - Clear canvas doesn't ask first; it shows an **Undo** button instead.
- **Export** — PNG or JPEG, at 1×/2×/3× the canvas resolution, with filtered
  photos rendered at full export resolution. On a phone, Export opens the
  share sheet (Save Image → Photos, or straight to a messaging app); desktop
  always downloads. Sizes larger than the browser can draw — iOS caps a
  canvas at ~16.7 MP, so e.g. a Story at 3× — are disabled in Export settings
  and clamped to the largest possible size, instead of saving a blank file. JPEG has no transparency, so
  areas outside a rounded collage frame come out white. The file name
  defaults to the project name (new projects are called "Collage") and
  follows it as you rename the project, until you type a file name of your own.
- **Offline install (PWA)** — the built app installs and runs with no
  network connection.
- **Desktop toolbar** — icon buttons with tooltips (hover for the name and
  keyboard shortcut; ⌘ on a Mac). A disabled button's tooltip says what it
  needs ("select a photo first"). Between 769 and 1000 px wide, Duplicate,
  Delete, Clear canvas and the theme toggle move into a ⋯ menu so nothing
  runs off the edge.
- **Phone layout** — below 768 px wide, and on phones held in landscape:
  - the toolbar keeps Add photos, Undo/Redo, **Export**, Tools and a ⋯ menu
    (Add text, Replace photo, Duplicate, Delete, Clear canvas, Projects,
    Save, theme);
  - **Tools is a bottom sheet** at half height, with the canvas refitted into
    the space above so you can watch a slider's effect; drag or tap its
    header to expand, swipe it down to close. In landscape it's a side panel
    beside the canvas instead;
  - **selecting an item swaps the thumbnail strip for its actions** — Crop,
    Replace, Adjust, Border, Duplicate, Delete for a photo; Edit, Style,
    Duplicate, Delete for text — docked in place, same height, so the canvas
    never jumps;
  - **text is edited in a field docked under the toolbar**, clear of the
    keyboard, where Enter types a new line and Done/Cancel finish;
  - a **Fit** chip shows the zoom level after a pinch and resets it in one
    tap; the status bar is hidden;
  - safe-area padding for notches and the home indicator.
- **Touch sizing** — on any touch screen (tablets included) buttons, chips,
  slider thumbs and toggles grow to finger size, and every text field is
  16 px so iOS doesn't zoom the page when one is focused. Desktop density is
  unchanged.
- **Histogram** — live R/G/B value distribution for the whole selected
  photo, reflecting current crop/filter edits.
- **Zoom & pan** — Ctrl+scroll or two-finger pinch zooms about the point
  under the cursor/fingers (a pinch can start in the margin around the
  canvas, and releasing one never selects what's under your fingers);
  Space+drag pans.
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
  storage/                 IndexedDB projects + assets, portable file import/export,
                             persistent-storage request
  hooks/                   useMediaQuery (+ the layout breakpoints), useReplacePhoto
  utils/                   image loading/downscaling, HEIC conversion, cropping,
                             palette, export/share, platform detection
  components/
    StatusBar.tsx           selection/canvas info + the editor mode toggles
    ModeToggles.tsx         Snap / Lock layout / Swap / Lock ratio / Stay in crop
    Toolbar.tsx             top bar — undo/redo, save/export, theme toggle;
                             collapses secondary actions into an overflow
                             menu on the phone layout
    SelectionBar.tsx        phone-only actions for the selected item
    ui/Icon.tsx             inline SVG icons (used on the phone layout)
    App.tsx                 dropzone, keyboard shortcuts, export/save wiring
    ErrorBoundary.tsx        catches render crashes, offers a safe reload
    Canvas/                  Konva stage and per-item node renderers
    panels/                  right-hand inspector — one collapsible panel per
                             feature area (a bottom sheet, or a side panel in
                             landscape, on the phone layout)
e2e/                        standalone Playwright project (its own
                             package.json); `npm run test:e2e` at the repo
                             root drives it
  tests/
    mobile.spec.ts           bottom sheet, landscape side panel, toolbar and
                             overflow menu, selection bar, docked text editor,
                             touch sizing, pinch-zoom (anchoring, margin
                             pinches, Fit chip), Clear canvas undo
    canvas.spec.ts           histogram, wheel zoom, text alignment, rotation,
                             crop dragging, colour-picker undo, photo memory
                             release, clean auto-save previews
    storage.spec.ts          save failures, storage cleanup, unsaved-changes
                             prompts, portable file round trip, save on hide
    import.spec.ts           oversized photos downscaled on import
    panels.spec.ts           mode toggles (status bar / sheet footer), preset
                             icons, print orientation chips, sticky search
    toolbar.spec.ts          icon buttons + tooltips, nothing off-screen from
                             800 to 1280 px, medium-width ⋯ menu
    editing.spec.ts          crop kept on resize/reflow, Insert-panel text box
    export.spec.ts           export sharpness, blur at 1x vs 3x, JPEG corners;
                             phone share sheet, iOS canvas-size clamp
    export-filename.spec.ts  export file name following the project name
    helpers.ts               store access, generated test images, image metrics
```

## Known limitations

- Single-user, single-browser: projects saved via IndexedDB stay on that
  device/browser and aren't synced elsewhere (use the portable `.json`
  export to move a project to another device or browser).
- The phone layout is tested in Chromium's mobile emulation, not on real
  devices: check iOS Safari and Android Chrome by hand (`npm run dev:lan`)
  after changing it — share sheet, keyboard behaviour and safe areas in
  particular can't be emulated.
- The Playwright suite (`e2e/`) covers the mobile responsive layout,
  project storage, cropping, the Insert panel, and export output; the rest
  of the editor is verified manually plus TypeScript's compiler checks
  (`npm run build`).
- Konva is split into its own vendor chunk (`vite.config.ts`) so app-code
  updates don't force a re-download of it, but it still loads on first
  visit since the canvas is needed immediately — there's no further win
  available from deferring it. HEIC decoding (`heic2any`, ~1.3MB) is
  already lazy-loaded and only fetched the first time a HEIC file is used.
