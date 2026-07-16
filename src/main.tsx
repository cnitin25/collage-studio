import React from 'react';
import ReactDOM from 'react-dom/client';
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
