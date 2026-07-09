# Collage Studio

An offline, browser-based photo collage editor. **Phase 6 complete; Phase 7 extras added.**

Everything runs client-side — your photos never leave your device. Node is build
tooling only (Vite). Offline/PWA install and project save land in a later phase.

## Stack

- **Vite + React 18 + TypeScript**
- **react-konva / konva** — canvas rendering, transforms, export
- **Zustand + immer** — editor state with undo/redo history
- **react-dropzone** — file ingestion
- **use-image** — image loading for Konva

## Run

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # production build -> dist/
npm run preview  # serve the build (PWA/offline install works here, not in dev)

To serve it to other devices on your WiFi/Local Network:

```bash
npm run dev:lan       # quick, for active development
# or, for a more stable/production experience:
npm run build && npm run preview:lan
```

Vite prints a `Network:` URL in the terminal, e.g. `http://192.168.1.23:5173`.
Share that exact URL with members on the same WiFi — phone, laptop,
tablet, anything with a browser. Each person opens it independently.


## Feature History

## What works in Phase 1

- Drag-and-drop photos in (or click to browse) — multi-file
- Move / resize / rotate any photo on the canvas (Konva Transformer)
- Selection model with a shared transformer
- Canvas presets (Square, Portrait, Story, Landscape, Wide)
- Solid background color (swatches + custom picker)
- Undo / redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z), Delete, Clear
- Full-resolution PNG export (2× export scale)
- Keyboard shortcuts; reduced-motion respected

The data model in `src/types/index.ts` already carries the fields later phases
need (crop, filters, borders, corner radius), so they slot in without a reshape.

## Added in Phase 2

- **Layout engine** — Grid, Justified rows, and Mosaic strategies (`src/layout/`)
- **Smart suggestions** — top-3 layouts ranked by aspect fit (% shows how little
  each photo gets cropped); click a thumbnail to apply
- **Spacing** — outer margin, spacing between cells, and per-cell padding; sliders
  re-flow the current layout live
- **Cover-fill** — layouts crop photos to fill cells without distortion using the
  `crop` field; resizing a laid-out photo re-covers instead of stretching
- **Arrange** — bring to front / forward / backward / send to back (z-order),
  shown when a photo is selected
- **Export quality** — 1× / 2× / 3× selector; **1× now matches the canvas size**
  exactly (the earlier 2× hardcode that doubled exports is fixed)

Layout is a deliberate action: applying one (or dragging a spacing slider) re-flows
all photos, replacing manual positions. Move photos freely afterward as needed.

## Added in Phase 3 (per-photo editing)

Select a photo to reveal its editing panels:

- **Crop** — click "Crop photo", then drag the photo on the canvas to reposition
  and use the Zoom slider; "Reset" returns to a centered cover-crop
- **Adjust** — brightness, contrast, saturation, blur (Konva filters; the node is
  cached only while a filter is active)
- **Frame & border** — five frame presets (None / Hairline / Matte / Bold / Soft),
  plus independent border width, border color, and corner radius
- **Rounded corners** — kept in, via a clip group (no distortion, works with the
  border and crop together)
- **Arrange** — bring to front / forward / backward / send to back

Each photo now renders as a Konva **Group** — a shadow caster, a clipped image,
and a border rect — with the Transformer attached to the group. Slider gestures
record a single undo step (a batched-history `begin/commit` pattern in the store).

## Added in Phase 4 (text, stickers + 2 requests)

- **Text** — "Add text" (toolbar or Insert panel). Double-click a text item to
  edit inline (a textarea overlays the Konva node, tracking position/zoom/rotation).
  The Text panel controls font, size, bold/italic, alignment, and color.
- **Stickers** — an emoji palette in the Insert panel; each sticker is a Konva
  text glyph (zero assets, fully offline), draggable and resizable.
- **Lock aspect ratio** (requested) — a toggle in the Arrange panel for photos.
  When on, resize keeps the ratio (corner handles + `keepRatio`). Text and stickers
  are ratio-locked automatically and resize by scaling font size.
- **Swap photos** (requested) — drag a photo over another and they trade cells.
  The target highlights while dragging; on drop the two exchange geometry and each
  re-covers its crop to the new cell. Drop on empty space = a normal free move.

