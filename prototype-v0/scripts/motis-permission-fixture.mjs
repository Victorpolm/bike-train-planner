import assert from "node:assert/strict";
import { DEFAULT_OPTIONS, emptyNetwork, solve } from "../src/model.ts";

// A shared synthetic fixture for the current solver and the optional local MOTIS pilot.
const stops = [8.53, 8.60, 8.78].map((lon, i) => ({ id: "ABC"[i], name: `Pilot ${"ABC"[i]}`, lat: 47.38, lon }));
const services = [
  { id: "OK", category: "RE", routeType: 2, bikesAllowed: 1, arrival: 40 },
  { id: "UNKNOWN", category: "B", routeType: 3, bikesAllowed: 0, arrival: 30 },
  { id: "NO", category: "B", routeType: 3, bikesAllowed: 2, arrival: 20 },
];
const start = new Date("2026-10-01T08:00:00+02:00"), network = emptyNetwork();
for (const stop of stops) network.stops.set(stop.id, stop);
for (const s of services) {
  const leg = { mode: "transit", from: stops[0].name, to: stops[2].name, fromId: "A", toId: "C",
    fromPoint: stops[0], toPoint: stops[2], departure: new Date(+start + 10 * 60_000),
    arrival: new Date(+start + s.arrival * 60_000), service: s.id, serviceName: s.id,
    category: s.category, operator: "Synthetic pilot", direction: null, departurePlatform: null, arrivalPlatform: null };
  if (s.bikesAllowed) leg.bicycleEvidence = { permission: s.bikesAllowed === 1 ? "allowed" : "prohibited",
    fromId: "A", toId: "C", departure: leg.departure.toISOString(), service: s.id, operator: leg.operator,
    source: { title: "Synthetic fixture", url: "https://example.org", checked: "2026-09-30" }, conditions: [] };
  network.edges.set(s.id, { id: s.id, from: "A", to: "C", leg });
}
const places = stops.map(s => ({ ...s, label: s.name, stopId: s.id }));
const current = {};
for (const bicycleScope of ["confirmed", "allow-uncertain", "all-transit"]) {
  const result = solve(network, places[0], places[2], start, { ...DEFAULT_OPTIONS, bicycleScope,
    busPreference: "include-unknown", maxAccessMinutes: 0, maxEgressMinutes: 0, maxIntermediateMinutes: 0,
    maxBikeMinutes: 0, maxBoardings: 1 }, "baseline");
  assert.equal(result.limited, false);
  const best = result.journeys.reduce((a, b) => a.totalMinutes < b.totalMinutes ? a : b);
  current[bicycleScope] = { service: best.transitLegs[0].service, arrival: best.arrival.toISOString() };
}
assert.deepEqual(Object.values(current).map(x => x.service), ["OK", "UNKNOWN", "NO"]);
console.log(JSON.stringify({ stops, services, current }));
