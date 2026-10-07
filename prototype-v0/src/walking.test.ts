import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { plan } from "./api.ts";
import { cyclingKey, zeroCycling } from "./cycling.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { DEFAULT_OPTIONS, emptyNetwork, metrics, solve, type Options, type Network } from "./model.ts";
import { OjpClient } from "./ojpClient.ts";
import type { Point, TransitLeg } from "./routing.ts";
import { solveWaypoints } from "./waypoints.ts";
import { parseWalkingRoute, WalkingClient, zeroWalking, type WalkingRoute } from "./walking.ts";

const start = new Date("2026-10-08T06:00:00Z"), at = (m: number) => new Date(+start + m * 60000);
const a = { id: "A", name: "Station A", lat: 47.301, lon: 8.4 }, b = { id: "B", name: "Station B", lat: 47.305, lon: 8.41 };
const home = { label: "Home", lat: 47.3, lon: 8.4 }, destination = { label: "Work", lat: 47.306, lon: 8.412 };
const options: Options = { ...DEFAULT_OPTIONS, cyclingPosition: "start-only", takeBikeOnTransit: false, bicycleScope: "confirmed",
  maxBikeMinutes: 5, maxAccessMinutes: 5, maxEgressMinutes: 5, maxWalkingMinutes: 15 };
