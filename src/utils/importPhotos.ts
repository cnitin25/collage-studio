import { useEditorStore } from '../store/useEditorStore';
import { loadImageFiles } from './loadImage';

/**
 * Show `message` (App's busy indicator) while `work` runs — unless it's done
 * within `delayMs`, so a quick job doesn't flash one. `work` can update the
 * message as it goes.
 */
export async function withBusy<T>(
  message: string,
  work: (update: (message: string) => void) => Promise<T>,
  delayMs = 300,
): Promise<T> {
  const setBusy = useEditorStore.getState().setBusyMessage;
  let current = message;
  let shown = false;
  const timer = window.setTimeout(() => {
    shown = true;
    setBusy(current);
  }, delayMs);
  try {
    return await work((m) => {
      current = m;
      if (shown) setBusy(m);
    });
  } finally {
    window.clearTimeout(timer);
    if (shown) setBusy(null);
  }
}

/**
 * Add photo files to the canvas, reporting any that couldn't be read. A big
 * batch (or HEIC conversion, seconds per photo) shows its progress; before,
 * nothing happened on screen until every photo had loaded.
 */
export async function importPhotos(files: File[]): Promise<void> {
  const label = (done: number, total: number) =>
    total > 1 ? `Adding photos… ${done} of ${total}` : 'Adding photo…';
  const { images, failures } = await withBusy(label(0, files.length), (update) =>
    loadImageFiles(files, (done, total) => update(label(done, total))),
  );
  const st = useEditorStore.getState();
  if (images.length) st.addImages(images);
  st.setImportFailures(failures);
}
