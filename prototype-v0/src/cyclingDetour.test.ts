import assert from "node:assert/strict";
import { it } from "node:test";
import { amenityDetourTarget, detourStages, detourTiming, nearestDetourStage, requestCyclingDetour, type DetourFacility } from "./cyclingDetour.ts";
import { zeroCycling, type CyclingRoute } from "./cycling.ts";
import type { Journey, Place, TransitLeg } from "./routing.ts";
import type { Amenity } from "./osmAmenities.ts";

const time = (minutes: number) => new Date(Date.parse("2026-09-30T08:00:00+02:00") + minutes * 60_000);
const a: Place = { lat: 47.38, lon: 8.5, label: "A" }, b: Place = { lat: 47.38, lon: 8.55, label: "B" };
const via: DetourFacility = { id: "water", name: "Fountain", lat: 47.381, lon: 8.525, category: "water" };
function route(from: Place, to: Place, minutes: number, distanceKm = 2): CyclingRoute {
  return { ...zeroCycling(from, to), id: `${from.label}-${to.label}`, from, to, minutes, distanceKm, source: "BRouter",
    points: [{ ...from, elevationM: 400, distanceM: 0 }, { ...to, elevationM: 400, distanceM: distanceKm * 1000 }] };
}
const original = route(a, b, 10);
const links = [route(a, { ...via, label: via.name }, 8, 1.5), route({ ...via, label: via.name }, b, 7, 1.5)] as const;
function leg(mode: TransitLeg["mode"], depart: number, arrive: number, cyclingRoute?: CyclingRoute): TransitLeg {
  return { mode, departure: time(depart), arrival: time(arrive), from: "Start", to: "End", service: mode === "transit" ? "IC 1" : mode,
    serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null, cyclingRoute };
}
function journey(): Journey {
  return { id: "same-trains", startTime: time(0), originStation: { ...a, id: "A", name: "Station A", bikeMinutes: 10, distanceKm: 2, cyclingRoute: original },
    destinationStation: { ...b, id: "B", name: "Station B", bikeMinutes: 10, distanceKm: 2, cyclingRoute: original },
    departure: time(25), arrival: time(60), trainMinutes: 35, totalMinutes: 70, waitMinutes: 15, changes: 0, services: ["IC 1"],
    transitLegs: [leg("transit", 25, 60)] };
}

it("requests only two directed cycling links and preserves the complete selected journey", async () => {
  const j = journey(), before = JSON.stringify(j), transit = j.transitLegs[0];
  const stage = detourStages(j, null, a, b, time(0))[0];
  const calls: [Place, Place][] = [];
  const results = await requestCyclingDetour(stage, via, { route: async (from, to) => { calls.push([from, to]); return links[calls.length - 1]; } }, new AbortController().signal);
  assert.deepEqual(calls.map(pair => pair.map(p => [p.lat, p.lon])), [[[a.lat, a.lon], [via.lat, via.lon]], [[via.lat, via.lon], [b.lat, b.lon]]]);
  assert.equal(results[0], links[0]); assert.equal(results[1], links[1]);
  const fits = detourTiming(stage, results, 5);
  assert.equal(fits.status, "kept"); assert.equal(fits.marginMinutes, 2); assert.equal(fits.arrival?.getTime(), time(70).getTime());
  assert.equal(fits.addedKm, 1); assert.equal(fits.addedTravelMinutes, 5); assert.equal(fits.addedMinutes, 10);
  const misses = detourTiming(stage, results, 8);
  assert.equal(misses.status, "missed"); assert.equal(misses.marginMinutes, -1); assert.equal(misses.arrival, undefined);
  assert.equal(calls.length, 2, "Changing the visit duration never requests another route");
  assert.equal(j.transitLegs[0], transit); assert.equal(JSON.stringify(j), before);
});

it("counts walking after an intermediate cycling detour before the fixed onward train", () => {
  const j = { ...journey(), legsIncludeEndpoints: true, transitLegs: [leg("transit", 0, 30), leg("bike", 30, 40, original),
    leg("walk", 40, 45), leg("transit", 55, 90), leg("bike", 90, 100, original)] };
  const stage = detourStages(j, null, a, b, time(0))[0];
  const result = detourTiming(stage, links, 5);
  assert.equal(result.status, "missed"); assert.equal(result.marginMinutes, -3);
  const shortened = detourTiming(stage, links, 0);
  assert.equal(shortened.status, "kept"); assert.equal(shortened.marginMinutes, 2); assert.equal(shortened.arrival?.getTime(), time(100).getTime());
});

