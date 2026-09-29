import { parseBikeParking, PARKING_DOWNLOAD, type ParkingData, type ParkingProvider } from "../src/bikeParking.ts";
import { OSM_PARKING_API, OSM_PARKING_QUERY, parseOsmParking } from "../src/osmParking.ts";

const TTL = 24 * 60 * 60_000, STALE_TTL = 7 * TTL, MAX_BYTES = 16 * 1024 * 1024;
async function boundedJson(response: Response): Promise<unknown> {
  if (!response.ok || !response.body || Number(response.headers.get("Content-Length")) > MAX_BYTES) throw new Error("Parking source unavailable");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Parking response too large"); }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { reader.releaseLock(); }
}

export function createParkingHandler(options: { now?: () => number; cache?: Cache } = {}) {
  const cached: Partial<Record<ParkingProvider, ParkingData>> = {};
  const pending: Partial<Record<ParkingProvider, Promise<void>>> = {};
  const retryAfter: Partial<Record<ParkingProvider, number>> = {};
  const now = options.now ?? Date.now;
  return async function(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url), source = url.searchParams.get("source") ?? "official";
    if (source !== "official" && source !== "osm") return Response.json({ error: "Unknown parking source" }, { status: 400 });
    const provider: ParkingProvider = source;
    const edge = options.cache ?? (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default;
    // Cache only public parking data, under a versioned, source-specific key.
    const cacheUrl = new URL("/api/parking", url.origin); cacheUrl.search = `source=${provider}&schema=2`;
    const cacheKey = new Request(cacheUrl);
    const age = () => cached[provider] ? now() - Date.parse(cached[provider]!.fetchedAt) : Infinity;
    const load = async () => {
      if (!cached[provider] && edge) {
        try {
          const hit = await edge.match(cacheKey);
          if (hit) cached[provider] = await hit.json() as ParkingData;
        } catch { /* A cache outage must not prevent a source request. */ }
      }
      if (age() <= TTL) return;
      if ((retryAfter[provider] ?? 0) > now()) throw new Error("Parking retry cooling down");
      try {
        const response = provider === "osm"
          ? await fetcher(OSM_PARKING_API, { method: "POST", body: new URLSearchParams({ data: OSM_PARKING_QUERY }),
            headers: { "User-Agent": "BikeTrainPlanner/1.0 (+https://github.com/Victorpolm/bike-train-planner)" }, signal: AbortSignal.timeout(40_000) })
          : await fetcher(PARKING_DOWNLOAD, { signal: AbortSignal.timeout(20_000) });
        const data = (provider === "osm" ? parseOsmParking : parseBikeParking)(await boundedJson(response), new Date(now()).toISOString());
        if (!data.facilities.length) throw new Error("Parking data empty");
        cached[provider] = data; delete retryAfter[provider];
        if (edge) {
          try { await edge.put(cacheKey, Response.json(data, { headers: { "Cache-Control": `public, max-age=${STALE_TTL / 1000}` } })); }
          catch { /* In-memory caching still works when the optional edge cache is unavailable. */ }
        }
      } catch (error) {
        // Prevent repeated national OSM queries during a provider failure.
        if (provider === "osm") retryAfter[provider] = now() + 60_000;
        throw error;
      }
    };
    try {
      if (age() > TTL) {
        pending[provider] ??= load().finally(() => { delete pending[provider]; });
        try { await pending[provider]; } catch { if (age() > STALE_TTL) throw new Error("Parking unavailable"); }
      }
      return Response.json({ ...cached[provider], stale: age() > TTL },
        { headers: { "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
    } catch {
      return Response.json({ error: `${provider === "osm" ? "OpenStreetMap" : "Official"} parking could not be loaded. Your journey search is unaffected.` },
        { status: 503, headers: provider === "osm" ? { "Retry-After": "60" } : undefined });
    }
  };
}
export const handleParking = createParkingHandler();
