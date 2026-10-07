import assert from "node:assert/strict";
import { it } from "node:test";
import { categorize, compareModels, DEFAULT_OPTIONS, emptyNetwork, solve, validateOptions, type Network, type Options } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { cyclingKey, zeroCycling } from "./cycling.ts";
import { journeySteps } from "./itinerary.ts";
import type { Place } from "./routing.ts";

const start = new Date("2026-10-05T06:00:00Z");
const at = (m: number) => new Date(+start + m * 60_000);
const a: Place = { label: "A", stopId: "A", lat: 47, lon: 8 };
const x: Place = { label: "X", stopId: "X", lat: 47.1, lon: 8 };
const y: Place = { label: "Y", stopId: "Y", lat: 47.1, lon: 8.01 };
const d: Place = { label: "D", stopId: "D", lat: 47.2, lon: 8 };
const home: Place = { label: "Home", lat: 47.21, lon: 8 };
const options: Options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 10, maxBikeMinutes: 15,
  maxIntermediateMinutes: 5, horizonMinutes: 120, arriveBy: at(100).toISOString() };
function ride(n: Network, from: Place, to: Place, departure: number, arrival: number) {
  const id = `${from.stopId}-${to.stopId}-${departure}`;
  const leg = { mode: "transit" as const, from: from.label, to: to.label, fromId: from.stopId, toId: to.stopId,
    fromPoint: from, toPoint: to, departure: at(departure), arrival: at(arrival), departurePlatform: null, arrivalPlatform: null,
    service: id, serviceName: null, direction: null };
  n.edges.set(id, { id, from: from.stopId!, to: to.stopId!, leg });
  return leg;
}
function network() {
  const n = emptyNetwork(); n.cycling = new Map();
  [a, x, y, d].forEach(p => n.stops.set(p.stopId!, { ...p, id: p.stopId!, name: p.label }));
  const cycle = (from: Place, to: Place, minutes: number) => n.cycling!.set(cyclingKey(from, to), { ...zeroCycling(from, to), minutes, distanceKm: 1 });
  cycle(d, home, 10); cycle(x, y, 5);
  ride(n, a, x, 10, 30); ride(n, a, x, 40, 60);
  ride(n, x, d, 70, 90); ride(n, y, d, 75, 89);
  ride(n, a, d, 65, 91); // Too late once the final ride is included.
  return n;
}
it("keeps the later origin departure at a shared interchange and includes the final cycle in the deadline", () => {
  const n = network();
  for (const waypoints of [false, true]) {
    const result = waypoints ? solveWaypoints(n, [a, x, home], start, options, "baseline") : solve(n, a, home, start, options, "baseline");
    const proposals = categorize(result.journeys, options), latest = proposals.find(p => p.categories.includes("Leave latest"))!.journey;
    assert.equal(+latest.startTime, +at(37));
    assert.equal(+latest.startTime + latest.totalMinutes * 60_000, +at(100));
    assert.ok(result.journeys.every(j => !j.transitLegs.some(l => l.service === "A-D-65")));
    const steps = journeySteps(latest, a, home);
    assert.equal(+steps[0].departure!, +latest.startTime);
    assert.equal(+steps.at(-1)!.arrival!, +at(100));
    if (waypoints) assert.deepEqual(latest.waypoints!.map(v => v.place.label), ["X"]);
  }
});
it("matches exhaustive minute-by-minute forward departure searches for both models and ordered visits", () => {
  const n = network();
  for (const mode of ["baseline", "extended"] as const) for (const via of [false, true]) for (const maxBikeMinutes of [9, 10, 15]) {
    const o = { ...options, maxBikeMinutes };
    const run = (time: Date, opts: Options) => via ? solveWaypoints(n, [a, x, home], time, opts, mode) : solve(n, a, home, time, opts, mode);
    const brute = Array.from({ length: 101 }, (_, i) => i).filter(i => run(at(i), { ...o, arriveBy: undefined }).journeys
      .some(j => +j.startTime + j.totalMinutes * 60_000 <= +at(100)));
    const result = run(start, o);
    assert.equal(Math.max(...result.journeys.map(j => (+j.startTime - +start) / 60_000)), Math.max(...brute));
  }
});
it("enforces earliest departure, the look-back window, exact seconds, and preserves Baseline in Extended", () => {
  const n = network();
  assert.equal(solve(n, a, home, at(38), options, "baseline").journeys.length, 0);
  assert.equal(solve(n, a, home, start, { ...options, horizonMinutes: 60 }, "baseline").journeys.length, 0);
  assert.equal(solve(n, a, home, start, { ...options, arriveBy: at(100 - 1 / 60).toISOString() }, "baseline").journeys.length, 0);
  const result = compareModels(n, a, home, start, options);
  assert.ok(result.baseline.journeys.every(j => result.extended.journeys.some(e => e.id === j.id)));
  assert.ok(result.extended.journeys.some(j => j.transitLegs.some(l => l.mode === "bike")));
  assert.equal(solve(n, a, home, start, { ...options, cyclingPosition: "start-only" }, "extended").journeys.length, 0);
  assert.equal(solve(n, a, home, start, { ...options, maxBoardings: 1 }, "extended").journeys.length, 0);
});
it("ranks the latest feasible departure ahead of a shorter trip that leaves earlier", () => {
  const n = network(); n.edges.clear();
  ride(n, a, d, 20, 40); ride(n, a, d, 30, 90);
  const p = categorize(solve(n, a, home, start, options, "baseline").journeys, options);
  const latest = p.find(p => p.categories.includes("Leave latest"))!;
  assert.equal(+latest.journey.startTime, +at(27));
  assert.ok(p.some(p => p.extraMinutes === 10));
  assert.ok(categorize(solve(n, a, home, start, options, "baseline").journeys, { ...options, extraTimeMinutes: 5 }).every(p => p.extraMinutes <= 5));
});
it("accepts only timezone-qualified arrival deadlines", () => {
  for (const arriveBy of ["tomorrow", "2026-10-05T10:00", "2026-10-05", "invalidZ"])
    assert.throws(() => validateOptions({ ...options, arriveBy }));
  validateOptions({ ...options, arriveBy: "2026-10-05T10:00:00+02:00" });
});
it("includes a directed cycling prefix through a required visit before the first boarding", () => {
  const n = network(); n.edges.clear(); ride(n, a, d, 40, 90);
  n.cycling!.set(cyclingKey(home, a), { ...zeroCycling(home, a), minutes: 10, distanceKm: 1 });
  const found = solveWaypoints(n, [home, a, d], start, { ...options, maxAccessMinutes: 10 }, "baseline");
  const latest = categorize(found.journeys, options).find(p => p.categories.includes("Leave latest"))!.journey;
  assert.equal(+latest.startTime, +at(27));
  assert.equal(+latest.waypoints![0].arrival, +at(37));
  assert.equal(solveWaypoints(n, [home, a, d], start, { ...options, maxAccessMinutes: 10, cyclingPosition: "end-only" }, "baseline").journeys.length, 0);
});
