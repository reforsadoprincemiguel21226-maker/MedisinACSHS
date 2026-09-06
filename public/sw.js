const CACHE_NAME = 'medisinacshs-shell-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/home.html',
  '/css/style.css',
  '/css/home.css',
  '/css/ai-assistant.css',
  '/assets/images/logoACSHS.png',
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
