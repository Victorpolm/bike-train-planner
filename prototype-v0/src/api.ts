import { hillSearch, routeClimb } from "./hills.ts";
import { SearchDeadline, SEARCH_DEADLINE_MS, TERRAIN_SEARCH_DEADLINE_MS } from "./searchDeadline.ts";
import { NationalTimetableClient } from "./nationalTimetableClient.ts";
import { cyclingMinutes, haversineKm, type CyclingComparison, type Place, type Point, type Station, type TransitLeg } from "./routing.ts";
import { maxCyclingSpeed } from "./cyclingPace.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { cyclingKey, MAX_ENDPOINT_GAP_METRES, samePlace } from "./cycling.ts";
import { MAJOR_STATIONS } from "./majorStations.ts";
import { type TransportSection } from "./itinerary.ts";
import { addSections, addStationboard, readStop, type BoardJourney } from "./timetable.ts";
import { atEndpoint, compareModels, cyclingTransferLimit, endpointCyclingLimit, emptyNetwork, solve, validateOptions,
  type ModelMode, type Network, type Options, type Solution, type Stop } from "./model.ts";

import { TimetableClient, swissDateParts } from "./timetableClient.ts";
import { SEARCH_LIMITS } from "./searchLimits.ts";
import { geocode, MAX_WAYPOINTS, type TransportLocation } from "./places.ts";
import { solveWaypoints } from "./waypoints.ts";
import { BICYCLE_SCOPES, bicycleLegAllowed, type BicycleEvidence } from "./bicyclePermission.ts";
import { OjpClient, addOjpConnections, applyBicycleEvidence } from "./ojpClient.ts";
import { searchSections, type SearchTimetableResponse } from "./searchTimetable.ts";
export { geocode } from "./places.ts";

export type Progress = (message: string) => void;
type ConnectionResponse = { connections?: { sections?: TransportSection[] }[]; errors?: unknown[] };

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
  add(candidates[0]);
  add(candidates.find(s => s.kind === "bus" || s.kind === "tram"));
  candidates.filter(s => s.kind === "train").slice(0, 2).forEach(add);
  for (const band of candidateBands(maxMinutes)) add(candidates.find(s => s.bikeMinutes > band - 20 && s.bikeMinutes <= band && !chosen.has(s.id)));
  candidates.forEach(add);
  return [...chosen.values()].sort((a, b) => a.bikeMinutes - b.bikeMinutes || a.id.localeCompare(b.id));
}

