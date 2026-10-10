import assert from "node:assert/strict";
import { it } from "node:test";
import { cyclingAmountForPreset, cyclingDurationOptions, cyclingDurationFits } from "./cyclingDuration.ts";
import { categorize, DEFAULT_OPTIONS, emptyNetwork, metrics, solve, validateOptions, type Options } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { cyclingKey, zeroCycling } from "./cycling.ts";
import { preferenceOptions } from "./preferences.ts";
import type { Place } from "./routing.ts";

const start = new Date("2026-10-10T08:00:00+02:00");
const at = (m: number) => new Date(+start + m * 60000);
const origin: Place = { lat: 47, lon: 8, label: "Home" };
function fixture() {
  const n = emptyNetwork();
  const [a, b, m, d] = [47.01, 47.02, 47.1, 47.2].map((lat, i) => ({ lat, lon: 8, id: String(i), name: String(i) }));
  for (const s of [a, b, m, d]) n.stops.set(s.id, s);
  const ride = (from: typeof a, to: typeof a, depart: number, arrive: number, mode: "transit" | "walk" = "transit") => {
    const id = `${from.id}:${to.id}`;
    n.edges.set(id, { id, from: from.id, to: to.id, leg: { mode, from: from.name, to: to.name,
      fromId: from.id, toId: to.id, fromPoint: from, toPoint: to, departure: at(depart), arrival: at(arrive),
      service: id, serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null } });
  };
  ride(a, m, 5, 15); ride(b, m, 11, 18); ride(m, d, 25, 45);
  n.cycling = new Map([a, b].map((s, i) => [cyclingKey(origin, s), { ...zeroCycling(origin, s), minutes: i ? 8 : 2, points: [origin, s] }]));
  const destination: Place = { ...d, label: "Finish", stopId: d.id };
  const via: Place = { ...m, label: "Requested stop", stopId: m.id };
  const options: Options = { ...DEFAULT_OPTIONS, maxBikeMinutes: 20, maxAccessMinutes: 10,
    maxEgressMinutes: 0, maxIntermediateMinutes: 0, horizonMinutes: 90, maxBoardings: 2 };
  return { n, a, b, m, d, destination, via, options, ride };
}

