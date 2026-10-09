/** Public map records only. Versioned source keys, asynchronous persistence and
 * shared requests avoid downloading a national dataset on every page reload. */
type RecordData = { fetchedAt: string; stale?: boolean };
export type MapCacheStore = { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> };
const DAY = 86_400_000;
let database: Promise<IDBDatabase | null> | undefined;
function openDatabase() {
  return database ??= new Promise(resolve => {
    if (typeof indexedDB === "undefined") { resolve(null); return; }
    try {
      const request = indexedDB.open("bike-planner-public-map-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("datasets");
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
const persistent: MapCacheStore = {
  async get(key) {
    const db = await openDatabase(); if (!db) return;
    return new Promise(resolve => {
      try {
        const request = db.transaction("datasets").objectStore("datasets").get(key);
        request.onsuccess = () => resolve(request.result); request.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
  },
  async put(key, value) {
    const db = await openDatabase(); if (!db) return;
    await new Promise<void>(resolve => {
      try {
        const tx = db.transaction("datasets", "readwrite");
        tx.objectStore("datasets").put(value, key);
        tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
      } catch { resolve(); }
    });
  },
};
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(value => { if (!signal.aborted) resolve(value); }, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
export function createMapDataCache(store: MapCacheStore = persistent, now = Date.now) {
  const memory = new Map<string, RecordData>();
  const pending = new Map<string, Promise<RecordData>>();
  return async function cached<T extends RecordData>(key: string, signal: AbortSignal,
    valid: (value: unknown) => value is T, load: () => Promise<T>, onUpdate?: (data: T) => void): Promise<T> {
    signal.throwIfAborted();
    let stored: unknown = memory.get(key);
    if (!stored) try { stored = await untilAborted(store.get(key), signal); } catch { signal.throwIfAborted(); }
    const age = valid(stored) ? now() - Date.parse(stored.fetchedAt) : Infinity;
    const usable = valid(stored) && age >= 0 && age <= 7 * DAY ? stored : undefined;
    if (usable && age < DAY && !usable.stale) { memory.set(key, usable); return usable; }
    let request = pending.get(key) as Promise<T> | undefined;
    if (!request) {
      // The bounded source request may finish after its first viewer unmounts:
      // subsequent viewers and the persistent cache share that same download.
      request = load().then(async data => {
        if (!valid(data)) throw new Error("Invalid map cache record");
        memory.set(key, data);
        while (memory.size > 64) memory.delete(memory.keys().next().value!);
        try { await store.put(key, data); } catch { /* Storage quota/private mode: memory remains useful. */ }
        return data;
      }).finally(() => pending.delete(key));
      pending.set(key, request);
    }
    if (usable) {
      void request.then(data => { if (!signal.aborted) onUpdate?.(data); }).catch(() => {});
      return { ...usable, stale: true };
    }
    return untilAborted(request, signal);
  };
}
export const cachedMapData = createMapDataCache();
