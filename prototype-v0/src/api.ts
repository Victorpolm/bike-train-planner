import { cyclingMinutes, haversineKm, type Place, type Point, type Station } from "./routing.ts";
import { MAJOR_STATIONS } from "./majorStations.ts";
import { type TransportSection } from "./itinerary.ts";
import { addSections, addStationboard, readStop, type BoardJourney } from "./timetable.ts";
import { atEndpoint, compareModels, emptyNetwork, solve, validateOptions,
  type ModelMode, type Network, type Options, type Solution, type Stop } from "./model.ts";

const TRANSPORT_URL = "https://transport.opendata.ch/v1";
export const SEARCH_LIMITS = { stopsPerSide: 6, connectionsPerPair: 6, transferStops: 6,
  neighborsPerTransfer: 2, suffixQueries: 18, stationboards: 3, requests: 100, locationProbesPerSide: 2, phaseMilliseconds: 90_000 };
export type Progress = (message: string) => void;
export type TransportLocation = { id: string | null; name: string; icon?: string | null;
  coordinate?: { x: number | null; y: number | null } };
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
        const response = await this.fetcher(url, { signal: AbortSignal.any([this.signal, AbortSignal.timeout(Math.max(1, Math.min(8_000, this.deadline - Date.now())))]) });
        if (response.status === 429) {
          this.stopped = true;
          throw new Error("The timetable service is busy; this search is incomplete. Try again later.");
        }
        if (!response.ok) throw new Error(`Some timetable requests failed (HTTP ${response.status}).`);
        const data = await response.json();
        if (data.errors?.length) throw new Error("The timetable service rejected some queries; this search is incomplete.");
        return data as T;
      } catch (error) {
        this.signal.throwIfAborted();
        this.failures++;
        this.warnings.add(error instanceof Error && !["TimeoutError", "TypeError"].includes(error.name)
          ? error.message : "Some timetable requests timed out or could not connect; this search is incomplete.");
        return null;
      }
    });
    this.cache.set(url, task); this.queue = task.catch(() => undefined);
    return task;
  }
}

export async function geocode(searchText: string, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Place> {
  const url = new URL("https://api3.geo.admin.ch/rest/services/ech/SearchServer");
  url.search = new URLSearchParams({ searchText, type: "locations", origins: "address,gazetteer,zipcode,gg25", limit: "8", sr: "4326" }).toString();
  const request = (target: URL, timeout: number) => fetcher(target, {
    signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(timeout)]),
  });
  try {
    const response = await request(url, 5_000);
    if (!response.ok) throw new Error("Location service unavailable.");
    const data = await response.json() as { results?: { attrs?: { lat?: number; lon?: number; label?: string; detail?: string } }[] };
    const attrs = data.results?.find(r => Number.isFinite(r.attrs?.lat) && Number.isFinite(r.attrs?.lon))?.attrs;
    if (attrs?.lat !== undefined && attrs.lon !== undefined) {
      const html = attrs.label || attrs.detail || searchText;
      const label = typeof DOMParser === "undefined" ? html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&")
        : new DOMParser().parseFromString(html, "text/html").body.textContent || searchText;
      return { lat: attrs.lat, lon: attrs.lon, label: label.replace(/\s+/g, " ").trim() };
    }
  } catch { signal?.throwIfAborted(); }
  // Timetable stop names (for example “Laax GR, posta”) are not always indexed
  // by address geocoding. The provider can resolve those names directly.
  const fallback = new URL(`${TRANSPORT_URL}/locations`);
  fallback.search = new URLSearchParams({ query: searchText, type: "all" }).toString();
  try {
    const response = await request(fallback, 10_000);
    if (!response.ok) throw new Error("Location service unavailable.");
    const data = await response.json() as { stations?: TransportLocation[] };
    const location = data.stations?.find(s => s.name && typeof s.coordinate?.x === "number" &&
      Number.isFinite(s.coordinate.x) && typeof s.coordinate?.y === "number" && Number.isFinite(s.coordinate.y));
    if (location) return { label: location.name, lat: location.coordinate!.x!, lon: location.coordinate!.y!,
      stopId: location.id ?? undefined, kind: location.icon ?? undefined };
  } catch {
    signal?.throwIfAborted();
    throw new Error("Location lookup is unavailable. Please try again, or enter a nearby station or bus-stop name.");
  }
  throw new Error(`No Swiss location found for “${searchText}”. Try a station, stop or full address.`);
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

async function nearby(point: Point, client: TimetableClient): Promise<Stop[]> {
  const data = await client.get<{ stations?: TransportLocation[] }>("locations", new URLSearchParams({ x: String(point.lat), y: String(point.lon) }));
  return (data?.stations ?? []).map((value): Stop | null => {
    const stop = readStop(value);
    return stop ? { ...stop, kind: value.icon ?? undefined } : null;
  }).filter((s): s is Stop => s !== null);
}

