import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { plan, searchWarnings } from "./api.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { breakdown, cachedCycling, classifyInfrastructure, classifySurface, cyclingKey, EndpointSnapError, finalClimb, parseCyclingRoute, pointAlong, postedSpeedBand, zeroCycling } from "./cycling.ts";
import { DEFAULT_OPTIONS, emptyNetwork, metrics, solve, type Network, type Stop } from "./model.ts";
import { preferenceOptions } from "./preferences.ts";
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
  assert.throws(() => parseCyclingRoute(fixture.data, { lat: 46.55, lon: 6.5 }, fixture.to), EndpointSnapError);
  const badPoint = structuredClone(fixture.data); badPoint.features[0].geometry.coordinates[5][0] = NaN;
  assert.throws(() => parseCyclingRoute(badPoint, fixture.from, fixture.to), /geometry/);
});

it("accepts nearby off-path endpoints while preserving pins and counting both walking connectors", () => {
  const a = { lat: 46, lon: 6 }, b = { lat: 46.01, lon: 6 };
  const data = geometry(a, b, 600);
  const from = { ...a, lat: a.lat - 249 / 111_195 }, to = { ...b, lat: b.lat + 249 / 111_195 };
  const route = parseCyclingRoute(data, from, to);
  assert.equal(route.from, from); assert.equal(route.to, to);
  assert.equal(route.points[0].lat, a.lat); assert.equal(route.points.at(-1)!.lat, b.lat);
  assert.ok(route.startGapM > 248 && route.startGapM < 250);
  assert.ok(route.endGapM > 248 && route.endGapM < 250);
  assert.ok(Math.abs(route.connectorMinutes - 7.47) < .01);
  assert.equal(route.minutes, 18); // 10-minute ride plus both access gaps, rounded up.
  assert.equal(route.distanceKm, haversineKm(a, b)); // No invented road/elevation/surface for the gaps.
  assert.throws(() => parseCyclingRoute(data, { ...a, lat: a.lat - 251 / 111_195 }, b), EndpointSnapError);
  assert.throws(() => parseCyclingRoute(data, a, { ...b, lat: b.lat + 251 / 111_195 }), EndpointSnapError);
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
    assert.equal(url.searchParams.get("profile:waypointCatchingRange"), "250");
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
  assert.ok(client.failureKinds.has("service"));
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

for (const { offset, failedAlternatives } of [{ offset: 0, failedAlternatives: false }, { offset: .001, failedAlternatives: false }, { offset: 0, failedAlternatives: true }]) it(`queries trains after routed access with a ${offset ? "111 m" : "zero"} gap${failedAlternatives ? " despite failed alternatives" : ""}`, async () => {
  const a = { id: "A", name: "A", lat: 42, lon: 4 }, b = { id: "B", name: "B", lat: 43, lon: 5 };
  const other = { id: "C", name: "Other station", lat: 42.003, lon: 4 };
  const from: Place = { label: "Home", lat: 42.001, lon: 4 }, to: Place = { ...b, label: "B", stopId: "B" };
  const urls: URL[] = [];
  const result = await plan(from, to, "baseline", { ...DEFAULT_OPTIONS, maxAccessMinutes: 25, maxEgressMinutes: 0 },
    new AbortController().signal, () => {}, () => {}, {
      start, gapMs: 0, cyclingFetcher: async input => {
        const points = new URL(String(input)).searchParams.get("lonlats")!.split("|").map(s => { const [lon, lat] = s.split(",").map(Number); return { lon, lat }; });
        const access = points[1].lat === a.lat;
        if (failedAlternatives && !access) return new Response(points[1].lat === other.lat ? "no track found at pass=0" : "operation killed by timeout", { status: 400 });
        return response(geometry(access ? { ...points[0], lat: points[0].lat + offset } : points[0], points[1], access ? 1200 : 36_000));
      },
      fetcher: async input => {
        const url = new URL(String(input)); urls.push(url);
        const station = (p: Stop) => ({ id: p.id, name: p.name, icon: "train", coordinate: { x: p.lat, y: p.lon } });
        if (url.pathname.endsWith("locations")) return response({ stations: [station(a), ...failedAlternatives ? [station(other)] : []] });
        assert.equal(url.searchParams.get("time"), offset ? "08:25" : "08:23");
        // Returning both trains exercises the solver as well as request readiness.
        return response({ connections: [24, 25].map(depart => ({ sections: [{ journey: { category: "IC", number: String(depart) },
          departure: { station: station(a), departure: time(depart).toISOString() }, arrival: { station: station(b), arrival: time(depart + 30).toISOString() } }] })) });
      },
    });
  assert.equal(result.baseline.journeys[0].totalMinutes, offset ? 55 : 54);
  assert.equal(result.baseline.journeys[0].originStation.bikeMinutes, offset ? 22 : 20);
  assert.equal(result.baseline.journeys[0].originStation.cyclingRoute?.minutes, offset ? 22 : 20);
  if (failedAlternatives) {
    assert.equal(result.cyclingStatus, "unavailable"); assert.equal(result.cyclingComparison, null);
    const warnings = searchWarnings(result);
    assert.ok(warnings.some(w => w.includes("Home → Other station") && w.includes("no usable connection")));
    assert.ok(warnings.some(w => w.startsWith("Cycling-only comparison") && w.includes("Home → B") && w.includes("ran out of time")));
    assert.equal(result.cyclingClient!.failedLinks.size, 1);
    assert.ok(result.baseline.journeys.every(j => j.originStation.id === "A"));
  } else { assert.equal(result.cyclingStatus, "ready"); assert.equal(result.cyclingComparison!.minutes, 600); }
  assert.equal(urls.filter(u => u.pathname.endsWith("connections")).length, 1);
  assert.equal(zeroCycling(a, a).minutes, 0);
});

it("permits 300 routed cycling minutes and queries reachable trains with the above-150 preset", async () => {
  // Synthetic coordinates keep Swiss seed stations outside the discovery radius.
  const a = { id: "A", name: "A", lat: 30.3, lon: 4 }, b = { id: "B", name: "B", lat: 31, lon: 5 };
  const from: Place = { label: "Home", lat: 30, lon: 4 }, to: Place = { label: "Destination", lat: 31.2, lon: 5 };
  const options = preferenceOptions("unrestricted", "none");
  let queries = 0;
  const result = await plan(from, to, "baseline", options, new AbortController().signal, () => {}, () => {}, {
    start, gapMs: 0,
    cyclingFetcher: async input => {
      const [p, q] = new URL(String(input)).searchParams.get("lonlats")!.split("|")
        .map(s => { const [lon, lat] = s.split(",").map(Number); return { lon, lat }; });
      return response(geometry(p, q, (q.lat === a.lat ? 180 : p.lat === b.lat ? 120 : 600) * 60));
    },
    fetcher: async input => {
      const url = new URL(String(input));
      const station = (p: Stop) => ({ id: p.id, name: p.name, icon: "train", coordinate: { x: p.lat, y: p.lon } });
      if (url.pathname.endsWith("locations")) return response({ stations: [station(Number(url.searchParams.get("x")) < 31 ? a : b)] });
      queries++;
      assert.equal(url.searchParams.get("from"), "A"); assert.equal(url.searchParams.get("to"), "B");
      assert.equal(url.searchParams.get("time"), "11:03"); // 180 minutes cycling + boarding buffer.
      return response({ connections: [182, 183, 1400].map(depart => ({ sections: [{ journey: { category: "IC", number: String(depart) },
        departure: { station: station(a), departure: time(depart).toISOString() },
        arrival: { station: station(b), arrival: time(depart + 30).toISOString() } }] })) });
    },
  });
  assert.equal(queries, 1);
  assert.equal(result.baseline.journeys.length, 1); // Missed train and next-day arrival beyond 24 h are excluded.
  const journey = result.baseline.journeys[0];
  assert.equal(journey.originStation.bikeMinutes, 180); assert.equal(journey.destinationStation.bikeMinutes, 120);
  assert.equal(metrics(journey).bike, 300); assert.equal(journey.totalMinutes, 333);
  assert.equal(solve(result.network, from, to, start, preferenceOptions("more", "none"), "baseline").journeys.length, 0);
  const stationStart = { ...a, label: "A", stopId: a.id }, stationFinish = { ...b, label: "B", stopId: b.id };
  assert.ok(solve(result.network, stationStart, stationFinish, start, options, "baseline").journeys.some(j => metrics(j).bike === 0));
});

it("allows a long cycling transfer only in Extended and still checks onward readiness", () => {
  const a = { id: "A", name: "A", lat: 42, lon: 4 }, b = { id: "B", name: "B", lat: 43, lon: 5 };
  const c = { id: "C", name: "C", lat: 43.3, lon: 5 }, d = { id: "D", name: "D", lat: 44, lon: 6 };
  const from = { ...a, label: "A", stopId: a.id }, to = { ...d, label: "D", stopId: d.id };
  const n = emptyNetwork(); ride(n, a, b, 5, 20); ride(n, c, d, 202, 249); ride(n, c, d, 203, 250);
  n.cycling = new Map([[cyclingKey(b, c), parseCyclingRoute(geometry(b, c, 180 * 60), b, c)]]);
  const options = preferenceOptions("unrestricted", "none");
  assert.equal(solve(n, from, to, start, options, "baseline").journeys.length, 0);
  assert.equal(solve(n, from, to, start, preferenceOptions("more", "none"), "extended").journeys.length, 0);
  const result = solve(n, from, to, start, options, "extended");
  assert.equal(result.journeys.length, 1); assert.equal(result.journeys[0].totalMinutes, 250);
  assert.equal(metrics(result.journeys[0]).middle, 180);
});

it("carries the above-150 allowance across requested stops without extending the journey window", () => {
  const a = { id: "A", name: "A", lat: 42, lon: 4 }, b = { id: "B", name: "B", lat: 43, lon: 5 }, c = { id: "C", name: "C", lat: 44, lon: 6 };
  const points: Place[] = [{ ...a, label: "A", stopId: a.id }, { label: "Visit", lat: 43.3, lon: 5 }, { ...c, label: "C", stopId: c.id }];
  const n = emptyNetwork(); ride(n, a, b, 3, 20); ride(n, b, c, 382, 419); ride(n, b, c, 383, 420);
  n.cycling = new Map([
    [cyclingKey(b, points[1]), parseCyclingRoute(geometry(b, points[1], 180 * 60), b, points[1])],
    [cyclingKey(points[1], b), parseCyclingRoute(geometry(points[1], b, 180 * 60), points[1], b)],
  ]);
  const options = preferenceOptions("unrestricted", "none");
  assert.equal(solveWaypoints(n, points, start, preferenceOptions("more", "none"), "baseline").journeys.length, 0);
  const result = solveWaypoints(n, points, start, options, "baseline");
  assert.equal(result.journeys.length, 1); assert.equal(result.journeys[0].totalMinutes, 420);
  assert.equal(metrics(result.journeys[0]).bike, 360);
  assert.equal(result.journeys[0].waypoints![0].arrival.getTime(), time(200).getTime());
  n.edges.clear(); ride(n, a, b, 3, 20); ride(n, b, c, 1430, 1450);
  assert.equal(solveWaypoints(n, points, start, options, "baseline").journeys.length, 0);
});

it("reports routing-service failure separately from an off-network point or disconnected path", async () => {
  const a = { id: "A", name: "A", lat: 42, lon: 4 }, b = { id: "B", name: "B", lat: 43, lon: 5 };
  const from: Place = { label: "Home", lat: 42.001, lon: 4 }, to: Place = { ...b, label: "B", stopId: "B" };
  for (const failure of ["service", "no-route", "off-network"]) {
    const signal = new AbortController().signal;
    const client = new CyclingClient(signal, async () => failure === "off-network"
      ? response(geometry({ ...from, lat: from.lat + .01 }, a, 1200))
      : new Response(failure === "service" ? "unavailable" : "no track found at pass=0", { status: failure === "service" ? 503 : 400 }), 0, false);
    await assert.rejects(plan(from, to, "baseline", DEFAULT_OPTIONS, signal, () => {}, () => {}, {
      start, gapMs: 0, cyclingClient: client, cyclingFetcher: async () => response({}, 503),
      fetcher: async () => response({ stations: [{ ...a, icon: "train", coordinate: { x: a.lat, y: a.lon } }] }),
    }), failure === "service" ? /cycling route service.*try again/i : /Home.*250 m/);
    assert.ok(client.failureKinds.has(failure as "service" | "no-route" | "off-network"));
    assert.equal(client.getCached(from, a), null);
  }
});

it("classifies actual provider errors and retains named, bounded diagnostics", async () => {
  const cases = [
    { status: 400, body: "operation killed by timeout", kind: "service", message: /ran out of time/ },
    { status: 400, body: "no track found at pass=0", kind: "no-route", message: /no usable connection/ },
    { status: 400, body: "from-position not mapped in existing datafile", kind: "off-network", message: /could not be matched/ },
    { status: 400, body: "profile not found", kind: "service", message: /could not complete/ },
    { status: 400, body: "unrecognized error ".repeat(500), kind: "service", message: /could not complete/ },
    { status: 429, body: "busy", kind: "service", message: /is busy/ },
  ] as const;
  const from = { ...fixture.from, label: "Start address" }, to = { ...fixture.to, name: "Station entrance" };
  for (const example of cases) {
    const client = new CyclingClient(new AbortController().signal, async () => new Response(example.body, { status: example.status }), 0, false);
    assert.equal(await client.route(from, to), null);
    const failure = client.failedLinks.get(cyclingKey(from, to))!;
    assert.equal(failure.from, from); assert.equal(failure.to, to);
    assert.equal(failure.kind, example.kind); assert.equal(failure.status, example.status);
    assert.equal(failure.providerDetail, example.body.slice(0, 2048).trim());
    assert.match(failure.message, example.message);
    assert.ok([...client.warnings].every(w => w.includes("Start address → Station entrance")));
    assert.ok([...client.warnings].every(w => !/operation killed|unrecognized error|profile not found/.test(w)));
  }
});
