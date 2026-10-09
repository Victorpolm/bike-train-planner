import { OSM_AMENITY_API, OSM_AMENITY_QUERY, parseOsmAmenities, validAmenityData, type AmenityData } from "../src/osmAmenities.ts";
import { OSM_SERVICE_QUERIES, type ServiceDataset } from "../src/osmServices.ts";

const TTL = 24 * 60 * 60_000, STALE_TTL = 7 * TTL, MAX_BYTES = 16 * 1024 * 1024;
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body || Number(response.headers.get("Content-Length")) > MAX_BYTES) throw new Error("Amenity source unavailable");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Amenity response too large"); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export function createAmenityHandler(options: { now?: () => number; cache?: Cache; dataset?: ServiceDataset } = {}) {
  let cached: AmenityData | undefined, pending: Promise<void> | undefined, retryAfter = 0;
  const now = options.now ?? Date.now;
  const dataset = options.dataset, path = dataset ? `/api/services/v1/${dataset}` : "/api/amenities/v1";
  return async function(request: Request, fetcher: typeof fetch = fetch, background?: (task: Promise<unknown>) => void): Promise<Response> {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url);
    if (url.pathname !== path) return new Response("Not found", { status: 404 });
    const edge = options.cache ?? (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default;
    // v2 avoids serving old normalised records that discarded floor/location tags.
    const cacheKey = new Request(new URL(dataset ? `/api/services-cache/v2/${dataset}` : "/api/amenities-cache/v2/osm", url.origin));
    const age = () => cached ? now() - Date.parse(cached.fetchedAt) : Infinity;
      if (!cached && edge) {
        try {
          const hit = await edge.match(cacheKey);
          if (hit) { const data: unknown = await hit.json();
            if (validAmenityData(data, dataset) && data.facilities.length && Date.parse(data.fetchedAt) <= now()) cached = data; }
        } catch { /* A cache failure does not block the upstream request. */ }
      }
    const load = async () => {
      if (age() <= TTL) return;
      if (retryAfter > now()) throw new Error("Amenity retry cooling down");
      try {
        const response = await fetcher(OSM_AMENITY_API, { method: "POST", body: new URLSearchParams({ data: dataset ? OSM_SERVICE_QUERIES[dataset] : OSM_AMENITY_QUERY }),
          headers: { "User-Agent": "BikeTrainPlanner/1.0 (+https://github.com/Victorpolm/bike-train-planner)" }, signal: AbortSignal.timeout(40_000) });
        const data = parseOsmAmenities(await boundedJson(response), new Date(now()).toISOString(), dataset);
        if (!data.facilities.length || !validAmenityData(data, dataset)) throw new Error("Amenity dataset empty or invalid");
        cached = data; retryAfter = 0;
        if (edge) try { await edge.put(cacheKey, Response.json(data, { headers: { "Cache-Control": `public, max-age=${STALE_TTL / 1000}` } })); } catch { /* Memory cache remains usable. */ }
      } catch (error) { retryAfter = now() + 60_000; throw error; }
    };
    try {
      if (age() > TTL) {
        pending ??= load().finally(() => { pending = undefined; });
        if (background && age() <= STALE_TTL) background(pending.catch(() => {}));
        else try { await pending; } catch { if (age() > STALE_TTL) throw new Error("Amenities unavailable"); }
      }
      return Response.json({ ...cached, stale: age() > TTL }, { headers: { "Cache-Control": "private, no-store", "X-Amenity-Schema": "1", "X-Content-Type-Options": "nosniff" } });
    } catch {
      return Response.json({ error: `OpenStreetMap ${dataset ?? "water and toilet"} data could not be loaded.` },
        { status: 503, headers: { "Retry-After": "60", "Cache-Control": "private, no-store" } });
    }
  };
}
export const handleAmenities = createAmenityHandler();
const serviceHandlers = { repairs: createAmenityHandler({ dataset: "repairs" }), food: createAmenityHandler({ dataset: "food" }), "food-dining": createAmenityHandler({ dataset: "food-dining" }) };
export function handleServices(request: Request, fetcher: typeof fetch = fetch, background?: (task: Promise<unknown>) => void) {
  const path = new URL(request.url).pathname;
  const category = path === "/api/services/v1/repairs" ? "repairs" : path === "/api/services/v1/food" ? "food" : path === "/api/services/v1/food-dining" ? "food-dining" : null;
  return category ? serviceHandlers[category](request, fetcher, background) : Promise.resolve(new Response("Not found", { status: 404 }));
}
