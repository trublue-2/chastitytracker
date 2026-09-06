// ---------------------------------------------------------------------------
// IndexedDB helpers for offline-first PWA support
// Database: kg-tracker v2
// Stores: entries (cached from server), offline-queue (pending mutations),
//         offline-blobs (photos captured offline, uploaded on flush)
// ---------------------------------------------------------------------------

const DB_NAME = "kg-tracker";
const DB_VERSION = 2;
const STORE_ENTRIES = "entries";
const STORE_QUEUE = "offline-queue";
const STORE_BLOBS = "offline-blobs";

/**
 * Marker eines OFFLINE zwischengespeicherten Fotos im Rumpf einer eingereihten Mutation.
 *
 * Ohne Netz kann das Foto nicht sofort nach `/api/upload` — statt den Eintrag zu blockieren, legt der
 * Client den (client-komprimierten) Blob in `offline-blobs` und schreibt an die Bild-Stelle des Rumpfs
 * `offline-blob:<id>`. Beim Nachreichen (`useOfflineQueue`) wird der Blob zuerst hochgeladen und der
 * Marker durch die zurückgegebene `imageUrl` ersetzt, BEVOR der Eintrag gesendet wird. Der Server
 * bekommt so nie einen Marker zu sehen — er ist rein client-intern.
 */
export const OFFLINE_BLOB_PREFIX = "offline-blob:";

/** Baut den Rumpf-Marker für einen zwischengespeicherten Blob. */
export function offlineBlobToken(id: string): string {
  return `${OFFLINE_BLOB_PREFIX}${id}`;
}

/** Ist dieser Wert ein Offline-Blob-Marker (und kein echter, hochgeladener Bild-Pfad)? */
export function isOfflineBlobUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(OFFLINE_BLOB_PREFIX);
}

/** Zieht die Blob-Id aus einem Marker; `null`, wenn der Wert keiner ist. */
export function parseOfflineBlobToken(value: unknown): string | null {
  return isOfflineBlobUrl(value) ? value.slice(OFFLINE_BLOB_PREFIX.length) : null;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface CachedEntry {
  id: string;
  type: string;
  startTime: string;
  imageUrl: string | null;
  note: string | null;
  orgasmusArt: string | null;
  kontrollCode: string | null;
  oeffnenGrund: string | null;
  verifikationStatus: string | null;
}

export interface QueuedMutation {
  id?: number; // auto-increment key
  method: string;
  url: string;
  body: string | null;
  createdAt: string;
}

/**
 * Ein offline aufgenommenes Foto, das beim Nachreichen hochgeladen wird.
 *
 * `clientExifTime` wird bewusst SEPARAT gehalten: der client-komprimierte Blob (Canvas → JPEG) hat
 * keine EXIF-Daten mehr, deshalb muss die Aufnahmezeit — wie im Online-Pfad über `clientExifTime` —
 * getrennt mitgeführt und beim Flush an `/api/upload` gereicht werden.
 */
export interface OfflineBlob {
  id: string;
  blob: Blob;
  /** Dateiname mit gültiger Bild-Endung (`/api/upload` prüft die Endung). */
  filename: string;
  /** ISO-Aufnahmezeit (EXIF bzw. `lastModified`), netz-unabhängig beim Erfassen gelesen. */
  clientExifTime: string | null;
  createdAt: string;
}

// ── Database ───────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        const store = db.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("startTime", "startTime", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: "id", autoIncrement: true });
      }

      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

// ── Entries store ──────────────────────────────────────────────────────────

/** Get all cached entries, sorted by startTime descending. */
export async function getAllEntries(): Promise<CachedEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, "readonly");
    const store = tx.objectStore(STORE_ENTRIES);
    const req = store.getAll();
    req.onsuccess = () => {
      const entries = (req.result as CachedEntry[]).sort(
        (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
      resolve(entries);
    };
    req.onerror = () => reject(req.error);
  });
}

/** Replace all cached entries with fresh data from the server. */
export async function putEntries(entries: CachedEntry[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ENTRIES, "readwrite");
    const store = tx.objectStore(STORE_ENTRIES);

    // Clear existing entries and replace with fresh data
    store.clear();
    for (const entry of entries) {
      store.put(entry);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Offline queue store ────────────────────────────────────────────────────

/** Add a mutation to the offline queue. Returns the auto-generated key. */
export async function addToQueue(mutation: Omit<QueuedMutation, "id">): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_QUEUE);
    const req = store.add(mutation);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

/** Get all queued mutations in FIFO order (by auto-increment key). */
export async function getQueue(): Promise<QueuedMutation[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readonly");
    const store = tx.objectStore(STORE_QUEUE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as QueuedMutation[]);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Rewrite a queued mutation's body in place (same key).
 *
 * Genutzt beim Flush, um einen aufgelösten Bild-Marker (`offline-blob:<id>` → echte `imageUrl`)
 * dauerhaft in die Zeile zu schreiben, BEVOR der Eintrag gesendet wird. Scheitert der Eintrag danach,
 * trägt die Zeile schon die hochgeladene URL — ein erneuter Versuch lädt den Blob nicht doppelt hoch.
 */
export async function updateQueueItemBody(id: number, body: string | null): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_QUEUE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const item = getReq.result as QueuedMutation | undefined;
      if (!item) { resolve(); return; }
      item.body = body;
      const putReq = store.put(item);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/** Remove a single item from the queue after successful sync. */
export async function clearQueueItem(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readwrite");
    const store = tx.objectStore(STORE_QUEUE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Get the number of items in the offline queue. */
export async function getQueueCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, "readonly");
    const store = tx.objectStore(STORE_QUEUE);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Offline blob store ───────────────────────────────────────────────────────

/** Store a photo blob captured offline. Returns the generated id (used in {@link offlineBlobToken}). */
export async function putBlob(entry: Omit<OfflineBlob, "id" | "createdAt">): Promise<string> {
  const db = await openDB();
  const record: OfflineBlob = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readwrite");
    const store = tx.objectStore(STORE_BLOBS);
    const req = store.add(record);
    req.onsuccess = () => resolve(record.id);
    req.onerror = () => reject(req.error);
  });
}

/** Read one stored blob; `null` if it is gone (e.g. site data cleared). */
export async function getBlob(id: string): Promise<OfflineBlob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readonly");
    const store = tx.objectStore(STORE_BLOBS);
    const req = store.get(id);
    req.onsuccess = () => resolve((req.result as OfflineBlob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Delete a stored blob after its upload succeeded (kein Speicherleck). */
export async function deleteBlob(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BLOBS, "readwrite");
    const store = tx.objectStore(STORE_BLOBS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
