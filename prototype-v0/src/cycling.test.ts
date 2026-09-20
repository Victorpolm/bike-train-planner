import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { plan } from "./api.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { breakdown, cachedCycling, classifyInfrastructure, classifySurface, cyclingKey, finalClimb, parseCyclingRoute, pointAlong, postedSpeedBand, zeroCycling } from "./cycling.ts";
import { DEFAULT_OPTIONS, emptyNetwork, solve, type Network, type Stop } from "./model.ts";
import { haversineKm, type Place, type Point } from "./routing.ts";
import { solveWaypoints } from "./waypoints.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/renens-epfl-cycling-2026-09-20.json", import.meta.url), "utf8"));
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const start = new Date("2026-09-21T08:00:00+02:00"), time = (m: number) => new Date(start.getTime() + m * 60_000);
function geometry(from: Point, to: Point, seconds: number) {
  return { type: "FeatureCollection", features: [{ geometry: { type: "LineString", coordinates: [[from.lon, from.lat, 400], [to.lon, to.lat, 420]] },
    properties: { "track-length": haversineKm(from, to) * 1000, "total-time": seconds } }] };
}
function ride(n: Network, a: Stop, b: Stop, depart: number, arrive: number) {
  n.stops.set(a.id, a); n.stops.set(b.id, b);
  const id = `${a.id}-${b.id}-${depart}`;
  n.edges.set(id, { id, from: a.id, to: b.id, leg: { mode: "transit", from: a.name, to: b.name, fromId: a.id, toId: b.id,
    fromPoint: a, toPoint: b, departure: time(depart), arrival: time(arrive), service: id, serviceName: null, direction: b.name,
    departurePlatform: null, arrivalPlatform: null } });
}

it("retains the real Renens–EPFL path, provider riding time and named data gaps", () => {
  const route = parseCyclingRoute(fixture.data, fixture.from, fixture.to);
  assert.equal(route.points.length, 120);
  assert.equal(route.distanceKm, 2.597);
  assert.equal(route.ridingSeconds, 401);
  assert.equal(route.minutes, 8); // Includes the short walking connectors, rounded up.
  assert.equal(route.ascentM, 3); assert.equal(route.descentM, 23);
  assert.equal(route.elevationCoverage, 1);
  assert.ok(route.endGapM > 30 && route.endGapM < 35);
  assert.ok(breakdown(route, "surface").some(s => s.label === "Unknown" && s.metres > 0));
  for (const key of ["surface", "infrastructure", "speedLimit"] as const) {
    assert.ok(Math.abs(breakdown(route, key).reduce((sum, s) => sum + s.metres, 0) - 2597) < .001);
  }
  assert.equal(finalClimb(route).distanceM, 2000);
  assert.ok(finalClimb(route).ascentM! > 0); // Net downhill does not hide a final climb.
  assert.ok(pointAlong(route.points, 1000)!.distanceM === 1000);
});

it("keeps attributes unknown across an unmatched road interval", () => {
  const data = structuredClone(fixture.data), messages = data.features[0].properties.messages;
  messages[2][messages[0].indexOf("Longitude")] = "0";
  const route = parseCyclingRoute(data, fixture.from, fixture.to);
  assert.ok(route.sections.some(s => s.endM > s.startM && Object.keys(s.tags).length === 0));
  assert.ok(Math.abs(breakdown(route, "surface").reduce((sum, s) => sum + s.metres, 0) - 2597) < .001);
});

it("shows missing elevation as unknown and identifies sustained steep climbs", () => {
  const data = structuredClone(fixture.data);
  delete data.features[0].geometry.coordinates[25][2];
  const partial = parseCyclingRoute(data, fixture.from, fixture.to);
  assert.ok(partial.elevationCoverage < 1); assert.equal(partial.ascentM, null); assert.equal(partial.descentM, null);
  const a = { lat: 46, lon: 6 }, b = { lat: 46.003, lon: 6 };
  const steepData = geometry(a, b, 300);
  steepData.features[0].geometry.coordinates = [[6, 46, 400], [6, 46.001, 412], [6, 46.002, 424], [6, 46.003, 436]];
  const steep = parseCyclingRoute(steepData, a, b);
  assert.ok(steep.steep.some(s => s.gradePercent >= 6));
  assert.ok(steep.ascentM! > 25); assert.equal(steep.descentM, 0);
});

it("rejects invalid time/geometry and distant snapping instead of drawing a road fallback", () => {
  const badTime = structuredClone(fixture.data); badTime.features[0].properties["total-time"] = null;
  assert.throws(() => parseCyclingRoute(badTime, fixture.from, fixture.to), /duration/);
  assert.throws(() => parseCyclingRoute(fixture.data, { lat: 46.55, lon: 6.5 }, fixture.to), /75 m/);
  const badPoint = structuredClone(fixture.data); badPoint.features[0].geometry.coordinates[5][0] = NaN;
  assert.throws(() => parseCyclingRoute(badPoint, fixture.from, fixture.to), /geometry/);
});