// Reserve queries for rail access: several adjacent bus stops must not consume
// every query before a farther, feasible railway station is tried.
export function selectStationPairs(origins: Station[], destinations: Station[], maxBikeMinutes: number,
  queried: ReadonlySet<string> = new Set(), limit = SEARCH_LIMITS.baselinePairs, preferClimbing = false): (readonly [Station, Station])[] {
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
  if (preferClimbing) {
    const climb = ([a, b]: readonly [Station, Station]) => {
      const aa = routeClimb(a.cyclingRoute, a.bikeMinutes), bb = routeClimb(b.cyclingRoute, b.bikeMinutes);
      return aa.unknown || bb.unknown ? Infinity : aa.ascent + bb.ascent;
    };
    add([...pairs].sort((a, b) => (climb(a) === climb(b) ? 0 : climb(a) - climb(b)))[0]);
  }
  // Give local transport its own query before the railway candidates.
  const local = (s: Station) => s.kind === "bus" || s.kind === "tram";
  add(pairs.find(([a, b]) => local(a) && local(b)) ?? pairs.find(([a, b]) => local(a) || local(b)));
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
  // A nearby rail hub is not evidence that local bus/tram stops are irrelevant.
  // An exact selected stop with a zero access budget needs no neighborhood query.
  if (!point.stopId || maxMinutes > 0 || expand) {
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
  return selectStations(stops, point, maxMinutes, expand ? SEARCH_LIMITS.stopsPerSide * 2 : SEARCH_LIMITS.stopsPerSide);
}

async function connections(network: Network, client: TimetableClient, from: Stop, to: Stop, ready: Date) {
  if (from.id === to.id) return;
  if (client.national) await client.timed(() => client.national!.add(network, from, to, ready));
  if (client.ojp) {
    const result = await client.timed(() => client.ojp!.connections(from, to, ready, calls => client.claimRequests(calls)));
    if (result) { addOjpConnections(network, result); return; }
  }
  const dt = swissDateParts(ready);
  if (client.publicTimetable) {
    const [year, month, day] = dt.date.split("-");
    const data = await client.get<SearchTimetableResponse>("route", new URLSearchParams({
      from: from.id, to: to.id, date: `${month}/${day}/${year}`, time: dt.time,
      num: String(SEARCH_LIMITS.connectionsPerPair), show_attributes: "1", show_coordinates: "1",
    }));
    if (data) for (const sections of searchSections(data)) client.rejectedSections += addSections(network, sections);
    return;
  }
  // Omitting transportations allows the provider's train, bus, tram and other PT modes in BOTH models.
  const data = await client.get<ConnectionResponse>("connections", new URLSearchParams({
    from: from.id, to: to.id, date: dt.date, time: dt.time, limit: String(SEARCH_LIMITS.connectionsPerPair),
  }));
  for (const connection of data?.connections ?? []) client.rejectedSections += addSections(network, connection.sections);
}

export type SearchSession = {
  requestSignal?: AbortSignal;
  searchElapsedMs?: number;
  searchIncomplete?: boolean;
  origin: Place; destination: Place; start: Date; options: Options; network: Network; client: TimetableClient;
  originStations: Station[]; destinationStations: Station[]; baseline: Solution; extended: Solution | null; extendedComplete?: boolean;
  confirmed?: { baseline: Solution; extended: Solution | null };
  allTransit?: { baseline: Solution; extended: Solution | null };
  waypoints?: Place[];
  waypointStations?: Station[][];
  cyclingClient?: CyclingClient;
  comparisonClient?: CyclingClient;
  cyclingComparison?: CyclingComparison | null;
  cyclingStatus?: "loading" | "ready" | "unavailable";
  cyclingTask?: Promise<void>;
  transferCyclingAttempts?: Set<string>;
  cyclingCandidatePools?: Map<string, Station[]>;
};
export function searchWarnings(session: SearchSession): string[] {
  const warnings = [...session.client.warnings, ...session.client.national?.warnings ?? [], ...session.client.ojp?.warnings ?? [], ...session.cyclingClient?.warnings ?? [],
    ...[...session.comparisonClient?.warnings ?? []].map(w => `Cycling-only comparison — ${w}`)];
  if (session.client.rejectedSections) warnings.push("Some sections lacked usable stops or times and were excluded.");
  if ([session, session.confirmed, session.allTransit].some(s => s?.baseline.limited || s?.extended?.limited)) warnings.push("The routing search reached its label limit; some alternatives may be missing.");
  return [...new Set(warnings)];
}

export type SearchUpdate = (session: SearchSession) => void;
function stationAccessError(session: SearchSession) {
  if (session.options.cyclingPosition === "start-only" && !session.destinationStations.length)
    return "Cycling is only at the beginning. Choose a public-transport stop as your destination; walking routes from stops to addresses are not yet supported.";
  if (session.options.cyclingPosition === "end-only" && !session.originStations.length)
    return "Cycling is only at the end. Choose a public-transport stop as your starting point; walking routes from addresses to stops are not yet supported.";
  const kinds = session.cyclingClient?.failureKinds;
  if (session.client.failures) return "The timetable service could not finish finding nearby stops. Please try again.";
  if (kinds?.has("service")) return "The cycling route service could not complete the station-access checks. Please try again; your points do not need to be exactly on a path.";
  if (kinds?.has("limit")) return "The search reached its limit while checking paths to nearby stops. Try again or choose a closer stop.";
  if (kinds?.has("off-network") || kinds?.has("no-route")) {
    const places = [!session.originStations.length && session.origin.label, !session.destinationStations.length && session.destination.label].filter(Boolean).join(" and ");
    return `No usable station-access path was found for ${places}. We allow up to ${MAX_ENDPOINT_GAP_METRES} m between a selected point and the routed path. Try a nearby road, path or entrance.`;
  }
  return session.options.maxBikeMinutes < session.options.horizonMinutes
    ? `No checked stop fits the cycling limit near ${[!session.originStations.length && session.origin.label, !session.destinationStations.length && session.destination.label].filter(Boolean).join(" and ")}. Try a larger cycling allowance in Preferences or select a nearby public-transport stop.`
    : "No usable stop was found in this search. Try a nearby stop.";
}
async function roadCandidates(session: SearchSession, point: Place, maxMinutes: number, direction: "access" | "egress" | "both",
  progress: Progress, expand = false, complete = false): Promise<Station[]> {
  const pools = session.cyclingCandidatePools ??= new Map<string, Station[]>(), key = `${point.lat},${point.lon}:${maxMinutes}`;
  const candidates = !expand && pools.has(key) ? pools.get(key)!
    : await findCandidateStations(point, maxMinutes * (session.cyclingClient ? maxCyclingSpeed(session.options.cyclingPace) / 15 : 1), session.client, progress, expand);
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
  // A short straight-line candidate can require a long road detour. Try the
  // expanded local pool before treating the first four checks as no access.
  if (!result.length && !expand && maxMinutes > 0 && !session.client.failures
    && !session.cyclingClient.failureKinds.has("limit") && !session.cyclingClient.failureKinds.has("service"))
    return roadCandidates(session, point, maxMinutes, direction, progress, true);
  return result.sort((a, b) => a.bikeMinutes - b.bikeMinutes);
}

async function prepareObservedCycling(session: SearchSession, progress: Progress) {
  if (!session.cyclingClient) return;
  const { network, cyclingClient, options } = session;
  const usable = [...network.edges.values()].filter(e => bicycleLegAllowed(e.leg, options.busPreference, options.bicycleScope ?? "all-transit"));
  const boarding = new Set(usable.filter(e => e.leg.mode === "transit").map(e => e.from));
  const arrival = new Set(usable.map(e => e.to));
  const points = [session.origin, ...session.waypoints ?? [], session.destination];
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    for (const direction of ["access", "egress"] as const) {
      if (index === 0 && direction === "egress" || index === points.length - 1 && direction === "access") continue;
      const limit = endpointCyclingLimit(options, direction);
      let candidates = [...network.stops.values()].filter(s => (direction === "access" ? boarding : arrival).has(s.id)
        && (samePlace(s, point) || haversineKm(s, point) / maxCyclingSpeed(session.options.cyclingPace) * 60 <= limit))
        .sort((a, b) => haversineKm(a, point) - haversineKm(b, point));
      const selected = new Map<string, Stop>();
      const add = (stop?: Stop) => { if (stop && selected.size < 4) selected.set(stop.id, stop); };
      // A train exit can be farther from the destination than four bus stops,
      // yet avoid a whole boarding. Check both arrival and boarding objectives.
      if (direction === "egress" && index === points.length - 1 && !session.waypoints?.length) {
        const allowed = new Set(candidates.map(s => s.id));
        const labels = (options.bicycleScope ? [session.baseline, session.extended] : [session.allTransit?.baseline, session.allTransit?.extended, session.confirmed?.baseline])
          .flatMap(solution => solution?.reachable ?? [])
          .filter(l => l.boardings > 0 && !l.needsTransit && allowed.has(l.stop)
            && l.bike + haversineKm(network.stops.get(l.stop)!, point) / maxCyclingSpeed(session.options.cyclingPace) * 60 <= options.maxBikeMinutes);
        const finish = (l: typeof labels[number]) => l.time + haversineKm(network.stops.get(l.stop)!, point) / maxCyclingSpeed(session.options.cyclingPace) * 3_600_000;
        // Refine unchecked exits instead of repeatedly choosing the same four.
        // Lower bounds prioritize checks; final ranking uses routed cycling time.
        const unchecked = labels.filter(l => {
          const stop = network.stops.get(l.stop)!;
          return !samePlace(stop, point) && !network.cycling!.has(cyclingKey(stop, point));
        });
        if (hillSearch(options)) add(network.stops.get([...unchecked].sort((a, b) => a.climb.unknown - b.climb.unknown
          || a.climb.ascent - b.climb.ascent || finish(a) - finish(b))[0]?.stop ?? ""));
        add(network.stops.get([...unchecked].sort((a, b) => finish(a) - finish(b) || a.boardings - b.boardings)[0]?.stop ?? ""));
        add(network.stops.get([...unchecked].sort((a, b) => a.boardings - b.boardings || finish(a) - finish(b))[0]?.stop ?? ""));
        const reachable = new Set(labels.map(l => l.stop));
        candidates = candidates.filter(s => reachable.has(s.id));
      }
      add(candidates[0]);
      const rail = new Set(usable.filter(e => /^(?:IC|ICN|IR|RE|R|S|TGV|EC|ICE|RJ|RJX|NJ|PE|EXT)\d*$/i.test(e.leg.category ?? ""))
        .flatMap(e => [e.from, e.to]));
      candidates.filter(s => s.kind === "train" || rail.has(s.id)).slice(0, 2).forEach(add);
      candidates.forEach(add);
      const stops = [...selected.values()];
      for (const stop of stops) {
        const from = direction === "access" ? point : stop, to = direction === "access" ? stop : point;
        if (network.cycling!.has(cyclingKey(from, to)) || samePlace(from, to)) continue;
        progress(`Checking the cycling link at ${stop.name}…`);
        await cyclingClient.route(from, to);
      }
    }
  }
}
// End-to-end queries can omit an earlier train when its onward bus is hours
// later. Probe rail exits at the original ready time, before routing long rides.
function railExitCandidates(session: SearchSession): Stop[] {
  const { network, destination, origin, options } = session;
  const ids = new Set([...network.edges.values()].filter(e => /^(?:IC|ICN|IR|RE|R|S|TGV|EC|ICE|RJ|RJX|NJ|PE|EXT)\d*$/i.test(e.leg.category ?? ""))
    .flatMap(e => [e.from, e.to]));
  const limit = endpointCyclingLimit(options, "egress");
  const stops = [...network.stops.values()].filter(s => ids.has(s.id) && !samePlace(s, origin)
    && haversineKm(s, destination) < haversineKm(origin, destination)
    && haversineKm(s, destination) / maxCyclingSpeed(session.options.cyclingPace) * 60 <= limit)
    .sort((a, b) => haversineKm(a, destination) - haversineKm(b, destination));
  const major = new Set(MAJOR_STATIONS.map(s => s.id));
  return [...new Map([stops.find(s => major.has(s.id)), ...stops].filter((s): s is Stop => !!s).map(s => [s.id, s])).values()];
}

