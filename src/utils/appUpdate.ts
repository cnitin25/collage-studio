import { registerSW } from 'virtual:pwa-register';
import { useEditorStore } from '../store/useEditorStore';

/** How often a long-open page asks for a newer version (browsers ask on navigation only). */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** How long Reload waits for the new worker to take over before reloading anyway. */
const ACTIVATE_WAIT_MS = 5000;

let registration: ServiceWorkerRegistration | undefined;
let skipWaiting: (() => Promise<void>) | undefined;

/**
 * Register the service worker and watch for a newer version. The worker
 * installs one in the background and leaves it waiting (registerType
 * 'prompt'); UpdateBanner offers the reload. Does nothing in development,
 * where there is no service worker.
 */
export function watchForUpdates(): void {
  const update = registerSW({
    onNeedRefresh() {
      useEditorStore.getState().setAppUpdate('new-version');
    },
    onRegisteredSW(_url, swRegistration) {
      if (!swRegistration) return;
      registration = swRegistration;
      window.setInterval(() => {
        // Offline, the check fails: nothing to do until it next succeeds.
        swRegistration.update().catch(() => {});
      }, CHECK_EVERY_MS);
    },
  });
  skipWaiting = () => update(true);
  // Code loaded on demand (the HEIC converter) that the server no longer has:
  // this page is from an older release. Vite's loader reports it here.
  window.addEventListener('vite:preloadError', () => useEditorStore.getState().setAppUpdate('out-of-date'));
}

/** Resolves once the worker has taken over, or never will, or after a few seconds. */
function tookOver(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ACTIVATE_WAIT_MS);
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'activated' && worker.state !== 'redundant') return;
      window.clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Swap in the waiting worker, if there is one, and reload into the newest
 * version (the caller saves first). The reload is ours: the plugin only
 * reloads a page that a worker already controls, and a page no worker controls
 * (a hard reload, with another tab keeping the old worker in place) never hears
 * of the handover, so Reload appeared to do nothing there.
 */
export async function reloadForUpdate(): Promise<void> {
  const waiting = registration?.waiting;
  if (waiting) {
    const done = tookOver(waiting);
    void skipWaiting?.();
    await done;
  }
  window.location.reload();
}
