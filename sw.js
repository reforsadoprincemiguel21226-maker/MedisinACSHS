const CACHE_NAME = 'medisinacshs-shell-v7-home-inventory-center4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/home.html',
  '/css/style.css',
  '/css/home.css',
  '/assets/images/settings-icon.png',
  '/assets/images/refresh-icon.png',
  '/assets/images/location-icon.png',
  '/assets/images/assistant-icon.png',
  '/assets/images/inventory-icon.png',
  '/css/ai-assistant.css',
  '/assets/images/logoACSHS.png',
  '/assets/images/aria-nurse-white.png',
  '/assets/images/icon-white-192.png',
  '/assets/images/icon-white-512.png',
  '/A.i%20asistant.html',
  '/data/hospitals-data.js'
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

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('/home.html');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});
