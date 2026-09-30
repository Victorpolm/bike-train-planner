import { FACILITY_JOBS, ruralWaterUrl, validFacilityData, type FacilityData } from "../src/facilitySources.ts";
import { facilityData, parseRuralWater, parseStationFacilities } from "./facilityParsers.ts";
import { readBounded } from "./tlmWater.ts";
import { TLM_WATER_SNAPSHOT } from "./tlmSnapshot.ts";

const DAY = 86400000, STALE = 7 * DAY;
export function createFacilityHandler(options: { now?: () => number; cache?: Cache } = {}) {
  const now = options.now ?? Date.now, records = new Map<string, FacilityData>(), pending = new Map<string, Promise<FacilityData>>(), cooldown = new Map<string, number>();
  return async (request: Request, fetcher: typeof fetch = fetch): Promise<Response> => {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url), job = FACILITY_JOBS.find(j => j.path === url.pathname);
    if (!job || url.search) return new Response("Not found", { status: 404 });
    if (job.provider === "swisstlm3d") return Response.json(TLM_WATER_SNAPSHOT,
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    const cache = options.cache ?? (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default;
    const key = new Request(new URL(`/api/facilities-cache/v1/${job.key}`, url.origin));
    const ttl = DAY;
    const age = (d?: FacilityData) => d ? now() - Date.parse(d.fetchedAt) : Infinity;
    const get = async () => {
      let data = records.get(job.key);
      if (!data && cache) try {
        const hit = await cache.match(key), value = hit ? await hit.json() : null;
        if (validFacilityData(value, job) && Date.parse(value.fetchedAt) <= now()) { data = value; records.set(job.key, data); }
      } catch { /* Independent upstream loading remains available. */ }
      if (age(data) <= ttl) return data!;
      try {
        if ((cooldown.get(job.key) ?? 0) > now()) throw new Error("Source cooling down");
        const fetchedAt = new Date(now()).toISOString(), signal = AbortSignal.timeout(25000);
        let facilities;
        {
          const part = job.key.split("/")[1];
          const upstream = job.provider === "sbb" ? `https://api.insa.geops.ch/export/geo/stations/${part}/services` : ruralWaterUrl(part);
          const response = await fetcher(upstream, { signal, headers: { Accept: job.provider === "sbb" ? "application/json" : "text/html" } });
          const body = new TextDecoder().decode(await readBounded(response, 3 * 1024 * 1024));
          facilities = job.provider === "sbb" ? parseStationFacilities(JSON.parse(body), part, fetchedAt) : parseRuralWater(body, part, fetchedAt);
        }
        const fresh = facilityData(job, facilities, fetchedAt);
        if (!validFacilityData(fresh, job)) throw new Error("Source did not match schema");
        records.set(job.key, fresh); cooldown.delete(job.key);
        if (cache) try { await cache.put(key, Response.json(fresh, { headers: { "Cache-Control": `public, max-age=${(ttl + STALE) / 1000}` } })); } catch { /* Keep memory result. */ }
        return fresh;
      } catch (error) {
        cooldown.set(job.key, now() + 60000);
        if (data && age(data) <= ttl + STALE) return { ...data, stale: true };
        throw error;
      }
    };
    try {
      let task = pending.get(job.key);
      if (!task) { task = get().finally(() => { pending.delete(job.key); }); pending.set(job.key, task); }
      return Response.json(await task, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    } catch {
      return Response.json({ error: `${job.label} could not be refreshed. Retry after a minute.` }, { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "60" } });
    }
  };
}
export const handleFacilities = createFacilityHandler();
