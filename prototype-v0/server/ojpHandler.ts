import { mergeOjpConnections, ojpTripInfoRequest, ojpTripRequest, parseOjpDetails,
  type OjpQuery, type OjpReference } from "../src/ojp.ts";
import { providerFailure } from "./providerFailure.ts";
import { retainedConnections } from "./retainedFare.ts";
import { waitFor } from "../src/http.ts";

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
  return v && stop(v.from) && stop(v.to) && iso(v.departure) && (v.arriveBy === undefined || typeof v.arriveBy === "boolean");
}
function validRef(v: any): v is OjpReference {
  return v && string(v.journeyRef) && string(v.operatingDay, 10) && /^\d{4}-\d{2}-\d{2}$/.test(v.operatingDay)
    && string(v.fromRef) && string(v.toRef) && iso(v.departure) && iso(v.arrival) && Date.parse(v.arrival) >= Date.parse(v.departure);
}
async function boundedText(response: Response | Request, max: number, signal?: AbortSignal) {
  if (Number(response.headers.get("content-length")) > max) throw new Error("Response too large");
  if (!response.body) throw new Error("Empty response");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await (signal ? withAbort(reader.read(), signal) : reader.read());
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

function withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
type OjpWork = { promise: Promise<unknown>; controller: AbortController; subscribers: number; settled: boolean };
async function subscribe(work: OjpWork, signal: AbortSignal) {
  work.subscribers++;
  try { return await withAbort(work.promise, signal); }
  finally {
    if (--work.subscribers === 0 && !work.settled) work.controller.abort(new DOMException("No subscribers remain", "AbortError"));
  }
}

export function createOjpHandler(fetcher: typeof fetch = fetch, paceMilliseconds = 1500, timeoutMs = 30_000) {
  // Bounded, short-lived caches contain timetable responses only. The secret
  // stays in runtime env and is never part of a response, cache key or log.
  const cache = new Map<string, { expires: number; data: unknown }>();
  const pending = new Map<string, OjpWork>();
  let queue: Promise<unknown> = Promise.resolve(), lastCall = 0, blockedUntil = 0, activeKey = "";
  const requestOjp = (payload: string, key: string, signal: AbortSignal) => {
    const task = queue.then(async () => {
      signal.throwIfAborted();
      if (Date.now() < blockedUntil) throw new Error("OJP temporarily unavailable");
      const pause = Math.max(0, paceMilliseconds - (Date.now() - lastCall));
      await waitFor(pause, signal);
      signal.throwIfAborted();
      lastCall = Date.now();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(new DOMException("OJP provider timed out", "TimeoutError")), 15_000);
      const upstreamSignal = AbortSignal.any([signal, controller.signal]);
      let phase = "request";
      try {
        // The hosted runtime rejects redirect:"error". Manual returns 3xx for
        // rejection below, without forwarding the authorization header.
        const response = await fetcher(ENDPOINT, { method: "POST", redirect: "manual", signal: upstreamSignal,
          headers: { Authorization: "Bearer " + key, "Content-Type": "application/xml", Accept: "application/xml" }, body: payload });
        if (!response.ok) {
          console.warn("OJP upstream HTTP failure", response.status);
          if (!signal.aborted && activeKey === key && [401, 403, 429].includes(response.status)) blockedUntil = Date.now() + 60_000;
          await response.body?.cancel();
          throw new Error("OJP request failed");
        }
        phase = "response-body";
        const raw = await boundedText(response, MAX_RESPONSE, upstreamSignal);
        // Defence against an upstream diagnostic ever echoing credentials.
        return raw.split(key).join("[REDACTED]");
      } catch (error) {
        // Do not log exception messages, request bodies, headers or credentials.
        console.warn("OJP upstream request failed", phase, providerFailure(error));
        throw error;
      } finally { clearTimeout(timer); }
    });
    queue = task.catch(() => {});
    // Queued/expired callers finish promptly and never send their stale work.
    return withAbort(task, signal);
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
    if (activeKey !== key) {
      for (const work of pending.values()) work.controller.abort(new DOMException("Credentials changed", "AbortError"));
      cache.clear(); pending.clear(); blockedUntil = 0; activeKey = key;
    }
    let body: any;
    try { body = JSON.parse(await boundedText(request, 8192, request.signal)); }
    catch { return json({ error: request.signal.aborted ? "Journey check cancelled." : "Invalid request" }, request.signal.aborted ? 499 : 400); }
    if (activeKey !== key) return json({ error: "Journey service configuration changed. Please try again." }, 503);
    const isConnections = path.endsWith("connections");
    if (!(isConnections ? validQuery(body) : validRef(body))) return json({ error: "Invalid journey references" }, 400);
    if (request.signal.aborted) return json({ error: "Journey check cancelled." }, 499);
    const cacheKey = path + JSON.stringify(isConnections
      ? [body.from.lat, body.from.lon, body.to.lat, body.to.lon, body.departure, !!body.arriveBy]
      : [body.journeyRef, body.operatingDay, body.fromRef, body.toRef, body.departure, body.arrival]);
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return json(cached.data);
    try {
      const existing = pending.get(cacheKey);
      if (existing) return json(await subscribe(existing, request.signal));
      // Bound distinct outstanding checks per isolate. Identical subscribers
      // share a slot; cache hits remain available while the queue is full.
      if (pending.size >= 4 || Date.now() < blockedUntil) {
        const response = json({ error: "Journey service busy; try again shortly." }, 429);
        response.headers.set("Retry-After", String(Math.max(5, Math.ceil((blockedUntil - Date.now()) / 1000))));
        return response;
      }
      const controller = new AbortController(), signal = controller.signal;
      // Finish before the 35s connection / 20s detail client deadlines.
      const timer = setTimeout(() => controller.abort(new DOMException("Journey check timed out", "TimeoutError")),
        Math.min(timeoutMs, isConnections ? 30_000 : 18_000));
      const work: OjpWork = { promise: Promise.resolve(), controller, subscribers: 0, settled: false };
      const task = (async () => {
      const checked = new Date().toISOString();
      let data: unknown;
      if (isConnections) {
        const unfiltered = await retainedConnections(await requestOjp(ojpTripRequest(body, false, checked), key, signal), false, key);
        let filtered: Awaited<ReturnType<typeof retainedConnections>> = { legs: [], sources: [] }, warnings: string[] = [];
        try { filtered = await retainedConnections(await requestOjp(ojpTripRequest(body, true, checked), key, signal), true, key); }
        catch { signal.throwIfAborted(); warnings = ["The bicycle-filtered search could not finish. Unverified services remain unknown."]; }
        data = { legs: mergeOjpConnections(unfiltered.legs, filtered.legs), checked, warnings,
          fareSources: [...new Map([...unfiltered.sources, ...filtered.sources].map(s => [s.id, s])).values()] };
      } else {
        data = parseOjpDetails(await requestOjp(ojpTripInfoRequest(body, checked), key, signal), body);
      }
      signal.throwIfAborted();
      if (cache.size >= 32) cache.delete(cache.keys().next().value!);
      // Do not cache failed filtered searches as a reusable complete response.
      if (!(data as { warnings?: string[] }).warnings?.length) cache.set(cacheKey, { expires: Date.now() + 15_000, data });
      return data;
      })();
      work.promise = withAbort(task, signal).finally(() => {
        work.settled = true; clearTimeout(timer);
        if (pending.get(cacheKey) === work) pending.delete(cacheKey);
      });
      pending.set(cacheKey, work);
      return json(await subscribe(work, request.signal));
    } catch (error) {
      if (request.signal.aborted || error instanceof Error && error.name === "AbortError") return json({ error: "Journey check cancelled. Please retry if needed." }, 499);
      if (error instanceof Error && error.name === "TimeoutError") return json({ error: "The journey service timed out. Please try again shortly." }, 504);
      console.warn("OJP journey or service check failed");
      return json({ error: "The bicycle information service could not complete this check. Permission remains unverified." }, 502);
    }
  };
}

export const handleOjp = createOjpHandler();