it("maps existing profiles and quick durations to explicit whole-journey choices", () => {
  assert.deepEqual(cyclingAmountForPreset("commuter"), { mode: "at-most", minutes: 45 });
  assert.equal(cyclingAmountForPreset("unrestricted").mode, "none");
  for (const minutes of [0, 40, 45, 90, 150, 237, 1440]) {
    const maximum = cyclingDurationOptions({ mode: "at-most", minutes });
    assert.deepEqual([maximum.maxBikeMinutes, maximum.maxAccessMinutes, maximum.maxEgressMinutes, maximum.maxIntermediateMinutes], Array(4).fill(minutes));
    assert.equal(maximum.minBikeMinutes, 0); validateOptions({ ...DEFAULT_OPTIONS, ...maximum });
    const minimum = cyclingDurationOptions({ mode: "at-least", minutes });
    assert.equal(minimum.minBikeMinutes, minutes); assert.equal(minimum.maxBikeMinutes, 1440);
    assert.equal(cyclingDurationFits(minutes, minimum), true);
    if (minutes) assert.equal(cyclingDurationFits(minutes - .01, minimum), false);
  }
  const unbounded = cyclingDurationOptions({ mode: "none", minutes: NaN });
  assert.equal(cyclingDurationFits(240, unbounded), true); assert.equal(cyclingDurationFits(10, unbounded), true);
  validateOptions({ ...DEFAULT_OPTIONS, ...unbounded });
  const o = preferenceOptions("balanced", "both", undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, { mode: "at-most", minutes: 123 });
  assert.equal(o.maxBikeMinutes, 123); assert.equal(o.maxAccessMinutes, 123); assert.equal(o.endpointPreference, "both");
});
it("renders transient cleared durations but rejects invalid bounds before searching", () => {
  for (const minutes of [NaN, Infinity, -1, .5, 1441]) for (const mode of ["at-most", "at-least"] as const) {
    const options = { ...DEFAULT_OPTIONS, ...cyclingDurationOptions({ mode, minutes }) };
    assert.throws(() => validateOptions(options));
  }
  assert.throws(() => validateOptions({ ...DEFAULT_OPTIONS, minBikeMinutes: 100, maxBikeMinutes: 90 }));
});
for (const waypoint of [false, true]) for (const mode of ["baseline", "extended"] as const) {
  it(`keeps a longer prefix needed to satisfy the minimum (${waypoint ? "waypoints" : "ordinary"}, ${mode})`, () => {
    const f = fixture();
    const run = (minimum: number, extra: Partial<Options> = {}) => {
      const o = { ...f.options, minBikeMinutes: minimum, ...extra };
      return waypoint ? solveWaypoints(f.n, [origin, f.via, f.destination], start, o, mode)
        : solve(f.n, origin, f.destination, start, o, mode);
    };
    assert.ok(run(0).journeys.length); assert.ok(run(0).journeys.every(j => metrics(j).bike === 2));
    const found = run(8); assert.equal(found.limited, false); assert.ok(found.journeys.length);
    assert.ok(found.journeys.every(j => metrics(j).bike === 8));
    assert.ok(found.journeys.every(j => j.transitLegs.some(l => l.fromId === f.b.id)));
    assert.equal(run(9).journeys.length, 0, "No invented loops or added minutes");
    assert.equal(run(8, { arriveBy: at(44).toISOString() }).journeys.length, 0);
    assert.ok(run(8, { arriveBy: at(45).toISOString() }).journeys.length);
    for (let min = 0; min <= 20; min++) for (const max of [min, 20]) {
      const actual = run(min, { maxBikeMinutes: max }).journeys.map(j => metrics(j).bike);
      // Independent enumeration: exactly two paths feed the common departure.
      const feasible = [2, 8].filter(bike => bike >= min && bike <= max);
      const expected = feasible.length ? Math.min(...feasible) : null;
      assert.equal(actual.length > 0, expected !== null, JSON.stringify({ min, max, waypoint, mode }));
      assert.ok(actual.every(bike => bike === expected));
    }
  });
}
it("adds cycling across requested stages and excludes walking and waiting from the minimum", () => {
  const f = fixture();
  const finish: Place = { lat: 47.21, lon: 8, label: "Final cycling destination" };
  f.n.cycling!.set(cyclingKey(f.destination, finish), { ...zeroCycling(f.destination, finish), minutes: 5, points: [f.destination, finish] });
  for (const waypoint of [false, true]) {
    const o = { ...f.options, maxEgressMinutes: 5, minBikeMinutes: 13 };
    const result = waypoint ? solveWaypoints(f.n, [origin, f.via, finish], start, o, "baseline")
      : solve(f.n, origin, finish, start, o, "baseline");
    assert.ok(result.journeys.length); assert.ok(result.journeys.every(j => metrics(j).bike === 13));
  }
  f.ride(f.m, f.d, 20, 45, "walk");
  const o = { ...f.options, minBikeMinutes: 9 };
  assert.equal(solve(f.n, origin, f.destination, start, o, "baseline").journeys.length, 0);
  assert.equal(solveWaypoints(f.n, [origin, f.via, f.destination], start, o, "baseline").journeys.length, 0);
});
it("excludes an under-minimum reference before applying the category time allowance", () => {
  const f = fixture(), short = solve(f.n, origin, f.destination, start, f.options, "baseline").journeys[0];
  const long = solve(f.n, origin, f.destination, start, { ...f.options, minBikeMinutes: 8 }, "baseline").journeys[0];
  const selected = categorize([{ ...short, totalMinutes: 10 }, { ...long, totalMinutes: 80 }], { ...f.options, minBikeMinutes: 8, extraTimeMinutes: 5 });
  assert.ok(selected.length); assert.ok(selected.every(p => p.journey.id === long.id));
});
