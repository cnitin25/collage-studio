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
  without running out of memory. A slow import (a big batch, or HEIC, which
  takes seconds per photo) shows its progress under the toolbar ("Adding
  photos… 3 of 12"); a HEIC conversion that stalls is reported instead of
  hanging.
- **Layout** — Grid, Justified, Mosaic, Masonry and Spotlight auto-layout
  strategies with ranked suggestions, plus manual free placement, resize,
  rotate, and drag-to-swap. Outer margin, spacing, and per-cell padding are
  adjustable live, and the spacing is the same between photos in every
  direction (Masonry included). Suggested layouts are ranked for the current
  photo order (layouts place photos in order), so Shuffle re-ranks them — the
  panel says so.
- **Per-photo editing** — crop (drag + zoom); adjustments for light
  (**exposure**, brightness, contrast, **highlights**, **shadows**), colour
  (**warmth** — colour temperature — **vibrance**, saturation, hue) and detail
  and effects (**sharpen**, **vignette**, blur); one-click enhance presets
  (Brighten, Darken, Antique, Vivid, Warm, Auto) with an adjustable
  strength, grayscale/sepia, borders (solid/dashed/dotted/glyph) and frame
  presets, corner rounding, clip shapes (rectangle/circle/oval/heart), and
  **replace photo** (swap in a different image while keeping that item's
  position, size, crop, and style).
  - A photo keeps its crop zoom and framing when it's resized, swapped, or
    reflowed by a layout/spacing change — and is cropped, never stretched, to
    a new shape, including while a resize handle is still being dragged.
  - Borders sit inside the photo, so the spacing between bordered photos
    stays visible and a border at the canvas edge isn't cut in half.
  - A photo's opacity shows what's behind it (its shadow fades with it).
  - Moving an Adjust slider by hand takes over from a preset, so the
    preset's Strength slider can't silently undo the adjustment. A preset
    sets a photo's light and colour, and leaves its Sharpen, Vignette and
    Blur as they are.
  - Exposure works in stops, in linear light as a camera does (+50 doubles
    the light), so it brightens without lifting the blacks; Brightness is
    the older kind that adds the same amount everywhere, kept so earlier
    projects look as they did. Highlights and Shadows move only the light
    or the dark tones, never turn tones over, and keep colours' hue.
    Vibrance boosts muted colours more than vivid ones.
  - Sharpen and Vignette look the same on screen and in a 2x or 3x export.
    The vignette is rounder than a long, thin photo, so it darkens the ends
    rather than shading all down the long sides.
  - Dragging a crop follows the pointer on flipped and rotated photos too,
    the 90° rotate buttons turn an item about its centre, and rotating with
    the handle settles on 45° steps.
  - The rotate handle stays where it can be grabbed: for a photo at the top
    of the canvas, or zoomed in past one, it moves inside the photo instead
    of sitting off the edge of the stage.
- **Text & stickers** — editable text boxes with font/size/weight/color
  controls, and an emoji sticker palette. Every text font ships with the app
  (Inter, Anton for Display, and four calligraphy fonts), so a collage's text
  looks the same on every device. Resizing a text box rewraps it as you drag.
  - **Text Effects**: letter and line spacing, an outline (drawn behind the
    letters, so they keep their weight), a shadow (blur, distance,
    direction, opacity, colour) and a highlight — a rounded, padded box
    behind the lines of text. Each slider drag or toggle is one undo step,
    and the effects survive saving and portable project files.
  - Text and stickers have an Opacity slider, as photos do.
- **Backgrounds** — solid color, gradient, image (with blur), or generated
  pattern (dots/grid/stripes/checker). An uploaded background image is kept
  — saves and exported files included — while another background type is
  showing, so switching back finds it.
- **Collage-wide styling** — a frame (corner radius + border) around the
  whole canvas, independent of per-photo borders; the border is its set width
  all the way round, rounded corners included.
- **Canvas sizing** — social-media presets (square, portrait, story,
  landscape, wide) and print presets (4×6, 5×7, 8×10, A4 at 300 DPI, portrait
  or landscape), or a custom pixel size. Each preset's icon is drawn at its
  real proportions.
- **Editor modes** — Snap, Lock layout, Swap, Lock ratio and Stay in crop are
  toggle buttons in the status bar (highlighted while on), so they stay
  visible even with the tools panel collapsed; on a phone they sit at the
  foot of the Tools sheet.
- **Command search** — the search box at the top of the tools panel stays
  pinned there while the panels scroll. On a phone it's behind a search
  button in the Tools sheet's header, so it doesn't take room from the panels.
- **Projects** — save/open/delete projects in the browser (IndexedDB),
  each with a thumbnail. After the first save the app asks the browser for
  persistent storage; where Safari would still clear the site after 7 days
  unused, the Projects dialog says so and suggests Add to Home Screen or
  Export file.
  - **Auto-save is on by default**: every 30 s when something changed, and
    the moment the page is hidden — switching apps on a phone, where the tab
    may never get another chance. A cloud icon beside the project name shows
    it (hover for when it last saved). Switched off, the icon becomes an
    orange warning chip — one click turns it back on — and the choice is
    remembered between visits.
  - **The last project reopens** when you come back. If reopening it ever
    crashed the editor, it isn't reopened again on the next visit; it waits
    in Projects.
  - Two open tabs saving at once can't delete each other's photos.
  - Opening another project, starting a new one, importing, or closing the tab
    asks first if there are unsaved changes (closing also asks while a save is
    still being written); undoing back to what was saved counts as saved.
    Deleting a project always asks, and deleting the open one closes it.
  - A save that fails (e.g. the browser's storage for the site is full) says
    so — it is never reported as "Saved" with photos missing.
  - Saving works in private windows too, Safari's included (Safari can't
    store a photo file in a private window, so photos are stored as their
    bytes). Projects in a private window are gone once it closes.
  - If the saved projects can't be read, opened or deleted, the Projects
    dialog says why instead of staying empty.
  - Stored photos no saved project uses any more (deleted projects, replaced
    photos) are cleaned up automatically, so storage doesn't only ever grow.
  - Clear canvas doesn't ask first; it shows an **Undo** button instead.
    Clearing a saved collage is saved too, so it doesn't come back.
  - **Crash recovery**: if the editor ever crashes, unsaved work is stored as
    a separate "(recovered)" project before you reload — never over the
    original.
- **Project files** — a project can also be exported to/imported from a
  single portable `.json` file (photos and background image embedded) for
  backup or moving to another browser/device. Only images embedded in the
  file are opened: a file that points a photo at a web address can't make
  the app fetch anything. A file from a newer version is refused with a
  clear message, and anything in a damaged file that can't be drawn is left
  out and listed rather than loaded half-broken.
- **Export** — PNG or JPEG, at 1×/2×/3× the canvas resolution, with filtered
  photos rendered at full export resolution. On a phone, Export opens the
  share sheet (Save Image → Photos, or straight to a messaging app); desktop
  always downloads. Sizes larger than the browser can draw — iOS caps a
  canvas at ~16.7 MP, so e.g. a Story at 3× — are disabled in Export settings
  and clamped to the largest possible size, instead of saving a blank file. JPEG has no transparency, so
  areas outside a rounded collage frame come out white. The file name
  defaults to the project name (new projects are called "Collage") and
  follows it as you rename the project, until you type a file name of your own.
  "Preparing image…" shows while a large export renders, and an export that
  fails says why.
- **Offline install (PWA)** — the built app installs and runs with no
  network connection.
- **Locked down** — the site is served with a Content-Security-Policy (in
  `vercel.json`) that only lets the page load scripts, images and data from
  itself, so the "nothing leaves your device" promise is enforced by the
  browser, not just by the code. `npm run preview` serves the same headers.
- **Desktop toolbar** — icon buttons with tooltips (hover for the name and
  keyboard shortcut; ⌘ on a Mac). A disabled button's tooltip says what it
  needs ("select a photo first"). Between 769 and 1000 px wide, Duplicate,
  Delete, Clear canvas and the theme toggle move into a ⋯ menu so nothing
  runs off the edge.
- **Phone layout** — below 768 px wide, and on phones held in landscape:
  - the toolbar keeps the auto-save toggle, Add photos, Undo/Redo,
    **Export**, Tools and a ⋯ menu (Add text, Replace photo, Duplicate,
    Delete, Clear canvas, Projects, Save, theme — and Rename project below
    480 px, where the name field is hidden), all fitting side by side down
    to 360 px wide;
  - **Tools is a bottom sheet** at half height, with the canvas refitted into
    the space above so you can watch a slider's effect; drag or tap its
    header to expand, swipe it down to close. In landscape it's a side panel
    beside the canvas instead;
  - inside it, a **navigation rail on the left** picks a section — Canvas,
    Layout, Insert, Photo (alignment, crop & arrange, enhance, border),
    Background (background + collage frame), Export, History — and the area
    on the right scrolls through just that section. Photo is dimmed, with a
    hint, until something is selected. A wide, always-visible scrollbar on
    the right of that area can be dragged (or tapped to jump), so scrolling
    never has to start on a control;
  - **sliders are swipe-safe:** a vertical swipe that starts on one scrolls
    and leaves its value alone; a sideways drag adjusts it from where it was
    (no jump to the finger); a tap does nothing — use − / + to step;
  - **selecting an item swaps the thumbnail strip for its actions** — Crop,
    Replace, Adjust, Border, Duplicate, Delete for a photo; Edit, Style,
    Duplicate, Delete for text — docked in place, same height, so the canvas
    never jumps. Crop, Adjust and Border open the Tools sheet at their
    controls (Crop lands on Done / Reset / Zoom, with the photo still in view
    above to drag into place);
  - **text is edited in a field docked under the toolbar**, clear of the
    keyboard, where Enter types a new line and Done/Cancel finish;
  - a **Fit** chip shows the zoom level after a pinch and resets it in one
    tap; the status bar is hidden;
  - safe-area padding for notches and the home indicator.
- **Touch resize handles** — small round handles set just outside the
  selected item, so they don't cover a photo's rounded corners, with a wide
  invisible touch area so they're still easy to grab.
- **Touch sizing** — on any touch screen (tablets included) buttons, chips,
  slider thumbs and toggles grow to finger size, and every text field is
  16 px so iOS doesn't zoom the page when one is focused. Desktop density is
  unchanged.
- **Histogram** — live R/G/B value distribution for the whole selected
  photo, reflecting current crop/filter edits.
- **Zoom & pan** — Ctrl+scroll or two-finger pinch zooms about the point
  under the cursor/fingers, in proportion to how far you scroll or pinch (a
  pinch can start in the margin around the canvas, and releasing one never
  selects what's under your fingers). Once zoomed, a plain scroll or
  two-finger trackpad swipe pans (Shift+scroll sideways); Space+drag pans
  too, even straight after clicking a toolbar button. Snapping reaches the
  same distance on screen at any zoom.
- **Undo/redo, keyboard shortcuts, dark/light theme.** Undo and redo keep the
  current selection (and the panel you're working in) whenever the selected
  item still exists. A colour picker session, a slider drag, a text-box edit,
  or a run of arrow-key nudges is one undo step each; opening a text box
  without changing it records nothing. Editor shortcuts are off while the
  Projects dialog is open — Escape closes it, and keyboard focus stays
  inside it.
- **Several items at once.** Shift-click (or Ctrl/⌘-click) adds an item to
  the selection or takes it out, dragging across empty canvas selects
  everything the box touches, and Ctrl/⌘+A selects all; on a phone, **Select
  more** in the bottom bar makes taps add to the selection. A selection of
  several moves, resizes and rotates as one (text scales its font, so it
  doesn't rewrap) and can be deleted, duplicated, nudged, copied and pasted —
  each as one undo step.
  - **Groups**: Ctrl/⌘+G groups the selection and Ctrl/⌘+Shift+G ungroups
    it. One click on a member selects the whole group; groups are saved with
    the project (and in portable files), and copies of a group form a group
    of their own.
  - **Align and distribute**: one item lines up with the canvas; several line
    up with each other (by their drawn edges, rotation included), and three
    or more can be spaced evenly across or down.
  - A **floating bar** above a selection of several (desktop) holds Group,
    the six alignments, Distribute, Duplicate and Delete; it gets out of the
    way while the selection is being dragged or resized. Phones get the same
    actions in the bottom bar.
  - Panels for a single item (crop, adjust, border, text effects) step aside
    while several are selected.
- **Copy, cut and paste.** Ctrl/⌘+C, X and V copy, cut and paste the
  selection; each paste lands a step further from the original, and cut items
  paste back where they were. Copying a text item puts its text on the system
  clipboard too. Pasting what another app copied works as well: an image (a
  screenshot, a photo copied from a browser) is added as a photo, and text
  becomes a text box. A copied item can be pasted into another project, and
  text fields and text selected on the page keep the browser's own copy and
  paste.
- **Keyboard shortcuts** (⌘ instead of Ctrl on a Mac):

  | Keys | Action |
  |---|---|
  | Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y | Undo, redo |
  | Ctrl+C, Ctrl+X, Ctrl+V | Copy, cut, paste |
  | Shift-click or Ctrl-click | Add to or take from the selection |
  | Ctrl+A | Select everything |
  | Ctrl+G, Ctrl+Shift+G | Group, ungroup |
  | Ctrl+D | Duplicate |
  | Delete or Backspace | Delete the selection |
  | Arrow keys (Shift: 10 px) | Nudge the selection |
  | Ctrl+] and Ctrl+[ (with Shift: to the top or bottom) | Bring forward, send backward |
  | Ctrl+S | Save |
  | Ctrl+Shift+E | Export the image |
  | Escape | Finish cropping, or deselect |
  | Space + drag | Pan the view |

## Who it's for

A single-user, no-signup tool for quickly assembling a photo collage
(social media post, print, invite, etc.) without uploading photos anywhere.

## Running it

Needs Node.js 26 (`engines` in `package.json`; Vercel and CI build with the
latest 26.x release).

```bash
npm install
npm run dev      # dev server, printed URL (default http://localhost:5173)
```

```bash
npm run build     # production build -> dist/
npm run preview   # serve the build locally (offline/PWA install only works here, not in dev)
```

```bash
npm test            # unit tests (Vitest): layouts, crops, snapping, colour,
                    # photo adjustments, presets, project-file import, undo
                    # history
npm run lint        # ESLint, type-aware (src/ and the e2e specs)
npm run typecheck   # the app, the Vite/Vitest configs and the e2e specs
```

```bash
cd e2e && npm install                          # first time only
npx playwright install chromium webkit         # first time only
npm run test:e2e        # Playwright e2e suite (spins up the dev server itself)
npm run test:prod       # production build under the real security headers
```

The suite reuses anything already listening on port 5173 — if another app's
dev server is running there, every test runs against *that* app and fails.
Stop it first. `npm run test:e2e -- --project=chromium` skips WebKit for a
quicker run.

`npm run test:prod` builds the app, serves it with `vercel.json`'s headers
(the Content-Security-Policy included) and drives every feature the policy
could block. Set `PROD_URL` to run it against a deployment instead:
`PROD_URL=https://offline-collage.vercel.app npm run test:prod`.

Every push and pull request runs lint, type-check, the unit tests, the e2e
suite on Chromium and WebKit, and the production smoke test on GitHub
Actions (`.github/workflows/ci.yml`).

To use it from another device on the same network (e.g. a phone), run
`npm run dev:lan` (development) or `npm run build && npm run preview:lan`
(closer to production), then open the `Network:` URL Vite prints.

## How it's built

- **Vite 8 (Rolldown) + React 19 + TypeScript** — builds for Chrome/Edge
  98+, Firefox 94+ and Safari 15.4+ (iOS 15.4+), the oldest browsers the app
  runs in at all
- **react-konva 19 / Konva 10** — canvas rendering, transforms, filters, export
- **Zustand + immer** — editor state, with a bounded undo/redo history
- **IndexedDB** (via a small wrapper in `src/storage/`) — project + image
  persistence
- **react-dropzone**, **heic2any** — file ingestion, including HEIC decode
- **Vitest** (unit), **Playwright** (end-to-end, Chromium and WebKit),
  **ESLint** with typescript-eslint and the React Hooks rules, **GitHub
  Actions** — checks on every change

## Project structure

```
src/                      unit tests sit next to the code they cover
                             (`*.test.ts`, run by `npm test`)
  types/index.ts          data model shared by store, canvas, and storage
  store/
    useEditorStore.ts      canvas/items state, undo/redo, all editing actions
    useThemeStore.ts        dark/light theme, persisted to localStorage
  layout/                  Grid / Justified / Mosaic / Masonry / Spotlight layouts
  style/                   frame presets, enhance presets
  storage/                 IndexedDB projects + assets (cross-tab save lock),
                             portable file import/export, persistent-storage
                             request; session.ts: reopen the last project,
                             crash-loop guard, crash recovery copy
  hooks/                   useMediaQuery (+ the layout breakpoints), useReplacePhoto
  utils/                   image loading/downscaling, HEIC conversion, cropping,
                             palette, export/share, platform detection,
                             importPhotos (import + progress), the photo
                             adjustments (adjustments.ts: each filter, and
                             the order they run in) and warmth
  components/
    StatusBar.tsx           selection/canvas info + the editor mode toggles
    ModeToggles.tsx         Snap / Lock layout / Swap / Lock ratio / Stay in crop
    Toolbar.tsx             top bar — auto-save toggle, undo/redo, save/export,
                             theme toggle; collapses secondary actions into an
                             overflow menu on the phone layout
    SelectionBar.tsx        phone-only actions for the selection, Select more
    ui/Icon.tsx             inline SVG icons
    ui/ToolButton.tsx       icon button with a tooltip (toolbar, selection bar)
    App.tsx                 dropzone, keyboard shortcuts, export/save wiring
    ErrorBoundary.tsx        catches render crashes, saves a recovery copy of
                             unsaved work, offers a safe reload
    Canvas/                  Konva stage and per-item node renderers;
                             SelectionActions.tsx is the floating bar
    panels/                  right-hand inspector — one collapsible panel per
                             feature area (a bottom sheet, or a side panel in
                             landscape, on the phone layout)
e2e/                        standalone Playwright project (its own
                             package.json and tsconfig); `npm run test:e2e`
                             at the repo root drives it. The storage, file,
                             import/export and phone specs also run on WebKit
  prod/production.spec.ts    production-build smoke test under the CSP
                             (`npm run test:prod`)
  fixtures/                  a JPEG and a HEIC photo for the smoke test
  tests/
    globals.d.ts             types the dev-only store hook from the app's
                             own source, so specs fail to compile on a
                             renamed action
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
    sheet-nav.spec.ts        phone rail navigation: every section reachable
                             once, fits the half sheet, independent scrolling
    touch-scroll.spec.ts     swipe-safe sliders, the pane's draggable scrollbar
    editing.spec.ts          crop kept on resize/reflow, Insert-panel text box
    export.spec.ts           export sharpness, blur at 1x vs 3x, JPEG corners;
                             phone share sheet, iOS canvas-size clamp
    export-filename.spec.ts  export file name following the project name
    data-safety.spec.ts      auto-save default + toggle, reopening the last
                             project, crash-loop guard, cross-tab saves, kept
                             backgrounds, database repair, saving where Blobs
                             can't be stored, older Blob records, phone
                             toolbar fit
    rendering.spec.ts        frame and photo borders at full width and inside,
                             opacity vs shadow, masonry gaps, frame presets
    adjustments.spec.ts      the Adjust sliders' groups and undo steps; exposure,
                             highlights/shadows, vibrance, vignette and sharpen
                             measured in exports (the last two at 1x and 3x)
    input.spec.ts            arrow-key undo, Projects dialog keyboard, Space
                             pan, wheel/pinch zoom and pan, text editor height,
                             presets vs hand-set sliders
    project-files.spec.ts    import never fetches, newer/damaged files, export
                             failure message, full round trip
    polish.spec.ts           live resize crop/rewrap, rotation snaps, a rotate
                             handle that stays on the stage, snap at any zoom,
                             progress, warmth, fonts, crash recovery
    shortcuts.spec.ts        copy/cut/paste, images and text pasted from other
                             apps, fields left alone, Save/Export/layer keys
    multi-select.spec.ts     Shift-click, box and Ctrl+A selection; moving,
                             resizing, deleting, duplicating, nudging, copying
                             several; saved groups; align/distribute; the
                             floating bar; Select more on a phone
    text-style.spec.ts       outline, shadow (under the outline), highlight box,
                             letter/line spacing, text and sticker opacity
    helpers.ts               store access, generated test images, image metrics,
                             export pixel analysis
.github/workflows/ci.yml     lint, type-check, e2e (Chromium, WebKit) and the
                             production smoke test on every push and PR
```

## Known limitations

- Single-user, single-browser: projects saved via IndexedDB stay on that
  device/browser and aren't synced elsewhere (use the portable `.json`
  export to move a project to another device or browser).
- The phone layout is tested in emulation (Chromium, and WebKit for the
  storage, file and phone specs), not on real devices: check iOS Safari and
  Android Chrome by hand (`npm run dev:lan`) after changing it — share
  sheet, keyboard behaviour and safe areas in particular can't be emulated.
  The two-finger pinch tests run on Chromium only, since they send touches
  through the Chrome DevTools Protocol.
- The Playwright suite (`e2e/`) covers the mobile responsive layout,
  project storage and recovery, rendering/export output, input handling,
  project files, cropping and the Insert panel; the unit tests cover the
  layout, geometry, colour, photo adjustment, preset, import and undo logic
  directly. The rest
  of the editor is verified manually plus TypeScript and ESLint
  (`npm run typecheck`, `npm run lint`).
- Konva is split into its own vendor chunk (`vite.config.ts`) so app-code
  updates don't force a re-download of it, but it still loads on first
  visit since the canvas is needed immediately — there's no further win
  available from deferring it. HEIC decoding (`heic2any`, ~1.3MB) is
  already lazy-loaded and only fetched the first time a HEIC file is used.
- heic2any converts in a worker that evaluates code from strings, so the
  Content-Security-Policy has to allow `'unsafe-eval'`. Scripts can still
  only come from the site itself; a WASM-based decoder would remove the need.
- Stickers are emoji, drawn with each device's own emoji font, so they look
  different on Apple, Android and Windows. The Serif and Mono text fonts are
  system fonts too (Georgia / Courier New, with fallbacks); every other text
  font is bundled.
- The stage is exactly the canvas's size, so a handle that falls outside it
  can't be reached. The rotate handle moves inside the photo when it would
  (see above), but a resize handle on the canvas edge is still partly cut
  off, and a photo zoomed so far that its centre is off the side of the
  stage keeps its rotate handle off it too: zoom out, or use the 90° rotate
  buttons.
- Groups are flat — a group can't contain another group — and a layout
  arranges grouped photos like any others (the group stays a group).
- Exposure stops each colour channel at white, as a camera does: a bright
  sky pushed past white can turn faintly cyan where its green and blue
  reach white before its red. There is no highlight roll-off.

## Licence

Collage Studio is free software: you can redistribute it and/or modify it
under the terms of the GNU General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option)
any later version. It is distributed in the hope that it will be useful, but
WITHOUT ANY WARRANTY; see [LICENSE](LICENSE) for the full terms.

Bundled third-party code and fonts keep their own licences:

- React, Konva, react-konva, Zustand, Immer, react-dropzone, use-image and
  heic2any — MIT; idb — ISC.
- heic2any includes a build of [libheif](https://github.com/strukturag/libheif)
  (LGPL-3.0) for decoding HEIC photos.
- Inter, Anton, Pacifico, Dancing Script, Caveat and Great Vibes (via
  Fontsource) — SIL Open Font License 1.1.