it("does not claim a connection fits when the onward leg details are unknown", () => {
  const j = { ...journey(), transitLegs: [] };
  const result = detourTiming(detourStages(j, null, a, b, time(0))[0], links, 5);
  assert.equal(result.status, "unknown"); assert.equal(result.arrival, undefined);
});

it("moves the destination arrival only for a detour after the last transit service", () => {
  const stage = detourStages(journey(), null, a, b, time(0))[1];
  const result = detourTiming(stage, links, 5);
  assert.equal(result.status, "no-connection"); assert.equal(result.arrival.getTime(), time(80).getTime());
  assert.equal(result.facilityArrival.getTime(), time(68).getTime());
});

it("keeps required waypoint boundaries and other cycling-only sections", () => {
  const waypoint = { ...via, label: "Required waypoint" }, first = route(a, waypoint, 20), second = route(waypoint, b, 30);
  const comparison = { routes: [first, second], minutes: 50, distanceKm: 4, arrival: time(50) };
  const before = JSON.stringify(comparison), stages = detourStages(null, comparison, a, b, time(0));
  assert.equal(stages.length, 2); assert.equal(stages[0].to.lat, waypoint.lat); assert.equal(stages[1].from.lon, waypoint.lon);
  assert.equal(stages[1].departure.getTime(), time(20).getTime());
  assert.equal(detourTiming(stages[0], links, 10).arrival?.getTime(), time(55).getTime());
  assert.equal(JSON.stringify(comparison), before);
});

it("preselects a section by distance to its full geometry, including the middle", () => {
  const far = route({ ...a, lat: 47.39 }, { ...b, lat: 47.39 }, 10);
  const stages = detourStages(null, { routes: [far, original], arrival: time(20), minutes: 20, distanceKm: 4 }, a, b, time(0));
  assert.equal(nearestDetourStage(stages, via), stages[1]);
});

it("cancels between links and discards an in-flight result after cancellation", async () => {
  const stage = detourStages(journey(), null, a, b, time(0))[0];
  for (const cancelAfter of [1, 2]) {
    const controller = new AbortController(); let calls = 0;
    await assert.rejects(requestCyclingDetour(stage, via, { route: async () => {
      calls++; if (calls === cancelAfter) controller.abort(); return links[calls - 1];
    } }, controller.signal), { name: "AbortError" });
    assert.equal(calls, cancelAfter);
  }
});

it("rejects missing and blocked links without returning a partial preview", async () => {
  const stage = detourStages(journey(), null, a, b, time(0))[0];
  for (const failed of [null, { ...links[0], blocked: true }]) {
    let calls = 0;
    await assert.rejects(requestCyclingDetour(stage, via, { route: async () => { calls++; return failed; } }, new AbortController().signal), /No usable cycling path/);
    assert.equal(calls, 1);
  }
  let calls = 0;
  await assert.rejects(requestCyclingDetour(stage, via, { route: async () => ++calls === 1 ? links[0] : null }, new AbortController().signal), /back to this section/);
});

it("exposes endpoint gaps and validates stop duration without hiding shorter routes", () => {
  const stage = detourStages(journey(), null, a, b, time(0))[0];
  const result = detourTiming(stage, [{ ...links[0], endGapM: 42, minutes: 3 }, { ...links[1], startGapM: 28, minutes: 3 }], 0);
  assert.equal(result.facilityGapM, 42); assert.equal(result.addedTravelMinutes, -4);
  for (const invalid of [-1, 181, NaN, Infinity]) assert.throws(() => detourTiming(stage, links, invalid), /stop duration/);
});

it("does not promote unknown or non-potable water, restricted access, or closed facilities as a detour", () => {
  const f: Amenity = { ...via, url: "https://example.org", categories: ["water"], tags: {}, area: false, potable: "yes" };
  assert.equal(amenityDetourTarget(f, "water").unavailable, undefined);
  for (const potable of ["unknown", "no"] as const) assert.match(amenityDetourTarget({ ...f, potable }, "water").unavailable!, /drinking water/);
  assert.match(amenityDetourTarget({ ...f, tags: { access: "private" } }, "water").unavailable!, /restricted/);
  const food: Amenity = { ...f, categories: ["food"], tags: { shop: "bakery", access: "customers" } };
  assert.equal(amenityDetourTarget(food, "food").unavailable, undefined);
  assert.match(amenityDetourTarget({ ...food, tags: { ...food.tags, opening_hours: "closed" } }, "food").unavailable!, /unavailable/);
  assert.match(amenityDetourTarget({ ...food, location: { floorLabel: "F", precision: "building" } }, "food").note!, /Indoor access/);
});
