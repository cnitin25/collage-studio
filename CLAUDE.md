# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start here

`AGENTS.md` in this repo root is the primary, tool-agnostic guide (project
overview, commands, code layout, state/history model, canvas/export notes, UI
conventions, verification steps). Read it first — this file only covers what's
specific to working here with Claude Code, or worth calling out twice.

## Claude Code specifics

- Use the `Edit`/`Write` tools for file changes, not `apply_patch` — the
  `apply_patch` instruction in `AGENTS.md` is a holdover from another agent
  and doesn't apply here.
- `npm run lint` (type-aware ESLint, correctness rules only — there is no
  formatter) and `npm run typecheck` (the app, the Vite/Vitest configs and
  the e2e specs) are the static checks, and `npm test` runs the Vitest unit
  tests (`src/**/*.test.ts`, plain Node). CI (`.github/workflows/ci.yml`)
  runs all three, the e2e suite on Chromium and WebKit, and the production
  smoke test, on every push and pull request. Work goes through one pull request per phase,
  merged when CI is green; merging to `master` deploys production.
- `e2e/` is a separate npm project (own `package.json`, own
  `node_modules`, own `tsconfig`) — not part of the root build (`tsc -b`),
  but `npm run typecheck` and `npm run lint` cover it. Run its install and
  tests from inside `e2e/`, or via the root's `npm run test:e2e`
  convenience script; it needs `npx playwright install chromium webkit`
  once. Specs reach the store as `window.__editorStore`, typed from the
  app's source by `e2e/tests/globals.d.ts` — never `(window as any)`.
  Update `README.md` file after every update of the project. `README.md` should have the features added in the project, resources and project structure

## Things easy to miss by only reading the code

- `npm run test:e2e` reuses whatever is already listening on port 5173
  (`reuseExistingServer`). If another project's dev server holds that port,
  every test runs against the wrong app and fails with "element not found" —
  check the port before debugging the tests.
- `AGENTS.md`'s **Storage**, **State And History** and **Canvas And Export**
  sections record rules the code depends on (storage lock, immutable assets,
  `refitCrop` over `coverCrop`, reference-based unsaved-changes tracking,
  blur radius in canvas pixels (Konva 10 scales it), the single blob-URL release subscription,
  `ColorInput` for colour pickers, `itemSize` for drawn sizes, `UI_OVERLAY`
  for editor-only visuals, stage-relative zoom maths). Read them before
  changing those areas.

- This app has **two responsive layouts** sharing the same components:
  desktop (fixed inspector, full toolbar) and the compact/phone layout
  (inspector becomes a bottom sheet, or a side panel in landscape; a
  selection bar replaces the thumbnail strip; secondary toolbar actions move
  into an overflow menu). AGENTS.md's UI Conventions has the breakpoint rule.
  The only automated coverage is `e2e/tests/mobile.spec.ts` (Chromium
  emulation); there is no visual regression tool, so a change that looks
  fine on desktop can silently break the phone layout. Run `npm run test:e2e`
  after touching `Toolbar.tsx`, `InspectorPanel.tsx`, `SelectionBar.tsx`, the
  responsive CSS, or `CanvasStage.tsx`'s pan/zoom handling, and for a visual
  check screenshot it with Playwright at 390x844 and 844x390.
- The dev server sends no Content-Security-Policy; production does
  (`vercel.json`), and `npm run preview` serves the same headers. Anything
  that loads a new kind of resource (a font, a worker, an image or fetch
  source) can work in `npm run dev` and break in production — run
  `npm run test:prod` (it fails on any CSP violation) and extend
  `e2e/prod/production.spec.ts` to cover the new resource. After a merge,
  `PROD_URL=https://offline-collage.vercel.app npm run test:prod` checks the
  live site.
- Don't edit `src/` while the e2e suite is running against the dev server:
  Vite reloads the pages under test, and the run fails with "Execution
  context was destroyed" or a store that has suddenly emptied.
- Playwright's WebKit build on Windows crashes under load (worker exit code
  3221226505, "Target page … has been closed", "Out of memory" in the big
  import/export specs). Run it locally with `--project=webkit --workers=2`
  before treating a failure as a bug; CI runs each engine as its own job.
- Photos are stored in IndexedDB as bytes plus MIME type, never as Blobs —
  Safari's private windows (and Playwright's WebKit) refuse Blobs there.
  See AGENTS.md's Storage section.
- Auto-save is on by default and the last project reopens on load. An e2e
  spec that needs "nothing saved" must switch auto-save off first
  (`s.setAutoSaveEnabled(false)`), and one that reloads gets the last saved
  project back.
- `README.md` is the user-facing feature list and is expected to stay
  accurate as features ship — update it alongside `AGENTS.md` when adding or
  removing a feature, not just when asked to "update the docs."
- `README.old.md` is an intentionally frozen changelog-style history of how
  the app got here (Phase 1 → v2 iterations). It's superseded by `README.md`
  for current behavior; don't treat it as authoritative, and don't merge its
  phase language back into `README.md`.
- Face detection (BlazeFace/TensorFlow.js) was built, then fully removed
  after real-world testing — see `README.old.md`'s "v2, iteration 2" entry
  before reintroducing anything like it. Same file documents two other
  removed features (Insert → Shapes, the floating quick-action toolbar) with
  the reasoning for cutting each.
