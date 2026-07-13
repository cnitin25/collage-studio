import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time exceptions anywhere below it (e.g. a bad Konva node)
 * so the app shows a recoverable screen instead of a blank white page. There
 * is no in-memory state to salvage here — auto-save already persists to
 * IndexedDB every 30s, so reloading is the safe recovery path, not an
 * attempt to keep rendering with broken state.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Collage Studio crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          height: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg, #101218)',
          color: 'var(--text, #e8eaf0)',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 18, marginBottom: 8 }}>Something went wrong</h1>
          <p style={{ color: 'var(--muted, #99a0b2)', fontSize: 13, marginBottom: 18 }}>
            Collage Studio hit an unexpected error and can't continue safely. Your last
            auto-save (if enabled) or manual save is still in Projects — reloading won't
            lose anything beyond changes made since then.
          </p>
          <button
            className="btn btn-accent"
            onClick={() => window.location.reload()}
            style={{ height: 36, padding: '0 18px' }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
