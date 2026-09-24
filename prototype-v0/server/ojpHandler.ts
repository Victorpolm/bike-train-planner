import { mergeOjpConnections, ojpTripInfoRequest, ojpTripRequest, parseOjpConnections, parseOjpTripInfo,
  type OjpQuery, type OjpReference } from "../src/ojp.ts";

export type OjpEnvironment = { OJP_API_KEY?: string };
const ENDPOINT = "https://api.opentransportdata.swiss/ojp20";
const MAX_RESPONSE = 8_000_000;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
});
const string = (v: unknown, max = 512): v is string => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u001f]/.test(v);
const iso = (v: unknown): v is string => string(v, 40) && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
function validQuery(v: any): v is OjpQuery {
  const stop = (s: any) => s && string(s.id) && string(s.name, 200) && Number.isFinite(s.lat) && Number.isFinite(s.lon)
    && s.lat >= 45 && s.lat <= 49 && s.lon >= 5 && s.lon <= 11;
  return v && stop(v.from) && stop(v.to) && iso(v.departure);
}
function validRef(v: any): v is OjpReference {
  return v && string(v.journeyRef) && string(v.operatingDay, 10) && /^\d{4}-\d{2}-\d{2}$/.test(v.operatingDay)
    && string(v.fromRef) && string(v.toRef) && iso(v.departure) && iso(v.arrival) && Date.parse(v.arrival) >= Date.parse(v.departure);
}
async function boundedText(response: Response | Request, max: number) {
  if (Number(response.headers.get("content-length")) > max) throw new Error("Response too large");
  if (!response.body) throw new Error("Empty response");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error("Response too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const buffer = new Uint8Array(size); let position = 0;
  for (const chunk of chunks) { buffer.set(chunk, position); position += chunk.length; }
  return new TextDecoder().decode(buffer);
}

export function createOjpHandler(fetcher: typeof fetch = fetch, paceMilliseconds = 1500) {
  // Bounded, short-lived caches contain timetable responses only. The secret
  // stays in runtime env and is never part of a response, cache key or log.
  const cache = new Map<string, { expires: number; data: unknown }>();
  let queue: Promise<unknown> = Promise.resolve(), lastCall = 0, blockedUntil = 0;
  const requestOjp = (payload: string, key: string) => {
    const task = queue.then(async () => {
      if (Date.now() < blockedUntil) throw new Error("OJP temporarily unavailable");
      const pause = Math.max(0, paceMilliseconds - (Date.now() - lastCall));
      if (pause) await new Promise(resolve => setTimeout(resolve, pause));
      lastCall = Date.now();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const response = await fetcher(ENDPOINT, { method: "POST", redirect: "error", signal: controller.signal,
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/xml", Accept: "application/xml" }, body: payload });
        if (!response.ok) {
          if ([401, 403, 429].includes(response.status)) blockedUntil = Date.now() + 60_000;
          await response.body?.cancel();
          throw new Error("OJP request failed");
        }
        const raw = await boundedText(response, MAX_RESPONSE);
        // Defence against an upstream diagnostic ever echoing credentials.
        return raw.split(key).join("[REDACTED]");
      } finally { clearTimeout(timer); }
    });
    queue = task.catch(() => {});
    return task;
  };
  return async (request: Request, env: OjpEnvironment): Promise<Response> => {
    const path = new URL(request.url).pathname, key = env.OJP_API_KEY?.trim().replace(/^Bearer\s+/i, "").trim();
    if (path === "/api/ojp/status" && request.method === "GET") return json({ available: !!key });
    if (!["/api/ojp/connections", "/api/ojp/tripinfo"].includes(path)) return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "Use POST" }, 405);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Origin not allowed" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Use JSON" }, 415);
    if (!key) return json({ error: "Bicycle information is not connected yet." }, 503);
    let body: any;
    try { body = JSON.parse(await boundedText(request, 8192)); }
    catch { return json({ error: "Invalid request" }, 400); }
    const isConnections = path.endsWith("connections");
    if (!(isConnections ? validQuery(body) : validRef(body))) return json({ error: "Invalid journey references" }, 400);
    const cacheKey = path + JSON.stringify(isConnections
      ? [body.from.lat, body.from.lon, body.to.lat, body.to.lon, body.departure]
      : [body.journeyRef, body.operatingDay, body.fromRef, body.toRef, body.departure, body.arrival]);
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return json(cached.data);
    try {
      const checked = new Date().toISOString();
      let data: unknown;
      if (isConnections) {
        const unfiltered = parseOjpConnections(await requestOjp(ojpTripRequest(body, false, checked), key), false);
        let filtered: ReturnType<typeof parseOjpConnections> = [], warnings: string[] = [];
        try { filtered = parseOjpConnections(await requestOjp(ojpTripRequest(body, true, checked), key), true); }
        catch { warnings = ["The bicycle-filtered search could not finish. Unverified services remain unknown."]; }
        data = { legs: mergeOjpConnections(unfiltered, filtered), checked, warnings };
      } else {
        const rule = parseOjpTripInfo(await requestOjp(ojpTripInfoRequest(body, checked), key), body);
        data = { rule, checked };
      }
      if (cache.size >= 32) cache.delete(cache.keys().next().value!);
      // Do not cache failed filtered searches as a reusable complete response.
      if (!(data as { warnings?: string[] }).warnings?.length) cache.set(cacheKey, { expires: Date.now() + 5 * 60_000, data });
      return json(data);
    } catch { return json({ error: "The bicycle information service could not complete this check. Permission remains unverified." }, 502); }
  };
}

export const handleOjp = createOjpHandler();
