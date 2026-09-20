import { cyclingMinutes, haversineKm, type CyclingComparison, type Place, type Point, type Station } from "./routing.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { cyclingKey, MAX_CYCLING_SPEED_KMH, MAX_ENDPOINT_GAP_METRES, samePlace } from "./cycling.ts";
import { MAJOR_STATIONS } from "./majorStations.ts";
import { type TransportSection } from "./itinerary.ts";
import { addSections, addStationboard, readStop, type BoardJourney } from "./timetable.ts";
import { atEndpoint, compareModels, emptyNetwork, solve, validateOptions,
  type ModelMode, type Network, type Options, type Solution, type Stop } from "./model.ts";

import { fetchJson, HttpError } from "./http.ts";
import { geocode, MAX_WAYPOINTS, type TransportLocation } from "./places.ts";
import { solveWaypoints } from "./waypoints.ts";
export { geocode } from "./places.ts";

const TRANSPORT_URL = "https://transport.opendata.ch/v1";
export const SEARCH_LIMITS = { stopsPerSide: 4, connectionsPerPair: 4, baselinePairs: 3, transferStops: 2,
  neighborsPerTransfer: 1, suffixQueries: 2, stationboards: 1, requests: 18,
  locationProbesPerSide: 2, phaseMilliseconds: 90_000, requestMilliseconds: 20_000 };
export type Progress = (message: string) => void;
type ConnectionResponse = { connections?: { sections?: TransportSection[] }[]; errors?: unknown[] };

