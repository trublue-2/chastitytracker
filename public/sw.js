// ---------------------------------------------------------------------------
// Chastity Tracker – Service Worker v2
// Versioned caches, fetch routing, push notifications, offline support
// ---------------------------------------------------------------------------

const CACHE_VERSION = 3; // bumped: räumt Bild-Caches, die bis 6.6.0 Abmelden und Nutzerwechsel überlebten
const OFFLINE_URL = '/offline.html';

/**
 * Die Pausen vor dem zweiten und dritten Zustellversuch einer Navigation.
 *
 * Ein einziger Fehlversuch reichte bisher, um die Offline-Seite einzublenden. Das trifft genau den
 * häufigsten Fall, in dem gar nichts kaputt ist: die App kommt aus dem Hintergrund, das WLAN ist
 * noch am Assoziieren, und der erste Zugriff läuft ins Leere. Die Seite behauptete dann „keine
 * Verbindung", während ein zweiter Versuch eine halbe Sekunde später durchgegangen wäre.
 *
 * Zwei kurze Pausen, keine lange: liegt wirklich nichts an, wartet der Nutzer 1,6 s länger auf eine
 * Auskunft, die er schon ahnt. Und bei fehlendem Netz wird gar nicht erst gewartet (siehe unten).
 */
const NAV_RETRY_DELAYS_MS = [400, 1200];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      .catch((err) => {
        console.warn('[SW] precache failed:', err);
      })
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();

  // Sent by the app on login and logout.
  // Clears the user-specific API response cache, the IMAGE cache and the entries IndexedDB store
  // so a newly logged-in user never sees data or photos that belonged to a previous user. Der
  // Bild-Cache fehlte hier bis 6.6.0: die Fotos des Vorgängers blieben am Gerät abrufbar.
  // Die Offline-Warteschlange bleibt bewusst stehen — sie hält noch nicht gesendete Einträge, und
  // dieselbe Nachricht kommt auch beim ANMELDEN (abgelaufene Sitzung, derselbe Nutzer).
  if (e.data?.type === 'CLEAR_USER_CACHE') {
    e.waitUntil(
      Promise.all([
        caches.delete(CACHE_API),
        caches.delete(CACHE_IMAGES),
        openIDB()
          .then((db) => {
            const tx = db.transaction('entries', 'readwrite');
            tx.objectStore('entries').clear();
          })
          .catch(() => {}),
      ])
    );
  }
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
  // Rückfall-Titel einer Push-Meldung ohne eigenen Titel — er steht in der Systemmeldung des
  // Geräts. Muss `APP_NAME` spiegeln; ein Service Worker kann nichts importieren, deshalb hält
  // `appName.test.ts` die beiden zusammen.
  let data = { title: 'Chastity Tracker', body: '', url: '/' };
  try {
    if (e.data) data = { ...data, ...JSON.parse(e.data.text()) };
  } catch (_) { /* ignore malformed payload */ }

  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'kg-tracker',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
      data: { url: data.url },
    }).then(() => {
      // Badge = ungelesene Nachrichten, vom Server gezählt (supported on Android + iOS 16.4+
      // standalone). Vorher stand hier eine feste 1, die nie wieder verschwand.
      // Fehlt `unread` ganz, bleibt das Badge unangetastet: eine Meldung ohne Nachrichten-Bezug
      // (z.B. an die Keyholder) darf den Stand weder erfinden noch löschen.
      if (typeof data.unread === 'number') {
        if (data.unread > 0) {
          self.navigator?.setAppBadge?.(data.unread).catch(() => {});
        } else {
          self.navigator?.clearAppBadge?.().catch(() => {});
        }
      }
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();

  // Das Badge wird hier BEWUSST nicht geräumt: es zählt ungelesene Nachrichten, und der Tap landet
  // direkt im Erfassungsformular — die Nachricht selbst hat der Nutzer dabei nie gesehen. Geräumt
  // wird am Zustand (nach dem Lesen, bei App-Start/Resume), nicht am Klick.
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

  // 2. Uploaded images (/api/uploads/) → cache-first: der Dateiname ist zufällig, der Inhalt ändert
  //    sich nie, und so bleiben Bilder offline sichtbar. Geleert beim An- und Abmelden (siehe oben).
  if (url.pathname.startsWith('/api/uploads/')) {
    e.respondWith(cacheFirst(request, CACHE_IMAGES));
    return;
  }

  // 3. Navigation requests → network-first with offline fallback
  if (request.mode === 'navigate') {
    e.respondWith(networkFirstNavigation(request));
    return;
  }

  // 4. Everything else → network-only (mutations, auth, etc.)
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
    // `no-store` respektieren: `cache.put` täte es von sich aus nicht, und ein freigegebenes
    // Bildersafe-Foto bliebe sonst auch nach erneutem Versiegeln im Cache.
    const noStore = /no-store/i.test(response.headers.get('Cache-Control') || '');
    if (response.ok && !noStore) {
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
 * Network-first for navigation: try network, fallback to offline page.
 *
 * **Was hier NICHT durchkommt.** Nur volle Dokument-Aufrufe (`mode === 'navigate'`). Ein Sprung
 * innerhalb der App holt eine RSC-Nutzlast und läuft an dieser Funktion vorbei — für den wacht
 * `useGuardedNavigation` (`src/app/hooks/`), und sein „Erneut versuchen" ist ein Dokument-Wechsel
 * und landet damit genau hier. Die beiden teilen sich die Arbeit, statt sie doppelt zu tun: eine
 * zweite Nachfass-Schleife auf der Client-Seite wäre die dritte Stelle, an der dieselbe Anfrage
 * wiederholt wird — und die Lehre des 30./31.08.2026 ist, dass Wiederholen die Lage verschlechtert,
 * wenn der Server ohnehin schon nicht nachkommt.
 */
async function networkFirstNavigation(request) {
  // Nachgefasst wird NUR bei GET. Eine Navigation kann auch ein Formular-POST sein, und ein zweiter
  // Versuch schickte ihn ein zweites Mal ab — Idempotenz hat dort nichts.
  const delays = request.method === 'GET' ? NAV_RETRY_DELAYS_MS : [];
  let lastResponse = null;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      // `onLine === false` ist die EINE Richtung dieses Schalters, der zu trauen ist: dann liegt
      // wirklich kein Netz an, und Nachfassen wäre bloss Wartezeit vor einer Auskunft, die schon
      // feststeht. Sein `true` sagt bekanntlich nichts (deshalb gibt es `connectionHealth.ts`) —
      // darauf stützt sich hier nichts.
      if (self.navigator.onLine === false) break;
      await sleep(delays[attempt - 1]);
    }

    const response = await fetchNavigation(request);
    if (isUsableNavigation(response)) return response;
    if (response) lastResponse = response;
  }

  // Die echte Antwort schlägt die erfundene: liegt die Offline-Seite nicht im Cache, ist ein
  // durchgereichter 502 immer noch mehr Auskunft als ein selbstgebauter.
  const offline = await caches.match(OFFLINE_URL);
  return offline || lastResponse || new Response('Offline', { status: 503 });
}

/** Ein Zustellversuch. `null` = gar keine Antwort (Netzfehler). */
async function fetchNavigation(request) {
  try {
    return await fetch(request);
  } catch (_) {
    return null;
  }
}

/** Taugt diese Antwort dem Nutzer? Wenn nicht, darf nachgefasst werden. */
function isUsableNavigation(response) {
  if (!response) return false;
  // 502/503/504 = Container startet noch / nicht erreichbar
  if (response.status === 502 || response.status === 503 || response.status === 504) return false;
  // 404 ohne x-kg-app-Header = Traefik hat kein Routing (Container komplett gestoppt)
  // 404 mit x-kg-app-Header = echter Next.js-404 → durchlassen
  if (response.status === 404 && !response.headers.get('x-kg-app')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Background Sync (Android Chrome only — progressive enhancement)
// Drains the offline-queue IndexedDB store when connectivity returns.
// ---------------------------------------------------------------------------
self.addEventListener('sync', (e) => {
  if (e.tag === 'offline-queue') {
    e.waitUntil(drainOfflineQueue());
  }
});

async function drainOfflineQueue() {
  try {
    const db = await openIDB();
    const tx = db.transaction('offline-queue', 'readonly');
    const store = tx.objectStore('offline-queue');
    const items = await idbGetAll(store);

    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { 'Content-Type': 'application/json' },
          body: item.body,
        });

        if (res.ok || res.status === 400 || res.status === 409) {
          // Success or client error — remove from queue
          const delTx = db.transaction('offline-queue', 'readwrite');
          delTx.objectStore('offline-queue').delete(item.id);
        } else if (res.status >= 500) {
          break; // Server error — stop, retry later
        }
      } catch (_) {
        break; // Network error — stop, retry later
      }
    }
  } catch (err) {
    console.warn('[SW] drainOfflineQueue failed:', err);
  }
}

// ---------------------------------------------------------------------------
// IndexedDB helpers (minimal — only used by SW for the offline queue / cache clearing)
// ---------------------------------------------------------------------------
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('kg-tracker', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) {
        const s = db.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('type', 'type', { unique: false });
        s.createIndex('startTime', 'startTime', { unique: false });
      }
      if (!db.objectStoreNames.contains('offline-queue')) {
        db.createObjectStore('offline-queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(store) {
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