export async function findCandidateStations(point: Place, maxMinutes: number, client: TimetableClient, progress: Progress): Promise<Station[]> {
  const stops: Stop[] = MAJOR_STATIONS.map(s => ({ ...s, kind: "train" }));
  if (point.stopId) stops.push({ id: point.stopId, name: point.label, lat: point.lat, lon: point.lon, kind: point.kind });
  stops.push(...await nearby(point, client));
  // Expand independently at each endpoint. Retain earlier discoveries and scan
  // every band within the bound, even after finding a feasible local stop.
  let probes = 0;
  for (const band of candidateBands(maxMinutes)) {
    if (band <= 20 && stops.some(s => cyclingMinutes(haversineKm(point, s)) <= band)) continue;
    if (probes >= SEARCH_LIMITS.locationProbesPerSide) break;
    progress(`Looking for stops within ${band} cycling minutes of ${point.label}…`);
    const radiusKm = Math.max(0, band - 10) / 4;
    const dLat = radiusKm / 111.32, dLon = radiusKm / (111.32 * Math.cos(point.lat * Math.PI / 180));
    const samples = [{ lat: point.lat + dLat, lon: point.lon }, { lat: point.lat, lon: point.lon + dLon },
      { lat: point.lat - dLat, lon: point.lon }, { lat: point.lat, lon: point.lon - dLon }];
    stops.push(...await nearby(samples[probes % samples.length], client));
    probes++;
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
  originStations: Station[]; destinationStations: Station[]; baseline: Solution; extended: Solution | null;
};
export function searchWarnings(session: SearchSession): string[] {
  const warnings = [...session.client.warnings];
  if (session.client.rejectedSections) warnings.push("Some sections lacked usable stops or times and were excluded.");
  if (session.baseline.limited || session.extended?.limited) warnings.push("The routing search reached its label limit; some alternatives may be missing.");
  return warnings;
}

export async function plan(fromText: string, toText: string, mode: ModelMode, options: Options,
  signal: AbortSignal, progress: Progress): Promise<SearchSession> {
  validateOptions(options);
  // One fixed departure instant for the entire search and later mode switching.
  const start = new Date();
  progress("Finding both places…");
  const [origin, destination] = await Promise.all([geocode(fromText, signal), geocode(toText, signal)]);
  const client = new TimetableClient(signal), network = emptyNetwork();
  progress("Finding train, bus and tram stops…");
  const originStations = await findCandidateStations(origin, Math.min(options.maxAccessMinutes, options.maxBikeMinutes), client, progress);
  const destinationStations = await findCandidateStations(destination, Math.min(options.maxEgressMinutes, options.maxBikeMinutes), client, progress);
  if (!originStations.length || !destinationStations.length) throw new Error(
    client.failures ? "Stop lookup was incomplete. Please try again." : "No stop was found within your cycling limits. Increase the start or arrival limit and try again.");
  for (const s of [...originStations, ...destinationStations]) network.stops.set(s.id, s);
  const pairs = originStations.flatMap(a => destinationStations.filter(b => a.id !== b.id && a.bikeMinutes + b.bikeMinutes <= options.maxBikeMinutes).map(b => [a, b] as const))
    .sort(([a, b], [c, d]) => a.bikeMinutes + b.bikeMinutes - c.bikeMinutes - d.bikeMinutes);
  for (let i = 0; i < pairs.length; i++) {
    progress(`Comparing public transport connections ${i + 1}/${pairs.length}…`);
    const [a, b] = pairs[i];
    await connections(network, client, a, b, new Date(start.getTime() + (a.bikeMinutes + options.boardingMinutes) * 60_000));
  }
  signal.throwIfAborted();
  const baseline = solve(network, origin, destination, start, options, "baseline");
  const session: SearchSession = { origin, destination, start, options: { ...options }, network, client,
    originStations, destinationStations, baseline, extended: null };
  if (mode === "extended") await extend(session, progress);
  return session;
}

export async function extend(session: SearchSession, progress: Progress): Promise<SearchSession> {
  if (session.extended) return session;
  const { network, client, options: o, origin, destination, start } = session;
  client.beginPhase();
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
        .filter(s => s.id !== id && cyclingMinutes(haversineKm(from, s)) > 0 && cyclingMinutes(haversineKm(from, s)) <= o.maxIntermediateMinutes)
        .sort((a, b) => haversineKm(a, destination) - haversineKm(b, destination) || a.id.localeCompare(b.id))
        .slice(0, SEARCH_LIMITS.neighborsPerTransfer);
      for (const neighbor of neighbors) {
        const minutes = cyclingMinutes(haversineKm(from, neighbor));
        // Do not discard slower labels with less cycling or fewer boardings.
        const feasibleLabels = exits.filter(l => l.stop === id && l.bike + minutes <= o.maxBikeMinutes);
        if (!feasibleLabels.length) continue;
        network.stops.set(neighbor.id, neighbor);
        const ready = new Date(Math.min(...feasibleLabels.map(l => l.time)) + (minutes + o.boardingMinutes) * 60_000);
        for (const end of session.destinationStations.slice(0, 2)) {
          if (queries >= SEARCH_LIMITS.suffixQueries) break;
          queries++;
          await connections(network, client, neighbor, end, ready);
        }
      }
    }
  }
  client.signal.throwIfAborted();
  progress("Selecting useful trade-offs in both models…");
  // Refresh BOTH solutions on the identical expanded graph. No data/mode confound.
  const compared = compareModels(network, origin, destination, start, o);
  session.baseline = compared.baseline; session.extended = compared.extended;
  return { ...session };
}