export function swissDateParts(date: Date) {
  // The provider accepts minutes. Round UP so the first returned service is catchable.
  const rounded = new Date(Math.ceil(date.getTime() / 60_000) * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(rounded);
  const v = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? "";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}` };
}

export class TimetableClient {
  readonly warnings = new Set<string>();
  requests = 0;
  failures = 0;
  rejectedSections = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, Promise<unknown>>();
  private lastRequest = 0;
  private stopped = false;
  private deadline = Date.now() + SEARCH_LIMITS.phaseMilliseconds;
  beginPhase() { this.deadline = Date.now() + SEARCH_LIMITS.phaseMilliseconds; }
  readonly signal: AbortSignal;
  readonly budget: number;
  private gapMs: number;
  private fetcher: typeof fetch;
  constructor(signal: AbortSignal, gapMs = 400, fetcher: typeof fetch = fetch, budget = SEARCH_LIMITS.requests) {
    this.signal = signal; this.gapMs = gapMs; this.fetcher = fetcher; this.budget = budget;
  }

  get<T>(path: string, params: URLSearchParams): Promise<T | null> {
    const url = `${TRANSPORT_URL}/${path}?${params}`;
    const cached = this.cache.get(url);
    if (cached) return cached as Promise<T | null>;
    const task = this.queue.then(async () => {
      this.signal.throwIfAborted();
      if (this.stopped) return null;
      if (Date.now() >= this.deadline) {
        this.warnings.add("The search time limit was reached; some connections were not explored."); return null;
      }
      if (this.requests >= this.budget) {
        this.warnings.add("Search request limit reached; some connections were not explored."); return null;
      }
      const wait = Math.max(0, this.gapMs - (Date.now() - this.lastRequest));
      if (wait) await new Promise<void>(resolve => setTimeout(resolve, wait));
      this.signal.throwIfAborted();
      this.requests++; this.lastRequest = Date.now();
      try {
        const data = await fetchJson<{ errors?: unknown[] }>(url, this.signal,
          Math.max(1, Math.min(SEARCH_LIMITS.requestMilliseconds, this.deadline - Date.now())), this.fetcher);
        if (data.errors?.length) throw new Error("The timetable service rejected some queries; this search is incomplete.");
        return data as T;
      } catch (error) {
        this.signal.throwIfAborted();
        if (error instanceof HttpError && error.status === 429) {
          this.stopped = true;
          error = new Error("The timetable service is busy. Try again later for more options.");
        }
        this.failures++;
        this.warnings.add(error instanceof Error && !["TimeoutError", "TypeError"].includes(error.name)
          ? error.message : "Some timetable requests timed out or could not connect; this search is incomplete.");
        return null;
      }
    });
    this.cache.set(url, task); this.queue = task.catch(() => undefined);
    // A transient failure is not a reusable empty result.
    void task.then(value => { if (value === null) this.cache.delete(url); }, () => this.cache.delete(url));
    return task;
  }
}

export function candidateBands(maxMinutes: number): number[] {
  const bands: number[] = [];
  for (let minutes = 20; minutes < maxMinutes; minutes += 20) bands.push(minutes);
  return [...bands, maxMinutes];
}
export function selectStations(stops: Stop[], point: Place, maxMinutes: number, limit = SEARCH_LIMITS.stopsPerSide): Station[] {
  const candidates = [...new Map(stops.map(s => [s.id, atEndpoint(s, point)])).values()]
    .filter(s => s.bikeMinutes <= maxMinutes).sort((a, b) => a.bikeMinutes - b.bikeMinutes || a.id.localeCompare(b.id));
  const chosen = new Map<string, Station>();
  const add = (s?: Station) => { if (s && chosen.size < limit) chosen.set(s.id, s); };
  candidates.slice(0, 2).forEach(add);
  candidates.filter(s => s.kind === "train").slice(0, 2).forEach(add);
  for (const band of candidateBands(maxMinutes)) add(candidates.find(s => s.bikeMinutes > band - 20 && s.bikeMinutes <= band && !chosen.has(s.id)));
  candidates.forEach(add);
  return [...chosen.values()].sort((a, b) => a.bikeMinutes - b.bikeMinutes || a.id.localeCompare(b.id));
}

// Reserve queries for rail access: several adjacent bus stops must not consume
// every query before a farther, feasible railway station is tried.
export function selectStationPairs(origins: Station[], destinations: Station[], maxBikeMinutes: number,
  queried: ReadonlySet<string> = new Set(), limit = SEARCH_LIMITS.baselinePairs): (readonly [Station, Station])[] {
  const pairs = origins.flatMap(a => destinations
    .filter(b => a.id !== b.id && a.bikeMinutes + b.bikeMinutes <= maxBikeMinutes).map(b => [a, b] as const))
    .sort(([a, b], [c, d]) => a.bikeMinutes + b.bikeMinutes - c.bikeMinutes - d.bikeMinutes
      || a.id.localeCompare(c.id) || b.id.localeCompare(d.id))
    .filter(([a, b]) => !queried.has(`${a.id}:${b.id}`));
  const chosen = new Map<string, readonly [Station, Station]>();
  const add = (pair?: readonly [Station, Station]) => {
    if (pair && chosen.size < limit) chosen.set(`${pair[0].id}:${pair[1].id}`, pair);
  };
  add(pairs[0]);
  for (const origin of origins.filter(s => s.kind === "train")) {
    add(pairs.find(([a, b]) => a.id === origin.id && b.kind === "train")
      ?? pairs.find(([a]) => a.id === origin.id));
  }
  for (const destination of destinations.filter(s => s.kind === "train")) {
    add(pairs.find(([a, b]) => a.kind === "train" && b.id === destination.id)
      ?? pairs.find(([, b]) => b.id === destination.id));
  }
  pairs.forEach(add);
  return [...chosen.values()];
}

async function nearby(point: Point, client: TimetableClient): Promise<Stop[]> {
  const data = await client.get<{ stations?: TransportLocation[] }>("locations", new URLSearchParams({ x: String(point.lat), y: String(point.lon) }));
  return (data?.stations ?? []).map((value): Stop | null => {
    const stop = readStop(value);
    return stop ? { ...stop, kind: value.icon ?? undefined } : null;
  }).filter((s): s is Stop => s !== null);
}

export async function findCandidateStations(point: Place, maxMinutes: number, client: TimetableClient,
  progress: Progress, expand = false): Promise<Station[]> {
  const stops: Stop[] = MAJOR_STATIONS.map(s => ({ ...s, kind: "train" }));
  if (point.stopId) stops.push({ id: point.stopId, name: point.label, lat: point.lat, lon: point.lon, kind: point.kind });
  // A selected stop is already a valid endpoint. Do not delay its first connection
  // with nearby lookups; an address can initially use a known hub within 20 minutes.
  if (expand || (!point.stopId && !stops.some(s => atEndpoint(s, point).bikeMinutes <= Math.min(20, maxMinutes)))) {
    progress(`Finding stops near ${point.label}…`);
    stops.push(...await nearby(point, client));
  }
  if (expand || !selectStations(stops, point, maxMinutes).length) {
    let probes = 0;
    for (const band of candidateBands(maxMinutes)) {
      if (band <= 20 || probes >= SEARCH_LIMITS.locationProbesPerSide) continue;
      progress(`Looking farther from ${point.label}…`);
      const radiusKm = Math.max(0, band - 10) / 4;
      const offset = radiusKm / 111.32;
      stops.push(...await nearby({ lat: point.lat + (probes % 2 ? -offset : offset), lon: point.lon }, client));
      probes++;
    }
  }
  return selectStations(stops, point, maxMinutes);
}

async function connections(network: Network, client: TimetableClient, from: Stop, to: Stop, ready: Date) {
  if (from.id === to.id) return;
  const dt = swissDateParts(ready);
  // Omitting transportations allows the provider's train, bus, tram and other PT modes in BOTH models.
  const data = await client.get<ConnectionResponse>("connections", new URLSearchParams({
    from: from.id, to: to.id, date: dt.date, time: dt.time, limit: String(SEARCH_LIMITS.connectionsPerPair),
  }));
  for (const connection of data?.connections ?? []) client.rejectedSections += addSections(network, connection.sections);
}

export type SearchSession = {
  origin: Place; destination: Place; start: Date; options: Options; network: Network; client: TimetableClient;
  originStations: Station[]; destinationStations: Station[]; baseline: Solution; extended: Solution | null; extendedComplete?: boolean;
  waypoints?: Place[];
  cyclingClient?: CyclingClient;
  comparisonClient?: CyclingClient;
  cyclingComparison?: CyclingComparison | null;
  cyclingStatus?: "loading" | "ready" | "unavailable";
  cyclingTask?: Promise<void>;
  transferCyclingAttempts?: Set<string>;
  cyclingCandidatePools?: Map<string, Station[]>;
};
export function searchWarnings(session: SearchSession): string[] {
  const warnings = [...session.client.warnings, ...session.cyclingClient?.warnings ?? [],
    ...[...session.comparisonClient?.warnings ?? []].map(w => `Cycling-only comparison — ${w}`)];
  if (session.client.rejectedSections) warnings.push("Some sections lacked usable stops or times and were excluded.");
  if (session.baseline.limited || session.extended?.limited) warnings.push("The routing search reached its label limit; some alternatives may be missing.");
  return [...new Set(warnings)];
}

export type SearchUpdate = (session: SearchSession) => void;
function stationAccessError(session: SearchSession) {
  const kinds = session.cyclingClient?.failureKinds;
  if (session.client.failures) return "The timetable service could not finish finding nearby stops. Please try again.";
  if (kinds?.has("service")) return "The cycling route service could not complete the station-access checks. Please try again; your points do not need to be exactly on a path.";
  if (kinds?.has("limit")) return "The search reached its limit while checking paths to nearby stops. Try again or choose a closer stop.";
  if (kinds?.has("off-network") || kinds?.has("no-route")) {
    const places = [!session.originStations.length && session.origin.label, !session.destinationStations.length && session.destination.label].filter(Boolean).join(" and ");
    return `No usable station-access path was found for ${places}. We allow up to ${MAX_ENDPOINT_GAP_METRES} m between a selected point and the routed path. Try a nearby road, path or entrance.`;
  }
  return "No stop was found within your cycling preference. Try More cycling, or a nearby stop.";
}
async function roadCandidates(session: SearchSession, point: Place, maxMinutes: number, direction: "access" | "egress" | "both",
  progress: Progress, expand = false, complete = false): Promise<Station[]> {
  const pools = session.cyclingCandidatePools ??= new Map<string, Station[]>(), key = `${point.lat},${point.lon}:${maxMinutes}`;
  const candidates = !expand && pools.has(key) ? pools.get(key)!
    : await findCandidateStations(point, maxMinutes * (session.cyclingClient ? MAX_CYCLING_SPEED_KMH / 15 : 1), session.client, progress, expand);
  pools.set(key, candidates);
  if (!session.cyclingClient) return candidates;
  const result: Station[] = [];
  for (const stop of candidates) {
    progress(`Checking cycling paths near ${point.label}…`);
    if (direction !== "egress") await session.cyclingClient.route(point, stop);
    if (direction !== "access") await session.cyclingClient.route(stop, point);
    const access = atEndpoint(stop, point, session.network), egress = atEndpoint(stop, point, session.network, "egress");
    const candidate = direction === "access" ? access : direction === "egress" ? egress : access.bikeMinutes <= egress.bikeMinutes ? access : egress;
    if (candidate.bikeMinutes <= maxMinutes) {
      result.push(candidate);
      // One verified access and egress suffice to query and publish a first trip.
      // Check the rest after that first timetable response, not before it.
      if (!complete && !expand) break;
    }
  }
  return result.sort((a, b) => a.bikeMinutes - b.bikeMinutes);
}

async function prepareObservedCycling(session: SearchSession, progress: Progress) {
  if (!session.cyclingClient) return;
  const { network, cyclingClient, options } = session;
  const boarding = new Set([...network.edges.values()].filter(e => e.leg.mode === "transit").map(e => e.from));
  const arrival = new Set([...network.edges.values()].map(e => e.to));
  const points = [session.origin, ...session.waypoints ?? [], session.destination];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    for (const direction of ["access", "egress"] as const) {
      if (index === 0 && direction === "egress" || index === points.length - 1 && direction === "access") continue;
      const limit = Math.min(options.maxBikeMinutes, direction === "access" ? options.maxAccessMinutes : options.maxEgressMinutes);
      const stops = [...network.stops.values()].filter(s => (direction === "access" ? boarding : arrival).has(s.id)
        && (samePlace(s, point) || haversineKm(s, point) / MAX_CYCLING_SPEED_KMH * 60 <= limit))
        .sort((a, b) => haversineKm(a, point) - haversineKm(b, point)).slice(0, 4);
      for (const stop of stops) {
        const from = direction === "access" ? point : stop, to = direction === "access" ? stop : point;
        if (network.cycling!.has(cyclingKey(from, to)) || samePlace(from, to)) continue;
        progress(`Checking the cycling link at ${stop.name}…`);
        await cyclingClient.route(from, to);
      }
    }
  }
}
async function prepareWaypointTransfers(session: SearchSession, progress: Progress) {
  if (!session.cyclingClient || !session.waypoints?.length || session.options.maxIntermediateMinutes <= 0) return;
  const { network, options, cyclingClient } = session;
  const attempts = session.transferCyclingAttempts ??= new Set<string>();
  const origins = [...new Set([...network.edges.values()].map(e => e.to))].map(id => network.stops.get(id)!);
  const destinations = [...new Set([...network.edges.values()].filter(e => e.leg.mode === "transit").map(e => e.from))].map(id => network.stops.get(id)!);
  const pairs = origins.flatMap(a => destinations.filter(b => a.id !== b.id && haversineKm(a, b) > .001
    && haversineKm(a, b) / MAX_CYCLING_SPEED_KMH * 60 <= options.maxIntermediateMinutes).map(b => [a, b] as const))
    .sort(([a, b], [c, d]) => haversineKm(a, b) - haversineKm(c, d));
  for (const [a, b] of pairs) {
    const key = cyclingKey(a, b);
    if (attempts.size >= 4) break;
    if (attempts.has(key) || network.cycling!.has(key)) continue;
    attempts.add(key); progress(`Checking a cycling transfer between ${a.name} and ${b.name}…`);
    await cyclingClient.route(a, b);
  }
}
async function refreshRoads(session: SearchSession, extended: boolean, publish: SearchUpdate, progress: Progress) {
  refresh(session, extended, publish);
  await prepareObservedCycling(session, progress);
  if (extended) await prepareWaypointTransfers(session, progress);
  refresh(session, extended, publish);
}
function startCyclingComparison(session: SearchSession, publish: SearchUpdate, fetcher?: typeof fetch, gapMs?: number) {
  if (!session.cyclingClient) return;
  const points = [session.origin, ...session.waypoints ?? [], session.destination];
  // One separate serial stream keeps a long bicycle-only route from blocking
  // short station access. Transit and cycling cards publish independently.
  const client = new CyclingClient(session.client.signal, fetcher, gapMs, !fetcher);
  session.comparisonClient = client;
  session.cyclingTask = (async () => {
    const routes = [];
    for (let i = 1; i < points.length; i++) {
      const route = await client.route(points[i - 1], points[i]);
      if (route) { routes.push(route); session.network.cycling!.set(cyclingKey(points[i - 1], points[i]), route); }
    }
    session.cyclingComparison = routes.length === points.length - 1 ? {
      distanceKm: routes.reduce((sum, r) => sum + r.distanceKm, 0), minutes: routes.reduce((sum, r) => sum + r.minutes, 0),
      arrival: new Date(session.start.getTime() + routes.reduce((sum, r) => sum + r.minutes, 0) * 60_000), routes,
    } : null;
    session.cyclingStatus = session.cyclingComparison ? "ready" : "unavailable";
    if (!session.client.signal.aborted) publish({ ...session });
  })().catch(() => { session.cyclingStatus = "unavailable"; });
}
function refresh(session: SearchSession, extended: boolean, publish: SearchUpdate) {
  if (session.waypoints?.length) {
    const points = [session.origin, ...session.waypoints, session.destination];
    session.baseline = solveWaypoints(session.network, points, session.start, session.options, "baseline");
    if (extended) {
      session.extended = solveWaypoints(session.network, points, session.start, session.options, "extended");
      session.extended.journeys = [...new Map([...session.baseline.journeys, ...session.extended.journeys].map(j => [j.id, j])).values()];
    }
    publish({ ...session });
    return;
  }
  if (extended) {
    const compared = compareModels(session.network, session.origin, session.destination, session.start, session.options);
    session.baseline = compared.baseline; session.extended = compared.extended;
  } else session.baseline = solve(session.network, session.origin, session.destination, session.start, session.options, "baseline");
  publish({ ...session });
}
// Dependency injection keeps the actual async acquisition flow testable without live HTTP.
export async function plan(from: string | Place, to: string | Place, mode: ModelMode, options: Options,
  signal: AbortSignal, progress: Progress, publish: SearchUpdate = () => {},
  dependencies: { fetcher?: typeof fetch; start?: Date; gapMs?: number; waypoints?: (string | Place)[];
    cyclingClient?: CyclingClient | null; cyclingFetcher?: typeof fetch } = {}): Promise<SearchSession> {
  validateOptions(options);
  if ((dependencies.waypoints?.length ?? 0) > MAX_WAYPOINTS) throw new Error(`Choose up to ${MAX_WAYPOINTS} intermediate stops.`);
  const start = dependencies.start ?? new Date();
  progress("Finding both places…");
  const resolve = (value: string | Place) => typeof value === "string" ? geocode(value, signal, dependencies.fetcher) : value;
  const [origin, destination, ...waypoints] = await Promise.all([resolve(from), resolve(to), ...(dependencies.waypoints ?? []).map(resolve)]);
  signal.throwIfAborted();
  const client = new TimetableClient(signal, dependencies.gapMs ?? 400, dependencies.fetcher), network = emptyNetwork();
  const cyclingClient = dependencies.cyclingClient === null ? undefined : dependencies.cyclingClient ?? new CyclingClient(signal, dependencies.cyclingFetcher, dependencies.gapMs, !dependencies.cyclingFetcher);
  if (cyclingClient) network.cycling = cyclingClient.routes;
  const session: SearchSession = { origin, destination, start, options: { ...options }, network, client,
    originStations: [], destinationStations: [], baseline: solve(network, origin, destination, start, options, "baseline"), extended: null, waypoints,
    cyclingClient, cyclingStatus: cyclingClient ? "loading" : undefined };
  // Show the cycling-only reference as soon as the places resolve, including
  // while stop/timetable requests are pending or ultimately fail.
  publish({ ...session });
  startCyclingComparison(session, publish, dependencies.cyclingFetcher, dependencies.gapMs);
  if (waypoints.length) return planWaypointStages(session, mode, progress, publish);
  session.originStations = await roadCandidates(session, origin, Math.min(options.maxAccessMinutes, options.maxBikeMinutes), "access", progress);
  publish({ ...session });
  session.destinationStations = await roadCandidates(session, destination, Math.min(options.maxEgressMinutes, options.maxBikeMinutes), "egress", progress);
  publish({ ...session });
  if (!session.originStations.length || !session.destinationStations.length) throw new Error(stationAccessError(session));
  client.beginPhase();
  const queried = new Set<string>();
  const queryPairs = async (limit = SEARCH_LIMITS.baselinePairs) => {
    for (const s of [...session.originStations, ...session.destinationStations]) network.stops.set(s.id, s);
    const pairs = selectStationPairs(session.originStations, session.destinationStations, options.maxBikeMinutes, queried, limit);
    for (const [a, b] of pairs) {
      progress(session.baseline.journeys.length ? "Your first options are ready. Checking a few alternatives…" : `Finding connections from ${a.name} to ${b.name}…`);
      queried.add(`${a.id}:${b.id}`);
      await connections(network, client, a, b, new Date(start.getTime() + (a.bikeMinutes + options.boardingMinutes) * 60_000));
      signal.throwIfAborted();
      await refreshRoads(session, mode === "extended", publish, progress);
    }
  };
  await queryPairs();
  if (cyclingClient && queried.size < SEARCH_LIMITS.baselinePairs) {
    session.originStations = await roadCandidates(session, origin, Math.min(options.maxAccessMinutes, options.maxBikeMinutes), "access", progress, false, true);
    session.destinationStations = await roadCandidates(session, destination, Math.min(options.maxEgressMinutes, options.maxBikeMinutes), "egress", progress, false, true);
    await queryPairs(SEARCH_LIMITS.baselinePairs - queried.size);
  }
  if (!session.baseline.journeys.length && !session.extended?.journeys.length && !client.failures) {
    // Expensive catchment discovery is a fallback, not a prerequisite for easy trips.
    session.originStations = await roadCandidates(session, origin, Math.min(options.maxAccessMinutes, options.maxBikeMinutes), "access", progress, true);
    session.destinationStations = await roadCandidates(session, destination, Math.min(options.maxEgressMinutes, options.maxBikeMinutes), "egress", progress, true);
    await queryPairs();
  }
  if (mode === "extended") return extend(session, progress, publish);
  await session.cyclingTask;
  refresh(session, false, publish);
  return { ...session };
}

export async function extend(session: SearchSession, progress: Progress, publish: SearchUpdate = () => {}): Promise<SearchSession> {
  if (session.extendedComplete) return session;
  if (session.waypoints?.length) {
    session.cyclingClient?.beginPhase();
    await prepareWaypointTransfers(session, progress);
    session.extendedComplete = true;
    refresh(session, true, publish);
    return { ...session };
  }
  refresh(session, true, publish);
  const { network, client, options: o, origin, destination, start } = session;
  client.beginPhase();
  session.cyclingClient?.beginPhase();
  if (o.maxBoardings >= 2 && o.maxIntermediateMinutes > 0) {
    // Departure-board seeds let Extended find opportunities even when no complete
    // baseline connection was returned. They do not depend on baseline success.
    for (const station of session.originStations.slice(0, SEARCH_LIMITS.stationboards)) {
      progress(`Exploring services from ${station.name}…`);
      const dt = swissDateParts(new Date(start.getTime() + (station.bikeMinutes + o.boardingMinutes) * 60_000));
      const data = await client.get<{ stationboard?: BoardJourney[] }>("stationboard", new URLSearchParams({
        id: station.id, datetime: `${dt.date} ${dt.time}`, limit: "6",
      }));
      client.rejectedSections += addStationboard(network, data?.stationboard ?? []);
      await refreshRoads(session, true, publish, progress);
    }
    const reach = solve(network, origin, destination, start, o, "baseline");
    const exits = reach.reachable.filter(l => l.boardings > 0 && l.boardings < o.maxBoardings && !l.needsTransit)
      .sort((a, b) => haversineKm(network.stops.get(a.stop)!, destination) - haversineKm(network.stops.get(b.stop)!, destination)
        || a.time - b.time || a.bike - b.bike);
    const stopIds = [...new Set(exits.map(l => l.stop))].slice(0, SEARCH_LIMITS.transferStops);
    let queries = 0;
    for (const id of stopIds) {
      const from = network.stops.get(id)!;
      progress(`Checking a cycling transfer near ${from.name}…`);
      const candidates = [...await nearby(from, client), ...MAJOR_STATIONS.map(s => ({ ...s, kind: "train" }))];
      const neighbors = [...new Map(candidates.map(s => [s.id, s])).values()]
        .filter(s => s.id !== id && haversineKm(from, s) > .001 && (session.cyclingClient
          ? haversineKm(from, s) / MAX_CYCLING_SPEED_KMH * 60 : cyclingMinutes(haversineKm(from, s))) <= o.maxIntermediateMinutes)
        .sort((a, b) => haversineKm(a, destination) - haversineKm(b, destination) || a.id.localeCompare(b.id))
        .slice(0, SEARCH_LIMITS.neighborsPerTransfer);
      for (const neighbor of neighbors) {
        const route = session.cyclingClient ? await session.cyclingClient.route(from, neighbor) : null;
        const minutes = session.cyclingClient ? route?.minutes ?? Infinity : cyclingMinutes(haversineKm(from, neighbor));
        if (minutes > o.maxIntermediateMinutes) continue;
        // Do not discard slower labels with less cycling or fewer boardings.
        const feasibleLabels = exits.filter(l => l.stop === id && l.bike + minutes <= o.maxBikeMinutes);
        if (!feasibleLabels.length) continue;
        network.stops.set(neighbor.id, neighbor);
        const ready = new Date(Math.min(...feasibleLabels.map(l => l.time)) + (minutes + o.boardingMinutes) * 60_000);
        for (const end of session.destinationStations.slice(0, 1)) {
          if (queries >= SEARCH_LIMITS.suffixQueries) break;
          queries++;
          await connections(network, client, neighbor, end, ready);
          await refreshRoads(session, true, publish, progress);
        }
      }
    }
  }
  client.signal.throwIfAborted();
  progress("Selecting useful trade-offs in both models…");
  // Refresh BOTH solutions on the identical expanded graph. No data/mode confound.
  session.extendedComplete = true;
  await session.cyclingTask;
  refresh(session, true, publish);
  return { ...session };
}

async function planWaypointStages(session: SearchSession, mode: ModelMode, progress: Progress, publish: SearchUpdate): Promise<SearchSession> {
  const { origin, destination, waypoints = [], network, client, options, start } = session;
  const points = [origin, ...waypoints, destination], candidates: Station[][] = [];
  for (let index = 0; index < points.length; index++) {
    const limit = index === 0 ? options.maxAccessMinutes : index === points.length - 1 ? options.maxEgressMinutes
      : Math.max(options.maxAccessMinutes, options.maxEgressMinutes);
    const stops = await roadCandidates(session, points[index], Math.min(limit, options.maxBikeMinutes),
      index === 0 ? "access" : index === points.length - 1 ? "egress" : "both", progress);
    client.signal.throwIfAborted();
    candidates.push(stops);
    for (const stop of stops) network.stops.set(stop.id, stop);
    if (index === 0) session.originStations = stops;
    if (index === points.length - 1) session.destinationStations = stops;
    refresh(session, mode === "extended", publish);
  }
  await session.cyclingTask;
  client.beginPhase();
  // Two station pairs per stage share the SAME request/time budget. Query an
  // onward stage from an actually reachable waypoint time, never from the
  // original departure or an independently optimized route.
  for (let stage = 0; stage < points.length - 1; stage++) {
    const from = candidates[stage].map(s => atEndpoint(s, points[stage], network)).filter(s => s.bikeMinutes <= options.maxAccessMinutes);
    const to = candidates[stage + 1].map(s => atEndpoint(s, points[stage + 1], network, "egress")).filter(s => s.bikeMinutes <= options.maxEgressMinutes);
    const pairs = selectStationPairs(from, to, options.maxBikeMinutes, new Set(), 2);
    for (const [a, b] of pairs) {
      const reachable = solveWaypoints(network, points, start, options, mode).stageArrivals[stage];
      if (!Number.isFinite(reachable)) break;
      progress(`Checking stage ${stage + 1} of ${points.length - 1}: ${points[stage].label} → ${points[stage + 1].label}…`);
      await connections(network, client, a, b, new Date(reachable + (a.bikeMinutes + options.boardingMinutes) * 60_000));
      client.signal.throwIfAborted();
      await refreshRoads(session, mode === "extended", publish, progress);
    }
  }
  session.extendedComplete = mode === "extended";
  refresh(session, mode === "extended", publish);
  return { ...session };
}
