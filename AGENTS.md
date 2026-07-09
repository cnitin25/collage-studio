# Repository Guidelines

## Project Overview

Collage Studio is an offline-first browser photo collage editor built with Vite,
React 18, TypeScript, Zustand, immer, and react-konva/konva. It is a static
client app: there is no backend, and user photos/projects stay in browser
storage.

## Common Commands

- `npm run dev` starts the local Vite dev server on port 5173.
- `npm run dev:lan` starts Vite with LAN access.
- `npm run build` runs `tsc -b` and then creates the production Vite build.
- `npm run preview` serves the production build locally.
- `npm run preview:lan` serves the production build with LAN access.

## Code Layout

- `src/App.tsx` wires the main editor shell, drag/drop import, save/export, and
  keyboard shortcuts.
- `src/store/useEditorStore.ts` owns editor state, actions, undo/redo history,
  layout application, project loading, and view pan/zoom state.
- `src/types/index.ts` defines the central data model for canvas config and
  collage items.
- `src/components/Canvas/` contains the Konva stage and item renderers.
- `src/components/panels/` contains inspector/sidebar controls.
- `src/layout/` contains layout specs and layout strategies.
- `src/storage/` contains IndexedDB/project persistence helpers.
- `src/utils/` contains image loading, export helpers, snapping, shapes, and
  other editor utilities.

## Engineering Notes

- Keep changes aligned with the existing React + Zustand + immer patterns.
- The TypeScript config is strict and enables `noUnusedLocals` and
  `noUnusedParameters`; remove dead imports and unused variables as part of any
  edit.
- Use `apply_patch` for manual file edits.
- Prefer focused changes over broad refactors. This app has many interacting
  editor states, so small, verified changes are usually safer.
- Preserve user data boundaries: photos and project state are intended to stay
  local to the browser.

## State And History

- Mutating editor actions in `useEditorStore.ts` usually capture a snapshot,
  push it to `past`, clear `future`, and then edit the draft state.
- Live interactions use `beginChange`, `updateItemLive`, and `commitChange` to
  avoid flooding undo history while dragging/cropping.
- `layoutToDraft` arranges image items only; text and stickers float freely.
- `lastLayout` is intentionally cleared by some manual resize behavior so later
  spacing changes do not unexpectedly override user placement.

## Canvas And Export

- `CanvasStage` is responsible for display scaling, pan/zoom, selection,
  transformer setup, snapping guides, swapping dragged images, and export.
- `exportDataURL` temporarily neutralizes pan/zoom so exported files capture the
  full canvas rather than the current viewport.
- Changes to item dimensions, crop behavior, or view scaling should be checked
  against export behavior.

## UI Conventions

- Inspector controls live in collapsible panels.
- Canvas presets and export options use the existing `preset`, `chip`, `btn`,
  `toggle-row`, and related CSS classes.
- Keep controls dense and practical; this is an editor interface, not a landing
  page.

## Verification

- Run `npm run build` before handing off substantive TypeScript or React
  changes.
- For visual/canvas changes, also run the app and manually check import,
  selection/transform, crop, export, and responsive behavior where relevant.

