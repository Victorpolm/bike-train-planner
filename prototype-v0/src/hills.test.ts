import assert from "node:assert/strict";
import { it } from "node:test";
import { climbingTradeoff, DEFAULT_HILLS, journeyClimb, routeClimb, uphillParameters, validateHills } from "./hills.ts";
import { chooseCyclingRoute } from "./cyclingPreferences.ts";
import { cyclingKey, zeroCycling, type CyclingRoute } from "./cycling.ts";
import { categorize, DEFAULT_OPTIONS, emptyNetwork, solve, type Options } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { selectStationPairs } from "./api.ts";
import { CyclingClient } from "./cyclingClient.ts";
import type { Place, Point, Station } from "./routing.ts";

const origin: Place = { lat: 47, lon: 8, label: "Origin" };
const destination: Place = { lat: 47.1, lon: 8.1, label: "Destination", stopId: "D" };
const start = new Date("2026-10-05T08:00:00+02:00");
const at = (m: number) => new Date(+start + m * 60_000);
function route(from: Point, to: Point, minutes: number, heights: (number | null)[], interval = 100): CyclingRoute {
  const points = heights.map((elevationM, i) => ({ lat: from.lat + (to.lat - from.lat) * i / (heights.length - 1),
    lon: from.lon + (to.lon - from.lon) * i / (heights.length - 1), distanceM: i * interval, elevationM }));
  const ascent = heights.slice(1).reduce<number>((sum, h, i) => sum + Math.max(0, (h ?? 0) - (heights[i] ?? 0)), 0);
  return { ...zeroCycling(from, to), points, elevation: points, minutes, distanceKm: interval * (heights.length - 1) / 1000,
    ascentM: heights.includes(null) ? null : ascent, elevationCoverage: heights.includes(null) ? .5 : 1, source: "BRouter" };
}
it("distinguishes total ascent, downhill and adjustable uphill thresholds", () => {
  const r = route(origin, destination, 10, [400, 408, 400, 404]);
  assert.equal(routeClimb(r, r.minutes, 6).ascent, 12);
  assert.equal(routeClimb(r, r.minutes, 6).steepM, 100);
  assert.equal(routeClimb(r, r.minutes, 3).steepM, 200);
  assert.equal(routeClimb(r, r.minutes, 8).steepM, 0);
  assert.equal(routeClimb(r).maxGrade, 8);
  assert.equal(routeClimb(route(origin, destination, 10, [408, 400])).steepM, 0);
});
it("chooses gentle paths while preserving the ordinary preference and respecting detour time", () => {
  const steep = route(origin, destination, 5, [400, 408]);
  const gentle = route(origin, destination, 8, [400, 405, 410]);
  const unknown = route(origin, destination, 4, [400, null]);
  assert.equal(chooseCyclingRoute([steep, gentle], "fastest", DEFAULT_HILLS)?.minutes, 5);
  assert.equal(chooseCyclingRoute([steep, gentle], "fastest", { ...DEFAULT_HILLS, mode: "gentler" })?.minutes, 8);
  assert.equal(chooseCyclingRoute([steep, gentle], "fastest", { ...DEFAULT_HILLS, mode: "gentler", extraMinutes: 2 })?.minutes, 5);
  assert.equal(chooseCyclingRoute([unknown, gentle], "fastest", { ...DEFAULT_HILLS, mode: "gentler" })?.minutes, 8);
  assert.equal(routeClimb(unknown).unknown, 1);
  assert.equal(routeClimb(undefined, 2).unknown, 1);
  assert.equal(routeClimb(zeroCycling(origin, origin)).unknown, 0);
});
it("validates slope percentages and builds soft uphill penalties", () => {
  assert.throws(() => validateHills({ ...DEFAULT_HILLS, mode: "less-climbing" as never }));
  for (const maxUphillPercent of [0, 21, NaN, Infinity]) assert.throws(() => validateHills({ ...DEFAULT_HILLS, maxUphillPercent }));
  for (const extraMinutes of [-1, 61, NaN]) assert.throws(() => validateHills({ ...DEFAULT_HILLS, extraMinutes }));
  const params = new URLSearchParams(); uphillParameters(params, { ...DEFAULT_HILLS, mode: "gentler", maxUphillPercent: 4.5 });
  assert.equal(params.get("profile:uphillcutoff"), "4.5"); assert.equal(params.get("profile:uphillcost"), "160");
});
function network() {
  const n = emptyNetwork(); n.cycling = new Map();
  const stops = [{ id: "A", name: "Short steep access", lat: 47.005, lon: 8 }, { id: "B", name: "Gentle access", lat: 47, lon: 8.006 },
    { id: "X", name: "Common interchange", lat: 47.07, lon: 8.07 }, { id: "D", name: "Destination", ...destination }];
  stops.forEach(s => n.stops.set(s.id, s));
  n.cycling.set(cyclingKey(origin, stops[0]), route(origin, stops[0], 5, [400, 500]));
  n.cycling.set(cyclingKey(origin, stops[1]), route(origin, stops[1], 10, [400, 400]));
  for (const [from, to, depart, arrive] of [["A", "X", 10, 20], ["B", "X", 15, 25], ["X", "D", 40, 60]] as const) {
    const id = `${from}-${to}`;
    n.edges.set(id, { id, from, to, leg: { mode: "transit", fromId: from, toId: to, from, to, departure: at(depart), arrival: at(arrive),
      service: id, serviceName: null, operator: "Synthetic operator", direction: null, departurePlatform: null, arrivalPlatform: null } });
  }
  return n;
}
const options: Options = { ...DEFAULT_OPTIONS, maxBikeMinutes: 30, maxAccessMinutes: 20, maxEgressMinutes: 0,
  bicycleScope: "allow-uncertain", hills: { ...DEFAULT_HILLS }, climbOptimization: true };
