const OFFLINE_URL = '/offline.html';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.open('offline-v1')
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.clients.claim())
      .catch((err) => {
        // Cache add can fail when network is unavailable on first install.
        // Still claim clients so the SW controls existing pages.
        console.warn('[SW] offline page cache failed, claiming anyway:', err);
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response.status === 502 || response.status === 503 || response.status === 504) {
            return caches.match(OFFLINE_URL);
          }
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
  }
});
