import assert from "node:assert/strict";
import { it } from "node:test";
import { createMapDataCache, type MapCacheStore } from "./mapDataCache.ts";
const NOW = Date.parse("2026-10-09T12:00:00Z"), DAY = 86_400_000;
type Data = { fetchedAt: string; facilities: number[]; stale?: boolean };
const valid = (value: unknown): value is Data => !!value && typeof value === "object" && Array.isArray((value as Data).facilities) && Number.isFinite(Date.parse((value as Data).fetchedAt));
const signal = () => new AbortController().signal;
const data = (age = 0): Data => ({ fetchedAt: new Date(NOW - age).toISOString(), facilities: [1, 2] });
const store = () => { const values = new Map<string, unknown>(); return { values, get: async (key: string) => values.get(key), put: async (key: string, value: unknown) => { values.set(key, value); } }; };
it("reuses a validated persistent dataset after reload without another download", async () => {
  const disk = store(); let downloads = 0;
  const load = async () => { downloads++; return data(); };
  await createMapDataCache(disk, () => NOW)("water-v1", signal(), valid, load);
  const reloaded = createMapDataCache(disk, () => NOW);
  assert.deepEqual(await reloaded("water-v1", signal(), valid, load), data());
  assert.equal(downloads, 1);
  await reloaded("food-v1", signal(), valid, load); assert.equal(downloads, 2);
});
it("shows bounded older data immediately, coalesces refreshes and delivers the new version", async () => {
  const disk = store(); disk.values.set("water", data(2 * DAY));
  const cache = createMapDataCache(disk, () => NOW); let resolve!: (v: Data) => void, calls = 0;
  const load = () => { calls++; return new Promise<Data>(r => { resolve = r; }); };
  let updated: Data | undefined;
  const old = await cache("water", signal(), valid, load, d => { updated = d; });
  assert.equal(old.stale, true); assert.equal(calls, 1);
  await cache("water", signal(), valid, load); assert.equal(calls, 1);
  resolve(data()); await new Promise(r => setImmediate(r));
  assert.deepEqual(updated, data()); assert.deepEqual(disk.values.get("water"), data());
});
it("rejects corrupt, future, expired and version-mismatched persisted records", async () => {
  for (const value of [{ fetchedAt: "broken" }, data(-DAY), data(8 * DAY)]) {
    const disk = store(); disk.values.set("v2", value); let calls = 0;
    await createMapDataCache(disk, () => NOW)("v2", signal(), valid, async () => { calls++; return data(); });
    assert.equal(calls, 1);
  }
});
it("does not poison the cache with failures and tolerates unavailable browser storage", async () => {
  const disk: MapCacheStore = { get: async () => { throw Error("disabled"); }, put: async () => { throw Error("quota"); } };
  const cache = createMapDataCache(disk, () => NOW);
  await assert.rejects(cache("a", signal(), valid, async () => { throw Error("offline"); }), /offline/);
  assert.deepEqual(await cache("a", signal(), valid, async () => data()), data());
  assert.deepEqual(await cache("a", signal(), valid, async () => { throw Error("must reuse memory"); }), data());
});
it("cancels one viewer without cancelling another viewer's shared dataset", async () => {
  const cache = createMapDataCache(store(), () => NOW), controller = new AbortController();
  let resolve!: (v: Data) => void, calls = 0;
  const load = () => { calls++; return new Promise<Data>(r => { resolve = r; }); };
  const first = cache("a", controller.signal, valid, load), second = cache("a", signal(), valid, load);
  await new Promise(r => setImmediate(r)); controller.abort();
  await assert.rejects(first, { name: "AbortError" });
  resolve(data()); assert.deepEqual(await second, data()); assert.equal(calls, 1);
});