it("uses direction-aware cycle facilities and does not invent surfaces or measured speeds", () => {
  assert.equal(classifyInfrastructure({ highway: "primary", "cycleway:left": "track", "cycleway:right": "lane" }), "Painted lane");
  assert.equal(classifyInfrastructure({ highway: "primary", "cycleway:left": "track", reversedirection: "yes" }), "Separated cycleway");
  assert.equal(classifyInfrastructure({ highway: "primary", cycleway: "separate" }), "Shared with traffic");
  assert.equal(classifyInfrastructure({ highway: "cycleway" }), "Separated cycleway");
  assert.equal(classifySurface({ highway: "primary" }), "Unknown");
  assert.equal(classifySurface({ surface: "compacted" }), "Compacted");
  assert.equal(classifySurface({ surface: "fine_gravel" }), "Gravel");
  assert.equal(postedSpeedBand({ maxspeed: "50" }), "48–56 km/h");
  assert.equal(postedSpeedBand({ maxspeed: "50", "maxspeed:backward": "30", reversedirection: "yes" }), "30–35 km/h");
  assert.equal(postedSpeedBand({ speed: "22", estimated_traffic_class: "5" }), "Unknown");
  assert.equal(postedSpeedBand({ maxspeed: "50", "maxspeed:conditional": "30 @ (school_hours)" }), "Unknown");
});

it("deduplicates cycling requests but routes the reverse direction independently", async () => {
  const urls: URL[] = [];
  const a = fixture.from, b = fixture.to;
  const client = new CyclingClient(new AbortController().signal, async input => {
    const url = new URL(String(input)); urls.push(url);
    assert.equal(url.searchParams.get("profile:allow_ferries"), "0");
    assert.equal(url.searchParams.get("profile:processUnusedTags"), "1");
    return response(geometry(urls.length === 1 ? a : b, urls.length === 1 ? b : a, urls.length === 1 ? 600 : 1200));
  }, 0, false);
  const [one, duplicate] = await Promise.all([client.route(a, b), client.route(a, b)]);
  assert.equal(client.requests, 1); assert.equal(one, duplicate);
  const reverse = await client.route(b, a);
  assert.equal(client.requests, 2); assert.equal(reverse?.minutes, 20); assert.equal(one?.minutes, 10);
});

it("does not replace unavailable cycling links with straight lines and stops after rate limiting", async () => {
  let requests = 0;
  const client = new CyclingClient(new AbortController().signal, async () => { requests++; return response({}, 429); }, 0, false);
  assert.equal(await client.route(fixture.from, fixture.to), null);
  assert.equal(await client.route(fixture.to, fixture.from), null);
  assert.equal(requests, 1); assert.ok(client.warnings.size);
  assert.equal(cachedCycling(client.routes, fixture.from, fixture.to), null);
  assert.equal((await client.route(fixture.from, fixture.from))?.minutes, 0);
});

it("ignores a late route response after cancellation", async () => {
  const abort = new AbortController(); let release!: (value: Response) => void;
  const client = new CyclingClient(abort.signal, async () => new Promise(resolve => { release = resolve; }), 0, false);
  const task = client.route(fixture.from, fixture.to), rejected = assert.rejects(task, { name: "AbortError" });
  await new Promise(resolve => setImmediate(resolve)); abort.abort(); release(response(fixture.data));
  await rejected; assert.equal(client.routes.size, 0);
});

it("uses routed access time to reject a train that the old straight-line model catches", () => {
  const a = { id: "A", name: "A", lat: 42, lon: 4 }, b = { id: "B", name: "B", lat: 43, lon: 5 };
  const origin: Place = { label: "Home", lat: 42.001, lon: 4 }, destination = { ...b, label: "Work", stopId: b.id };
  const n = emptyNetwork(); ride(n, a, b, 10, 40); ride(n, a, b, 25, 55);
  const options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 25, maxEgressMinutes: 0, maxBikeMinutes: 25 };
  assert.equal(Math.min(...solve(n, origin, destination, start, options, "baseline").journeys.map(j => j.totalMinutes)), 40);
  const road = parseCyclingRoute(geometry(origin, a, 1200), origin, a);
  n.cycling = new Map([[cyclingKey(origin, a), road]]);
  const routed = solve(n, origin, destination, start, options, "baseline").journeys;
  assert.equal(Math.min(...routed.map(j => j.totalMinutes)), 55);
  assert.equal(routed[0].originStation.cyclingRoute, road);
  n.cycling.clear(); assert.equal(solve(n, origin, destination, start, options, "baseline").journeys.length, 0);
  n.cycling.set(cyclingKey(a, origin), road); assert.equal(solve(n, origin, destination, start, options, "baseline").journeys.length, 0);
});

