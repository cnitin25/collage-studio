import { useEditorStore } from '../store/useEditorStore';

/** Offers the reload when a new version is waiting, or when this page is out of date (utils/appUpdate). */
export default function UpdateBanner({ onReload }: { onReload: () => void }) {
  const update = useEditorStore((s) => s.appUpdate);
  const setAppUpdate = useEditorStore((s) => s.setAppUpdate);
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
