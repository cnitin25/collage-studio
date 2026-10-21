/** iPhone/iPad, including iPadOS reporting itself as a Mac. Every iOS browser is WebKit. */
export function isIOS(): boolean {
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** macOS (or iPadOS with a keyboard): shortcuts use ⌘ rather than Ctrl. */
export function isMac(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.platform) || isIOS();
}

/** Running as an installed Home Screen / desktop app rather than a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Desktop or iOS Safari (WebKit), as opposed to Chromium/Firefox. */
export function isWebKit(): boolean {
  const ua = navigator.userAgent;
  return isIOS() || (/Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|Firefox\//.test(ua));
}