it("retains the slower low-climb state at a common stop in both solvers", () => {
  for (const waypoint of [false, true]) {
    const n = network();
    const run = (o: Options) => waypoint ? solveWaypoints(n, [origin, destination], start, o, "baseline") : solve(n, origin, destination, start, o, "baseline");
    const old = run({ ...options, climbOptimization: false });
    assert.equal(old.journeys.some(j => j.transitLegs.some(l => l.fromId === "B")), false);
    const found = run(options), proposals = categorize(found.journeys, options);
    const low = proposals.find(p => p.categories.includes("Reduce climbing"))!.journey;
    assert.ok(low.transitLegs.some(l => l.fromId === "B")); assert.equal(journeyClimb(low).ascent, 0);
    assert.ok(proposals.some(p => p.categories.includes("Fastest") && p.journey.transitLegs.some(l => l.fromId === "A")));
  }
});
it("does not select unknown elevation as a climbing winner or relax bicycle permission", () => {
  const n = network();
  for (const [key, r] of n.cycling!) if (r) n.cycling!.set(key, { ...r, ascentM: null, elevationCoverage: 0 });
  const result = solve(n, origin, destination, start, options, "baseline");
  assert.ok(result.journeys.length);
  assert.ok(categorize(result.journeys, options).every(p => !p.categories.includes("Reduce climbing")));
  assert.equal(solve(network(), origin, destination, start, { ...options, bicycleScope: "confirmed" }, "baseline").journeys.length, 0);
});
it("keeps a gentler option even when it has more total ascent", () => {
  const n = network(), a = n.stops.get("A")!, b = n.stops.get("B")!;
  n.cycling!.set(cyclingKey(origin, a), route(origin, a, 5, [400, 480], 1000));
  n.cycling!.set(cyclingKey(origin, b), route(origin, b, 10, [400, 500], 2000));
  const o = { ...options, hills: { ...DEFAULT_HILLS, mode: "gentler" as const } };
  for (const found of [solve(n, origin, destination, start, o, "baseline"), solveWaypoints(n, [origin, destination], start, o, "baseline")]) {
    const proposals = categorize(found.journeys, o);
    assert.ok(proposals.find(p => p.categories.includes("Gentlest cycling"))!.journey.transitLegs.some(l => l.fromId === "B"));
    assert.ok(!proposals.some(p => p.categories.includes("Reduce climbing")), "The fastest is already the lowest climb; it has no ascent saving over itself.");
  }
});
it("reserves a timetable query for the road-checked low-ascent pair", () => {
  const n = network();
  const origins: Station[] = [...n.stops.values()].slice(0, 2).map(s => ({ ...s, distanceKm: 1, bikeMinutes: s.id === "A" ? 5 : 10,
    cyclingRoute: n.cycling!.get(cyclingKey(origin, s))! }));
  const end: Station = { ...destination, id: "D", name: "D", distanceKm: 0, bikeMinutes: 0 };
  assert.deepEqual(selectStationPairs(origins, [end], 30, new Set(), 2, true).map(([a]) => a.id), ["A", "B"]);
});
it("requests a hill-specific alternative, carries the threshold through fork and separates cache keys", async () => {
  const from = { lat: 47, lon: 8 }, to = { lat: 47.001, lon: 8 }, calls: URL[] = [];
  const data = (gentle: boolean) => ({ features: [{ geometry: { type: "LineString", coordinates: gentle
    ? [[8, 47, 400], [8.0002, 47.0005, 401], [8, 47.001, 402]] : [[8, 47, 400], [8, 47.001, 410]] },
    properties: { "track-length": gentle ? 117 : 111, "total-time": 60 } }] });
  const fetcher: typeof fetch = async input => { const url = new URL(String(input)); calls.push(url); return Response.json(data(url.searchParams.has("profile:uphillcost"))); };
  const hills = { ...DEFAULT_HILLS, mode: "gentler" as const, maxUphillPercent: 4 };
  const client = new CyclingClient(new AbortController().signal, fetcher, 0, false, null, undefined, "fastest", null, hills);
  const found = await client.route(from, to); assert.ok(found);
  assert.ok(calls.some(url => url.searchParams.get("profile:uphillcutoff") === "4"));
  assert.equal(found.ascentM, 2); assert.deepEqual(client.fork(new AbortController().signal).hills, hills);
  const before = calls.length;
  for (const threshold of [4, 10, 4]) {
    const cached = new CyclingClient(new AbortController().signal, fetcher, 0, true, null, undefined, "fastest", null, { ...hills, maxUphillPercent: threshold });
    await cached.route(from, to);
  }
  assert.equal(calls.length - before, 4, "Each threshold gets its own pair of requests; returning to the first threshold reuses its cache.");
});

