import assert from "node:assert/strict";
import { it } from "node:test";
import { journeyTiming } from "./journeyTiming.ts";
import { categorize, DEFAULT_OPTIONS, metrics } from "./model.ts";
import { journeySteps } from "./itinerary.ts";
import { boardingCheck } from "./transferTimes.ts";
import { zeroCycling } from "./cycling.ts";
import { zeroWalking } from "./walking.ts";
import { applyCyclingEdit } from "./cyclingEditor.ts";
import { detourStages } from "./cyclingDetour.ts";
import type { Journey, Place, TransitLeg } from "./routing.ts";

const start = new Date("2026-10-08T07:00:00Z");
const at = (minutes: number) => new Date(+start + minutes * 60_000);
const home: Place = { label: "Home", lat: 47, lon: 8 };
const a: Place = { label: "A", lat: 47.01, lon: 8, stopId: "A" };
const d: Place = { label: "D", lat: 47.1, lon: 8, stopId: "D" };
const destination: Place = { label: "Destination", lat: 47.11, lon: 8 };
const route = { ...zeroCycling(home, a), id: "access", minutes: 10, distanceKm: 2 };
function leg(mode: TransitLeg["mode"], departure: number, arrival: number, extra: Partial<TransitLeg> = {}): TransitLeg {
  return { mode, departure: at(departure), arrival: at(arrival), from: "A", to: "D", fromId: "A", toId: "D",
    service: "Test service", serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null, ...extra };
}
function journey(): Journey {
  return { id: "golden", startTime: start, originStation: { ...a, id: "A", name: "A", bikeMinutes: 10, distanceKm: 2, cyclingRoute: route },
    destinationStation: { ...d, id: "D", name: "D", bikeMinutes: 5, distanceKm: 1 },
    departure: at(30), arrival: at(60), trainMinutes: 30, waitMinutes: 20, totalMinutes: 65,
    changes: 0, services: ["Train"], transitLegs: [leg("transit", 30, 60)] };
}
it("moves avoidable station waiting to the origin while preserving the service and raw arrival ranking", () => {
  const raw = journey(), snapshot = JSON.stringify(raw), timing = journeyTiming(raw);
  assert.equal(+timing.departure, +at(17));
  assert.equal(+timing.arrival, +at(65));
  assert.equal(timing.journeyMinutes, 48);
  assert.equal(timing.beforeDepartureMinutes, 17);
  assert.equal(timing.elapsedMinutes, 65);
  assert.equal(timing.connectionMinutes, 3);
  assert.equal(timing.journey.transitLegs[0], raw.transitLegs[0]);
  assert.equal(JSON.stringify(raw), snapshot);
  const steps = journeySteps(timing.journey, home, destination);
  assert.equal(+steps[0].departure!, +at(17));
  assert.equal(+steps.at(-1)!.arrival!, +at(65));
  const later = { ...journey(), id: "late-short", departure: at(90), arrival: at(100), totalMinutes: 105,
    transitLegs: [leg("transit", 90, 100)] };
  assert.ok(journeyTiming(later).journeyMinutes < timing.journeyMinutes);
  assert.equal(categorize([raw, later], DEFAULT_OPTIONS).find(p => p.categories.includes("Fastest"))!.journey.id, raw.id);
});
it("retains connection waits, final walking/cycling and the full time decomposition", () => {
  const raw = journey(); raw.transitLegs = [leg("transit", 30, 50), leg("walk", 50, 55), leg("transit", 70, 95)];
  raw.arrival = at(95); raw.totalMinutes = 100; raw.changes = 1;
  const t = journeyTiming(raw);
  assert.equal(t.journeyMinutes, 83);
  assert.equal(t.walkingMinutes, 5);
  assert.equal(t.transitMinutes, 45);
  assert.equal(t.connectionMinutes, 18);
  assert.equal(t.journeyMinutes, t.cyclingMinutes + t.walkingMinutes + t.transitMinutes + t.connectionMinutes);
  assert.equal(t.journey.transitLegs[2], raw.transitLegs[2]);
});
it("keeps exact OJP platform access, including already-materialized access, with conservative minute rounding", () => {
  for (const materialized of [false, true]) {
    const raw = journey(), ride = raw.transitLegs[0];
    ride.ojp = { journeyRef: "r", operatingDay: "2026-10-08", fromRef: "A:1", toRef: "D:1", fromOrder: 1, toOrder: 2,
      departure: at(30).toISOString(), arrival: at(60).toISOString(), bikeFiltered: true, attributes: [] };
    ride.accessRules = [{ point: a, toRef: "A:1", operatingDay: "2026-10-08", departure: at(30).toISOString(), seconds: 241 }];
    if (materialized) raw.transitLegs.unshift(leg("walk", 10, 10 + 241 / 60,
      { stationAccess: true, fromPoint: a, toPoint: a, fromId: "A", toId: "A" }));
    const t = journeyTiming(raw);
    assert.equal(+t.departure, +at(15));
    const prefix = t.journey.transitLegs.slice(0, -1);
    const ready = +(prefix.at(-1)?.arrival ?? at(25));
    assert.ok(boardingCheck(prefix, ride, ready, 3, a).readyAt <= +ride.departure!);
    if (materialized) assert.equal(+prefix[0].arrival! - +prefix[0].departure!, 241_000);
    assert.equal(t.journey.transitLegs.at(-1), ride);
  }
});
it("does not shift a fixed provider walking leg or its evidence", () => {
  const raw = journey(), walk = leg("walk", 15, 20);
  raw.transitLegs.unshift(walk);
  const t = journeyTiming(raw);
  assert.equal(+t.departure, +at(5));
  assert.equal(t.journey.transitLegs[0], walk);
  assert.equal(+walk.departure!, +at(15));
});
it("shifts flexible cycling prefixes and ordered visits, leaving later visits fixed", () => {
  const raw = journey(); raw.legsIncludeEndpoints = true;
  raw.originStation = { ...raw.originStation, bikeMinutes: 0 };
  raw.destinationStation = { ...raw.destinationStation, bikeMinutes: 0 };
  raw.arrival = at(65);
  raw.transitLegs = [leg("bike", 0, 5), leg("bike", 5, 10), raw.transitLegs[0], leg("bike", 60, 65)];
  raw.waypoints = [{ place: a, arrival: at(5) }, { place: d, arrival: at(60) }];
  const t = journeyTiming(raw);
  assert.equal(+t.departure, +at(17));
  assert.equal(+t.journey.waypoints![0].arrival, +at(22));
  assert.equal(+t.journey.waypoints![1].arrival, +at(60));
  assert.equal(+t.journey.transitLegs[3].departure!, +at(60));
  assert.equal(metrics(t.journey).bike, metrics(raw).bike);
});
it("retimes a checked pedestrian prefix without changing its duration or route", () => {
  const raw = journey(), walkingRoute = { ...zeroWalking(home, a), minutes: 12, distanceKm: .8 };
  raw.legsIncludeEndpoints = true;
  raw.originStation = { ...raw.originStation, bikeMinutes: 0 };
  raw.destinationStation = { ...raw.destinationStation, bikeMinutes: 0 };
  raw.transitLegs = [leg("walk", 0, 12, { walkingRoute }), raw.transitLegs[0], leg("bike", 60, 65)];
  const t = journeyTiming(raw);
  assert.equal(+t.departure, +at(15));
  assert.equal(t.walkingMinutes, 12);
  assert.equal(t.journey.transitLegs[0].walkingRoute, walkingRoute);
});
it("retains unknown boarding times and never moves a departure earlier than the original", () => {
  const raw = journey();
  assert.equal(journeyTiming(raw, Infinity).journey, raw);
  assert.equal(journeyTiming(raw, 25).journey, raw);
  const arrival = { ...raw, startTime: at(17), totalMinutes: 48 };
  assert.equal(journeyTiming(arrival).journey, arrival);
});
it("uses each later/historical search's origin time and preserves overnight arrival dates", () => {
  const raw = journey();
  raw.startTime = new Date("2026-10-07T21:00:00Z");
  raw.departure = new Date("2026-10-07T22:30:00Z");
  raw.arrival = new Date("2026-10-07T23:00:00Z");
  raw.totalMinutes = 125;
  raw.transitLegs = [{ ...raw.transitLegs[0], departure: raw.departure, arrival: raw.arrival }];
  const t = journeyTiming(raw, 3, raw.startTime);
  assert.equal(t.beforeDepartureMinutes, 77);
  assert.equal(t.arrival.toISOString(), "2026-10-07T23:05:00.000Z");
  assert.equal(t.elapsedMinutes, 125);
});
it("lets a longer access edit use origin slack and recalculates its feasible departure without changing fares", () => {
  const raw = journey(), shown = journeyTiming(raw).journey;
  const stage = detourStages(shown, null, home, destination, start)[0];
  const result = applyCyclingEdit({ journey: shown, cycling: null, origin: home, destination, start, options: DEFAULT_OPTIONS },
    stage, [{ ...route, minutes: 20 }]).journey!;
  const t = journeyTiming(result, 3, start);
  assert.equal(+t.departure, +at(7));
  assert.equal(+t.arrival, +at(65));
  assert.equal(t.journey.transitLegs.find(l => l.mode === "transit"), raw.transitLegs[0]);
});
