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

self.addEventListener('push', (e) => {
  let data = { title: 'KG-Tracker', body: '', url: '/' };
  try {
    if (e.data) data = { ...data, ...JSON.parse(e.data.text()) };
  } catch (_) { /* ignore malformed payload */ }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.startsWith(self.location.origin));
      if (existing) {
        existing.focus();
        return existing.navigate(url);
      }
      return self.clients.openWindow(url);
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
