import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject, isDevMode } from '@angular/core';

/**
 * Registers the service worker (public/sw.js) once, in the browser, in a
 * production build only. Must be called from an injection context (e.g. a
 * component constructor).
 *
 * Skipped during prerender (no browser) and under `ng serve` (`isDevMode()`),
 * where a caching layer only gets in the way of live reloads.
 *
 * `updateViaCache: 'none'` tells the browser never to serve the sw.js script
 * itself from the HTTP cache when checking for updates, so a redeploy's new
 * worker is always detected. Registration is deferred to `load` so it never
 * competes with first paint or hydration.
 */
export function registerServiceWorker(): void {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  if (!isBrowser || isDevMode() || !('serviceWorker' in navigator)) {
    return;
  }

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .catch((error) => console.warn('Service worker registration failed', error));
  };

  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
