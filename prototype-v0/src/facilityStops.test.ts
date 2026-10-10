import assert from "node:assert/strict";
import { it } from "node:test";
import { applyFacilityStop, facilityStopSteps } from "./facilityStops.ts";
import { applyCyclingEdit, type EditContext } from "./cyclingEditor.ts";
import { detourStages, type DetourFacility, type DetourRoutes } from "./cyclingDetour.ts";
import { zeroCycling, type CyclingRoute } from "./cycling.ts";
import { DEFAULT_OPTIONS, metrics } from "./model.ts";
import { cyclingSteps, journeySteps } from "./itinerary.ts";
import { journeyTiming } from "./journeyTiming.ts";
import { fareQuery } from "./onlineFare.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";
import { navigationTrip } from "./navigation.ts";
import { realtimeJourney } from "./realtimeJourney.ts";
import type { Journey, Place, TransitLeg } from "./routing.ts";

const point = (lat: number, label: string): Place => ({ lat, lon: 8, label });
const origin = point(47, "Origin"), a = point(47.01, "Station A"), b = point(47.1, "Station B"), end = point(47.11, "Destination");
const start = new Date("2026-10-05T08:00:00+02:00"), at = (n: number) => new Date(+start + n * 60000);
function route(from: Place, to: Place, minutes: number): CyclingRoute {
  const points = [{ ...from, elevationM: 400, distanceM: 0 }, { ...to, elevationM: 400, distanceM: 1000 }];
  return { ...zeroCycling(from, to), points, elevation: points, minutes, distanceKm: 1, source: "BRouter" };
}
function ride(from = a, to = b, leave = 25, arrive = 60): TransitLeg {
  return { mode: "transit", from: from.label, to: to.label, fromId: from.label, toId: to.label, fromPoint: from, toPoint: to,
    departure: at(leave), arrival: at(arrive), departurePlatform: "1", arrivalPlatform: "2", service: "IC", serviceName: null, direction: null };
}
function context(): EditContext {
  const journey: Journey = { id: "original", startTime: start, originStation: { ...a, id: a.label, name: a.label, bikeMinutes: 10, distanceKm: 1, cyclingRoute: route(origin, a, 10) },
    destinationStation: { ...b, id: b.label, name: b.label, bikeMinutes: 10, distanceKm: 1, cyclingRoute: route(b, end, 10) },
    departure: at(25), arrival: at(60), trainMinutes: 35, waitMinutes: 15, totalMinutes: 70, changes: 0, services: ["IC"], transitLegs: [ride()] };
  return { journey, cycling: null, origin, destination: end, start, options: { ...DEFAULT_OPTIONS, maxAccessMinutes: 20, maxEgressMinutes: 30 } };
}
const stages = (c: EditContext) => detourStages(c.journey, c.cycling, c.origin, c.destination, c.start);
const fountain: DetourFacility = { ...point(47.005, "Fountain"), id: "fountain", name: "Fountain", category: "water", openingHours: "24/7" };
const via = { ...fountain, label: fountain.name };
const links = (first = 7, second = 7): DetourRoutes => [route(origin, via, first), route(via, a, second)];

it("adds a timed visit while preserving source objects, service identity and endpoint fares", () => {
  const c = context(), snapshot = JSON.stringify(c), service = c.journey!.transitLegs[0];
  const edit = applyFacilityStop(c, stages(c)[0], links(), fountain, 5), journey = edit.journey!;
  assert.equal(JSON.stringify(c), snapshot);
  assert.equal(journey.transitLegs.find(l => l.mode === "transit"), service);
  assert.deepEqual(fareQuery(journey.transitLegs, DEFAULT_FARE_PROFILE), fareQuery(c.journey!.transitLegs, DEFAULT_FARE_PROFILE));
  assert.equal(metrics(journey).bike, 24); assert.equal(metrics(journey).walk, 0);
  const stop = facilityStopSteps(edit, c)[0];
  assert.equal(stop.leg!.facilityVisit!.name, "Fountain"); assert.equal(+stop.arrival! - +stop.departure!, 5 * 60000);
  assert.equal(+journey.arrival, +at(70));
  assert.equal(journeyTiming(journey).stopMinutes, 5);
  assert.equal(journeySteps(journey, origin, end).filter(s => s.mode === "stop").length, 1);
});

it("independently checks 1372 travel/visit combinations against the fixed boarding window", t => {
  let accepted = 0, rejected = 0;
  for (let first = 1; first <= 14; first++) for (let second = 1; second <= 14; second++) for (let visit = 0; visit <= 30; visit += 5) {
    const c = context(), fits = first + second <= 20 && first + second + visit <= 22;
    const apply = () => applyFacilityStop(c, stages(c)[0], links(first, second), fountain, visit);
    if (!fits) { assert.throws(apply, /limit|miss/); rejected++; continue; }
    const result = apply().journey!; accepted++;
    assert.equal(metrics(result).bike, first + second + 10);
    assert.equal(+result.arrival, +at(70));
    assert.equal(result.transitLegs.find(l => l.mode === "transit")!.departure, c.journey!.transitLegs[0].departure);
    assert.equal(journeyTiming(result).stopMinutes, visit);
  }
  t.diagnostic(JSON.stringify({ accepted, rejected, cases: accepted + rejected }));
});

