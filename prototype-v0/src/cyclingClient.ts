import { DEFAULT_HILLS, uphillParameters, validateHills, type HillPreferences } from "./hills.ts";
import { fetchJson, HttpError, transientFailure, waitFor } from "./http.ts";
import { cachedCycling, cyclingKey, CYCLING_PROFILE, MAX_ENDPOINT_GAP_METRES, EndpointSnapError, parseCyclingRoute, samePlace, zeroCycling, type CyclingRoute } from "./cycling.ts";
import { haversineKm, type Point } from "./routing.ts";
import { MAJOR_STATIONS } from "./majorStations.ts";
import { maxCyclingSpeed, validateCyclingPace, type CyclingPace } from "./cyclingPace.ts";
import { fallbackCycling } from "./cyclingFallback.ts";
import { applySwisstopo, simplifyTopoLine, type TopoReply } from "./swisstopo.ts";
import { chooseCyclingRoute, type RoutePreference } from "./cyclingPreferences.ts";

const CYCLING_LIMITS = { requests: 32, timeoutMs: 25_000, phaseMs: 150_000, gapMs: 500, cacheEntries: 100, cacheMs: 30 * 60_000 };
const cache = new Map<string, { route: CyclingRoute; traffic?: CyclingRoute }>();
type Located = Point & { id?: string; stopId?: string; label?: string; name?: string };
type CyclingFailureKind = "service" | "no-route" | "off-network" | "limit";
export type CyclingFailure = {
  from: Located; to: Located; kind: CyclingFailureKind; message: string;
  status?: number; providerDetail?: string;
};
const placeName = (point: Located) => point.label || point.name || `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
function explainFailure(error: unknown): Omit<CyclingFailure, "from" | "to"> {
  if (error instanceof TerrainRouteError) return { kind: "no-route", message: error.message };
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
class TerrainRouteError extends Error {}
export class CyclingClient {
  readonly routes = new Map<string, CyclingRoute | null>();
  readonly trafficRoutes = new Map<string, CyclingRoute>();
  readonly collectTrafficAlternatives: boolean;
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
  private topoRequests = 0;
  private alternativeRequests = 0;
  private topoReplies = new Map<string, TopoReply>();
  private topoCorridors = new Map<string, TopoReply>();
  private terrainFetcher: typeof fetch | null;
  readonly routePreference?: RoutePreference;
  readonly hills: HillPreferences;
  constructor(signal: AbortSignal, fetcher: typeof fetch = fetch, gapMs = CYCLING_LIMITS.gapMs, useCache = true,
    fallbackFetcher: typeof fetch | null = fetcher === fetch ? fetch : null, pace?: CyclingPace, routePreference?: RoutePreference,
    terrainFetcher: typeof fetch | null = fetcher === fetch ? fetch : null, hills: HillPreferences = DEFAULT_HILLS, collectTrafficAlternatives = false) {
    this.collectTrafficAlternatives = collectTrafficAlternatives;
    validateHills(hills); this.hills = { ...hills };
    if (pace) validateCyclingPace(pace);
    this.pace = pace ? { ...pace } : undefined;
    this.routePreference = routePreference ?? (hills.mode !== "none" ? "fastest" : undefined);
    this.terrainFetcher = terrainFetcher;
    this.signal = signal; this.fetcher = fetcher; this.gapMs = gapMs; this.useCache = useCache;
    this.fallbackFetcher = fallbackFetcher;
  }
  private async terrainCheck(route: CyclingRoute): Promise<CyclingRoute> {
    if (!this.routePreference || !this.terrainFetcher || route.blocked) return route;
    const unavailable = (note: string): CyclingRoute => ({ ...route, topoCheck: { status: "unavailable",
      matchedMetres: 0, checkedAt: new Date().toISOString(), note } });
    const points = simplifyTopoLine(route.points).map(({ lat, lon }) => ({ lat, lon }));
    const key = JSON.stringify(points), cached = this.topoReplies.get(key);
    if (cached) return applySwisstopo(route, cached);
    const corridorKey = cyclingKey(route.from, route.to), nearby = this.topoCorridors.get(corridorKey);
    if (nearby) {
      const matched = applySwisstopo(route, { ...nearby, complete: false,
        note: "This alternative was matched against the same nearby official features. Unmatched sections remain unchecked." });
      if (matched.topoCheck!.matchedMetres >= route.distanceKm * 1000 * .85) return matched;
    }
    if (this.topoRequests >= 12) return unavailable("Swisstopo search budget reached; remaining sections are unchecked.");
    if (points.length > 1500) return unavailable("This path is too detailed for the bounded swisstopo check.");
    this.topoRequests++;
    try {
      const reply = await fetchJson<TopoReply>("/api/terrain", this.signal, 9500,
        (url, init) => this.terrainFetcher!(url, { ...init, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points }) }));
      this.signal.throwIfAborted();
      if (!Array.isArray(reply.features) || typeof reply.complete !== "boolean") throw new Error("Incomplete check");
      if (reply.complete) { this.topoReplies.set(key, reply); this.topoCorridors.set(corridorKey, reply); }
      return applySwisstopo(route, reply);
    } catch {
      this.signal.throwIfAborted();
      return unavailable("Swisstopo could not complete this check; unverified sections remain unverified.");
    }
  }
  beginPhase() { this.remainingMs = CYCLING_LIMITS.phaseMs; }
  fork(signal: AbortSignal) {
    const next = new CyclingClient(signal, this.fetcher, this.gapMs, this.useCache, this.fallbackFetcher,
      this.pace, this.routePreference, this.terrainFetcher, this.hills, this.collectTrafficAlternatives);
    for (const [key, route] of this.routes) if (route) next.routes.set(key, route);
    for (const [key, route] of this.trafficRoutes) next.trafficRoutes.set(key, route);
    return next;
  }
  getCached(a: Located, b: Located) { return cachedCycling(this.routes, a, b); }
  route(a: Located, b: Located): Promise<CyclingRoute | null> {
    if (this.signal.aborted) return Promise.reject(this.signal.reason);
    if (samePlace(a, b)) return Promise.resolve(zeroCycling(a, b));
    const key = cyclingKey(a, b);
    if (this.routes.has(key)) return Promise.resolve(this.routes.get(key)!);
    const equivalent = cachedCycling(this.routes, a, b);
    if (equivalent) { this.routes.set(key, equivalent); return Promise.resolve(equivalent); }
    if (this.pending.has(key)) return this.pending.get(key)!;
    const cacheKey = "traffic-objectives-v1|" + this.collectTrafficAlternatives + "|" + JSON.stringify(this.hills) + "|" + (this.routePreference ?? "legacy") + "|" + `${key}|${this.pace ? `${this.pace.flatSpeedKmh}:${this.pace.electricAssist}` : "provider"}`;
    const cached = this.useCache ? cache.get(cacheKey) : undefined;
    if (cached && Date.now() - cached.route.fetchedAt < CYCLING_LIMITS.cacheMs) {
      this.routes.set(key, cached.route); if (cached.traffic) this.trafficRoutes.set(key, cached.traffic);
      return Promise.resolve(cached.route);
    }
    const task = this.queue.then(async () => {
      this.signal.throwIfAborted();
      const started = Date.now();
      const remaining = () => this.remainingMs - Math.max(0, Date.now() - started);
      const remember = (route: CyclingRoute) => {
        if (route.source === "OSRM" && this.routePreference) route = { ...route, preference: this.routePreference,
          alternativesChecked: 1, preferenceNote: "Backup cycling service: path preferences and hill avoidance could not be compared. Elevation may be unavailable." };
        if (route.blocked) throw new TerrainRouteError("No bicycle-suitable checked path: " +
          [...new Set(route.sections.filter(s => s.mode === "blocked").flatMap(s => s.reasons ?? []))].join(" "));
        this.routes.set(key, route);
        const previous = this.failedLinks.get(key);
        if (previous) this.warnings.delete(`${placeName(a)} → ${placeName(b)}: ${previous.message}`);
        this.failedLinks.delete(key);
        this.failureKinds.clear();
        for (const failure of this.failedLinks.values()) this.failureKinds.add(failure.kind);
        if (this.useCache) {
          cache.delete(cacheKey); cache.set(cacheKey, { route, traffic: this.trafficRoutes.get(key) });
          while (cache.size > CYCLING_LIMITS.cacheEntries) cache.delete(cache.keys().next().value!);
        }
        return route;
      };
      const params = new URLSearchParams({ lonlats: `${a.lon},${a.lat}|${b.lon},${b.lat}`, profile: CYCLING_PROFILE,
        alternativeidx: "0", format: "geojson", "profile:processUnusedTags": "1", "profile:allow_steps": this.routePreference ? "1" : "0",
        "profile:allow_ferries": "0", "profile:maxSpeed": String(maxCyclingSpeed(this.pace)),
        "profile:waypointCatchingRange": String(MAX_ENDPOINT_GAP_METRES) });
      if (this.routePreference) {
        params.set("timode", "2");
        params.set("profile:turnInstructionMode", "2");
        params.set("profile:ignore_cycleroutes", this.routePreference === "fastest" ? "1" : "0");
        params.set("profile:avoid_unsafe", this.routePreference === "lower-stress" ? "1" : "0");
      }
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
              try { return remember(await this.terrainCheck(await fallbackCycling(a, b, this.signal, Math.min(CYCLING_LIMITS.timeoutMs, remaining()), this.fallbackFetcher, this.pace))); }
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
            let route = parseCyclingRoute(data, a, b, Date.now(), this.pace);
            if (this.routePreference) {
              // Check the primary path while the route provider computes a genuine
              // alternative. Unchosen alternatives need no second terrain request.
              const [checkedPrimary, rawAlternative] = await Promise.all([this.terrainCheck(route), (async () => {
                if (this.alternativeRequests >= (this.hills.mode === "none" ? 6 : 12) || this.requests >= CYCLING_LIMITS.requests - 4 || remaining() <= 7000) return null;
                const alternative = new URLSearchParams(params);
                const stairs = route.sections.some(s => s.tags.highway === "steps");
                uphillParameters(alternative, this.hills);
                if (this.routePreference === "simplest") {
                  // A second trekking route can repeat the same cycle-route
                  // bias. Compare a road-oriented bicycle route instead, then
                  // rank actual instructions with the same terrain/time checks.
                  alternative.set("profile", "fastbike");
                  alternative.set("profile:allow_steps", "0");
                  alternative.set("profile:allow_motorways", "0");
                  alternative.set("profile:considerTurnRestrictions", "1");
                  alternative.delete("profile:ignore_cycleroutes");
                  alternative.delete("profile:avoid_unsafe");
                } else if (stairs || route.blocked || this.collectTrafficAlternatives && this.routePreference === "fastest") {
                  alternative.set("profile:allow_steps", "0");
                  alternative.set("profile:avoid_unsafe", "1");
                  if (this.collectTrafficAlternatives) alternative.set("profile:ignore_cycleroutes", "0");
                } else if (this.hills.mode === "none") alternative.set("alternativeidx", "1");
                try {
                  await waitFor(this.gapMs, this.signal); this.lastRequest = Date.now(); this.requests++; this.alternativeRequests++;
                  // Live city alternatives can take 9–12 s. The old 2.5 s
                  // first-link timeout often prevented Simplest comparing any.
                  const timeout = this.routePreference === "simplest" ? 15000
                    : this.hills.mode !== "none" ? 10000 : !stairs && !route.blocked && this.routes.size < 2 ? 2500 : 10000;
                  const alternate = await fetchJson<unknown>("https://brouter.de/brouter?" + alternative, this.signal,
                    Math.min(timeout, remaining()), this.fetcher);
                  return parseCyclingRoute(alternate, a, b, Date.now(), this.pace);
                } catch (error) {
                  this.signal.throwIfAborted();
                  if (error instanceof HttpError && error.status === 429)
                    this.cooldown = Date.now() + (error.retryAfterMs ?? 60_000);
                  return null;
                }
              })()]);
              const candidates = [checkedPrimary];
              if (rawAlternative) {
                const preliminary = chooseCyclingRoute([checkedPrimary, rawAlternative], this.routePreference, this.hills);
                // IDs identify endpoints, so compare the point-array identity here.
                const trafficChoice = this.collectTrafficAlternatives && chooseCyclingRoute([checkedPrimary, rawAlternative], "lower-stress", this.hills);
                candidates.push(preliminary?.points === rawAlternative.points || trafficChoice && trafficChoice.points === rawAlternative.points ? await this.terrainCheck(rawAlternative) : rawAlternative);
              }
              const choice = chooseCyclingRoute(candidates, this.routePreference, this.hills);
              if (!choice) throw new TerrainRouteError("No bicycle-suitable checked path: " +
                [...new Set(candidates.flatMap(r => r.sections.filter(s => s.mode === "blocked").flatMap(s => s.reasons ?? [])))].join(" "));
              if (this.collectTrafficAlternatives) {
                const traffic = chooseCyclingRoute(candidates, "lower-stress", this.hills);
                if (traffic && traffic.points !== choice.points) this.trafficRoutes.set(key, traffic);
              }
              route = choice;
            }
            return remember(route);
          } catch (error) {
            this.signal.throwIfAborted();
            // Provider centroids can fall on disconnected indoor/platform ways.
            // Retry once at the same station's existing public anchor, only
            // within the already disclosed walking-connector bound. The parsed
            // route still uses the user's original endpoints and walking time.
            if (attempt === 0 && error instanceof HttpError && error.status === 400
              && /no track found|island detected|position not mapped/i.test(error.detail)) {
              const anchor = (point: Located) => MAJOR_STATIONS.find(s => s.id === (point.id ?? point.stopId)
                && haversineKm(s, point) * 1000 <= MAX_ENDPOINT_GAP_METRES) ?? point;
              const aa = anchor(a), bb = anchor(b);
              if (haversineKm(a, aa) > .001 || haversineKm(b, bb) > .001) {
                params.set("lonlats", aa.lon + "," + aa.lat + "|" + bb.lon + "," + bb.lat);
                continue;
              }
            }
            const temporary = transientFailure(error);
            const rateLimited = error instanceof HttpError && error.status === 429;
            const delay = error instanceof HttpError && error.retryAfterMs !== null ? error.retryAfterMs : this.gapMs * 5;
            if (rateLimited) this.cooldown = Date.now() + (attempt === 0 ? delay : Math.max(delay, 60_000));
            if (temporary && this.fallbackFetcher && this.requests < CYCLING_LIMITS.requests && remaining() > 0) {
              this.requests++;
              try { return remember(await this.terrainCheck(await fallbackCycling(a, b, this.signal, Math.min(CYCLING_LIMITS.timeoutMs, remaining()), this.fallbackFetcher, this.pace))); }
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