The model is now a real union (`ImageItem | TextItem | StickerItem`). Layouts
arrange only the photos; text and stickers float on top.

## Added in Phase 5 (backgrounds, palette, shared styles)

- **Backgrounds** — Color, Gradient (two stops + angle), Image (pick one of your
  photos or upload; a Blur slider turns it into a blurred backdrop), and Pattern
  (dots / grid / stripes / checker with adjustable colors and scale). Rendered by
  `Background.tsx`; patterns are generated as offscreen canvases.
- **Automatic color extraction** — a dependency-free quantizer (`utils/palette.ts`)
  samples a downscaled photo, buckets colors, and returns a distinct palette.
  "Auto palette → From photo" in the Background panel; "Auto from photo" sets a
  border color in the Style panel.
- **Shared styles** (your request) — in the Style panel: **Copy** / **Paste** a
  photo's look (border, corners, shadow, frame, adjustments), and **Apply to all
  photos** to make every photo match the selected one in one click.

## Added in Phase 6 (offline, persistence + extras)

- **Install & offline (PWA)** — service worker precaches the app (incl. fonts) so
  it loads with no network and can be installed. Active in the built app
  (`npm run build && npm run preview`), not the dev server.
- **Projects (IndexedDB)** — Save stores the project *and its image blobs* in the
  browser database; the Projects dialog lists, opens, and deletes saved projects,
  each with a thumbnail. Images survive a reload (object URLs are rebuilt from the
  stored blobs via a stable `assetId`).
- **Project / file name** — editable project name in the toolbar; export file name
  and **PNG/JPEG** format in the Export panel.
- **Persistent crop mode** — "Stay in crop mode": selecting another photo keeps you
  in crop so you can reposition immediately.
- **Border styles** — solid / dashed / dotted, plus a **glyph border** (✕ ◯ / \\ • …)
  tiled around the edge. (Border color "from image" shipped in Phase 5.)
- **Calligraphy fonts** — Dancing Script, Pacifico, Caveat, Great Vibes (bundled
  offline via @fontsource; the stage redraws once fonts load).
- **Duplicate** (Ctrl+D) and **JPEG export** — small high-value extras.

## Added in Phase 7 (extras)

- **Photo shapes** — clip a photo to Rectangle, **Circle**, **Oval**, or **Heart**
  (Style panel → Shape). The border and shadow follow the shape outline; a single
  `drawShapePath` helper feeds the clip, the border stroke, and the shadow caster
  so they always agree.
- **Rulers** — toggle top + side rulers (Canvas panel), tick labels in canvas
  pixels, aligned to the stage at any zoom.
- **Snap & guides** — while dragging, edges/centers snap to the canvas
  edges/center and to other items' edges/centers, with accent guide lines
  (Canvas panel → Snap & guides). Coexists with photo-swap.
- **Lock layout** — freezes all item positions/sizes (Layout panel) so you can
  keep styling without nudging anything; selection still works for edits.

## Bug fix (post-Phase 8): blank project thumbnails

Two real bugs were found and fixed:

1. **Auto-save wiped thumbnails.** `saveProject` wrote the whole IndexedDB
   record on every call (idb's `put()` replaces, it doesn't merge). Auto-save
   never generated a thumbnail, so the *first auto-save tick after any manual
   Save* silently erased it. Fixed: `saveProject` now preserves the existing
   thumbnail when a call doesn't supply a new one, and auto-save generates its
   own lightweight thumbnail so brand-new projects get one too.
2. **Pan/zoom broke image capture.** `CanvasStage.exportDataURL()` now resets
   the stage to its true, un-panned, un-zoomed framing before calling
   `toDataURL()`, then restores the view — so Save (thumbnails) and Export
   always capture the full canvas at its real resolution, regardless of
   whatever zoom/pan the user was in when they clicked. Previously a zoomed or
   panned view would capture mostly empty space, which renders as solid black
   in JPEG.

Existing projects saved before this fix still have a blank thumbnail in
storage; open and re-save (or wait for the next auto-save) to regenerate it.