function bike(n: Network, from: Point, to: Point, minutes: number) {
  n.cycling!.set(cyclingKey(from, to), { ...zeroCycling(from, to), minutes, distanceKm: minutes / 4, source: "BRouter" });
}
function walk(n: Network, from: Point, to: Point, minutes: number): WalkingRoute {
  const route: WalkingRoute = { ...zeroWalking(from, to), minutes, distanceKm: minutes * .075, source: "OSRM foot",
    points: [{ ...from, distanceM: 0, elevationM: null }, { ...to, distanceM: minutes * 75, elevationM: null }] };
  n.walking!.set(cyclingKey(from, to), route); return route;
}
function fixture(endOnly = false) {
  const n = emptyNetwork(); n.cycling = new Map(); n.walking = new Map(); n.stops.set(a.id, a); n.stops.set(b.id, b);
  const leg: TransitLeg = { mode: "transit", from: a.name, to: b.name, fromId: a.id, toId: b.id, fromPoint: a, toPoint: b,
    departure: at(10), arrival: at(30), service: "T4", serviceName: null, direction: null, category: "T", operator: "Test",
    departurePlatform: null, arrivalPlatform: null };
  leg.bicycleEvidence = { permission: "prohibited", fromId: a.id, toId: b.id, departure: at(10).toISOString(), service: leg.service, operator: "Test",
    conditions: [], source: { title: "Dated test restriction", url: "https://example.test/rule", checked: start.toISOString() } };
  n.edges.set("tram", { id: "tram", from: a.id, to: b.id, leg });
  if (endOnly) { walk(n, home, a, 6); bike(n, b, destination, 5); }
  else { bike(n, home, a, 5); walk(n, b, destination, 12); }
  return n;
}
it("cycles to transit and walks to an address without consuming the cycling allowance", () => {
  for (const mode of ["baseline", "extended"] as const) {
    const result = solve(fixture(), home, destination, start, options, mode).journeys;
    assert.equal(result.length, 1);
    const j = result[0], m = metrics(j);
    assert.equal(j.totalMinutes, 42); assert.equal(+j.arrival, +at(42));
    assert.equal(m.bike, 5); assert.equal(m.walk, 12); assert.equal(m.active, 17);
    assert.deepEqual(j.transitLegs.map(l => l.mode), ["bike", "transit", "walk"]);
    assert.equal(j.transitLegs.at(-1)!.geometryKind, "path");
    assert.equal(j.legsIncludeEndpoints, true);
  }
});
it("walks before public transport and cycles after it, in both departure and arrival searches", () => {
  const o = { ...options, cyclingPosition: "end-only" as const };
  for (const arriveBy of [undefined, at(35).toISOString()]) {
    const j = solve(fixture(true), home, destination, start, { ...o, arriveBy }, "baseline").journeys[0];
    assert.ok(j); assert.equal(+j.arrival, +at(35));
    assert.deepEqual(j.transitLegs.map(l => l.mode), ["walk", "transit", "bike"]);
    assert.equal(metrics(j).walk, 6); assert.equal(metrics(j).bike, 5);
    if (arriveBy) assert.equal(+j.startTime, +at(1)); // Six-minute walk plus three-minute boarding allowance.
  }
});
it("includes final walking in arrive-by feasibility and latest-departure seeds", () => {
  const n = fixture(), o = { ...options, arriveBy: at(42).toISOString() };
  const j = solve(n, home, destination, start, o, "baseline").journeys[0];
  assert.ok(j); assert.equal(+j.startTime, +at(2)); assert.equal(+j.startTime + j.totalMinutes * 60000, +at(42));
  assert.equal(solve(n, home, destination, start, { ...o, arriveBy: at(41).toISOString() }, "baseline").journeys.length, 0);
});
it("keeps direction, missing paths, walking limits and bicycle carriage separate", () => {
  for (const reverse of [false, true]) {
    const n = fixture(), route = [...n.walking!.values()][0]!; n.walking!.clear();
    if (reverse) n.walking!.set(cyclingKey(destination, b), { ...route, from: destination, to: b });
    assert.equal(solve(n, home, destination, start, options, "baseline").journeys.length, 0);
  }
  const n = fixture();
  assert.equal(solve(n, home, destination, start, { ...options, maxWalkingMinutes: 11 }, "baseline").journeys.length, 0);
  assert.equal(solve(n, home, destination, start, { ...options, takeBikeOnTransit: true }, "baseline").journeys.length, 0);
  assert.equal(solve(n, home, destination, start, { ...options, takeBikeOnTransit: true, bicycleScope: "all-transit" }, "baseline").journeys.length, 1);
});
it("keeps walking through ordered visits and cannot resume cycling after leaving the bicycle", () => {
  const n = fixture(), via = { label: "Visit", lat: 47.3055, lon: 8.411 };
  walk(n, b, via, 4); walk(n, via, destination, 8);
  bike(n, via, destination, 1); // Must not turn this tempting cycle into a post-transit option.
  for (const mode of ["baseline", "extended"] as const) {
    const j = solveWaypoints(n, [home, via, destination], start, options, mode).journeys[0];
    assert.ok(j); assert.equal(j.totalMinutes, 42); assert.equal(metrics(j).bike, 5); assert.equal(metrics(j).walk, 12);
    assert.equal(+j.waypoints![0].arrival, +at(34));
    assert.deepEqual(j.transitLegs.map(l => l.mode), ["bike", "transit", "walk", "walk"]);
  }
});
it("preserves a walking prefix through an ordered visit for an end-only arrival search", () => {
  const n = fixture(true), via = { label: "Visit", lat: 47.3005, lon: 8.4 };
  walk(n, home, via, 3); walk(n, via, a, 3);
  const o = { ...options, cyclingPosition: "end-only" as const, arriveBy: at(35).toISOString() };
  const j = solveWaypoints(n, [home, via, destination], start, o, "baseline").journeys[0];
  assert.ok(j); assert.equal(+j.startTime, +at(1)); assert.equal(metrics(j).walk, 6); assert.equal(metrics(j).bike, 5);
});
it("retains a real Stadelhofen pedestrian route and rejects non-pedestrian or invalid responses", () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/stadelhofen-walking-2026-10-07.json", import.meta.url), "utf8"));
  const route = parseWalkingRoute(raw.data, raw.from, raw.to);
  assert.equal(route.distanceKm, .6611); assert.equal(route.minutes, 10); assert.ok(route.points.length > 5);
  for (const mode of ["cycling", "driving", "ferry"]) {
    const data = structuredClone(raw.data); data.routes[0].legs[0].steps[0].mode = mode;
    assert.throws(() => parseWalkingRoute(data, raw.from, raw.to), /walking-only/);
  }
  assert.throws(() => parseWalkingRoute({ code: "Ok", routes: [] }, raw.from, raw.to));
  assert.throws(() => parseWalkingRoute(raw.data, { lat: 47, lon: 8 }, raw.to), /250 m/);
});
it("acquires transit to an address via its checked walking path and subtracts walking from arrival queries", async () => {
  for (const endOnly of [false, true]) for (const arrival of [false, true]) {
    const signal = new AbortController().signal, n = fixture(endOnly), bodies: any[] = [];
    const o = { ...options, cyclingPosition: endOnly ? "end-only" as const : "start-only" as const };
    const cycling = new CyclingClient(signal, async () => Response.json({ features: [] }), 0, false, null);
    for (const [key, route] of n.cycling!) cycling.routes.set(key, route);
    const walking = new WalkingClient(signal, async () => Response.json({ code: "NoRoute" }));
    for (const [key, route] of n.walking!) walking.routes.set(key, route);
    const ojpClient = new OjpClient(signal, async (_url, init) => {
      bodies.push(JSON.parse(String(init!.body)));
      return Response.json({ legs: [{ from: a, to: b, mode: "transit", departure: at(10).toISOString(), arrival: at(30).toISOString(),
        service: "T4", serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null }], checked: start.toISOString(), warnings: [] });
    });
    const session = await plan(home, destination, "baseline", o, signal, () => {}, () => {}, { start,
      ...(arrival ? { arriveBy: at(endOnly ? 35 : 42) } : {}), cyclingClient: cycling, walkingClient: walking, ojpClient, gapMs: 0,
      cyclingFetcher: async () => Response.json({ features: [] }), fetcher: async input => {
        const stop = Number(new URL(String(input)).searchParams.get("x")) < 47.304 ? a : b;
        return Response.json({ stations: [{ id: stop.id, name: stop.name, coordinate: { x: stop.lat, y: stop.lon } }] });
      } });
    assert.ok(session.baseline.journeys.length);
    assert.equal(metrics(session.baseline.journeys[0]).walk, endOnly ? 6 : 12);
    assert.equal(bodies[0].departure, at(arrival ? 30 : endOnly ? 6 : 5).toISOString());
    assert.equal(!!bodies[0].arriveBy, arrival);
  }
});
it("queries an onward public-transport stage on foot after leaving the bicycle behind", async () => {
  const signal = new AbortController().signal, n = fixture(), bodies: any[] = [];
  const via = { label: "Visit", lat: 47.306, lon: 8.415 };
  const c = { id: "C", name: "Stop C", lat: 47.3065, lon: 8.415 };
  const d = { id: "D", name: "Stop D", lat: 47.31, lon: 8.42 };
  const finish = { label: "Finish", lat: 47.311, lon: 8.42 };
  walk(n, b, via, 4); walk(n, via, c, 3); walk(n, c, via, 2); walk(n, d, finish, 5);
  const cycling = new CyclingClient(signal, async () => Response.json({ features: [] }), 0, false, null);
  for (const [key, route] of n.cycling!) cycling.routes.set(key, route);
  const walking = new WalkingClient(signal, async () => Response.json({ code: "NoRoute" }));
  for (const [key, route] of n.walking!) walking.routes.set(key, route);
  const ojpClient = new OjpClient(signal, async (_url, init) => {
    const body = JSON.parse(String(init!.body)); bodies.push(body);
    const onward = body.from.id === "C";
    return Response.json({ legs: [{ from: onward ? c : a, to: onward ? d : b, mode: "transit",
      departure: at(onward ? 40 : 10).toISOString(), arrival: at(onward ? 50 : 30).toISOString(),
      service: onward ? "T5" : "T4", serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null }],
      checked: start.toISOString(), warnings: [] });
  });
  const session = await plan(home, finish, "baseline", options, signal, () => {}, () => {}, { start, waypoints: [via],
    cyclingClient: cycling, walkingClient: walking, ojpClient, gapMs: 0,
    cyclingFetcher: async () => Response.json({ features: [] }), fetcher: async input => {
      const lat = Number(new URL(String(input)).searchParams.get("x"));
      const stop = lat < 47.304 ? a : lat < 47.309 ? c : d;
      return Response.json({ stations: [{ id: stop.id, name: stop.name, coordinate: { x: stop.lat, y: stop.lon } }] });
    } });
  const j = session.baseline.journeys[0];
  assert.ok(j); assert.equal(j.totalMinutes, 55); assert.equal(metrics(j).walk, 12); assert.equal(metrics(j).bike, 5);
  assert.ok(bodies.some(body => body.from.id === "C" && body.departure === at(37).toISOString()));
  assert.equal(j.transitLegs.filter(l => l.mode === "bike").length, 1);
});
it("uses the pedestrian service and reuses a checked path without a second request", async () => {
  const raw = JSON.parse(readFileSync(new URL("./fixtures/stadelhofen-walking-2026-10-07.json", import.meta.url), "utf8"));
  const urls: string[] = [];
  const client = new WalkingClient(new AbortController().signal, async url => { urls.push(String(url)); return Response.json(raw.data); });
  const [first, second] = await Promise.all([client.route(raw.from, raw.to), client.route(raw.from, raw.to)]);
  assert.ok(first); assert.equal(first, second); assert.equal(await client.route(raw.from, raw.to), first);
  assert.equal(urls.length, 1); assert.match(urls[0], /\/routed-foot\//);
  assert.equal(client.fork(new AbortController().signal).routes.size, 1);
});
