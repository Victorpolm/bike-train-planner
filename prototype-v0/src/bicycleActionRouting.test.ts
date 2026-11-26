import assert from "node:assert/strict";
import { it } from "node:test";
import { bicycleRoutingPoint } from "./bicycleAvailability.ts";
import { cyclingKey, parseCyclingRoute, zeroCycling } from "./cycling.ts";
import { DEFAULT_OPTIONS, emptyNetwork, metrics, solve, type Network, type Options, type Stop } from "./model.ts";
import { haversineKm, type Place, type Point, type TransitLeg } from "./routing.ts";
import { parseWalkingRoute, zeroWalking } from "./walking.ts";
import { solveWaypoints } from "./waypoints.ts";

const start = new Date("2026-11-26T08:00:00Z"), at = (minutes: number) => new Date(+start + minutes * 60_000);
const place = (i: number, label = `Place ${i}`): Place => ({ label, lat: 47 + i * .001, lon: 8 });
const station = (i: number): Stop => ({ id: `S${i}`, name: `Station ${i}`, lat: place(i).lat, lon: 8 });
const action = (i: number, bicycleAction: "park" | "collect"): Place => ({ ...place(i), bicycleAction });
const options: Options = { ...DEFAULT_OPTIONS, bicycleScope: "confirmed", objectives: ["fastest"], maxBikeMinutes: 30,
  maxAccessMinutes: 30, maxEgressMinutes: 30, maxWalkingMinutes: 15, maxBoardings: 2 };
