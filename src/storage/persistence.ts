import { isStandalone, isWebKit } from '../utils/platform';

let request: Promise<boolean> | null = null;

/**
 * Ask the browser to keep this site's storage instead of clearing it under
 * pressure or after inactivity. Called once a project has actually been saved
 * — browsers weigh real use, and there's nothing to protect before that.
 */
export function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return Promise.resolve(false);
  request ??= navigator.storage
    .persisted()
    .then((already) => already || navigator.storage.persist())
    .catch(() => false);
  return request;
}

/**
 * True when saved projects are at risk of silent deletion: Safari (and every
 * iOS browser) clears a site's storage after 7 days without a visit unless it
 * runs as a Home Screen app or the browser granted persistent storage.
 */
export async function projectsMayBeCleared(): Promise<boolean> {
  if (!isWebKit() || isStandalone()) return false;
  try {
    return !(await navigator.storage?.persisted?.());
  } catch {
    return true;
  }
}
