const CACHE_NAME = 'medisinacshs-shell-v15-inventory-segments';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/press-feedback.css?v=1',
  '/assets/js/press-feedback.js?v=1',
  '/home.html',
  '/inventory.html',
  '/css/inventory.css?v=inventory-ui-v4',
  '/assets/js/inventory.js?v=inventory-ui-v4',
  '/assets/js/inventory-store.js?v=inventory-ui-v4',
  '/assets/images/inventory-add.png',
  '/assets/images/inventory-edit.png',
  '/assets/images/inventory-trash.png',
  '/assets/images/inventory-warning.png',
  '/css/style.css',
  '/css/home.css?v=home-ui-inventory-v4',
  '/assets/images/settings-icon.png',
  '/assets/images/refresh-icon.png',
  '/assets/images/location-icon.png',
  '/assets/images/assistant-icon.png',
  '/assets/images/inventory-icon.png',
  '/css/ai-assistant.css?v=aria-chat-4',
  '/assets/images/logoACSHS.png',
  '/assets/images/aria-nurse-white.png',
  '/assets/images/aria-speaker-icon.png',
  '/assets/images/aria-mic-icon.png',
  '/assets/images/aria-send-icon.png',
  '/assets/images/icon-white-192.png',
  '/assets/images/icon-white-512.png',
  '/A.i%20asistant.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/home.html')))
    );
    return;
  }

  // Static files: try the network first so updates show up immediately,
  // keep a copy for offline use, and fall back to the cache only when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request, { ignoreSearch: true }).then((cached) => {
          if (cached) {
            return cached;
          }
          if (event.request.mode === 'navigate') {
            return caches.match('/home.html');
          }
          return new Response('', { status: 503, statusText: 'Offline' });
        })
      )
  );
});