function network() { const n = emptyNetwork(); n.cycling = new Map(); n.walking = new Map(); return n; }
function walk(n: Network, from: Point, to: Point, minutes = 2) {
  const route = parseWalkingRoute({ code: "Ok", routes: [{ duration: minutes * 60, distance: haversineKm(from, to) * 1000,
    geometry: { type: "LineString", coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
    legs: [{ steps: [{ mode: "walking" }] }] }] }, from, to);
  n.walking!.set(cyclingKey(from, to), route); return route;
}
function bike(n: Network, from: Point, to: Point, minutes = 2) {
  const route = parseCyclingRoute({ features: [{ geometry: { type: "LineString", coordinates: [[from.lon, from.lat, 400], [to.lon, to.lat, 400]] },
    properties: { "track-length": haversineKm(from, to) * 1000, "total-time": minutes * 60 } }] }, from, to);
  n.cycling!.set(cyclingKey(from, to), route); return route;
}
function transit(n: Network, from: Stop, to: Stop, departure: number, arrival: number, permission: "allowed" | "prohibited" = "allowed") {
  for (const stop of [from, to]) n.stops.set(stop.id, stop);
  const service = `${from.id}-${to.id}-${departure}`;
  const leg: TransitLeg = { mode: "transit", from: from.name, to: to.name, fromId: from.id, toId: to.id,
    fromPoint: from, toPoint: to, departure: at(departure), arrival: at(arrival), service, serviceName: null,
    operator: "Unreviewed fixture operator", category: "R", direction: null, departurePlatform: null, arrivalPlatform: null };
  leg.bicycleEvidence = { permission, fromId: from.id, toId: to.id, departure: leg.departure!.toISOString(), operator: leg.operator!, service,
    conditions: [], source: { title: "Synthetic service evidence", url: "https://example.com", checked: "2026-11-26" } };
  n.edges.set(service, { id: service, from: from.id, to: to.id, leg }); return leg;
}

it("uses current possession when raw network legs already carry another journey's custody annotation", () => {
  const n = network(), a = station(1), b = station(4), origin = { ...place(1), stopId: a.id }, finish = { ...place(4), stopId: b.id };
  const leg = transit(n, a, b, 10, 20); leg.bicycleOnBoard = false;
  assert.equal(solve(n, origin, finish, start, { ...options, takeBikeOnTransit: false }, "baseline").journeys.length, 0);
  leg.bicycleEvidence!.permission = "prohibited";
  assert.equal(solve(n, origin, finish, start, options, "baseline").journeys.length, 0);
  leg.bicycleOnBoard = true;
  const passenger = solve(n, origin, finish, start, { ...options, bicycleAtOrigin: false }, "baseline").journeys[0];
  assert.ok(passenger); assert.equal(passenger.transitLegs.find(l => l.mode === "transit")!.bicycleOnBoard, false);
});

it("rejects incoming and outgoing action teleports through runtime IDs, cached zero paths, and unchecked snaps", () => {
  for (const kind of ["park", "collect"] as const) {
    const n = network(), origin = { ...place(0), stopId: "alias" }, stop = { ...action(1, kind), stopId: "alias", id: "alias" }, finish = place(2);
    const o = { ...options, bicycleAtOrigin: kind === "park", maxBoardings: 0 }, points = [origin, stop, finish];
    assert.equal("id" in bicycleRoutingPoint(stop), false); assert.equal(bicycleRoutingPoint(stop).stopId, undefined);
    if (kind === "collect") { n.walking!.set(cyclingKey(origin, stop), zeroWalking(origin, stop)); bike(n, stop, finish); }
    else { n.cycling!.set(cyclingKey(origin, stop), zeroCycling(origin, stop)); walk(n, stop, finish); }
    assert.equal(solveWaypoints(n, points, start, o, "baseline").journeys.length, 0);
    const incoming = kind === "collect" ? walk(n, origin, stop) : bike(n, origin, stop);
    assert.ok(solveWaypoints(n, points, start, o, "baseline").journeys.length);
    incoming.endGapM = 30;
    for (const arriveBy of [undefined, at(60).toISOString()])
      assert.equal(solveWaypoints(n, points, start, { ...o, arriveBy }, "baseline").journeys.length, 0);
    incoming.endGapM = 0;
    if (kind === "collect") n.cycling!.set(cyclingKey(stop, finish), zeroCycling(stop, finish));
    else n.walking!.set(cyclingKey(stop, finish), zeroWalking(stop, finish));
    assert.equal(solveWaypoints(n, points, start, o, "baseline").journeys.length, 0);
  }
});

it("can collect after transit and push the bicycle to a later train before end-only riding", () => {
  const n = network(), origin = place(0), a = station(1), b = station(4), collect = action(5, "collect"), c = station(6), d = station(9), finish = place(10);
  walk(n, origin, a); transit(n, a, b, 10, 20, "prohibited"); walk(n, b, collect); walk(n, collect, c, 3); bike(n, collect, c);
  const onward = transit(n, c, d, 30, 40); bike(n, d, finish, 4);
  const o: Options = { ...options, bicycleAtOrigin: false, cyclingPosition: "end-only", minBikeMinutes: 4, maxBikeMinutes: 4 };
  for (const arriveBy of [undefined, at(44).toISOString()]) {
    const result = solveWaypoints(n, [origin, collect, finish], start, { ...o, arriveBy }, "baseline");
    const j = result.journeys[0]; assert.ok(j); assert.equal(result.stageArrivalsByMode[1].walk, +at(22));
    assert.deepEqual(j.transitLegs.filter(l => l.mode === "transit").map(l => l.bicycleOnBoard), [false, true]);
    const lastTransit = j.transitLegs.findLastIndex(l => l.mode === "transit");
    assert.ok(j.transitLegs.slice(0, lastTransit).every(l => l.mode !== "bike"));
    assert.ok(j.transitLegs.some(l => l.mode === "walk" && l.bicycleWithTraveller === true));
    assert.equal(metrics(j).bike, 4); assert.equal(+j.arrival, +at(44));
  }
  onward.bicycleEvidence!.permission = "prohibited";
  assert.equal(solveWaypoints(n, [origin, collect, finish], start, o, "baseline").journeys.length, 0);
});

it("does not finish the end-only riding phase merely by pushing along a bicycle path", () => {
  const n = network(), origin = place(0), a = station(1), b = station(4), collect = action(5, "collect"), via = place(6), c = station(7), d = station(9), finish = place(10);
  walk(n, origin, a); transit(n, a, b, 10, 20, "prohibited"); walk(n, b, collect);
  const pushing = bike(n, collect, via, 3); pushing.ridingSeconds = 0; pushing.pushingSeconds = 180;
  walk(n, via, c); transit(n, c, d, 35, 45); bike(n, d, finish, 4);
  const j = solveWaypoints(n, [origin, collect, via, finish], start,
    { ...options, bicycleAtOrigin: false, cyclingPosition: "end-only", minBikeMinutes: 4, maxBikeMinutes: 4 }, "baseline").journeys[0];
  assert.ok(j); assert.equal(metrics(j).bike, 4); assert.equal(j.transitLegs.filter(l => l.mode === "transit").length, 2);
});

it("keeps a checked direct walk through visits when the riding phase is finished, including arrive-by", () => {
  const n = network(), origin = place(0), via = place(1), finish = place(2);
  via.visit = { id: "pause", name: "Pause", category: "parking", minutes: 4, lat: via.lat, lon: via.lon };
  walk(n, origin, via); walk(n, via, finish, 3); bike(n, origin, via, 1); bike(n, via, finish, 1);
  for (const arriveBy of [undefined, at(60).toISOString()]) {
    const j = solveWaypoints(n, [origin, via, finish], start, { ...options, cyclingFinished: true, maxBoardings: 0, arriveBy }, "baseline").journeys[0];
    assert.ok(j); assert.equal(j.totalMinutes, 9); assert.equal(metrics(j).bike, 0);
    assert.deepEqual(j.transitLegs.map(l => l.mode), ["walk", "stop", "walk"]);
    assert.ok(j.transitLegs.every(l => l.bicycleWithTraveller === true));
    assert.equal(+j.startTime, +at(arriveBy ? 51 : 0));
  }
});
