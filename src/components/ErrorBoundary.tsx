import { Component, type ErrorInfo, type ReactNode } from 'react';
import { noteCrash, saveRecoveryCopy } from '../storage/session';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** What happened to the work that wasn't saved yet. */
  recovery: { status: 'saving' } | { status: 'saved'; name: string } | { status: 'nothing' } | { status: 'failed' } | null;
}

/**
 * Catches render-time exceptions anywhere below it (e.g. a bad Konva node)
 * so the app shows a recoverable screen instead of a blank white page. The
 * editor's state lives in a store outside React, so it survives the crash:
 * any unsaved work is stored as a separate recovery copy before the user
 * reloads, and reloading is the safe way back — rather than trying to keep
 * rendering with broken state.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, recovery: null };
  private recovering = false;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Collage Studio crashed:', error, info.componentStack);
    // If this happened while reopening the last project, the next load must
    // not reopen it again (session.ts).
    noteCrash();
    if (this.recovering) return; // one copy, however many errors follow
    this.recovering = true;
    this.setState({ recovery: { status: 'saving' } });
    saveRecoveryCopy().then(
      (name) => this.setState({ recovery: name ? { status: 'saved', name } : { status: 'nothing' } }),
      () => this.setState({ recovery: { status: 'failed' } }),
    );
  }

  render() {
    const { error, recovery } = this.state;
    if (!error) return this.props.children;

    const status =
      recovery?.status === 'saved'
        ? `A copy of your unsaved work was saved in Projects as “${recovery.name}”.`
        : recovery?.status === 'nothing'
          ? 'Everything up to your last save is in Projects.'
          : recovery?.status === 'failed'
            ? "Your unsaved changes couldn't be saved. Your last save is still in Projects."
            : 'Saving a copy of your unsaved work…';

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
          <p style={{ color: 'var(--muted, #99a0b2)', fontSize: 13, marginBottom: 8 }}>
            Collage Studio hit an unexpected error and can't continue safely.
          </p>
          <p role="status" style={{ color: 'var(--text, #e8eaf0)', fontSize: 13, marginBottom: 18 }}>
            {status}
          </p>
          <button
            className="btn btn-accent"
            onClick={() => window.location.reload()}
            disabled={recovery?.status === 'saving'}
            style={{ height: 36, padding: '0 18px' }}
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}
