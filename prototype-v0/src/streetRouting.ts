import { fetchJson, HttpError, waitFor } from "./http.ts";
import { beginTiming } from "./searchTiming.ts";
import type { Point } from "./routing.ts";

let queue: Promise<unknown> = Promise.resolve(), nextRequest = 0;

// One queue for every use of the FOSSGIS service, including the bicycle backup.
// Its published policy allows at most one request per second.
export function streetRoute(mode: "bike" | "foot", from: Point, to: Point, signal: AbortSignal,
  timeoutMs: number, fetcher: typeof fetch = fetch): Promise<unknown> {
  const endQueue = beginTiming(signal, "queue");
  const task = queue.then(async () => {
    endQueue();
    signal.throwIfAborted();
    const started = Date.now(), delay = Math.max(0, nextRequest - started);
    if (delay >= timeoutMs) throw new Error("The street routing service is busy.");
    await waitFor(delay, signal);
    nextRequest = Date.now() + 1000;
    const coordinates = `${from.lon},${from.lat};${to.lon},${to.lat}`;
    const url = `https://routing.openstreetmap.de/routed-${mode}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
    try {
      const data = await fetchJson(url, signal, Math.max(1, timeoutMs - (Date.now() - started)), fetcher);
      signal.throwIfAborted();
      return data;
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) nextRequest = Date.now() + Math.max(error.retryAfterMs ?? 60_000, 1000);
      throw error;
    }
  }).finally(endQueue);
  queue = task.catch(() => undefined);
  return task;
}
