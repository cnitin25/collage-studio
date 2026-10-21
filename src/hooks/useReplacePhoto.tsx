import { useRef } from 'react';
import { useEditorStore } from '../store/useEditorStore';
import { loadImageFile } from '../utils/loadImage';

/**
 * "Replace the selected photo": a hidden file input plus the handler that
 * swaps the chosen image in. Render `input` once wherever the hook is used,
 * and call `open` from a button.
 */
export function useReplacePhoto() {
  const selectedId = useEditorStore((s) => s.selectedId);
  const available = useEditorStore((s) => s.items.find((i) => i.id === s.selectedId)?.type === 'image');
  const replaceImage = useEditorStore((s) => s.replaceImage);
  const setImportFailures = useEditorStore((s) => s.setImportFailures);
  const ref = useRef<HTMLInputElement>(null);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedId) return;
    try {
      replaceImage(selectedId, await loadImageFile(file));
    } catch (err) {
      setImportFailures([
        { name: file.name, reason: err instanceof Error ? err.message : 'Could not load this image.' },
      ]);
    }
  };

  return {
    available,
    open: () => ref.current?.click(),
    input: <input ref={ref} type="file" accept="image/*" hidden onChange={onChange} />,
  };
}