Also added: an explicit hover "Open" overlay and an "Open" button on each
project card (opening already worked via click; it just wasn't visually
obvious), and an in-app note in the Projects dialog on where data is stored.

## Added: portable file backup, optional auto-save, collapsible history

- **Export / Import project file** — Projects dialog → "Export file (.json)"
  downloads a single self-contained file (photos embedded as base64) you can
  save anywhere — a folder, USB drive, cloud storage — genuinely outside the
  browser. "Import file" reopens it, even in a different browser or on a
  different device. This is separate from the in-browser Projects list
  (IndexedDB), which stays tied to this browser install. Verified: importing
  regenerates fresh ids for every item (no collision with existing data), and
  malformed or non-project files are rejected with a clear message rather than
  crashing.
- **Auto-save is now off by default** and toggleable (Projects dialog →
  "Auto-save every 30s"). When on, it behaves as before — silent background
  saves, its own lightweight thumbnail, never overwrites a good thumbnail with
  a blank one.
- **History panel is collapsible** — click the chevron next to "History" to
  expand/collapse; shows a running count when collapsed.

## Latest round: custom size, collage frame, floating toolbar, rulers removed

- **Rulers removed.** They weren't rendering reliably and added real overlay
  complexity for a feature that wasn't earning its keep — removed cleanly
  (component, toggle, store field) rather than left half-working.
- **Custom canvas size** — W/H number fields under the presets (200–6000px per
  side), Enter or blur to apply. Works alongside the five presets.
- **Collage frame** — a new panel: corner radius + border width/color applied
  to the *entire* collage (as opposed to the existing per-photo border/corner
  controls in Style). Implemented as a rounded clip around the whole
  Background+items group, with the border drawn on top so it isn't clipped.