it("enforces total cycling, section and arrival/horizon limits including visit time", () => {
  let c = context(); c.options.maxBikeMinutes = 23;
  assert.throws(() => applyFacilityStop(c, stages(c)[0], links(), fountain, 5), /total cycling/);
  c = context(); c.options.maxAccessMinutes = 13;
  assert.throws(() => applyFacilityStop(c, stages(c)[0], links(), fountain, 0), /section exceeds/);
  const facility = { ...fountain, lat: 47.105 }, p = { ...facility, label: facility.name };
  c = context(); c.options.arriveBy = at(75).toISOString();
  assert.throws(() => applyFacilityStop(c, stages(c)[1], [route(b, p, 7), route(p, end, 7)], facility, 5), /arrival time/);
  c.options.arriveBy = undefined; c.options.horizonMinutes = 75;
  assert.throws(() => applyFacilityStop(c, stages(c)[1], [route(b, p, 7), route(p, end, 7)], facility, 5), /time window/);
});

it("updates egress arrival and keeps selected train times unchanged", () => {
  const c = context(), f = { ...fountain, lat: 47.105 }, p = { ...f, label: f.name };
  const edited = applyFacilityStop(c, stages(c)[1], [route(b, p, 7), route(p, end, 8)], f, 10).journey!;
  assert.equal(+edited.arrival, +at(85)); assert.equal(metrics(edited).bike, 25);
  assert.equal(+edited.transitLegs.find(l => l.mode === "transit")!.departure!, +at(25));
});

it("keeps several visits when adding or reshaping another part of the same cycling section", () => {
  const c = context(); c.journey = applyFacilityStop(c, stages(c)[0], links(), fountain, 4).journey;
  const another = { ...fountain, id: "second", name: "Second", lat: 47.002 }, p = { ...another, label: another.name };
  c.journey = applyFacilityStop(c, stages(c)[0], [route(origin, p, 2), route(p, via, 2)], another, 2).journey;
  assert.deepEqual(facilityStopSteps(c, c).map(s => s.leg!.facilityVisit!.id), ["second", "fountain"]);
  const last = stages(c).at(-1)!;
  const edited = applyCyclingEdit(c, last, [route(b, end, 12)]);
  assert.deepEqual(facilityStopSteps(edited, c).map(s => s.leg!.facilityVisit!.minutes), [2, 4]);
});

it("rejects closed visits and rechecks previously added stops after a route edit", () => {
  const c = context();
  assert.throws(() => applyFacilityStop(c, stages(c)[0], links(), { ...fountain, openingHours: "Mo 10:00-18:00" }, 1), /hours/);
  const unknown = applyFacilityStop(c, stages(c)[0], links(), { ...fountain, openingHours: "PH off" }, 1);
  assert.ok(unknown.journey);
  c.journey = applyFacilityStop(c, stages(c)[0], links(), fountain, 1).journey;
  c.journey!.transitLegs.find(l => l.facilityVisit)!.facilityVisit!.openingHours = "closed";
  assert.throws(() => applyCyclingEdit(c, stages(c).at(-1)!, [route(b, end, 10)]), /hours/);
});

it("rejects invalid, disconnected, stale and unavailable facility requests without mutation", () => {
  const c = context(), stage = stages(c)[0], snapshot = JSON.stringify(c);
  for (const duration of [-1, 181, Infinity, NaN]) assert.throws(() => applyFacilityStop(c, stage, links(), fountain, duration), /valid facility/);
  assert.throws(() => applyFacilityStop(c, stage, links(), { ...fountain, unavailable: "Closed facility" }, 5), /Closed/);
  assert.throws(() => applyFacilityStop(c, stage, links(), { ...fountain, lat: 48 }, 5), /valid facility/);
  assert.throws(() => applyFacilityStop(c, { ...stage, route: { ...stage.route } }, links(), fountain, 5), /changed/);
  assert.throws(() => applyFacilityStop(c, stage, [links()[0], route(origin, a, 5)], fountain, 5), /connected/);
  assert.equal(JSON.stringify(c), snapshot);
});

