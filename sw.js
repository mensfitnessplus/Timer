const CACHE_NAME = 'focus-timer-v1.1';

// Files to cache for offline use
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Google Fonts — cached on first fetch, served offline after
  'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Nunito:wght@700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0',
];

// ─── INSTALL: pre-cache core assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache local assets first (must succeed), then attempt fonts
      return cache.addAll([
        './index.html',
        './manifest.json',
        './icons/icon-192.png',
        './icons/icon-512.png',
      ]).then(() => {
        // Best-effort cache of external fonts (no throw if offline during install)
        return Promise.allSettled(
          STATIC_ASSETS.filter(u => u.startsWith('https://')).map(url =>
            cache.add(new Request(url, { mode: 'cors' })).catch(() => {})
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: delete old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH: cache-first for local, network-first for external ─────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and browser-extension requests
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  const isLocal = url.origin === self.location.origin;
  const isFonts = url.hostname === 'fonts.googleapis.com' ||
                  url.hostname === 'fonts.gstatic.com';

  if (isLocal) {
    // Cache-first: serve instantly offline, update cache in background
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached); // network failed → serve stale
        return cached || networkFetch;
      })
    );
  } else if (isFonts) {
    // Stale-while-revalidate for fonts
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
  }
  // All other external requests fall through to the browser normally
});