- **Floating quick-action toolbar** — appears above (or below, if too close to
  the top) the selected photo: Crop, Border (quick on/off toggle), Copy style,
  and Paste style (once something's been copied). Position math accounts for
  pan/zoom and photo rotation (axis-aligned bounding box). Hides during an
  active drag/resize/rotate gesture and while Lock layout is on, so it never
  lags behind the photo or gets in the way.

## Latest round: floating-toolbar fix, collapsible panels everywhere

- **Fixed: floating toolbar could get permanently stuck hidden.** The flag
  that hides it during an active drag/resize (`isInteracting`) had no
  guaranteed way back to `false` if a gesture ever ended in an unusual way
  (e.g. released outside the stage), silently hiding the toolbar for the rest
  of the session. Fixed with two belt-and-suspenders measures: it now resets
  whenever selection changes, and a global `pointerup`/`mouseup` listener
  forces it false as a safety net — so it can no longer get stuck.
- **Every panel is now collapsible**, using the same chevron pattern as
  History, via a shared `CollapsiblePanel` wrapper — Canvas, Collage frame,
  Layout, Insert, Text, Crop, Adjust, Frame & border, Align, Arrange,
  Background, History, Export. All default to **expanded**. Collapsing one
  just hides its body; the title row (with chevron) stays visible so you can
  reopen it or see a badge (History still shows its step count while
  collapsed).

## Latest round: floating toolbar removed, two real bugs fixed, status bar added

- **Floating toolbar removed** entirely (component, store field, all wiring) —
  per explicit request, rather than continue debugging a feature that wasn't
  earning its keep.
- **Fixed: adjusting spacing sliders silently reverted swaps/manual moves.**
  `layoutToDraft` (which spacing sliders re-run) reassigned photos to grid
  cells by raw array order, ignoring where photos visually are — so any swap
  or manual drag got undone the moment you touched a spacing slider. Fixed
  with a row-bucketed "reading order" sort (top-to-bottom, left-to-right) that
  reflects current visual position instead. Verified end-to-end against the
  real store: a swap now survives a spacing change.
- **Fixed: undo didn't restore spacing slider values.** `spacing` and
  `lastLayout` were never part of the undo snapshot at all, and the
  slider-driven `setSpacing` action never pushed a history step in the first
  place — so undo would revert *items* (from whatever unrelated action was
  last recorded) while leaving the margin/spacing/padding sliders showing
  stale values. Fixed by including `spacing`/`lastLayout` in every snapshot,
  restoring them on undo/redo, and rewiring the Layout panel's sliders through
  the same begin/live/commit gesture-batching pattern already used elsewhere
  in the app (previously a duplicate local `Slider` component was missing
  this entirely). One slider drag is now exactly one undo step, and undo
  precisely restores both the slider value and item positions.
- **Also fixed while in there:** `commitChange()` (used by every slider drag
  in the app — Adjust, Crop zoom, Style border/corners, Background, Text size,
  Layout spacing) pushed to the undo stack but never recorded a matching
  History label, silently desyncing the History panel's list over time. Every
  slider gesture now carries a real label (e.g. "Brightness", "Outer margin",
  "Crop zoom") and respects the 60-step cap consistently.
- **Status bar** — a thin bar along the bottom of the app. With a photo
  selected: its current on-canvas size, aspect ratio, rotation (if any), and
  original resolution. With nothing selected: canvas size and current zoom
  level.

## Fixed: manual photo resize reverted on any spacing change

Different bug from the earlier swap-revert fix — this one was about SIZE, not
position. `layoutToDraft` (re-run by every margin/spacing/padding change)
recomputes every photo's width/height from the layout algorithm with no
awareness that you'd deliberately resized one — so a photo you'd manually
made bigger would silently snap back to the uniform grid cell size the moment
you touched a spacing slider.

Fixed: `updateItem` now detects a genuine manual resize (comparing the
incoming width/height against the item's current size, so a pure rotate or
move doesn't false-trigger) and clears `lastLayout` when it happens. With no
active layout, spacing/margin/padding changes stop trying to re-flow photos —
your custom size sticks. The Layout panel shows a small hint explaining why
the Grid/Justified/Mosaic chips go inactive at that point, and undoing the
resize correctly restores the active layout too.

Verified end-to-end against the real store: resize a photo, confirm
`lastLayout` clears, drag Padding, confirm the resized photo keeps its custom
size and nothing else moves, then undo twice and confirm both the layout
governance and the original size are restored.

## Fixed: photos shuffling positions on any margin/spacing/padding change

A side effect of the earlier swap-preservation fix. That fix inferred photo
order from CURRENT pixel position (row-bucketed by center-Y) so a re-run
layout wouldn't undo a swap — reasonable for Grid, but unstable for Mosaic:
a tall spanning cell's center sits ambiguously between "rows," so a tiny
margin change (e.g. 52px → 56px) could tip it into a different bucket and
scramble the whole assignment, even though nothing was swapped.

Real fix: instead of *inferring* order from geometry (fragile), `swapItems`
now also swaps the two photos' ARRAY positions, not just their on-canvas
geometry. Array order is then always a reliable, stable record of "current
visual order" — no per-render geometric guessing needed. `layoutToDraft` goes
back to plain array order, which is now correct by construction.

Verified against the real store: margin 52 → 56 with no swap in between now
produces byte-identical ordering (previously this exact scenario reshuffled
all 5 photos), and a swap still correctly survives a subsequent spacing
change.

## Latest round: rotate, shape primitives (template sketching), nudge, print sizes

- **Rotate 90° CW/CCW** — two buttons in the Arrange panel, work on *any*
  selected item (photo, text, sticker, or shape), not just images. Fully
  undoable, wraps cleanly at 0°/360° (verified numerically).
- **Shape primitives** — Insert panel → Shapes: Rectangle, Circle, Oval, Line.
  Each is a real canvas item — drag, resize, rotate (via the same Transformer
  everything else uses), align, duplicate, reorder — with its own Shape style
  panel (fill on/off, fill color, stroke color/width, corner radius for
  rectangles, opacity). This is meant for exactly what you described: sketch
  a template's structure with placeholder shapes before you have photos, then
  swap each one out for a photo once you do (dragging a photo near a shape
  will already snap to its edges/center via the existing Snap & guides).
  **Scoped down from the full idea, as you allowed** — I built freely
  placeable/resizable shapes rather than a click-and-drag "draw" tool, and
  there's no automatic "drop a photo directly into a shape to convert it"
  yet. Both are real, boundable follow-ons if you want them later; I chose
  the safer, lower-risk version now given how much interaction-layer
  complexity this app already carries.
- **Keyboard nudge** — arrow keys move the selected item 1px, Shift+arrow
  moves 10px. Disabled during crop mode, text editing, and Lock Layout, same
  as drag/resize already are.
- **Print-size presets** — 4×6", 5×7", 8×10", and A4, all at 300 DPI
  (verified the pixel math), alongside the existing social-media presets.

Also fixed in passing: the Transformer's aspect-lock logic previously forced
*every* non-image item (text, sticker, and now shapes) into 1:1 resizing —
harmless for text/stickers, but would have wrongly locked rectangles/ovals to
squares. Fixed to only force-lock text/stickers, while shapes (and images)
respect their own lock-aspect setting.

### Considered, not built this round

A few more ideas worth knowing about for a future pass: **Save As / duplicate
project** (branch a copy without overwriting the original — currently Save
always overwrites the same project), **batch export** (each collage cell as
its own image), and a **watermark/logo overlay** pinned to every export. None
are in yet; flagging them so the roadmap stays visible rather than deciding
silently on your behalf.

## HEIC/HEIF support + two silent-failure bugs fixed

**Real support, not just a warning.** iPhone photos (HEIC/HEIF) now decode
fully offline via a self-contained JS port of libheif (`heic2any`) — verified
by inspecting its bundle directly: zero `fetch()`/`WebAssembly`/CDN
references, the whole decoder runs in a Web Worker built from an embedded
string. It's ~1.35MB, so it's lazy-loaded (dynamic `import()`) — confirmed in
the actual build output that it splits into its own chunk and the main
bundle is untouched. The PWA precaches it on first visit, so it's available
offline from the start, not fetched on first HEIC use.

Once converted, a HEIC photo becomes a normal JPEG at the very first step —
nothing downstream (canvas rendering, project save, JSON export) needed any
changes at all.

**Two independent bugs were actually causing the silent failures — not just
missing HEIC support:**
1. `loadImageFiles` used `Promise.all`, so **one bad file failed the entire
   batch** with an unhandled rejection — drop 5 photos with 1 HEIC among
   them, and *none* of the 5 would appear, with nothing in the UI to explain
   why.
2. Two separate filters (`file.type.startsWith('image/')`, and
   react-dropzone's own `accept: 'image/*'` matching) silently dropped any
   file with an empty or unrecognized MIME type — which is exactly how HEIC
   commonly reports on non-Apple platforms — *before the code ever tried to
   load it*.

Both are fixed: each file now succeeds or fails independently
(`Promise.allSettled`), detection checks file extension as a fallback (MIME
type alone is unreliable for HEIC), and any file that still can't be
loaded — HEIC or otherwise, corrupt or unsupported — surfaces in a
**dismissible warning banner** naming the file and the reason, instead of
vanishing silently. This covers the fallback you asked for even now that real
support exists — some HEIC variants (odd depth-map or burst-photo formats)
can still fail inside the decoder itself, and those get reported the same
way rather than silently dropped.


## Added: +/- nudge buttons on every slider

Small "−" and "+" buttons now flank every slider in the app — Adjust,
Crop zoom, Layout spacing, Style border/corners, Background, Text size,
Arrange opacity, Collage frame, Shape style — all 20 usages, since they all
share one `Slider` component. Each click steps by the slider's own step size
(1px for most, 0.01x for Crop zoom, etc.), clamps at min/max, and disables
itself right at the boundary. Verified the rounding avoids the classic
floating-point drift (repeated 0.01 nudges land exactly on 1.30, not
1.3000000000000003). Each click is its own single undo step, same as a full
slider drag.

## v2, iteration 1: enhance presets, face-aware crop, extended copy-style, resize slider

### 1. Enhance presets (Brighten, Darken, Monochrome, Antique, Vivid, Warm, Auto Enhance)

Select a photo → **Enhance** panel. Each button sets the photo's filters to a
specific recipe in one click; **Adjust** below shows the same values as
sliders so you can fine-tune afterward. Built entirely on Konva's own filter
library, already a dependency — no new packages needed:

- **Monochrome** uses Konva's dedicated `Grayscale` filter, not just a
  saturation slider pushed to its minimum — confirmed by reading Konva's own
  saturation formula (`2^saturation`), which can only ever *approach* zero,
  never truly reach it.
- **Antique** uses Konva's dedicated `Sepia` filter (grayscale and sepia are
  mutually exclusive — picking one clears the other).
- **Warm** shifts hue rather than just cranking saturation. I verified the
  *direction* numerically by reimplementing Konva's actual HSL matrix in
  Node and testing it against a skin-tone color — Konva's raw hue property
  runs opposite to what you'd expect, so this needed checking rather than
  guessing. The stored/UI value uses the intuitive convention (positive =
  warmer) and is negated only at the point it's handed to Konva.
- **Auto Enhance** uses Konva's own built-in `Enhance` filter (yes, that's
  literally its name) rather than a hand-rolled histogram analysis — it's a
  real, tested filter already shipping in the dependency you have, so
  reinventing it would have added risk for no benefit.

### 2. Face detection + auto-crop to keep faces in frame <NOT WORKING>

Crop panel → **Detect face & center**. This is the one feature in the app
that isn't fully self-contained offline, and it's worth explaining exactly
why, since every other feature here (including HEIC support) deliberately
avoided any CDN dependency:

- The **native browser API** for this (`FaceDetector`, part of the Shape
  Detection API) technically exists in Chrome/Edge, but I checked current
  support directly — it's still gated behind an experimental flag
  (`chrome://flags/#enable-experimental-web-platform-features`) that almost
  no one enables. Not viable as the real path for actual users.
- A **fully offline library** would need bundled model weights. I checked:
  BlazeFace's weights are hosted on Google's model hub, not included in the
  npm package, and I don't have network access to that host from this
  environment to download and bundle them myself.
- So this uses **TensorFlow.js + BlazeFace**, dynamically imported (only
  users who click "Detect face" pay for it — confirmed in the build output
  that it splits into its own chunks, leaving the main bundle unchanged).
  The detection model (~250KB gzipped across a few chunks) is fetched from
  Google's model hub **the first time it's used**; after that the browser
  caches it and it works offline. Nothing about this touches your actual
  photos — those never leave the browser either way.
- The crop math itself: detected face(s) get a **union bounding box** (so a
  group photo centers on everyone, not just one face), then it reuses the
  existing `coverCrop` sizing math, just recentered on the face instead of
  the image's raw center, clamped to stay inside the source image. Verified
  numerically — aspect ratio match, face containment, and edge-clamping all
  confirmed on synthetic face positions.
- **Honest limitation:** I don't have a browser or a real photo with a face
  in this environment, so I could verify the crop math and the bundling
  behavior thoroughly, but not an actual end-to-end detection on a real
  photo. Please test this one for real before relying on it.
- If a photo has no detectable face, or the model can't be fetched (no
  internet on first use), you get a clear message in the Crop panel instead
  of a silent failure.

### 3. Copy style now includes enhancements — automatically

No new code was needed for this beyond extending the filter model in #1: the
existing Copy/Paste style and "Apply to all photos" already copy the whole
`filters` object as a unit, so hue, auto-enhance amount, grayscale, and
sepia all ride along for free. Verified end-to-end against the real store:
applying "Warm" to one photo, copying its style, and pasting onto another
produces byte-identical filters.

### 4. Manual resize via a single slider (aspect ratio always locked)

Arrange panel → **Size (width)** slider, shown for photos. Dragging it
resizes the photo proportionally — height is always derived from the
captured aspect ratio, never independently adjustable, matching what was
asked for. Two details worth knowing:
- It resizes **anchored on the photo's center**, not its top-left corner, so
  the photo doesn't visually jump as it grows or shrinks — verified
  numerically.
- If the photo has an active crop (e.g., from a layout), resizing re-covers
  the crop to the new size automatically, same as dragging a Transformer
  handle already does.

This is independent of the existing "Lock aspect ratio" toggle (which
governs corner-handle dragging) — the slider always preserves aspect
regardless of that toggle's state, since that's what was specifically asked
for here.

## v2, iteration 2: removed 3 features, added enhancement strength control

Real-world testing surfaced three things worth cutting rather than fixing:

- **Face detection — removed entirely.** TF.js + BlazeFace and all its
  dependencies are uninstalled; the crop panel is back to exactly how it was
  before. Confirmed via a full rebuild: precache dropped from 39 entries
  (3.89MB) back to 32 (2.46MB), and a full source grep found zero remaining
  references anywhere. If this comes back later as a proper U2Net-based
  feature, that's a clean slate to build on rather than a patch on top of
  the abandoned attempt.
- **Insert → Shapes — removed.** Rectangle/Circle/Oval/Line and their style
  panel are gone (the underlying issue was always that a shape and a photo
  dropped onto it don't have any relationship — sketching a template doesn't
  actually help place photos later). **Add Text and Stickers stay** — those
  are unrelated, proven-useful features that happened to share a panel with
  Shapes, not part of what was reported as unhelpful. If that reading is
  wrong and the whole Insert panel should go, easy to remove further.
- Both removals were done carefully around a real backward-compatibility
  concern: any project auto-saved during testing with a shape item still in
  it needed to not crash on reload. `CanvasStage` now defensively skips
  rendering any item whose type it doesn't recognize, rather than assuming
  every non-text/sticker item is a photo.

**Enhance presets now have a Strength slider (0–100%).** Every preset
applies at 60% by default rather than full intensity — directly answering
"Brighten and Darken work too aggressively" — and the same one slider
controls the intensity of *any* active preset, not just those two. Verified
end-to-end against the real store: raising strength from 60% to 100%
recomputes cleanly from each preset's original recipe rather than
compounding on the already-scaled value (a classic bug class with this kind
of repeated-percentage control), and dialing down to 20% lands on an exact
value, not something drifted by floating-point error.

One honest limitation, stated in the UI rather than hidden: Konva's
Grayscale and Sepia filters are all-or-nothing — there's no native "50%
sepia" without a bigger rendering change (blending two rendered layers).
So for Monochrome and Antique, the strength slider still scales their
accompanying brightness/contrast, but the recoloring itself stays fully on
regardless of the percentage. The Enhance panel says so directly rather than
pretending the slider does something it can't.

## v2, iteration 3: fixed a real overlap, merged controls, added Reset

Three related issues, all from the same root cause: Grayscale/Sepia lived in
Adjust as **toggles** (click to turn on, click again to turn off), while
Enhance panel presets are **one-way applies** (always set specific values,
never toggle off). That mismatch explains all three reports:

1. **"Auto-enhance amount has no effect"** — it wasn't broken, it was
   genuinely redundant: both it and the Enhance panel's Strength slider
   controlled the same underlying value, and touching Strength would
   silently overwrite any manual tweak to the Adjust-panel slider (since
   Strength always recomputes from the original recipe). Removed the direct
   slider; Auto Enhance intensity is now only reachable through Strength,
   which is the one, non-conflicting path.
2. **Grayscale/Sepia moved into the Enhance panel**, and Monochrome (which
   was really just "grayscale + a bit of contrast" — nearly identical once
   Grayscale is a direct toggle in the same panel) is removed from the
   preset list.
3. **The "doesn't toggle" issue is a direct consequence of #2's fix.** I
   checked Konva's actual source first rather than assume a rendering bug —
   both "change a filter's parameter" and "change which filters are active"
   invalidate the render cache through the identical internal mechanism, so
   there was never an engine-level asymmetry. The real mismatch was
   behavioral (toggle vs. apply-once), and moving Grayscale/Sepia to live
   beside the presets as proper toggles resolves it directly.

**Added: one Reset for all enhancements.** Enhance panel header → Reset,
clears every filter (brightness, contrast, saturation, hue, auto-enhance,
grayscale, sepia, blur) back to neutral in a single action — deliberately
scoped to *only* `filters`, never touching crop or size. Verified against
the real store: crop and width/height are byte-identical before and after a
reset that's actively clearing a non-trivial filter set.

## Enhance panel cleanup: removed duplication, fixed a real state bug, verified the rest

- **"Auto-enhance amount" slider removed from Adjust** — it duplicated the
  Enhance panel's Strength slider with no clear relationship between the two.
  Adjust now holds only the sliders that aren't preset-driven: Brightness,
  Contrast, Saturation, Warmth, Blur.
- **Grayscale and Sepia moved into the Enhance panel**, as toggle buttons
  alongside the presets, using the exact same `updateItem` mechanism already
  confirmed to work reliably.
- **Monochrome preset removed** — it was just Grayscale + a contrast bump,
  redundant now that Grayscale is its own button in the same panel. Removed
  from the actual preset list (not just hidden), confirmed with a full
  source grep.
- **Found and fixed a real bug while verifying this**, not just taking the
  restructuring at face value: manually toggling Grayscale or Sepia didn't
  clear the photo's `presetId`/`presetStrength`, so if a preset had been
  applied earlier, the Strength slider would stay visible and silently
  overwrite your manual toggle the next time you touched it. Confirmed with
  a real store simulation showing `presetId` incorrectly surviving a
  Grayscale click, then confirmed the fix — Grayscale/Sepia now clear any
  active preset association, becoming a true independent toggle.
- **Reset button** (Enhance panel header) clears every enhancement field —
  brightness, contrast, saturation, hue, auto-enhance, grayscale, sepia,
  blur — in one click. Verified end-to-end: crop and resize survive a reset
  completely untouched, and undo correctly restores the pre-reset state.

## Four more Enhance-panel fixes

- **Ugly floating-point values fixed** (e.g. `1.7999999999999998`) — these
  came from multiplying preset values by a strength percentage
  (`35 × 0.6` is clean, but `3 × 0.6` isn't, in floating point). Scaled
  values are now rounded to 1 decimal place at the source, not just
  truncated for display.
- **Auto Enhance's weak response to Strength — root cause found, not just
  patched.** Read Konva's actual `Enhance` filter source: it's a genuine
  auto-levels histogram stretch — it finds each color channel's min/max
  across the photo and stretches that range toward 0–255. On a photo that's
  already well-exposed (most modern phone photos are), there's very little
  headroom left to stretch, so the effect stays small **no matter how high
  the strength goes** — that's correct behavior for an auto-levels
  algorithm, not a wiring bug. Fixed by pairing it with a real contrast +
  saturation boost, so Auto Enhance stays visibly useful across ordinary
  photos too, not only washed-out ones.
- **Preset buttons now toggle properly** — clicking an already-active preset
  again turns it off (reverts to neutral) instead of just reapplying the
  same values; clicking a *different* preset switches cleanly without
  toggling off first. Verified the full click sequence (on → off → on →
  switch) against the real store.
- **Reset now looks like an actual button** — a small bordered
  accent-colored button in the Enhance panel header, replacing the
  plain-text link style.

## Roadmap — your 14 features mapped to phases

| Phase | Features |
|-------|----------|
| **1 ✓** | Drag & drop, free resize, rotate, background color, export |
| **2 ✓** | Layout engine (grid / justified / mosaic), smart suggestions, spacing / margin / padding, z-order, export quality |
| **3 ✓** | Crop tool, image adjustments (brightness/contrast/saturation/blur), borders, rounded corners, frame styles |
| **4 ✓** | Text, stickers, lock aspect ratio, swap photos |
| **5 ✓** | Gradient / image / blurred / pattern backgrounds, automatic color extraction, copy/apply styles |
| **6 ✓** | PWA install + offline, IndexedDB project save/load, file/project names, JPEG, duplicate, border styles, calligraphy fonts, persistent crop |

## Project structure

```
src/
  types/index.ts              data model (forward-compatible)
  store/useEditorStore.ts     zustand store + undo/redo
  utils/                      loadImage, exportStage, id
  components/
    Toolbar.tsx               top bar
    panels/InspectorPanel.tsx canvas + background controls
    Canvas/
      CanvasStage.tsx         Konva stage, fit-to-view, transformer
      ImageNode.tsx           draggable/transformable image
  App.tsx                     dropzone, shortcuts, export wiring
```

## Notes / known Phase-1 limitations

- Images are held as in-memory object URLs; they won't persist across reloads
  until the IndexedDB phase.
- The single JS chunk is large because Konva ships as one module — we'll
  code-split it later; it doesn't affect functionality.
