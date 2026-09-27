import { fareRequest, fareTripRequest, fareTrips, matchingFareTrip, parseFare } from "./fareProtocol.ts";
import type { FareQuery, OnlineFare } from "../src/onlineFare.ts";

export type FareEnvironment = { OJP_FARE_API_KEY?: string; OJP_API_KEY?: string };
const FARE_ENDPOINT = "https://api.opentransportdata.swiss/ojpfare";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const stop = (v: unknown) => typeof v === "string" && /^(?:85\d{5}|ch:1:sloid:\d+(?::[\w-]+)*)$/.test(v);
const instant = (v: unknown): v is string => typeof v === "string" && v.length < 40 && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
export function validFareQuery(v: any): v is FareQuery {
  return v && ["full", "half-fare", "ga"].includes(v.passenger) && typeof v.bicycle === "boolean"
    && Array.isArray(v.segments) && v.segments.length > 0 && v.segments.length <= 8
    && v.segments.every((s: any, i: number) => s && stop(s.from) && stop(s.to) && instant(s.departure) && instant(s.arrival)
      && Date.parse(s.departure) > Date.now() && Date.parse(s.departure) < Date.now() + 180 * 86400000
      && Date.parse(s.arrival) > Date.parse(s.departure) && Date.parse(s.arrival) - Date.parse(v.segments[0].departure) < 86400000
      && (!i || Date.parse(s.departure) >= Date.parse(v.segments[i - 1].arrival))
      && (s.journeyRef === undefined || typeof s.journeyRef === "string" && s.journeyRef.length < 512));
}
async function boundedText(response: Response | Request, max: number) {
  if (Number(response.headers.get("content-length")) > max || !response.body) throw new Error("Invalid response size");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break;
    length += value.length; if (length > max) throw new Error("Response too large"); chunks.push(value);
  } } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
export function createFareHandler(fetcher: typeof fetch = fetch, pace = 1500) {
  const cache = new Map<string, { expires: number; data: OnlineFare }>();
  const pending = new Map<string, Promise<OnlineFare>>();
  let queue: Promise<unknown> = Promise.resolve(), lastCall = 0, blockedUntil = 0;
  const post = (xml: string, key: string, endpoint = FARE_ENDPOINT) => {
    const job = queue.then(async () => {
      if (Date.now() < blockedUntil) throw new Error("Fare service cooling down");
      const pause = Math.max(0, pace - (Date.now() - lastCall));
      if (pause) await new Promise(resolve => setTimeout(resolve, pause)); lastCall = Date.now();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetcher(endpoint, { method: "POST", redirect: "error", signal: controller.signal,
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/xml", Accept: "application/xml" }, body: xml });
        if (!response.ok) { if ([401, 403, 429].includes(response.status)) blockedUntil = Date.now() + 60_000;
          await response.body?.cancel(); throw new Error("Fare service request failed"); }
        return (await boundedText(response, 8_000_000)).split(key).join("[REDACTED]");
      } finally { clearTimeout(timer); }
    });
    queue = job.catch(() => {}); return job;
  };
  return async (request: Request, env: FareEnvironment): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const key = env.OJP_FARE_API_KEY?.trim().replace(/^Bearer\s+/i, "").trim();
    if (path === "/api/fares/status" && request.method === "GET") return json({ available: !!key, environment: "test" });
    if (path !== "/api/fares/quote") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Origin not allowed" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Use JSON" }, 415);
    if (!key) return json({ error: "Online fare service is not connected." }, 503);
    let query: FareQuery;
    try { query = JSON.parse(await boundedText(request, 8192)); } catch { return json({ error: "Invalid request" }, 400); }
    if (!validFareQuery(query)) return json({ error: "A future, complete Swiss transit itinerary is required." }, 400);
    const id = JSON.stringify([query.segments, query.passenger, query.bicycle]), cached = cache.get(id);
    if (cached && cached.expires > Date.now()) return json(cached.data);
    if (pending.has(id)) return json(await pending.get(id));
    // Bound queue growth when several cards or visitors request prices at once.
    if (pending.size >= 1 || Date.now() < blockedUntil) return json({ error: "Fare service busy; try again shortly." }, 429);
    const work = (async (): Promise<OnlineFare> => {
      const data: OnlineFare = { status: "unavailable", passenger: null, bicycle: null, checked: new Date().toISOString(), environment: "test" };
      try {
        const tripKey = env.OJP_API_KEY?.trim().replace(/^Bearer\s+/i, "").trim();
        const trips = fareTrips(await post(fareTripRequest(query.segments), tripKey || key,
          tripKey ? "https://api.opentransportdata.swiss/ojp20" : FARE_ENDPOINT));
        const trip = matchingFareTrip(trips, query.segments);
        if (!trip) return { ...data, reason: "No exact itinerary match; no substitute route was priced." };
        if (query.passenger !== "ga") {
          try { data.passenger = parseFare(await post(fareRequest(trip, query.passenger), key), trip, query.passenger); } catch { /* Preserve a possible bicycle quote. */ }
        }
        if (query.bicycle) {
          try { data.bicycle = parseFare(await post(fareRequest(trip, "bicycle"), key), trip, "bicycle"); } catch { /* Unknown remains explicit. */ }
        }
        const complete = (query.passenger === "ga" || data.passenger) && (!query.bicycle || data.bicycle);
        data.status = complete ? "quoted" : data.passenger || data.bicycle ? "partial" : "unavailable";
        if (!complete) data.reason = "No eligible fare covering the whole transit itinerary was returned for every traveller.";
      } catch { data.reason = "The online fare service could not complete this check."; }
      return data;
    })();
    pending.set(id, work);
    try {
      const data = await work;
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(id, { expires: Date.now() + (data.status === "unavailable" ? 30_000 : 300_000), data });
      return json(data);
    } finally { pending.delete(id); }
  };
}
export const handleFare = createFareHandler();
