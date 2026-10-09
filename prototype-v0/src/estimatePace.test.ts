import assert from "node:assert/strict";
import { it } from "node:test";
import { atEndpoint, cyclingLink, DEFAULT_OPTIONS, emptyNetwork, solve } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { cyclingKey, zeroCycling } from "./cycling.ts";
import { cyclingMinutes, cyclingOnly, type Place } from "./routing.ts";

const origin: Place = { lat: 47, lon: 8, label: "Origin" };
const destination: Place = { lat: 47.1, lon: 8, label: "Destination", stopId: "D" };
const station = { lat: 47.009, lon: 8, id: "A", name: "Station" };
const slow = { flatSpeedKmh: 10, electricAssist: false }, fast = { flatSpeedKmh: 30, electricAssist: false };
const start = new Date("2026-10-09T06:00:00Z"), at = (m: number) => new Date(+start + m * 60_000);

it("honours the selected flat pace in offline estimates and both solvers' boarding feasibility", () => {
  assert.equal(cyclingMinutes(5), 20); assert.equal(cyclingMinutes(5, slow), 30); assert.equal(cyclingMinutes(5, fast), 10);
  const n = emptyNetwork(); n.stops.set("A", station); n.stops.set("D", { ...destination, id: "D", name: "D" });
  n.edges.set("train", { id: "train", from: "A", to: "D", leg: { mode: "transit", from: "A", to: "D", fromId: "A", toId: "D",
    departure: at(6), arrival: at(30), departurePlatform: null, arrivalPlatform: null, service: "Train", serviceName: null, direction: null } });
  for (const pace of [slow, fast]) {
    const options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 10, maxEgressMinutes: 0, maxBikeMinutes: 10, maxIntermediateMinutes: 0, cyclingPace: pace };
    for (const result of [solve(n, origin, destination, start, options, "baseline"), solveWaypoints(n, [origin, destination], start, options, "baseline")])
      assert.equal(result.journeys.length, pace === fast ? 1 : 0);
    assert.equal(atEndpoint(station, origin, n, "access", options).bikeMinutes, pace === fast ? 3 : 7);
    assert.equal(cyclingOnly(origin, { ...station, label: station.name }, start, [], pace).minutes, pace === fast ? 3 : 7);
  }
});

it("never substitutes a pace estimate for missing routed geometry and preserves an existing routed duration", () => {
  const n = emptyNetwork(); n.cycling = new Map();
  for (const pace of [slow, fast]) assert.equal(cyclingLink(n, origin, station, pace).minutes, Infinity);
  n.cycling.set(cyclingKey(origin, station), { ...zeroCycling(origin, station), minutes: 17 });
  for (const pace of [slow, fast]) assert.equal(cyclingLink(n, origin, station, pace).minutes, 17);
});
