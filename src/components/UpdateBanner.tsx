import { useEffect } from 'react';
import { useEditorStore } from '../store/useEditorStore';

/**
 * How long the new-version notice stays up. Nothing is lost when it goes: the
 * new version starts on its own once every tab of the app has been closed.
 */
const NEW_VERSION_NOTICE_MS = 12_000;

/** Offers the reload when a new version is waiting, or when this page is out of date (utils/appUpdate). */
export default function UpdateBanner({ onReload }: { onReload: () => void }) {
  const update = useEditorStore((s) => s.appUpdate);
  const setAppUpdate = useEditorStore((s) => s.setAppUpdate);

  // An out-of-date page stays flagged: part of the app has already failed to load.
  useEffect(() => {
    if (update !== 'new-version') return;
    const timer = window.setTimeout(() => setAppUpdate(null), NEW_VERSION_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [update, setAppUpdate]);

  if (!update) return null;

  return (
    <div className="update-banner" role="status">
      <span className="update-banner-text">
        {update === 'new-version'
          ? 'A new version of Collage Studio is ready.'
          : "Collage Studio was updated since this page opened, so part of it couldn't load."}
      </span>
      <button className="btn btn-primary update-banner-reload" onClick={onReload}>
        Reload
      </button>
      <button className="btn btn-ghost" onClick={() => setAppUpdate(null)}>
        Later
      </button>
    </div>
  );
}