it("enforces routed time and the shared cycling budget across an ordered visit", () => {
  const a = { id: "A", name: "A", lat: 42, lon: 4 }, b = { id: "B", name: "B", lat: 43, lon: 5 }, c = { id: "C", name: "C", lat: 44, lon: 6 };
  const points: Place[] = [{ ...a, label: "A", stopId: a.id }, { label: "Visit", lat: b.lat + .001, lon: b.lon }, { ...c, label: "C", stopId: c.id }];
  const n = emptyNetwork(); ride(n, a, b, 3, 20); ride(n, b, c, 25, 40); ride(n, b, c, 53, 70);
  n.cycling = new Map([
    [cyclingKey(b, points[1]), parseCyclingRoute(geometry(b, points[1], 600), b, points[1])],
    [cyclingKey(points[1], b), parseCyclingRoute(geometry(points[1], b, 1200), points[1], b)],
  ]);
  const options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 20, maxEgressMinutes: 10, maxBikeMinutes: 30 };
  const result = solveWaypoints(n, points, start, options, "baseline");
  assert.equal(result.journeys[0].totalMinutes, 70);
  assert.equal(result.journeys[0].waypoints![0].arrival.getTime(), time(30).getTime());
  assert.equal(solveWaypoints(n, points, start, { ...options, maxBikeMinutes: 29 }, "baseline").journeys.length, 0);
});

it("uses the routed duration and geometry for an automatic cycling transfer", () => {
  const a = { id: "A", name: "A", lat: 42, lon: 4 }, b = { id: "B", name: "B", lat: 43, lon: 5 };
  const c = { id: "C", name: "C", lat: 43.001, lon: 5 }, d = { id: "D", name: "D", lat: 44, lon: 6 };
  const from = { ...a, label: "A", stopId: a.id }, to = { ...d, label: "D", stopId: d.id };
  const n = emptyNetwork(); ride(n, a, b, 5, 20); ride(n, c, d, 25, 50); ride(n, c, d, 35, 70);
  const road = parseCyclingRoute(geometry(b, c, 600), b, c);
  n.cycling = new Map([[cyclingKey(b, c), road]]);
  const options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0 };
  const result = solve(n, from, to, start, options, "extended");
  assert.equal(result.journeys[0].totalMinutes, 70);
  assert.equal(result.journeys[0].transitLegs.find(l => l.mode === "bike")?.cyclingRoute, road);
  assert.equal(solve(n, from, to, start, { ...options, maxIntermediateMinutes: 9 }, "extended").journeys.length, 0);
});

it("queries the timetable after routed station access and keeps that duration in the final plan", async () => {
  const a = { id: "A", name: "A", lat: 42, lon: 4 }, b = { id: "B", name: "B", lat: 43, lon: 5 };
  const from: Place = { label: "Home", lat: 42.001, lon: 4 }, to: Place = { ...b, label: "B", stopId: "B" };
  const urls: URL[] = [];
  const result = await plan(from, to, "baseline", { ...DEFAULT_OPTIONS, maxAccessMinutes: 25, maxEgressMinutes: 0 },
    new AbortController().signal, () => {}, () => {}, {
      start, gapMs: 0, cyclingFetcher: async input => {
        const points = new URL(String(input)).searchParams.get("lonlats")!.split("|").map(s => { const [lon, lat] = s.split(",").map(Number); return { lon, lat }; });
        return response(geometry(points[0], points[1], points[1].lat === a.lat ? 1200 : 36_000));
      },
      fetcher: async input => {
        const url = new URL(String(input)); urls.push(url);
        const station = (p: Stop) => ({ id: p.id, name: p.name, icon: "train", coordinate: { x: p.lat, y: p.lon } });
        if (url.pathname.endsWith("locations")) return response({ stations: [station(a)] });
        assert.equal(url.searchParams.get("time"), "08:23");
        return response({ connections: [{ sections: [{ journey: { category: "IC", number: "1" },
          departure: { station: station(a), departure: time(25).toISOString() }, arrival: { station: station(b), arrival: time(55).toISOString() } }] }] });
      },
    });
  assert.equal(result.baseline.journeys[0].totalMinutes, 55);
  assert.equal(result.baseline.journeys[0].originStation.bikeMinutes, 20);
  assert.equal(result.baseline.journeys[0].originStation.cyclingRoute?.minutes, 20);
  assert.equal(result.cyclingStatus, "ready"); assert.equal(result.cyclingComparison!.minutes, 600);
  assert.equal(urls.filter(u => u.pathname.endsWith("connections")).length, 1);
  assert.equal(zeroCycling(a, a).minutes, 0);
});
