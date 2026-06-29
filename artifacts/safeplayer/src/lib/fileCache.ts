/**
 * IndexedDB-backed persistent file cache.
 * Stores File objects by mediaId so local files survive browser session restarts.
 * Files are structured-cloneable and can be stored directly in IDB (Chrome 70+, Firefox, Safari 14+).
 */

const DB_NAME = "safeplayer-files";
const DB_VERSION = 1;
const STORE_NAME = "files";

interface CachedFile {
  mediaId: number;
  file: File;
  cachedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "mediaId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Store a File object for a given media entry. Fire-and-forget safe. */
export async function cacheFile(mediaId: number, file: File): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: CachedFile = { mediaId, file, cachedAt: Date.now() };
    store.put(record);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    // IndexedDB unavailable or quota exceeded — silent fail, app degrades gracefully
  }
}

/** Retrieve a previously-cached File, or null if not found. */
export async function getCachedFile(mediaId: number): Promise<File | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(mediaId);
    const record = await new Promise<CachedFile | undefined>((res, rej) => {
      req.onsuccess = () => res(req.result as CachedFile | undefined);
      req.onerror = () => rej(req.error);
    });
    return record?.file ?? null;
  } catch {
    return null;
  }
}

/** Remove a cached file (e.g. when clearing from library). */
export async function removeCachedFile(mediaId: number): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(mediaId);
  } catch {
    // silent fail
  }
}
