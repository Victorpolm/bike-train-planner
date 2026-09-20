import { fetchJson, HttpError } from "./http.ts";
import { cachedCycling, cyclingKey, CYCLING_PROFILE, MAX_CYCLING_SPEED_KMH, MAX_ENDPOINT_GAP_METRES, EndpointSnapError, parseCyclingRoute, samePlace, zeroCycling, type CyclingRoute } from "./cycling.ts";
import type { Point } from "./routing.ts";

export const CYCLING_LIMITS = { requests: 32, timeoutMs: 25_000, phaseMs: 150_000, gapMs: 500, cacheEntries: 100, cacheMs: 30 * 60_000 };
const cache = new Map<string, CyclingRoute>();
type Located = Point & { id?: string; stopId?: string; label?: string; name?: string };
type CyclingFailureKind = "service" | "no-route" | "off-network" | "limit";
export type CyclingFailure = {
  from: Located; to: Located; kind: CyclingFailureKind; message: string;
  status?: number; providerDetail?: string;
};
const placeName = (point: Located) => point.label || point.name || `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
function explainFailure(error: unknown): Omit<CyclingFailure, "from" | "to"> {
  if (error instanceof EndpointSnapError) return { kind: "off-network", message: error.message };
  const diagnostic = error instanceof HttpError ? { status: error.status, providerDetail: error.detail } : {};
  const detail = diagnostic.providerDetail ?? "";
  if (error instanceof Error && error.name === "TimeoutError" || /timeout|timed out|time limit/i.test(detail)) {
    return { ...diagnostic, kind: "service", message: "The cycling service ran out of time for this link. Please try again." };
  }
  if (diagnostic.status === 429) return { ...diagnostic, kind: "service", message: "The cycling service is busy. Try again later." };
  if (diagnostic.status === 400 && /(?:from|to|via[^\s]*)-position not mapped|no (?:matching|routable) (?:way|road|path).*(?:point|position)/i.test(detail)) {
    return { ...diagnostic, kind: "off-network", message: `A point could not be matched to a routable path within ${MAX_ENDPOINT_GAP_METRES} m. Check a nearby road or entrance.` };
  }
  if (diagnostic.status === 400 && /no track found|(?:start|target) island detected|routing island/i.test(detail)) {
    return { ...diagnostic, kind: "no-route", message: "The cycling service found no usable connection between these points with this bicycle profile." };
  }
  // Unknown 400 responses are service/request failures, not evidence that a
  // path does not exist. Never tell the user to move a valid pin on that basis.
  return { ...diagnostic, kind: "service", message: "The cycling service could not complete this check. Please try again." };
}
export class CyclingClient {
  readonly routes = new Map<string, CyclingRoute | null>();
  readonly warnings = new Set<string>();
  readonly failureKinds = new Set<CyclingFailureKind>();
  readonly failedLinks = new Map<string, CyclingFailure>();
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
        const failure = { from: a, to: b, ...explainFailure(error) };
        this.failedLinks.set(key, failure); this.failureKinds.add(failure.kind);
        this.warnings.add(`${placeName(a)} → ${placeName(b)}: ${failure.message}`);
        return null;
      }
    });
    this.pending.set(key, task); this.queue = task.catch(() => undefined);
    void task.finally(() => this.pending.delete(key)).catch(() => undefined);
    return task;
  }
}
