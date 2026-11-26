import assert from "node:assert/strict";
import { it } from "node:test";
import { applyCyclingEdit, type EditContext } from "./cyclingEditor.ts";
import { detourStages } from "./cyclingDetour.ts";
import { applyFacilityStop } from "./facilityStops.ts";
import { cyclingKey, zeroCycling, type CyclingRoute } from "./cycling.ts";
import { DEFAULT_OPTIONS, emptyNetwork, metrics, type Options } from "./model.ts";
import { navigationTrip, remainingNavigationStops } from "./navigation.ts";
import type { Place } from "./routing.ts";
import { emptyJourneyLibrary, saveJourney } from "./savedJourneys.ts";
import { zeroWalking } from "./walking.ts";
import { solveWaypoints } from "./waypoints.ts";

const start = new Date("2026-11-26T08:00:00Z");
const at = (minutes: number) => new Date(+start + minutes * 60_000);
const point = (n: number, label: string): Place => ({ label, lat: 47 + n * .001, lon: 8 });
const origin = point(0, "Start on foot"), pickup = point(1, "Pickup rack"), via = point(2, "Visit"),
  leave = point(3, "Leave rack"), destination = point(4, "Finish on foot");
function route(from: Place, to: Place, minutes: number): CyclingRoute {
  const points = [from, to].map((p, i) => ({ ...p, distanceM: i * 100, elevationM: 400 }));
  return { ...zeroCycling(from, to), minutes, ridingSeconds: minutes * 60, distanceKm: .1, points, elevation: points };
}
function context(arriveBy = false): EditContext {
  const collect: Place = { ...pickup, bicycleAction: "collect", visit: {
    id: "pickup-visit", name: pickup.label, lat: pickup.lat, lon: pickup.lon, category: "parking", minutes: 4,
  } };
  const park: Place = { ...leave, bicycleAction: "park", visit: {
    id: "leave-visit", name: leave.label, lat: leave.lat, lon: leave.lon, category: "parking", minutes: 1,
  } };
  const points = [origin, collect, via, park, destination], network = emptyNetwork();
  network.cycling = new Map(); network.walking = new Map();
  for (const [from, to, minutes] of [[collect, via, 3], [via, park, 4]] as const)
    network.cycling.set(cyclingKey(from, to), route(from, to, minutes));
  for (const [from, to] of [[origin, collect], [park, destination]])
    network.walking.set(cyclingKey(from, to), { ...zeroWalking(from, to), minutes: 2, distanceKm: .1,
      points: [from, to].map((p, i) => ({ ...p, distanceM: i * 100, elevationM: null })) });
  const options: Options = { ...DEFAULT_OPTIONS, bicycleAtOrigin: false, maxBoardings: 0,
    maxBikeMinutes: 20, maxAccessMinutes: 12, maxEgressMinutes: 12, maxWalkingMinutes: 10,
    ...(arriveBy ? { arriveBy: at(60).toISOString() } : {}) };
  const journey = solveWaypoints(network, points, start, options, "baseline").journeys[0];
  assert.ok(journey); assert.equal(journey.totalMinutes, 16);
  return { journey, cycling: null, origin, destination, start, options };
}
const stages = (c: EditContext) => detourStages(c.journey, c.cycling, c.origin, c.destination, c.start);

it("edits an action journey with no transit while retaining every action, dwell and shared budget", () => {
  const c = context(), original = JSON.stringify(c);
  const result = applyCyclingEdit(c, stages(c)[0], [route(pickup, via, 5)]);
  const j = result.journey!;
  assert.equal(result.cycling, null); assert.equal(j.trainMinutes, 0); assert.equal(j.changes, 0);
  assert.deepEqual(j.services, []); assert.equal(j.totalMinutes, 18); assert.equal(+j.startTime, +start);
  assert.equal(+j.arrival, +at(18)); assert.equal(metrics(j).bike, 9); assert.equal(metrics(j).walk, 4);
  assert.deepEqual(j.transitLegs.filter(l => l.bicycleAction).map(l => [l.bicycleAction, l.to, l.bicycleWithTraveller]),
    [["collect", pickup.label, true], ["park", leave.label, false]]);
  assert.deepEqual(j.transitLegs.filter(l => l.facilityVisit).map(l => l.facilityVisit!.minutes), [4, 1]);
  assert.deepEqual(j.waypoints!.map(w => [+w.arrival, w.place.bicycleAction]),
    [[+at(6), "collect"], [+at(11), undefined], [+at(16), "park"]]);
  assert.equal(j.transitLegs[0].bicycleWithTraveller, false);
  assert.equal(j.transitLegs.at(-1)!.bicycleWithTraveller, false);
  const stored = saveJourney(emptyJourneyLibrary(), { ...c, key: "edited", journey: j, cycling: null,
    mode: "baseline", waypoints: j.waypoints!.map(w => w.place) }, 0, "Edited bike stops", "one", start).journeys[0].trip;
  assert.deepEqual(remainingNavigationStops(navigationTrip(stored), 0).map(p => p.bicycleAction), ["collect", undefined, "park"]);
  assert.equal(JSON.stringify(c), original);
});

