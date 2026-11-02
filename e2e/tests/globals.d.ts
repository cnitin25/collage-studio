import type Konva from 'konva';
import type { useEditorStore } from '../../src/store/useEditorStore';

// What the app exposes to these specs, typed from its own source so a spec
// that calls a renamed or reshaped store action fails to compile.
declare global {
  interface Window {
    /** The editor store, set by main.tsx in development builds only. */
    __editorStore: typeof useEditorStore;
    /** Konva registers itself globally. */
    Konva: typeof Konva;
  }
}

export {};