it("offers Reduce climbing only as a separate category without changing the main winners", () => {
  const journeys = solve(network(), origin, destination, start, options, "baseline").journeys;
  const normal = categorize(journeys, { ...options, climbOptimization: false });
  const extra = categorize(journeys, options);
  assert.ok(normal.every(p => !p.categories.includes("Reduce climbing")));
  assert.ok(extra.some(p => p.categories.includes("Reduce climbing")));
  for (const name of ["Fastest", "Fewest boardings", "Least cycling or walking"])
    assert.equal(extra.find(p => p.categories.includes(name))!.journey.id, normal.find(p => p.categories.includes(name))!.journey.id);
  assert.equal(options.hills!.mode, "none");
});

it("rejects small, proportionally tiny, overlong and poor-value climbing detours", () => {
  const base = solve(network(), origin, destination, start, options, "baseline").journeys[0];
  const candidate = (id: string, minutes: number, ascent: number) => ({ ...base, id, totalMinutes: minutes,
    originStation: { ...base.originStation, cyclingRoute: route(origin, base.originStation, 5, [400, 400 + ascent], 10_000) } });
  assert.equal(climbingTradeoff(candidate("a", 120, 30), candidate("b", 121, 10), 60), null);
  assert.equal(climbingTradeoff(candidate("a", 120, 1000), candidate("b", 121, 950), 60), null);
  assert.equal(climbingTradeoff(candidate("a", 120, 600), candidate("b", 151, 0), 60), null);
  assert.equal(climbingTradeoff(candidate("a", 40, 600), candidate("b", 51, 0), 60), null);
  assert.equal(climbingTradeoff(candidate("a", 120, 600), candidate("b", 136, 300), 60), null);
  assert.equal(climbingTradeoff(candidate("a", 120, 600), candidate("b", 135, 300), 60), null, "A score tie does not add a card.");
  assert.equal(climbingTradeoff(candidate("a", 120, 600), candidate("b", 130, 300), 5), null);
  assert.equal(climbingTradeoff(candidate("a", 120, 600), candidate("b", 130, 300), 60)!.savedMetres, 300);
  const a = candidate("a", 120, 600), b = candidate("b", 130, 300), c = candidate("c", 149, 0);
  const proposals = categorize([a, b, c], { ...options, extraTimeMinutes: 60 });
  const winner = proposals.find(p => p.categories.includes("Reduce climbing"))!;
  assert.equal(winner.journey.id, "b", "A useful compromise wins over the absolute flattest route.");
  assert.equal(winner.climbingSaved, 300);
  assert.equal(proposals.find(p => p.categories.includes("Fastest"))!.journey.id, "a");
  assert.equal(journeyClimb(c).ascent, 0, "Raw ascent is not altered by recommendation tolerances.");
  assert.equal(climbingTradeoff({ ...a, startTime: at(40) }, { ...b, startTime: at(10) }, 60, true), null,
    "Arrive-by counts how much earlier the alternative requires leaving.");
});
