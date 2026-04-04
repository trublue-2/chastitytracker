// ---------------------------------------------------------------------------
// IndexedDB helpers for offline-first PWA support
// Database: kg-tracker v1
// Stores: entries (cached from server), offline-queue (pending mutations)
// ---------------------------------------------------------------------------

const DB_NAME = "kg-tracker";
const DB_VERSION = 1;
const STORE_ENTRIES = "entries";
const STORE_QUEUE = "offline-queue";

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
