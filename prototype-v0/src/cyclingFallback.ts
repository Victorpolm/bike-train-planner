import type { CyclingPace } from "./cyclingPace.ts";
import { parseCyclingRoute, type CyclingRoute } from "./cycling.ts";
import { fetchJson, HttpError, waitFor } from "./http.ts";
import type { Point } from "./routing.ts";

let queue: Promise<unknown> = Promise.resolve(), nextRequest = 0;

export function parseFallbackRoute(data: unknown, from: Point, to: Point, pace?: CyclingPace): CyclingRoute {
  const reply = data as { code?: string; routes?: { distance?: number; duration?: number; geometry?: unknown;
    legs?: { steps?: { mode?: string }[] }[] }[] };
  const route = reply?.routes?.[0];
  const steps = route?.legs?.flatMap(leg => leg.steps ?? []) ?? [];
  // The bicycle profile can include ferries, trains or carrying the bike on
  // steps. Those cannot silently become a cycling leg in this app.
  if (reply?.code !== "Ok" || !steps.length || steps.some(step => step.mode !== "cycling")) {
    throw new Error("The backup cycling service did not return a bicycle-only path.");
  }
  const parsed = parseCyclingRoute({ features: [{ geometry: route!.geometry,
    properties: { "track-length": route!.distance, "total-time": route!.duration } }] }, from, to, Date.now(), pace);
  return { ...parsed, source: "OSRM" };
}

// FOSSGIS requires at most one request per second. This single queue covers
// station links and the independent cycling-only comparison in this browser.
export function fallbackCycling(from: Point, to: Point, signal: AbortSignal, timeoutMs: number, fetcher: typeof fetch = fetch, pace?: CyclingPace) {
  const task = queue.then(async () => {
    signal.throwIfAborted();
    const started = Date.now(), delay = Math.max(0, nextRequest - started);
    if (delay >= timeoutMs) throw new Error("The backup cycling service is busy.");
    await waitFor(delay, signal);
    nextRequest = Date.now() + 1000;
    const coordinates = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const url = `https://routing.openstreetmap.de/routed-bike/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
    try {
      const data = await fetchJson(url, signal, Math.max(1, timeoutMs - (Date.now() - started)), fetcher);
      signal.throwIfAborted();
      return parseFallbackRoute(data, from, to, pace);
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) nextRequest = Date.now() + Math.max(error.retryAfterMs ?? 60_000, 1000);
      throw error;
    }
  });
  queue = task.catch(() => undefined);
  return task;
}