it("updates cycling-only totals and visit indices through repeated edits", () => {
  const c = context(); c.journey = null; c.destination = a;
  c.cycling = { minutes: 10, distanceKm: 1, routes: [route(origin, a, 10)], departure: start, arrival: at(10) };
  c.cycling = applyFacilityStop(c, stages(c)[0], links(), fountain, 6).cycling;
  assert.equal(c.cycling!.minutes, 20); assert.equal(+c.cycling!.arrival, +at(20));
  assert.deepEqual(cyclingSteps(c.cycling!, origin, a, start).map(s => s.mode), ["bike", "stop", "bike"]);
  assert.equal(+stages(c)[1].departure, +at(13));
  const middle = point(47.003, "shaping");
  c.cycling = applyCyclingEdit(c, stages(c)[0], [route(origin, middle, 4), route(middle, via, 5)]).cycling;
  assert.equal(c.cycling!.stops![0].afterRoute, 1); assert.equal(c.cycling!.minutes, 22);
  assert.equal(facilityStopSteps(c, c)[0].leg!.facilityVisit!.id, fountain.id);
});

it("caps repeated visits at five while allowing the same named facility twice", () => {
  const c = context(); c.journey = null; c.destination = a;
  c.cycling = { minutes: 10, distanceKm: 1, routes: [route(origin, a, 10)], departure: start, arrival: at(10) };
  for (let i = 0; i < 5; i++) {
    const stage = stages(c)[0];
    c.cycling = applyFacilityStop(c, stage, [route(stage.from, via, 1), route(via, stage.to, 1)], fountain, 1).cycling;
    assert.equal(facilityStopSteps(c, c).length, i + 1);
  }
  assert.throws(() => applyFacilityStop(c, stages(c)[0], links(), fountain, 1), /five facility stops/);
});

it("preserves an arrive-by cycling deadline by moving departure and rejects insufficient windows", () => {
  const c = context(); c.journey = null; c.destination = a; c.options.arriveBy = at(50).toISOString();
  c.cycling = { minutes: 10, distanceKm: 1, routes: [route(origin, a, 10)], departure: at(40), arrival: at(50) };
  const edit = applyFacilityStop(c, stages(c)[0], links(), fountain, 6);
  assert.equal(+edit.cycling!.arrival, +at(50)); assert.equal(+edit.cycling!.departure!, +at(30));
  assert.throws(() => applyFacilityStop({ ...c, start: at(35) }, stages(c)[0], links(), fountain, 6), /before the search/);
  c.options.maxBikeMinutes = 13;
  assert.throws(() => applyFacilityStop(c, stages(c)[0], links(), fountain, 0), /total cycling/);
});

it("does not reuse an all-transit fare for a stop between services", () => {
  const c = context(), mid = route(a, b, 10), f = { ...fountain, lat: 47.05 }, p = { ...f, label: f.name };
  c.journey = { ...c.journey!, legsIncludeEndpoints: true, originStation: { ...c.journey!.originStation, bikeMinutes: 0 }, destinationStation: { ...c.journey!.destinationStation, bikeMinutes: 0 },
    transitLegs: [ride(origin, a, 0, 20), { ...ride(a, b, 20, 30), mode: "bike", cyclingRoute: mid }, ride(b, end, 50, 70)] };
  const edited = applyFacilityStop(c, stages(c)[0], [route(a, p, 5), route(p, b, 5)], f, 5).journey!;
  assert.equal(fareQuery(edited.transitLegs, DEFAULT_FARE_PROFILE), null);
  assert.equal(edited.transitLegs.filter(l => l.mode === "transit").length, 2);
});

it("includes explicit visits in GPS stages without counting them as required waypoints", () => {
  const c = context(); c.journey = null; c.destination = a;
  c.cycling = { minutes: 10, distanceKm: 1, routes: [route(origin, a, 10)], departure: start, arrival: at(10) };
  c.cycling = applyFacilityStop(c, stages(c)[0], links(), fountain, 5).cycling;
  const trip = navigationTrip({ ...c, key: "test", waypoints: [a], mode: "baseline" });
  assert.deepEqual(trip.stages.map(s => s.mode), ["bike", "stop", "bike"]);
  assert.deepEqual(trip.stages.map(s => s.completedVisits), [0, 0, 1]);
  assert.equal(trip.stages[1].minutes, 5);
});

it("moves stop durations with live delays and warns about changed opening feasibility", () => {
  const c = context(); const f = { ...fountain, lat: 47.105 }, p = { ...f, label: f.name };
  const edit = applyFacilityStop(c, stages(c)[1], [route(b, p, 5), route(p, end, 5)], f, 5);
  const service = edit.journey!.transitLegs.find(l => l.mode === "transit")!;
  service.realtime = { checkedAt: start.toISOString(), estimatedDeparture: null, estimatedArrival: at(80).toISOString(), departurePlatform: null, arrivalPlatform: null, cancelled: false, departureCancelled: false, arrivalCancelled: false, undefinedDelay: false };
  edit.journey!.transitLegs.find(l => l.facilityVisit)!.facilityVisit!.openingHours = "Mo 08:00-09:15";
  const result = realtimeJourney(edit.journey!, new Map());
  const visit = journeySteps(result.journey, origin, end).find(s => s.mode === "stop")!;
  assert.equal(+visit.arrival! - +visit.departure!, 5 * 60000);
  assert.ok(result.issues.some(i => i.includes("opening hours")));
});
