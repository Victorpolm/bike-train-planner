import { OFFICIAL_ROUTE_LAYER, OFFICIAL_CLOSURE_LAYER, parseOfficialRoutes, parseOfficialClosures, validOfficialBounds } from "../src/officialCycling.ts";
import { readBounded } from "./tlmWater.ts";

const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export function createOfficialCyclingHandler(now = Date.now) {
  const cache = new Map<string, { expires: number; data: unknown }>(), pending = new Map<string, Promise<unknown>>();
  let active = 0;
  return async (request: Request, fetcher: typeof fetch = fetch) => {
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers });
    let body: any;
    try {
      const text = new TextDecoder().decode(await readBounded(new Response(request.body, { headers: request.headers }), 1024)); body = JSON.parse(text);
      if (!validOfficialBounds(body.bounds) || !["routes", "closures"].includes(body.kind)) throw new Error();
    } catch { return Response.json({ error: "Choose a valid Swiss cycling area up to 120 km across." }, { status: 400, headers }); }
    const key = JSON.stringify([body.kind, body.bounds]), previous = cache.get(key);
    if (previous && previous.expires > now()) return Response.json(previous.data, { headers });
    let task = pending.get(key);
    if (!task) {
      if (active >= 2) return Response.json({ error: "Official routes are busy. Please retry shortly." }, { status: 429, headers: { ...headers, "Retry-After": "10" } });
      active++;
      task = (async () => {
        const closures = body.kind === "closures", limit = closures ? 100 : 30;
        const query = new URLSearchParams({ geometryType: "esriGeometryEnvelope", geometry: body.bounds.join(","), tolerance: "0",
          layers: `all:${closures ? OFFICIAL_CLOSURE_LAYER : OFFICIAL_ROUTE_LAYER}`, sr: "4326", geometryFormat: "geojson", returnGeometry: "true", limit: String(limit), lang: "en" });
        const response = await fetcher("https://api3.geo.admin.ch/rest/services/ech/MapServer/identify?" + query,
          { signal: AbortSignal.timeout(18000), headers: { Accept: "application/json" } });
        const raw = JSON.parse(new TextDecoder().decode(await readBounded(response, 4_000_000)));
        const checked = new Date(now()).toISOString(), data = closures ? parseOfficialClosures(raw, checked, limit) : parseOfficialRoutes(raw, checked, limit);
        cache.set(key, { expires: now() + (closures ? 15 * 60_000 : 24 * 3600_000), data });
        while (cache.size > 6) cache.delete(cache.keys().next().value!);
        return data;
      })().finally(() => { active--; pending.delete(key); });
      pending.set(key, task);
    }
    try { return Response.json(await task, { headers }); }
    catch { return Response.json({ error: "The official route source could not be checked. Your journey is unchanged." }, { status: 503, headers }); }
  };
}
export const handleOfficialCycling = createOfficialCyclingHandler();
