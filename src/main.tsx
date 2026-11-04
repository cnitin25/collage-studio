import React from 'react';
import ReactDOM from 'react-dom/client';
import Konva from 'konva';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useEditorStore } from './store/useEditorStore';
import { watchForUpdates } from './utils/appUpdate';
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

// Bundled text fonts (offline), so a collage looks the same on every device —
// Inter and Impact used to be whatever the system had, and phones have
// neither. Latin subsets only for the two new ones: every woff2 is precached
// for offline use, and other scripts fall back to system fonts per character.
// Imported for side effects.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-ext-400.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-ext-700.css';
import '@fontsource/inter/latin-400-italic.css';
import '@fontsource/inter/latin-ext-400-italic.css';
import '@fontsource/inter/latin-700-italic.css';
import '@fontsource/inter/latin-ext-700-italic.css';
import '@fontsource/anton/latin-400.css';
import '@fontsource/anton/latin-ext-400.css';
// Serif and Mono: Gelasio has Georgia's metrics and Courier Prime Courier's
// widths, so text set in the old system fonts wraps the same in these.
import '@fontsource/gelasio/latin-400.css';
import '@fontsource/gelasio/latin-ext-400.css';
import '@fontsource/gelasio/latin-700.css';
import '@fontsource/gelasio/latin-ext-700.css';
import '@fontsource/gelasio/latin-400-italic.css';
import '@fontsource/gelasio/latin-ext-400-italic.css';
import '@fontsource/gelasio/latin-700-italic.css';
import '@fontsource/gelasio/latin-ext-700-italic.css';
import '@fontsource/courier-prime/latin-400.css';
import '@fontsource/courier-prime/latin-ext-400.css';
import '@fontsource/courier-prime/latin-700.css';
import '@fontsource/courier-prime/latin-ext-700.css';
import '@fontsource/courier-prime/latin-400-italic.css';
import '@fontsource/courier-prime/latin-ext-400-italic.css';
import '@fontsource/courier-prime/latin-700-italic.css';
import '@fontsource/courier-prime/latin-ext-700-italic.css';
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

watchForUpdates();
