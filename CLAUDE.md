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
- There is no lint/format script configured; `tsc -b` (via `npm run build`)
  is the only automated correctness check outside the Playwright suite.
- `e2e/` is a separate npm project (own `package.json`, own
  `node_modules`, own `tsconfig`) — it is not part of the root TypeScript
  build (`tsc -b`) and won't be type-checked or built by root-level commands.
  Run its install and tests from inside `e2e/`, or via the root's
  `npm run test:e2e` convenience script.
  Update `README.md` file after every update of the project. `README.md` should have the features added in the project, resources and project structure

## Things easy to miss by only reading the code

- `npm run test:e2e` reuses whatever is already listening on port 5173
  (`reuseExistingServer`). If another project's dev server holds that port,
  every test runs against the wrong app and fails with "element not found" —
  check the port before debugging the tests.
- `AGENTS.md`'s **Storage**, **State And History** and **Canvas And Export**
  sections record rules the code depends on (storage lock, immutable assets,
  `refitCrop` over `coverCrop`, reference-based unsaved-changes tracking,
  blur radius in cache pixels, the single blob-URL release subscription,
  `ColorInput` for colour pickers, `itemSize` for drawn sizes, `UI_OVERLAY`
  for editor-only visuals, stage-relative zoom maths). Read them before
  changing those areas.

- This app has **two responsive layouts** sharing the same components:
  desktop (fixed inspector, full toolbar) and mobile/touch (inspector becomes
  a slide-over drawer, secondary toolbar actions move into an overflow menu).
  The only automated coverage for this is `e2e/tests/mobile.spec.ts` — there
  is no visual regression tool, so a change that looks fine on desktop can
  silently break the drawer/overflow behavior. Run `npm run test:e2e` after
  touching `Toolbar.tsx`, `InspectorPanel.tsx`, or `CanvasStage.tsx`'s
  pan/zoom handling.
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
