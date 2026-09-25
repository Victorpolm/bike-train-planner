import { fetchJson, HttpError, transientFailure, waitFor } from "./http.ts";
import { cachedCycling, cyclingKey, CYCLING_PROFILE, MAX_ENDPOINT_GAP_METRES, EndpointSnapError, parseCyclingRoute, samePlace, zeroCycling, type CyclingRoute } from "./cycling.ts";
import type { Point } from "./routing.ts";
import { maxCyclingSpeed, validateCyclingPace, type CyclingPace } from "./cyclingPace.ts";
import { fallbackCycling } from "./cyclingFallback.ts";

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
  private remainingMs = CYCLING_LIMITS.phaseMs;
  private cooldown = 0;
  private attempts = new Map<string, number>();
  signal: AbortSignal;
  readonly pace?: CyclingPace;
  private fetcher: typeof fetch;
  private gapMs: number;
  private useCache: boolean;
  private fallbackFetcher: typeof fetch | null;
  constructor(signal: AbortSignal, fetcher: typeof fetch = fetch, gapMs = CYCLING_LIMITS.gapMs, useCache = true,
    fallbackFetcher: typeof fetch | null = fetcher === fetch ? fetch : null, pace?: CyclingPace) {
    if (pace) validateCyclingPace(pace);
    this.pace = pace ? { ...pace } : undefined;
    this.signal = signal; this.fetcher = fetcher; this.gapMs = gapMs; this.useCache = useCache;
    this.fallbackFetcher = fallbackFetcher;
  }
  beginPhase() { this.remainingMs = CYCLING_LIMITS.phaseMs; }
  getCached(a: Located, b: Located) { return cachedCycling(this.routes, a, b); }
  route(a: Located, b: Located): Promise<CyclingRoute | null> {
    if (this.signal.aborted) return Promise.reject(this.signal.reason);
    if (samePlace(a, b)) return Promise.resolve(zeroCycling(a, b));
    const key = cyclingKey(a, b);
    if (this.routes.has(key)) return Promise.resolve(this.routes.get(key)!);
    const equivalent = cachedCycling(this.routes, a, b);
    if (equivalent) { this.routes.set(key, equivalent); return Promise.resolve(equivalent); }
    if (this.pending.has(key)) return this.pending.get(key)!;
    const cacheKey = `${key}|${this.pace ? `${this.pace.flatSpeedKmh}:${this.pace.electricAssist}` : "provider"}`;
    const cached = this.useCache ? cache.get(cacheKey) : undefined;
    if (cached && Date.now() - cached.fetchedAt < CYCLING_LIMITS.cacheMs) { this.routes.set(key, cached); return Promise.resolve(cached); }
    const task = this.queue.then(async () => {
      this.signal.throwIfAborted();
      const started = Date.now();
      const remaining = () => this.remainingMs - Math.max(0, Date.now() - started);
      const remember = (route: CyclingRoute) => {
        this.routes.set(key, route);
        const previous = this.failedLinks.get(key);
        if (previous) this.warnings.delete(`${placeName(a)} → ${placeName(b)}: ${previous.message}`);
        this.failedLinks.delete(key);
        this.failureKinds.clear();
        for (const failure of this.failedLinks.values()) this.failureKinds.add(failure.kind);
        if (this.useCache) {
          cache.delete(cacheKey); cache.set(cacheKey, route);
          while (cache.size > CYCLING_LIMITS.cacheEntries) cache.delete(cache.keys().next().value!);
        }
        return route;
      };
      const params = new URLSearchParams({ lonlats: `${a.lon},${a.lat}|${b.lon},${b.lat}`, profile: CYCLING_PROFILE,
        alternativeidx: "0", format: "geojson", "profile:processUnusedTags": "1", "profile:allow_steps": "0",
        "profile:allow_ferries": "0", "profile:maxSpeed": String(maxCyclingSpeed(this.pace)),
        "profile:waypointCatchingRange": String(MAX_ENDPOINT_GAP_METRES) });
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          if (this.requests >= CYCLING_LIMITS.requests || remaining() <= 0) {
            this.failureKinds.add("limit");
            this.warnings.add("Some cycling links could not be checked within the search limit. Only checked links are used.");
            return null;
          }
          // One immediate retry and at most one later recheck for a failed link.
          // Permanent errors stay cached; a transient null must not poison it.
          if ((this.attempts.get(key) ?? 0) >= 3) return null;
          const delay = Math.max(0, this.gapMs - (Date.now() - this.lastRequest), this.cooldown - Date.now());
          if (delay > 10_000 || delay >= remaining()) {
            if (this.fallbackFetcher) {
              this.requests++;
              try { return remember(await fallbackCycling(a, b, this.signal, Math.min(CYCLING_LIMITS.timeoutMs, remaining()), this.fallbackFetcher, this.pace)); }
              catch { this.signal.throwIfAborted(); }
            }
            return null;
          }
          await waitFor(delay, this.signal);
          this.lastRequest = Date.now(); this.requests++;
          this.attempts.set(key, (this.attempts.get(key) ?? 0) + 1);
          try {
            const data = await fetchJson<unknown>(`https://brouter.de/brouter?${params}`, this.signal,
              Math.min(CYCLING_LIMITS.timeoutMs, remaining()), this.fetcher);
            this.signal.throwIfAborted();
            const route = parseCyclingRoute(data, a, b, Date.now(), this.pace);
            this.cooldown = 0;
            return remember(route);
          } catch (error) {
            this.signal.throwIfAborted();
            const temporary = transientFailure(error);
            const rateLimited = error instanceof HttpError && error.status === 429;
            const delay = error instanceof HttpError && error.retryAfterMs !== null ? error.retryAfterMs : this.gapMs * 5;
            if (rateLimited) this.cooldown = Date.now() + (attempt === 0 ? delay : Math.max(delay, 60_000));
            if (temporary && this.fallbackFetcher && this.requests < CYCLING_LIMITS.requests && remaining() > 0) {
              this.requests++;
              try { return remember(await fallbackCycling(a, b, this.signal, Math.min(CYCLING_LIMITS.timeoutMs, remaining()), this.fallbackFetcher, this.pace)); }
              catch { this.signal.throwIfAborted(); }
            }
            if (temporary && !this.fallbackFetcher && attempt === 0 && delay <= 10_000 && delay < remaining() && this.requests < CYCLING_LIMITS.requests) {
              if (!rateLimited) await waitFor(delay, this.signal);
              continue;
            }
            if (!temporary) this.routes.set(key, null);
            const failure = { from: a, to: b, ...explainFailure(error) };
            this.failedLinks.set(key, failure); this.failureKinds.add(failure.kind);
            this.warnings.add(`${placeName(a)} → ${placeName(b)}: ${failure.message}`);
            return null;
          }
        }
        return null;
      } finally {
        // Time spent waiting on geocoding or timetables is not cycling work.
        this.remainingMs -= Math.max(0, Date.now() - started);
      }
    });
    this.pending.set(key, task); this.queue = task.catch(() => undefined);
    void task.finally(() => this.pending.delete(key)).catch(() => undefined);
    return task;
  }
}
