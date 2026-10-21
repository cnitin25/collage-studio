import React from 'react';
import ReactDOM from 'react-dom/client';
import Konva from 'konva';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useEditorStore } from './store/useEditorStore';
import './index.css';

// Dev/test-only: lets Playwright read view state (viewScale/viewX/viewY)
// directly instead of scraping the DOM. Stripped from production builds —
// import.meta.env.DEV is statically replaced by Vite, so this whole block
// is dead-code-eliminated.
if (import.meta.env.DEV) {
  (window as unknown as { __editorStore: typeof useEditorStore }).__editorStore = useEditorStore;
}

// Most phones are 3× displays, where every Konva canvas — and every cached,
// filtered photo — would hold 9× its on-screen pixel count. 2× is visually
// almost indistinguishable at that density and far lighter on memory. Must
// run before any Stage exists; export resolution is set separately
// (CanvasStage's exportDataURL), and blur radii already scale by this value.
Konva.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

// Bundled script/calligraphy fonts (offline). Imported for side effects.
import '@fontsource/pacifico/400.css';
import '@fontsource/dancing-script/400.css';
import '@fontsource/dancing-script/700.css';
import '@fontsource/caveat/400.css';
import '@fontsource/great-vibes/400.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
