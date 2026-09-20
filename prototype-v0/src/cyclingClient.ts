import { fetchJson, HttpError } from "./http.ts";
import { cachedCycling, cyclingKey, CYCLING_PROFILE, MAX_CYCLING_SPEED_KMH, MAX_ENDPOINT_GAP_METRES, EndpointSnapError, parseCyclingRoute, samePlace, zeroCycling, type CyclingRoute } from "./cycling.ts";
import type { Point } from "./routing.ts";

export const CYCLING_LIMITS = { requests: 32, timeoutMs: 25_000, phaseMs: 150_000, gapMs: 500, cacheEntries: 100, cacheMs: 30 * 60_000 };
const cache = new Map<string, CyclingRoute>();
type Located = Point & { id?: string; stopId?: string };
type CyclingFailureKind = "service" | "no-route" | "off-network" | "limit";
export class CyclingClient {
  readonly routes = new Map<string, CyclingRoute | null>();
  readonly warnings = new Set<string>();
  readonly failureKinds = new Set<CyclingFailureKind>();
  requests = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Promise<CyclingRoute | null>>();
  private lastRequest = 0;
  private deadline = Date.now() + CYCLING_LIMITS.phaseMs;
  private stopped = false;
  readonly signal: AbortSignal;
  private fetcher: typeof fetch;
  private gapMs: number;
  private useCache: boolean;
  constructor(signal: AbortSignal, fetcher: typeof fetch = fetch, gapMs = CYCLING_LIMITS.gapMs, useCache = true) {
    this.signal = signal; this.fetcher = fetcher; this.gapMs = gapMs; this.useCache = useCache;
  }
  beginPhase() { this.deadline = Date.now() + CYCLING_LIMITS.phaseMs; }
  getCached(a: Located, b: Located) { return cachedCycling(this.routes, a, b); }
  route(a: Located, b: Located): Promise<CyclingRoute | null> {
    if (this.signal.aborted) return Promise.reject(this.signal.reason);
    if (samePlace(a, b)) return Promise.resolve(zeroCycling(a, b));
    const key = cyclingKey(a, b);
    if (this.routes.has(key)) return Promise.resolve(this.routes.get(key)!);
    if (this.pending.has(key)) return this.pending.get(key)!;
    const cached = this.useCache ? cache.get(key) : undefined;
    if (cached && Date.now() - cached.fetchedAt < CYCLING_LIMITS.cacheMs) { this.routes.set(key, cached); return Promise.resolve(cached); }
    const task = this.queue.then(async () => {
      this.signal.throwIfAborted();
      if (this.stopped || this.requests >= CYCLING_LIMITS.requests || Date.now() >= this.deadline) {
        if (!this.stopped) this.failureKinds.add("limit");
        this.warnings.add("Some cycling links could not be checked within the search limit. Only checked links are used.");
        return null;
      }
      const delay = Math.max(0, this.gapMs - (Date.now() - this.lastRequest));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      this.signal.throwIfAborted();
      this.lastRequest = Date.now(); this.requests++;
      const params = new URLSearchParams({ lonlats: `${a.lon},${a.lat}|${b.lon},${b.lat}`, profile: CYCLING_PROFILE,
        alternativeidx: "0", format: "geojson", "profile:processUnusedTags": "1", "profile:allow_steps": "0",
        "profile:allow_ferries": "0", "profile:maxSpeed": String(MAX_CYCLING_SPEED_KMH),
        "profile:waypointCatchingRange": String(MAX_ENDPOINT_GAP_METRES) });
      try {
        const data = await fetchJson<unknown>(`https://brouter.de/brouter?${params}`, this.signal,
          Math.max(1, Math.min(CYCLING_LIMITS.timeoutMs, this.deadline - Date.now())), this.fetcher);
        this.signal.throwIfAborted();
        const route = parseCyclingRoute(data, a, b);
        this.routes.set(key, route);
        if (this.useCache) {
          cache.delete(key); cache.set(key, route);
          while (cache.size > CYCLING_LIMITS.cacheEntries) cache.delete(cache.keys().next().value!);
        }
        return route;
      } catch (error) {
        this.signal.throwIfAborted();
        if (error instanceof HttpError && error.status === 429) this.stopped = true;
        this.routes.set(key, null);
        const kind: CyclingFailureKind = error instanceof EndpointSnapError ? "off-network"
          : error instanceof HttpError && error.status === 400 ? "no-route" : "service";
        this.failureKinds.add(kind);
        this.warnings.add(kind === "off-network" ? (error as EndpointSnapError).message
          : kind === "no-route" ? `No connected cycling path was returned for some links after searching within ${MAX_ENDPOINT_GAP_METRES} m of their endpoints.`
            : "The cycling route service could not complete some requests. Checked routes remain available; please try again for missing links.");
        return null;
      }
    });
    this.pending.set(key, task); this.queue = task.catch(() => undefined);
    void task.finally(() => this.pending.delete(key)).catch(() => undefined);
    return task;
  }
}
