/**
 * YYDevTools service worker.
 *
 * Hand-written rather than Angular's ngsw because this site is prerendered to a
 * separate HTML file per route, with per-route meta/JSON-LD, a canonical apex
 * domain and real 404s. ngsw is built for single-page apps: it answers every
 * navigation from one cached app-shell index.html, which would bypass all of
 * that. So navigations here are network-first — an online visitor always gets
 * the real prerendered page, and crawlers (which never run a service worker) are
 * unaffected — while already-visited pages and their assets stay available
 * offline.
 *
 * The strategy, by request kind:
 *   - Cross-origin (ads, Google Fonts) and non-GET  → not handled; browser default.
 *   - /api/*                                         → not handled; never cached
 *                                                      (dynamic, rate-limited, private).
 *   - Navigations (mode === 'navigate')              → network-first, falling back
 *                                                      to the cached page for that
 *                                                      URL, then to /offline.html.
 *   - Same-origin static assets                      → stale-while-revalidate.
 *
 * Because navigations are network-first and the app's JS/CSS are content-hashed
 * (so a new deploy has new filenames), a fresh deploy is picked up on the next
 * online visit — there is no "stuck on an old version" trap. Bumping CACHE_VERSION
 * changes the SW bytes, which triggers install/activate and clears old caches.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `yydevtools-${CACHE_VERSION}`;

/** The one page that must work with no network at all, so it is precached. */
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // { cache: 'reload' } bypasses the HTTP cache so we precache the live copy.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      // Take over as soon as this version is installed rather than waiting for
      // every tab to close first.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from previous CACHE_VERSIONs.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Cross-origin (the AdSense loader, Google
  // Fonts) and non-GET requests are left entirely to the browser.
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  // The API is dynamic, rate-limited and privacy-sensitive: never intercept it.
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

/**
 * Network-first for pages: serve the live prerendered HTML when online (and keep
 * a copy for offline), fall back to the cached copy of this exact URL, and only
 * then to the generic offline page.
 */
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    const offline = await cache.match(OFFLINE_URL);
    // The offline page is precached in install, so this is always present.
    return offline ?? Response.error();
  }
}

/**
 * For static assets: return the cached copy immediately if there is one, and
 * refresh it in the background. The app's assets are content-hashed, so a cached
 * hit is always correct; unhashed public files (logo, icons) stay current via
 * the background refresh.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      // Cache only clean, same-origin responses; skip opaque/error ones.
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  return cached ?? (await network) ?? Response.error();
}
