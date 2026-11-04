import { useEditorStore } from '../../store/useEditorStore';

/** What a panel's controls will change, for a selection of several items. */
export default function PhotoScopeNote({ photoCount }: { photoCount: number }) {
  const itemCount = useEditorStore((s) => s.selectedIds.length);
  const photos = photoCount === 1 ? 'the selected photo' : `the ${photoCount} selected photos`;
  return (
    <p className="dim small" style={{ marginTop: 0 }}>
      {photoCount === itemCount
        ? `Applies to all ${photoCount} selected photos.`
        : `Applies to ${photos}; the rest of the selection is left as it is.`}
    </p>
  );
}
