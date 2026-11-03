import { registerSW } from 'virtual:pwa-register';
import { useEditorStore } from '../store/useEditorStore';

/** How often a long-open page asks for a newer version (browsers ask on navigation only). */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** Swaps in the waiting version and reloads; a plain reload until one is waiting. */
let applyUpdate: () => void = () => window.location.reload();

/**
 * Register the service worker and watch for a newer version. The worker
 * installs one in the background and leaves it waiting (registerType
 * 'prompt'); UpdateBanner offers the reload. Does nothing in development,
 * where there is no service worker.
 */
export function watchForUpdates(): void {
  const update = registerSW({
    onNeedRefresh() {
      applyUpdate = () => void update(true);
      useEditorStore.getState().setAppUpdate('new-version');
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => {
        // Offline, the check fails: nothing to do until it next succeeds.
        registration.update().catch(() => {});
      }, CHECK_EVERY_MS);
    },
  });
  // Code loaded on demand (the HEIC converter) that the server no longer has:
  // this page is from an older release. Vite's loader reports it here.
  window.addEventListener('vite:preloadError', () => useEditorStore.getState().setAppUpdate('out-of-date'));
}

/** Reload into the newest version (the caller saves first). */
export function reloadForUpdate(): void {
  applyUpdate();
}