async function prepareWaypointTransfers(session: SearchSession, progress: Progress) {
  if (!session.cyclingClient || !session.waypoints?.length || cyclingTransferLimit(session.options, "extended") === 0 || session.options.maxIntermediateMinutes <= 0) return;
  const { network, options, cyclingClient } = session;
  const attempts = session.transferCyclingAttempts ??= new Set<string>();
  const usable = [...network.edges.values()].filter(e => bicycleLegAllowed(e.leg, options.busPreference, "all-transit"));
  const origins = [...new Set(usable.map(e => e.to))].map(id => network.stops.get(id)!);
  const destinations = [...new Set(usable.filter(e => e.leg.mode === "transit").map(e => e.from))].map(id => network.stops.get(id)!);
  const pairs = origins.flatMap(a => destinations.filter(b => a.id !== b.id && haversineKm(a, b) > .001
    && haversineKm(a, b) / maxCyclingSpeed(session.options.cyclingPace) * 60 <= options.maxIntermediateMinutes).map(b => [a, b] as const))
    .sort(([a, b], [c, d]) => haversineKm(a, b) - haversineKm(c, d));
  for (const [a, b] of pairs) {
    const key = cyclingKey(a, b);
    if (attempts.size >= 4 * cyclingTransferLimit(options, "extended")) break;
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
  const client = new CyclingClient(session.client.signal, fetcher, gapMs, !fetcher, undefined, session.options.cyclingPace, session.options.cyclingRoutePreference, undefined, session.options.hills);
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
  const run = (options: Options) => {
    if (session.waypoints?.length) {
      const points = [session.origin, ...session.waypoints, session.destination];
      const baseline = solveWaypoints(session.network, points, session.start, options, "baseline");
      const expanded = extended ? solveWaypoints(session.network, points, session.start, options, "extended") : null;
      if (expanded) {
        const one = cyclingTransferLimit(options, "extended") > 1
          ? solveWaypoints(session.network, points, session.start, { ...options, maxCyclingTransfers: 1 }, "extended") : null;
        expanded.journeys = [...new Map([...baseline.journeys, ...one?.journeys ?? [], ...expanded.journeys].map(j => [j.id, j])).values()];
        expanded.limited ||= one?.limited ?? false;
      }
      return { baseline, extended: expanded };
    }
    return extended ? compareModels(session.network, session.origin, session.destination, session.start, options)
      : { baseline: solve(session.network, session.origin, session.destination, session.start, options, "baseline"), extended: null };
  };
  // Separate label searches are essential: an uncertain path may dominate a
  // confirmed one in the permissive graph. Never derive strict results by filtering.
  const possible = run({ ...session.options, bicycleScope: "allow-uncertain" });
  session.confirmed = run({ ...session.options, bicycleScope: "confirmed" });
  session.allTransit = run({ ...session.options, bicycleScope: "all-transit" });
  const chosen = session.options.bicycleScope === "confirmed" ? session.confirmed : session.options.bicycleScope === "all-transit" ? session.allTransit : possible;
  session.baseline = chosen.baseline; session.extended = chosen.extended;
  publish({ ...session });
}
// Dependency injection keeps the actual async acquisition flow testable without live HTTP.
export function updateBicycleEvidence(session: SearchSession, leg: TransitLeg, evidence: BicycleEvidence, publish: SearchUpdate) {
  applyBicycleEvidence(session.network, leg, evidence);
  refresh(session, !!session.extended, publish);
}

async function planInternal(from: string | Place, to: string | Place, mode: ModelMode, options: Options,
  signal: AbortSignal, progress: Progress, publish: SearchUpdate = () => {},
  dependencies: { fetcher?: typeof fetch; start?: Date; gapMs?: number; waypoints?: (string | Place)[];
    cyclingClient?: CyclingClient | null; cyclingFetcher?: typeof fetch; ojpClient?: OjpClient | null; nationalClient?: NationalTimetableClient | null; publicTimetable?: boolean;
    previous?: SearchSession } = {}): Promise<SearchSession> {
  validateOptions(options);
  if ((dependencies.waypoints?.length ?? 0) > MAX_WAYPOINTS) throw new Error(`Choose up to ${MAX_WAYPOINTS} intermediate stops.`);
  const start = dependencies.start ?? new Date();
  progress("Finding both places…");
  const resolve = (value: string | Place) => typeof value === "string" ? geocode(value, signal, dependencies.fetcher) : value;
  const [origin, destination, ...waypoints] = await Promise.all([resolve(from), resolve(to), ...(dependencies.waypoints ?? []).map(resolve)]);
  signal.throwIfAborted();
  const client = dependencies.previous?.client.fork(signal) ?? new TimetableClient(signal, dependencies.gapMs ?? 400, dependencies.fetcher), network = emptyNetwork();
  client.publicTimetable = dependencies.previous?.client.publicTimetable ?? dependencies.publicTimetable ?? !dependencies.fetcher;
  if (!dependencies.previous) client.ojp = dependencies.ojpClient !== undefined ? dependencies.ojpClient
    : dependencies.fetcher ? null : await OjpClient.connect(signal);
  if (!dependencies.previous) client.national = dependencies.nationalClient !== undefined ? dependencies.nationalClient
    : dependencies.fetcher ? null : await NationalTimetableClient.connect(signal);
  const cyclingClient = dependencies.cyclingClient === null || dependencies.previous && !dependencies.previous.cyclingClient ? undefined
    : dependencies.previous?.cyclingClient?.fork(signal) ?? dependencies.cyclingClient ?? new CyclingClient(signal, dependencies.cyclingFetcher, dependencies.gapMs, !dependencies.cyclingFetcher, undefined, options.cyclingPace, options.cyclingRoutePreference, undefined, options.hills);
  if (cyclingClient) network.cycling = cyclingClient.routes;
  const session: SearchSession = { origin, destination, start, options: { ...options }, network, client,
    originStations: [], destinationStations: [], baseline: solve(network, origin, destination, start, options, "baseline"), extended: null, waypoints,
    cyclingClient, cyclingStatus: cyclingClient ? "loading" : undefined,
    cyclingCandidatePools: dependencies.previous?.cyclingCandidatePools ? new Map(dependencies.previous.cyclingCandidatePools) : undefined };
  // Show the cycling-only reference as soon as the places resolve, including
  // while stop/timetable requests are pending or ultimately fail.
  publish({ ...session });
  if (dependencies.previous?.cyclingComparison) {
    session.cyclingComparison = { ...dependencies.previous.cyclingComparison,
      arrival: new Date(+start + dependencies.previous.cyclingComparison.minutes * 60_000) };
    session.cyclingStatus = "ready";
  } else startCyclingComparison(session, publish, dependencies.cyclingFetcher, dependencies.gapMs);
  if (waypoints.length) return planWaypointStages(session, mode, progress, publish);
  // Stop discovery at one end can run while the other end's road/terrain
  // check is pending. Both clients retain their own serialized rate limits.
  await Promise.all([
    roadCandidates(session, origin, endpointCyclingLimit(options, "access"), "access", progress)
      .then(stops => { session.originStations = stops; publish({ ...session }); }),
    roadCandidates(session, destination, endpointCyclingLimit(options, "egress"), "egress", progress)
      .then(stops => { session.destinationStations = stops; publish({ ...session }); }),
  ]);
  if (!session.originStations.length || !session.destinationStations.length) {
    await session.cyclingTask;
    signal.throwIfAborted();
    if (!session.cyclingComparison || (options.cyclingPosition ?? "anywhere") !== "anywhere") throw new Error(stationAccessError(session));
    client.warnings.add(stationAccessError(session));
    refresh(session, mode === "extended", publish);
    return { ...session };
  }
  client.beginPhase();
  const queried = new Set<string>();
  let railExitsChecked = false, normalPairs = 0;
  const queryPairs = async (limit = SEARCH_LIMITS.baselinePairs) => {
    for (const s of [...session.originStations, ...session.destinationStations]) network.stops.set(s.id, s);
    const pairs = selectStationPairs(session.originStations, session.destinationStations, options.maxBikeMinutes, queried, limit, hillSearch(options));
    for (const [a, b] of pairs) {
      if (queried.has(`${a.id}:${b.id}`)) continue;
      progress(session.baseline.journeys.length ? "Your first options are ready. Checking a few alternatives…" : `Finding connections from ${a.name} to ${b.name}…`);
      queried.add(`${a.id}:${b.id}`);
      normalPairs++;
      await connections(network, client, a, b, new Date(start.getTime() + (a.bikeMinutes + options.boardingMinutes) * 60_000));
      signal.throwIfAborted();
      refresh(session, mode === "extended", publish);
      if (!railExitsChecked && mode !== "extended") {
        railExitsChecked = true;
        const exits = railExitCandidates(session).filter(s => !queried.has(`${a.id}:${s.id}`)).slice(0, SEARCH_LIMITS.railExitQueries);
        for (const exit of exits) {
          progress(`Checking earlier trains to ${exit.name} for a cycling finish…`);
          queried.add(`${a.id}:${exit.id}`);
          await connections(network, client, a, exit, new Date(start.getTime() + (a.bikeMinutes + options.boardingMinutes) * 60_000));
          if (cyclingClient) {
            progress(`Checking the cycling finish from ${exit.name}…`);
            await cyclingClient.route(network.stops.get(exit.id) ?? exit, destination);
          }
          refresh(session, false, publish);
        }
      }
      await refreshRoads(session, mode === "extended", publish, progress);
    }
  };
  // Give Extended its transfer-discovery work before ordinary alternative
  // pairs and rail exits spend the entire shared request/deadline allowance.
  await queryPairs(mode === "extended" || hillSearch(options) ? 1 : SEARCH_LIMITS.baselinePairs);
  if (hillSearch(options) && cyclingClient) {
    progress("Comparing station access and exits for less cycling ascent…");
    session.originStations = await roadCandidates(session, origin, endpointCyclingLimit(options, "access"), "access", progress, true, true);
    session.destinationStations = await roadCandidates(session, destination, endpointCyclingLimit(options, "egress"), "egress", progress, true, true);
    await queryPairs(Math.min(2, SEARCH_LIMITS.baselinePairs - normalPairs));
  }
  if (mode === "extended") return extendInternal(session, progress, publish);
  if (cyclingClient && normalPairs < SEARCH_LIMITS.baselinePairs) {
    // The hill search already expanded these pools. Reuse their checked roads.
    session.originStations = await roadCandidates(session, origin, endpointCyclingLimit(options, "access"), "access", progress, false, true);
    session.destinationStations = await roadCandidates(session, destination, endpointCyclingLimit(options, "egress"), "egress", progress, false, true);
    await queryPairs(SEARCH_LIMITS.baselinePairs - normalPairs);
  }
  await session.cyclingTask;
  const mixed = [...session.baseline.journeys, ...session.extended?.journeys ?? []];
  const slowerThanCycling = (options.cyclingPosition ?? "anywhere") === "anywhere" && session.cyclingComparison && mixed.every(j => j.totalMinutes > session.cyclingComparison!.minutes);
  if ((!mixed.length || slowerThanCycling) && !client.failures) {
    // Finding an overnight wait is not enough to stop looking for useful local PT.
    session.originStations = await roadCandidates(session, origin, endpointCyclingLimit(options, "access"), "access", progress, true);
    session.destinationStations = await roadCandidates(session, destination, endpointCyclingLimit(options, "egress"), "egress", progress, true);
    await queryPairs();
  }
  await session.cyclingTask;
  refresh(session, false, publish);
  return { ...session };
}

async function seedDepartures(session: SearchSession, station: Stop, ready: Date) {
  const dt = swissDateParts(ready);
  const data = await session.client.get<{ stationboard?: BoardJourney[] }>("stationboard", new URLSearchParams({
    id: station.id, datetime: `${dt.date} ${dt.time}`, limit: "6",
  }));
  session.client.rejectedSections += addStationboard(session.network, data?.stationboard ?? []);
}

async function extendInternal(session: SearchSession, progress: Progress, publish: SearchUpdate = () => {}): Promise<SearchSession> {
  if (session.extendedComplete) return session;
  if (session.waypoints?.length && !session.waypointStations)
    return planWaypointStages(session, "extended", progress, publish);
  refresh(session, true, publish);
  const { network, client, options: o, origin, destination, start } = session;
  const transferLimit = cyclingTransferLimit(o, "extended");
  client.beginPhase();
  session.cyclingClient?.beginPhase();
  if (transferLimit > 0 && o.maxIntermediateMinutes > 0) {
    // Seed real services even when no complete Baseline connection exists.
    for (const station of session.originStations.slice(0, SEARCH_LIMITS.stationboards)) {
      if ([...network.edges.values()].some(e => e.from === station.id && e.leg.mode === "transit"
        && bicycleLegAllowed(e.leg, o.busPreference, o.bicycleScope) && e.leg.departure && +e.leg.departure >= +start)) continue;
      progress(`Exploring services from ${station.name}…`);
      await seedDepartures(session, station, new Date(+start + (station.bikeMinutes + o.boardingMinutes) * 60_000));
      await refreshRoads(session, true, publish, progress);
    }
    const points = [origin, ...session.waypoints ?? [], destination];
    // Each round starts from states that have used exactly that many transfers.
    // Counts, request quotas, cycling budgets and the search deadline never reset.
    for (let round = 0; round < transferLimit; round++) {
      const exits = BICYCLE_SCOPES.flatMap(bicycleScope => {
        const options = { ...o, bicycleScope, maxCyclingTransfers: round };
        if (session.waypoints?.length) return solveWaypoints(network, points, start, options, "extended").transferExits;
        return solve(network, origin, destination, start, options, "extended").reachable
          .filter(l => !l.needsTransit).map(l => ({ ...l, stage: 0 }));
      }).filter(l => l.middle === round && l.boardings > 0 && l.boardings < o.maxBoardings
        && !samePlace(network.stops.get(l.stop)!, points[l.stage + 1]))
        .sort((a, b) => haversineKm(network.stops.get(a.stop)!, points[a.stage + 1])
          - haversineKm(network.stops.get(b.stop)!, points[b.stage + 1]) || a.time - b.time || a.bike - b.bike);
      const groups = [...new Map(exits.map(l => [`${l.stage}|${l.stop}`, l])).values()].slice(0, SEARCH_LIMITS.transferStops);
      let queries = 0;
      for (const exit of groups) {
        const from = network.stops.get(exit.stop)!, goal = points[exit.stage + 1];
        progress(`Checking cycling connection ${round + 1} of ${transferLimit} near ${from.name}…`);
        const candidates = [...await nearby(from, client), ...network.stops.values(), ...MAJOR_STATIONS.map(s => ({ ...s, kind: "train" }))];
        const neighbors = [...new Map(candidates.map(s => [s.id, s])).values()]
          .filter(s => s.id !== from.id && !samePlace(s, goal) && haversineKm(from, s) > .001 && (session.cyclingClient
            ? haversineKm(from, s) / maxCyclingSpeed(o.cyclingPace) * 60 : cyclingMinutes(haversineKm(from, s))) <= o.maxIntermediateMinutes)
          .sort((a, b) => haversineKm(a, goal) - haversineKm(b, goal) || a.id.localeCompare(b.id))
          .slice(0, SEARCH_LIMITS.neighborsPerTransfer);
        for (const neighbor of neighbors) {
          const route = session.cyclingClient ? await session.cyclingClient.route(from, neighbor) : null;
          const minutes = session.cyclingClient ? route?.minutes ?? Infinity : cyclingMinutes(haversineKm(from, neighbor));
          if (minutes <= 0 || minutes > o.maxIntermediateMinutes) continue;
          const feasible = exits.filter(l => l.stop === from.id && l.stage === exit.stage && l.bike + minutes <= o.maxBikeMinutes);
          if (!feasible.length) continue;
          network.stops.set(neighbor.id, neighbor);
          const ready = new Date(Math.min(...feasible.map(l => l.time)) + (minutes + o.boardingMinutes) * 60_000);
          const ends = session.waypointStations?.[exit.stage + 1] ?? session.destinationStations;
          for (const end of ends.slice(0, 1)) {
            if (queries >= SEARCH_LIMITS.suffixQueries) break;
            queries++;
            await connections(network, client, neighbor, end, ready);
          }
          // A second cycling transfer can be essential: the first onward query
          // may return nothing. Seed the next ride instead of stopping there.
          if (round + 1 < transferLimit && feasible.some(l => l.boardings + 2 <= o.maxBoardings))
            await seedDepartures(session, neighbor, ready);
          await refreshRoads(session, true, publish, progress);
        }
      }
      if (session.waypoints?.length) await queryWaypointStages(session, "extended", progress, publish);
    }
  }
  client.signal.throwIfAborted();
  progress("Selecting useful trade-offs in both models…");
  session.extendedComplete = true;
  await session.cyclingTask;
  refresh(session, true, publish);
  return { ...session };
}

async function planWaypointStages(session: SearchSession, mode: ModelMode, progress: Progress, publish: SearchUpdate): Promise<SearchSession> {
  const { origin, destination, waypoints = [], network, client, options, start } = session;
  const points = [origin, ...waypoints, destination], candidates: Station[][] = [];
  for (let index = 0; index < points.length; index++) {
    const limit = index === 0 ? endpointCyclingLimit(options, "access") : index === points.length - 1 ? endpointCyclingLimit(options, "egress")
      : Math.max(endpointCyclingLimit(options, "access"), endpointCyclingLimit(options, "egress"));
    const stops = await roadCandidates(session, points[index], Math.min(limit, options.maxBikeMinutes),
      index === 0 ? "access" : index === points.length - 1 ? "egress" : "both", progress);
    client.signal.throwIfAborted();
    candidates.push(stops);
    for (const stop of stops) network.stops.set(stop.id, stop);
    if (index === 0) session.originStations = stops;
    if (index === points.length - 1) session.destinationStations = stops;
    refresh(session, mode === "extended", publish);
  }
  session.waypointStations = candidates;
  await session.cyclingTask;
  client.beginPhase();
  await queryWaypointStages(session, mode, progress, publish);
  if (mode === "extended") return extendInternal(session, progress, publish);
  refresh(session, false, publish);
  return { ...session };
}

async function queryWaypointStages(session: SearchSession, mode: ModelMode, progress: Progress, publish: SearchUpdate) {
  const { origin, destination, network, client, options, start } = session;
  const points = [origin, ...session.waypoints ?? [], destination], candidates = session.waypointStations!;
  // Two station pairs per stage share the SAME request/time budget. Query an
  // onward stage from an actually reachable waypoint time, never from the
  // original departure or an independently optimized route.
  for (let stage = 0; stage < points.length - 1; stage++) {
    const from = (candidates[stage] ?? []).map(s => atEndpoint(s, points[stage], network)).filter(s => s.bikeMinutes <= endpointCyclingLimit(options, "access"));
    const to = (candidates[stage + 1] ?? []).map(s => atEndpoint(s, points[stage + 1], network, "egress")).filter(s => s.bikeMinutes <= endpointCyclingLimit(options, "egress"));
    const pairs = selectStationPairs(from, to, options.maxBikeMinutes, new Set(), 2, hillSearch(options));
    for (const [a, b] of pairs) {
      // Preserve independently reachable stage times. An earlier prohibited ride
      // must neither block the comparison nor replace later bicycle-aware queries.
      const arrivals = [...new Set(BICYCLE_SCOPES.map(bicycleScope =>
        solveWaypoints(network, points, start, { ...options, bicycleScope }, mode).stageArrivals[stage]).filter(Number.isFinite))];
      for (const reachable of arrivals) {
        progress(`Checking stage ${stage + 1} of ${points.length - 1}: ${points[stage].label} → ${points[stage + 1].label}…`);
        await connections(network, client, a, b, new Date(reachable + (a.bikeMinutes + options.boardingMinutes) * 60_000));
        client.signal.throwIfAborted();
        await refreshRoads(session, mode === "extended", publish, progress);
      }
    }
  }
}

export type PlanDependencies = NonNullable<Parameters<typeof planInternal>[7]> & { deadlineMs?: number };
export async function plan(from: string | Place, to: string | Place, mode: ModelMode, options: Options,
  signal: AbortSignal, progress: Progress, publish: SearchUpdate = () => {}, dependencies: PlanDependencies = {}): Promise<SearchSession> {
  const deadline = new SearchDeadline(signal, dependencies.deadlineMs ?? (options.cyclingRoutePreference ? TERRAIN_SEARCH_DEADLINE_MS : SEARCH_DEADLINE_MS));
  let latest: SearchSession | undefined;
  const update: SearchUpdate = session => { if (!deadline.signal.aborted) { session.requestSignal = signal; latest = session; publish(session); } };
  const report: Progress = message => { if (!deadline.signal.aborted) progress(message); };
  try {
    const result = await deadline.run(() => planInternal(from, to, mode, options, deadline.signal, report, update, dependencies));
    return { ...result, requestSignal: signal, searchElapsedMs: Date.now() - deadline.started };
  } catch (error) {
    if (!deadline.expired) throw error;
    if (!latest) throw new Error("The search time limit was reached before the places could be checked. Please try again.");
    latest.client.warnings.add("Search time limit reached. Completed routes are kept; some alternatives could not be checked.");
    latest.searchIncomplete = true; latest.searchElapsedMs = Date.now() - deadline.started;
    refresh(latest, mode === "extended", publish);
    return { ...latest };
  }
}

export async function extend(session: SearchSession, progress: Progress, publish: SearchUpdate = () => {}, signal?: AbortSignal): Promise<SearchSession> {
  if (session.extendedComplete) return session;
  if (session.cyclingCandidatePools && (!session.originStations.length || !session.destinationStations.length))
    return plan(session.origin, session.destination, "extended", session.options,
      signal ?? session.requestSignal ?? session.client.signal, progress, publish,
      { start: session.start, waypoints: session.waypoints, previous: session });
  const deadline = new SearchDeadline(signal ?? session.requestSignal ?? session.client.signal,
    session.options.cyclingRoutePreference ? TERRAIN_SEARCH_DEADLINE_MS : SEARCH_DEADLINE_MS);
  // This is an explicit new action after Baseline; retain its results and
  // verified paths, but do not inherit an exhausted provider allowance.
  session = { ...session, requestSignal: signal ?? session.requestSignal, client: session.client.fork(deadline.signal),
    cyclingClient: session.cyclingClient?.fork(deadline.signal),
    network: { ...session.network, stops: new Map(session.network.stops), edges: new Map(session.network.edges) } };
  if (session.cyclingClient) session.network.cycling = session.cyclingClient.routes;
  session.client.signal = deadline.signal;
  if (session.client.ojp) session.client.ojp.signal = deadline.signal;
  if (session.client.national) session.client.national.signal = deadline.signal;
  if (session.cyclingClient) session.cyclingClient.signal = deadline.signal;
  if (session.comparisonClient) session.comparisonClient.signal = deadline.signal;
  const update: SearchUpdate = result => { if (!deadline.signal.aborted) publish(result); };
  try { return await deadline.run(() => extendInternal(session, message => { if (!deadline.signal.aborted) progress(message); }, update)); }
  catch (error) {
    if (!deadline.expired) throw error;
    session.searchIncomplete = true;
    session.client.warnings.add("Search time limit reached. Completed routes are kept; some cycling transfers could not be checked.");
    refresh(session, true, publish);
    return { ...session };
  }
}
