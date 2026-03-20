import { useCallback, useRef } from "react";

const IDB_DB_NAME = "qjudge_anticheat_capture";
const IDB_DB_VERSION = 2; // bumped: now creates per-module stores
const IDB_STORE_SCREEN = "frames_screen_share";
const IDB_STORE_WEBCAM = "frames_webcam";
/** @deprecated kept for migration: drain any leftover frames into screen_share */
const IDB_STORE_LEGACY = "frames";
const MAX_IDB_QUEUE = 600;
const MAX_MEMORY_QUEUE = 120;

export type PendingFrame = {
  id: number;
  createdAt: number;
  blob: Blob;
};

export type QueueStore = {
  mode: "indexeddb" | "memory";
  enqueue: (blob: Blob) => Promise<number>;
  peek: (limit: number) => Promise<PendingFrame[]>;
  remove: (ids: number[]) => Promise<void>;
  count: () => Promise<number>;
};

type QueueModule = "screen_share" | "webcam";

const storeNameFor = (module: QueueModule): string =>
  module === "webcam" ? IDB_STORE_WEBCAM : IDB_STORE_SCREEN;

const createMemoryQueueStore = (): QueueStore => {
  const queue: PendingFrame[] = [];
  let nextId = 1;

  return {
    mode: "memory",
    enqueue: async (blob) => {
      if (queue.length >= MAX_MEMORY_QUEUE) queue.shift();
      const id = nextId++;
      queue.push({ id, createdAt: Date.now(), blob });
      return id;
    },
    peek: async (limit) => queue.slice(0, limit),
    remove: async (ids) => {
      if (!ids.length) return;
      const idSet = new Set(ids);
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (idSet.has(queue[i].id)) queue.splice(i, 1);
      }
    },
    count: async () => queue.length,
  };
};

const openIndexedDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = window.indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Create per-module stores
      if (!db.objectStoreNames.contains(IDB_STORE_SCREEN)) {
        db.createObjectStore(IDB_STORE_SCREEN, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains(IDB_STORE_WEBCAM)) {
        db.createObjectStore(IDB_STORE_WEBCAM, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
      // Keep legacy store around for migration drain; do NOT delete it
      // as IndexedDB forbids deleting stores with pending data outside versionchange.
      if (!db.objectStoreNames.contains(IDB_STORE_LEGACY)) {
        db.createObjectStore(IDB_STORE_LEGACY, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open indexedDB"));
  });

/** One-time: move any leftover frames from the shared legacy store into screen_share. */
const drainLegacyStore = async (db: IDBDatabase): Promise<void> => {
  if (!db.objectStoreNames.contains(IDB_STORE_LEGACY)) return;
  if (!db.objectStoreNames.contains(IDB_STORE_SCREEN)) return;

  return new Promise<void>((resolve) => {
    try {
      const tx = db.transaction([IDB_STORE_LEGACY, IDB_STORE_SCREEN], "readwrite");
      const legacyStore = tx.objectStore(IDB_STORE_LEGACY);
      const screenStore = tx.objectStore(IDB_STORE_SCREEN);
      const cursorReq = legacyStore.openCursor();

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return; // done
        screenStore.add({ createdAt: cursor.value.createdAt, blob: cursor.value.blob });
        legacyStore.delete(cursor.primaryKey);
        cursor.continue();
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve(); // best effort
    } catch {
      resolve();
    }
  });
};

const createIndexedDbQueueStore = async (module: QueueModule): Promise<QueueStore> => {
  const db = await openIndexedDb();

  // Drain legacy store once (only matters for screen_share)
  if (module === "screen_share") {
    await drainLegacyStore(db);
  }

  const storeName = storeNameFor(module);

  const count = () =>
    new Promise<number>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).count();
      request.onsuccess = () => resolve(Number(request.result || 0));
      request.onerror = () => reject(request.error || new Error("Failed to count frames"));
    });

  const deleteOldest = () =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to delete oldest frame"));
    });

  const enqueue = async (blob: Blob) => {
    if ((await count()) >= MAX_IDB_QUEUE) {
      await deleteOldest();
    }

    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const request = tx.objectStore(storeName).add({ createdAt: Date.now(), blob });
      tx.oncomplete = () => resolve(Number(request.result));
      tx.onerror = () => reject(tx.error || new Error("Failed to enqueue frame"));
    });
  };

  const peek = (limit: number) =>
    new Promise<PendingFrame[]>((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const cursorReq = store.openCursor();
      const rows: PendingFrame[] = [];

      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || rows.length >= limit) {
          resolve(rows);
          return;
        }
        const value = cursor.value as PendingFrame;
        rows.push({
          id: Number(value.id),
          createdAt: Number(value.createdAt || 0),
          blob: value.blob,
        });
        cursor.continue();
      };

      cursorReq.onerror = () => reject(cursorReq.error || new Error("Failed to read queued frames"));
    });

  const remove = (ids: number[]) =>
    new Promise<void>((resolve, reject) => {
      if (!ids.length) {
        resolve();
        return;
      }
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      for (const id of ids) {
        store.delete(id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to remove queued frames"));
    });

  return {
    mode: "indexeddb",
    enqueue,
    peek,
    remove,
    count,
  };
};

export const useFrameQueue = (module: QueueModule = "screen_share") => {
  const queueRef = useRef<QueueStore | null>(null);

  const ensureQueue = useCallback(async (): Promise<QueueStore> => {
    if (queueRef.current) return queueRef.current;

    if (typeof window === "undefined" || !window.indexedDB) {
      queueRef.current = createMemoryQueueStore();
      return queueRef.current;
    }

    try {
      queueRef.current = await createIndexedDbQueueStore(module);
    } catch {
      queueRef.current = createMemoryQueueStore();
    }
    return queueRef.current;
  }, [module]);

  return { ensureQueue, queueRef };
};