it("adds and then reshapes a facility detour without moving or duplicating bicycle actions", () => {
  const c = context(), fountain = { ...point(1.5, "Fountain"), id: "water", name: "Fountain", category: "water" as const, openingHours: "24/7" };
  const result = applyFacilityStop(c, stages(c)[0], [route(pickup, fountain, 2), route(fountain, via, 3)], fountain, 3).journey!;
  assert.equal(result.totalMinutes, 21); assert.equal(metrics(result).bike, 9);
  assert.deepEqual(result.transitLegs.filter(l => l.facilityVisit).map(l => [l.facilityVisit!.id, l.facilityVisit!.minutes]),
    [["pickup-visit", 4], ["water", 3], ["leave-visit", 1]]);
  assert.equal(result.transitLegs.find(l => l.facilityVisit?.id === "water")!.bicycleWithTraveller, true);
  const next = { ...c, journey: result };
  const edited = applyCyclingEdit(next, stages(next)[0], [route(pickup, fountain, 4)]).journey!;
  assert.equal(edited.totalMinutes, 23); assert.equal(metrics(edited).bike, 11);
  assert.deepEqual(edited.transitLegs.filter(l => l.bicycleAction).map(l => [l.bicycleAction, l.to]),
    [["collect", pickup.label], ["park", leave.label]]);
  assert.equal(edited.transitLegs.filter(l => l.facilityVisit?.id === "water").length, 1);
  assert.throws(() => applyCyclingEdit(next, stages(next)[0], [route(pickup, fountain, 11)]), /section exceeds/);
});

it("keeps whole-journey cycling bounds and the original direct-section cap for zero-transit edits", () => {
  const c = context(), stage = stages(c)[0];
  assert.throws(() => applyCyclingEdit({ ...c, options: { ...c.options, maxBikeMinutes: 8 } }, stage,
    [route(pickup, via, 5)]), /total cycling limit/);
  assert.throws(() => applyCyclingEdit({ ...c, options: { ...c.options, minBikeMinutes: 7 } }, stage,
    [route(pickup, via, 2)]), /cycling minimum/);
  assert.throws(() => applyCyclingEdit(c, stage, [route(pickup, via, 13)]), /section exceeds its 12-minute limit/);
  const asymmetric = { ...c, options: { ...c.options, maxAccessMinutes: 12, maxEgressMinutes: 4 } };
  assert.equal(metrics(applyCyclingEdit(asymmetric, stage, [route(pickup, via, 5)]).journey!).bike, 9,
    "Direct stop-to-stop riding retains the solver's max(access, egress) cap");
  const rest = { ...point(1.5, "Rest"), id: "rest", name: "Rest", category: "food" as const };
  assert.throws(() => applyFacilityStop({ ...c, options: { ...c.options, horizonMinutes: 30 } }, stage,
    [route(pickup, rest, 2), route(rest, via, 3)], rest, 20), /time window/);
});

it("retimes all flexible steps of an arrive-by action journey while preserving dwell and earliest departure", () => {
  const c = context(true), original = JSON.stringify(c);
  const j = applyCyclingEdit(c, stages(c)[0], [route(pickup, via, 5)]).journey!;
  assert.equal(+j.startTime, +at(42)); assert.equal(+j.departure, +at(42));
  assert.equal(+j.arrival, +at(60)); assert.equal(j.totalMinutes, 18); assert.equal(j.waitMinutes, 0);
  assert.deepEqual(j.waypoints!.map(w => +w.arrival), [+at(48), +at(53), +at(58)]);
  assert.deepEqual(j.transitLegs.filter(l => l.facilityVisit).map(l => (+l.arrival! - +l.departure!) / 60_000), [4, 1]);
  const shorter = applyCyclingEdit(c, stages(c)[0], [route(pickup, via, 1)]).journey!;
  assert.equal(+shorter.startTime, +at(46)); assert.equal(+shorter.arrival, +at(60));
  assert.throws(() => applyCyclingEdit({ ...c, start: at(43) }, stages(c)[0], [route(pickup, via, 5)]), /before the search time window/);
  assert.equal(JSON.stringify(c), original);
});

it("rechecks opening hours after moving a zero-transit arrive-by journey earlier", () => {
  const c = context(true);
  c.journey!.transitLegs.find(l => l.facilityVisit?.id === "pickup-visit")!.facilityVisit!.openingHours = "Th 09:46-10:00";
  assert.throws(() => applyCyclingEdit(c, stages(c)[0], [route(pickup, via, 5)]), /mapped hours/);
});

it("does not resume a completed riding phase or replace an exact bike stop with a snapped path", () => {
  const c = context(), stage = stages(c)[0];
  assert.throws(() => applyCyclingEdit({ ...c, options: { ...c.options, cyclingFinished: true } }, stage,
    [route(pickup, via, 3)]), /Cycling has already finished/);
  const snapped = route(pickup, via, 3);
  snapped.points = [{ ...via, distanceM: 0, elevationM: 400 }, { ...via, distanceM: 100, elevationM: 400 }];
  assert.throws(() => applyCyclingEdit(c, stage, [snapped]), /exact bicycle pickup and leave locations/);
});
