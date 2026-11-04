import { useShallow } from 'zustand/react/shallow';
import { selectedPhotos, useEditorStore } from '../store/useEditorStore';
import type { ImageItem } from '../types';

/** The selected photos, in stacking order; re-renders only when one changes. */
export function useSelectedPhotos(): ImageItem[] {
  return useEditorStore(useShallow(selectedPhotos));
}
