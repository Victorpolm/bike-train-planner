/** Local, read-only Swiss timetable pilot. Node 24; no third-party dependencies.
 * Run: node tools/swiss_timetable.ts /absolute/path/to/index.sqlite
 * Loopback only. Hosting and a production validation gate remain separate.
 */
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { searchTime } from "../prototype-v0/src/searchTimetable.ts";
import { transitLegsFromSections, type TransportSection } from "../prototype-v0/src/itinerary.ts";
import { bicycleLegAllowed, BICYCLE_SCOPES, type BicycleScope } from "../prototype-v0/src/bicyclePermission.ts";
import { swissDateTimeInput } from "../prototype-v0/src/departure.ts";

type Stop = { id: string; name: string; lat: number; lon: number; parent: string; platform: string; uic: string };
type Event = { trip: string; seq: number; stop: string; arrival: number; departure: number; pickup: number; dropoff: number };
type Trip = { id: string; hints: string; headsign: string; number: string; agency: string; name: string; category: string; timezone: string };
type Label = { stop: Stop; time: number; sections: TransportSection[] };
export type TimetableQuery = { from: string; to: string; departure: string; scope?: BicycleScope; maxBoardings?: number; horizonMinutes?: number; budgetMs?: number };
const SOURCE = "https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/";
const nextDay = (date: string, n: number) => new Date(Date.parse(date + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);
export function serviceBase(date: string) {
  // GTFS time is measured from noon minus 12 hours, including DST days.
  const noon = searchTime(date + " 12:00:00");
  if (!noon) throw new Error("Invalid service date");
  return Date.parse(noon) - 12 * 3600000;
}
export class SwissTimetable {
  readonly db: DatabaseSync;
  readonly report: { indexed_dates: string[]; imported_at: string; counts: Record<string, number>; warnings: string[] };
  private stops = new Map<string, Stop>();
  private groups = new Map<string, Stop[]>();
  constructor(path: string) {
    this.db = new DatabaseSync(path, { readOnly: true });
    this.db.exec("PRAGMA query_only=ON; PRAGMA cache_size=-32000;");
    this.report = JSON.parse(String(this.db.prepare("SELECT value FROM metadata WHERE key='report'").get()!.value));
    for (const raw of this.db.prepare("SELECT * FROM stops").all()) {
      const stop = raw as unknown as Stop;
      this.stops.set(stop.id, stop);
      const key = this.group(stop), list = this.groups.get(key) ?? [];
      list.push(stop); this.groups.set(key, list);
    }
  }
  close() { this.db.close(); }
  private group(stop: Stop) { return stop.uic || stop.parent || stop.id; }
  private resolve(id: string) { return this.stops.get(id) ?? this.groups.get(id)?.find(s => !s.id.startsWith("Parent")) ?? this.groups.get(id)?.[0]; }
  nearby(lat: number, lon: number, limit = 12) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Invalid coordinates");
    return [...this.groups.entries()].map(([id, list]) => {
      const s = list.find(s => !s.platform && !s.id.startsWith("Parent")) ?? list[0];
      return { id, name: s.name, lat: s.lat, lon: s.lon, distance: (s.lat - lat) ** 2 + ((s.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2 };
    }).sort((a, b) => a.distance - b.distance).slice(0, Math.max(1, Math.min(limit, 30)));
  }
  query(input: TimetableQuery) {
    const started = performance.now(), deadline = started + Math.min(10000, Math.max(1, input.budgetMs ?? 8000));
    const origin = this.resolve(input.from), destination = this.resolve(input.to), start = Date.parse(input.departure);
    if (!origin || !destination || !Number.isFinite(start)) throw new Error("Unknown stop or invalid departure");
    const day = swissDateTimeInput(new Date(start)).slice(0, 10);
    if (!this.report.indexed_dates.includes(day)) throw new Error("Service date is outside the indexed timetable");
    const boardings = input.maxBoardings ?? 4, horizon = input.horizonMinutes ?? 720;
    if (!Number.isInteger(boardings) || boardings < 1 || boardings > 8 || !Number.isFinite(horizon) || horizon < 1 || horizon > 1440) throw new Error("Invalid search limits");
    if (input.scope && !BICYCLE_SCOPES.includes(input.scope)) throw new Error("Invalid bicycle scope");
    const dates = [-1, 0, 1].map(n => nextDay(day, n)).filter(d => this.report.indexed_dates.includes(d));
    const end = start + horizon * 60000, warnings = new Set(this.report.warnings);
    if (!this.report.indexed_dates.includes(nextDay(day, -1))) warnings.add("Previous-day after-midnight services are outside this index.");
    if (swissDateTimeInput(new Date(end)).slice(0, 10) !== day && !dates.includes(nextDay(day, 1))) warnings.add("The overnight horizon extends beyond the indexed dates.");
    if (this.report.counts.frequencies) warnings.add("Frequency-based services are not expanded in this timetable pilot.");
    warnings.add("Station pathways and realtime changes are not verified. Transfer times use the feed or a minimum three-minute allowance.");
    const eventStatement = this.db.prepare(`SELECT s.* FROM stop_times s JOIN trips t ON t.id=s.trip
      JOIN service_dates d ON d.service=t.service AND d.date=? WHERE s.stop=? AND s.departure>=? AND s.departure<=?
      AND s.pickup=0 AND NOT EXISTS(SELECT 1 FROM frequencies f WHERE f.trip=s.trip) ORDER BY s.departure LIMIT 2501`);
    const tripStatement = this.db.prepare(`SELECT t.*,r.agency,r.name,r.category,a.timezone FROM trips t
      JOIN routes r ON r.id=t.route JOIN agencies a ON a.id=r.agency WHERE t.id=?`);
    const timesStatement = this.db.prepare("SELECT * FROM stop_times WHERE trip=? ORDER BY seq");
    const transferStatement = this.db.prepare("SELECT * FROM transfers WHERE from_stop IN (?,?,?)");
    const trips = new Map<string, Trip>(), times = new Map<string, Event[]>(), departures = new Map<string, { event: Event; base: number }[]>();
    const transfers = new Map<string, { to_stop: string; type: number; seconds: number }[]>();
    const getTransfers = (stop: Stop) => {
      if (!transfers.has(stop.id)) transfers.set(stop.id, transferStatement.all(stop.id, stop.uic, stop.parent) as unknown as { to_stop: string; type: number; seconds: number }[]);
      return transfers.get(stop.id)!;
    };
    const getDepartures = (stop: Stop) => {
      const key = this.group(stop);
      if (!departures.has(key)) {
        const list: { event: Event; base: number }[] = [];
        for (const member of this.groups.get(key) ?? [stop]) for (const date of dates) {
          const base = serviceBase(date), rows = eventStatement.all(date, member.id, Math.max(0, (start - base) / 1000), (end - base) / 1000) as unknown as Event[];
          if (rows.length > 2500) warnings.add("A busy-stop departure limit was reached; this search is incomplete.");
          list.push(...rows.slice(0, 2500).map(event => ({ event, base })));
        }
        departures.set(key, list.sort((a, b) => a.base + a.event.departure * 1000 - b.base - b.event.departure * 1000));
      }
      return departures.get(key)!;
    };
    const station = (s: Stop) => ({ id: this.group(s), name: s.name, coordinate: { x: s.lat, y: s.lon } });
    const found: { scope: BicycleScope; sections: TransportSection[]; arrival: string; boardings: number }[] = [];
    let incomplete = false;
    // A separate search per scope prevents forbidden/unknown fast labels from
    // dominating later services that are actually feasible with a bicycle.
    scopeLoop: for (const scope of input.scope ? [input.scope] : BICYCLE_SCOPES) {
      let frontier = new Map<string, Label>([[origin.id, { stop: origin, time: start, sections: [] }]]);
      let bestArrival = Infinity;
      for (let round = 1; round <= boardings && frontier.size; round++) {
        const next = new Map<string, Label>();
        const retain = (label: Label) => {
          if (label.time <= end && label.time < (next.get(label.stop.id)?.time ?? Infinity)) next.set(label.stop.id, label);
        };
        for (const label of frontier.values()) {
          if (performance.now() >= deadline) { incomplete = true; break scopeLoop; }
          if (label.time >= bestArrival) continue;
          for (const { event, base } of getDepartures(label.stop)) {
            const boarding = this.stops.get(event.stop)!;
            const transferRules = label.sections.length ? getTransfers(label.stop).filter(t => [boarding.id, boarding.uic, boarding.parent].includes(t.to_stop)) : [];
            if (transferRules.some(t => t.type === 3)) continue;
            const buffer = label.sections.length ? Math.max(180, ...transferRules.filter(t => t.type === 2).map(t => t.seconds)) * 1000 : 0;
            const departure = base + event.departure * 1000;
            if (departure < label.time + buffer || departure >= bestArrival) continue;
            if (!trips.has(event.trip)) trips.set(event.trip, tripStatement.get(event.trip) as unknown as Trip);
            if (!times.has(event.trip)) times.set(event.trip, timesStatement.all(event.trip) as unknown as Event[]);
            const trip = trips.get(event.trip)!;
            if (!["Europe/Zurich", "Europe/Berlin", "Europe/Paris", "Europe/Rome", "Europe/Vienna"].includes(trip.timezone)) {
              warnings.add("Services in another timezone were excluded from this Swiss timetable pilot."); continue;
            }
            const service = (trip.name.toUpperCase().startsWith(trip.category.toUpperCase())
              ? trip.name.slice(trip.category.length).trim() : trip.name) || trip.number;
            for (const alight of times.get(event.trip)!) {
              if (performance.now() >= deadline) { incomplete = true; break scopeLoop; }
              if (alight.seq <= event.seq || alight.dropoff !== 0 || alight.arrival === null) continue;
              const arrival = base + alight.arrival * 1000, stop = this.stops.get(alight.stop)!;
              if (arrival < departure || arrival > end || arrival >= bestArrival || this.group(stop) === this.group(boarding)) continue;
              const section: TransportSection = { departure: { station: station(boarding), departure: new Date(departure).toISOString(), platform: boarding.platform },
                arrival: { station: station(stop), arrival: new Date(arrival).toISOString(), platform: stop.platform },
                journey: { category: trip.category, number: service, operator: "OJP:" + trip.agency, name: trip.number, to: trip.headsign,
                  bicycleData: { source: { title: "Swiss GTFS dated service attributes", url: SOURCE, checked: this.report.imported_at },
                    attributes: trip.hints.split(/\s+/).filter(c => /^V[NRBICKT]$/.test(c)).map(c => ({ code: "A__" + c, text: c, scope: "service" })) } } };
              if (!bicycleLegAllowed(transitLegsFromSections([section])[0], "include-unknown", scope)) continue;
              const sections = [...label.sections, section];
              retain({ stop, time: arrival, sections });
              if (this.group(stop) === this.group(destination)) {
                bestArrival = arrival;
                found.push({ scope, sections, arrival: new Date(arrival).toISOString(), boardings: round });
              }
            }
          }
        }
        // One explicit, timed walking transfer between boardings. No invented
        // distance-based links, chained footpaths, stairs or lift assumptions.
        for (const label of [...next.values()]) for (const t of getTransfers(label.stop)) {
          const stop = this.resolve(t.to_stop);
          if (!stop || t.type === 3 || t.seconds <= 0 || t.seconds > 1200 || this.group(stop) === this.group(label.stop)) continue;
          const arrival = label.time + t.seconds * 1000;
          retain({ stop, time: arrival, sections: [...label.sections, { walk: true,
            departure: { station: station(label.stop), departure: new Date(label.time).toISOString() },
            arrival: { station: station(stop), arrival: new Date(arrival).toISOString() } }] });
        }
        frontier = next;
      }
    }
    if (incomplete) warnings.add("Local timetable search time limit reached; completed routes are kept and some alternatives are missing.");
    return { journeys: found, warnings: [...warnings], incomplete, checked: this.report.imported_at,
      elapsedMs: Math.round(performance.now() - started) };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error("Supply the SQLite index path");
  const timetable = new SwissTimetable(process.argv[2]), token = process.env.SWISS_TIMETABLE_TOKEN;
  createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
    const provided = Buffer.from(req.headers.authorization ?? ""), expected = Buffer.from("Bearer " + token);
    if (token && (provided.length !== expected.length || !timingSafeEqual(provided, expected))) { res.writeHead(401); res.end('{"error":"Unauthorized"}'); return; }
    try {
      if (req.method === "GET" && req.url === "/status") { res.end(JSON.stringify({ available: true, pilot: true, ...timetable.report })); return; }
      if (req.method !== "POST" || req.url !== "/connections") { res.writeHead(404); res.end("{}"); return; }
      let body = "";
      for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error("Request too large"); }
      const query = JSON.parse(body);
      res.end(JSON.stringify(timetable.query(query)));
    } catch (error) { res.writeHead(400); res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid request" })); }
  }).listen(Number(process.env.SWISS_TIMETABLE_PORT ?? 8788), "127.0.0.1", () => console.log("Swiss timetable pilot listening on loopback; no public access enabled."));
}
