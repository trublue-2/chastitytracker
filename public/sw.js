// ---------------------------------------------------------------------------
// KG Tracker – Service Worker v2
// Versioned caches, fetch routing, push notifications, offline support
// ---------------------------------------------------------------------------

const CACHE_VERSION = 1;
const OFFLINE_URL = '/offline.html';

// Cache names (versioned for clean upgrades)
const CACHE_STATIC  = `static-v${CACHE_VERSION}`;
const CACHE_IMAGES  = `images-v${CACHE_VERSION}`;
const CACHE_API     = `api-v${CACHE_VERSION}`;
const CACHE_OFFLINE = `offline-v${CACHE_VERSION}`;

const ALL_CACHES = [CACHE_STATIC, CACHE_IMAGES, CACHE_API, CACHE_OFFLINE];

// Assets to precache on install
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

// ---------------------------------------------------------------------------
// Install – precache critical assets
// ---------------------------------------------------------------------------
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_OFFLINE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[SW] precache failed, skipping anyway:', err);
        return self.skipWaiting();
      })
  );
});

// ---------------------------------------------------------------------------
// Activate – clean up old versioned caches, claim clients
// ---------------------------------------------------------------------------
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !ALL_CACHES.includes(name))
            .map((name) => {
              console.log('[SW] deleting old cache:', name);
              return caches.delete(name);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// Push Notifications
// ---------------------------------------------------------------------------
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
    }).then(() => {
      // Set badge count (supported on Android + iOS 16.4+ standalone)
      if (self.navigator?.setAppBadge) {
        self.navigator.setAppBadge(1).catch(() => {});
      }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  // Clear badge on interaction
  if (self.navigator?.clearAppBadge) {
    self.navigator.clearAppBadge().catch(() => {});
  }

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

// ---------------------------------------------------------------------------
// Fetch – routing by request pattern
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // 1. Static assets (/_next/static/) → cache-first (immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // 2. Uploaded images (/api/uploads/) → cache-first (immutable, 1yr headers)
  if (url.pathname.startsWith('/api/uploads/')) {
    e.respondWith(cacheFirst(request, CACHE_IMAGES));
    return;
  }

  // 3. Entries API (GET /api/entries) → stale-while-revalidate
  if (url.pathname === '/api/entries' && request.method === 'GET') {
    e.respondWith(staleWhileRevalidate(request, CACHE_API));
    return;
  }

  // 4. Navigation requests → network-first with offline fallback
  if (request.mode === 'navigate') {
    e.respondWith(networkFirstNavigation(request));
    return;
  }

  // 5. Everything else → network-only (mutations, auth, etc.)
  // Let the browser handle it normally
});

// ---------------------------------------------------------------------------
// Cache strategies
// ---------------------------------------------------------------------------

/**
 * Cache-first: return from cache if available, otherwise fetch + cache.
 * Best for immutable assets (static bundles, uploaded images).
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // For images: return a transparent 1x1 pixel as fallback
    if (cacheName === CACHE_IMAGES) {
      return new Response('', { status: 408, statusText: 'Offline' });
    }
    throw err;
  }
}

/**
 * Stale-while-revalidate: serve cached immediately, update in background.
 * Notifies clients via postMessage when fresh data arrives.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Always fetch in background to update
  const networkPromise = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
        // Notify all clients that fresh data is available
        const clients = await self.clients.matchAll({ type: 'window' });
        const body = await response.clone().json();
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_ENTRIES_UPDATED',
            entries: body,
          });
        });
      }
      return response;
    })
    .catch((err) => {
      console.warn('[SW] background revalidation failed:', err);
      return null;
    });

  // Return cached version immediately if available
  if (cached) {
    // Background update happens asynchronously
    networkPromise; // intentionally not awaited
    return cached;
  }

  // No cache: wait for network
  const response = await networkPromise;
  if (response) return response;

  // Both cache and network failed
  return new Response(JSON.stringify([]), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Network-first for navigation: try network, fallback to offline page.
 */
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.status === 502 || response.status === 503 || response.status === 504) {
      const offline = await caches.match(OFFLINE_URL);
      return offline || response;
    }
    return response;
  } catch (_) {
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response('Offline', { status: 503 });
  }
}
