import assert from "node:assert/strict";
import { it } from "node:test";
import { applyCyclingEdit, requestEditedCycling, type EditContext } from "./cyclingEditor.ts";
import { detourStages } from "./cyclingDetour.ts";
import { zeroCycling, type CyclingRoute } from "./cycling.ts";
import { DEFAULT_OPTIONS, metrics } from "./model.ts";
import { journeyClimb } from "./hills.ts";
import { fareQuery } from "./onlineFare.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";
import type { Journey, Place, TransitLeg } from "./routing.ts";

const place = (lat: number, label: string): Place => ({ lat, lon: 8, label });
const origin = place(47, "Origin"), a = place(47.01, "Station A"), b = place(47.1, "Station B"), destination = place(47.11, "Destination");
const via = place(47.005, "Via"), start = new Date("2026-10-05T08:00:00+02:00");
const time = (m: number) => new Date(+start + m * 60_000);
function route(from: Place, to: Place, minutes: number): CyclingRoute {
  const points = [{ ...from, elevationM: 400, distanceM: 0 }, { ...to, elevationM: 401, distanceM: 1000 }];
  return { ...zeroCycling(from, to), minutes, distanceKm: 1, points, elevation: points, ascentM: 1, source: "BRouter" };
}
const leg = (mode: TransitLeg["mode"], depart: number, arrive: number, from = a, to = b, cyclingRoute?: CyclingRoute): TransitLeg => ({
  mode, from: from.label, to: to.label, fromId: from.label, toId: to.label, fromPoint: from, toPoint: to,
  departure: time(depart), arrival: time(arrive), departurePlatform: null, arrivalPlatform: null, service: mode === "transit" ? "IC" : mode,
  serviceName: null, direction: null, cyclingRoute,
});
function context(): EditContext {
  const journey: Journey = { id: "original", startTime: start, originStation: { ...a, id: a.label, name: a.label, bikeMinutes: 10, distanceKm: 1, cyclingRoute: route(origin, a, 10) },
    destinationStation: { ...b, id: b.label, name: b.label, bikeMinutes: 10, distanceKm: 1, cyclingRoute: route(b, destination, 10) },
    departure: time(25), arrival: time(60), trainMinutes: 35, waitMinutes: 15, totalMinutes: 70, changes: 0, services: ["IC"], transitLegs: [leg("transit", 25, 60)] };
  return { journey, cycling: null, origin, destination, start, options: { ...DEFAULT_OPTIONS, maxAccessMinutes: 20 } };
}
const stages = (c: EditContext) => detourStages(c.journey, c.cycling, c.origin, c.destination, c.start);
const links = () => [route(origin, via, 8), route(via, a, 7)];

it("applies an access edit while preserving exact transit objects, fare query and original journey", () => {
  const c = context(), snapshot = JSON.stringify(c), originalLeg = c.journey!.transitLegs[0];
  const updated = applyCyclingEdit(c, stages(c)[0], links()).journey!;
  assert.equal(updated.transitLegs.find(l => l.mode === "transit"), originalLeg);
  assert.deepEqual(fareQuery(updated.transitLegs, DEFAULT_FARE_PROFILE), fareQuery(c.journey!.transitLegs, DEFAULT_FARE_PROFILE));
  assert.equal(updated.totalMinutes, 70); assert.equal(metrics(updated).bike, 25); assert.equal(journeyClimb(updated).ascent, 3);
  assert.equal(updated.transitLegs[2].departure!.getTime(), time(25).getTime());
  assert.equal(JSON.stringify(c), snapshot);
});
it("rejects a missed connection including walking and the boarding buffer", () => {
  const c = context();
  assert.throws(() => applyCyclingEdit({ ...c, options: { ...c.options, maxAccessMinutes: 30 } }, stages(c)[0], [route(origin, a, 23)]), /miss/);
  const middle = route(a, b, 10);
  c.journey = { ...c.journey!, legsIncludeEndpoints: true, originStation: { ...c.journey!.originStation, bikeMinutes: 0 }, destinationStation: { ...c.journey!.destinationStation, bikeMinutes: 0 },
    transitLegs: [leg("transit", 0, 30), leg("bike", 30, 40, a, b, middle), leg("walk", 40, 45), leg("transit", 55, 90)] };
  const stage = stages(c)[0];
  assert.throws(() => applyCyclingEdit(c, stage, [route(a, b, 18)]), /miss/);
  const accepted = applyCyclingEdit(c, stage, [route(a, b, 15)]).journey!;
  assert.equal(+accepted.transitLegs[2].departure!, +time(45));
  assert.equal(+accepted.transitLegs[3].departure!, +time(55));
});
it("enforces total cycling and per-section budgets across repeatedly edited split paths", () => {
  const c = context();
  assert.throws(() => applyCyclingEdit({ ...c, options: { ...c.options, maxBikeMinutes: 24 } }, stages(c)[0], links()), /total cycling/);
  const updated = applyCyclingEdit(c, stages(c)[0], links()).journey!;
  const next = { ...c, journey: updated }, first = stages(next)[0];
  assert.throws(() => applyCyclingEdit(next, first, [route(origin, via, 14)]), /section exceeds/);
});
it("changes final arrival after the last service and rejects stale or disconnected previews", () => {
  const c = context(), stage = stages(c)[1];
  const updated = applyCyclingEdit(c, stage, [route(b, destination, 20)]).journey!;
  assert.equal(updated.totalMinutes, 80); assert.equal(+updated.arrival, +time(80));
  assert.throws(() => applyCyclingEdit(c, stage, [route(a, destination, 20)]), /endpoints/);
  assert.throws(() => applyCyclingEdit(c, { ...stage, route: { ...stage.route } }, [route(b, destination, 20)]), /changed/);
  assert.throws(() => applyCyclingEdit({ ...c, options: { ...c.options, horizonMinutes: 75 } }, stage, [route(b, destination, 20)]), /time window/);
});
it("uses the actual arrival-search departure when editing and enforces the destination deadline", () => {
  const c = context(); c.start = time(-120); c.options.arriveBy = time(75).toISOString();
  const changed = applyCyclingEdit(c, stages(c)[1], [route(b, destination, 15)]).journey!;
  assert.equal(changed.totalMinutes, 75); assert.equal(+changed.startTime, +start);
  assert.throws(() => applyCyclingEdit(c, stages(c)[1], [route(b, destination, 16)]), /arrival time/);
  c.journey = null; c.cycling = { minutes: 30, distanceKm: 1, departure: time(45), arrival: time(75), routes: [route(origin, destination, 30)] };
  assert.equal(+stages(c)[0].departure, +time(45));
  const ride = applyCyclingEdit(c, stages(c)[0], [route(origin, destination, 40)]).cycling!;
  assert.equal(+ride.departure!, +time(35)); assert.equal(+ride.arrival, +time(75));
  assert.throws(() => applyCyclingEdit({ ...c, start: time(40) }, stages(c)[0], [route(origin, destination, 40)]), /before the search time/);
});
it("edits cycling-only routes without losing other sections or required waypoint boundaries", () => {
  const c = context(), first = route(origin, a, 10), second = route(a, destination, 20);
  c.journey = null; c.cycling = { minutes: 30, distanceKm: 2, arrival: time(30), routes: [first, second] };
  const changed = applyCyclingEdit(c, stages(c)[0], links()).cycling!;
  assert.equal(changed.routes!.at(-1), second); assert.equal(changed.minutes, 35); assert.equal(+changed.arrival, +time(35));
  assert.equal(c.cycling.routes![0], first);
});
it("requests ordered shaping links, rejects partial routes and cancels stale requests", async () => {
  const c = context(), stage = stages(c)[0], calls: string[] = [];
  const controller = new AbortController();
  const found = await requestEditedCycling(stage, [via], { route: async (a, b) => { calls.push(a.label + "→" + b.label); return route(a, b, 4); } }, controller.signal);
  assert.deepEqual(calls, ["Origin→Via", "Via→Station A"]); assert.equal(found.length, 2);
  await assert.rejects(requestEditedCycling(stage, [via], { route: async () => null }, controller.signal), /part 1/);
  await assert.rejects(requestEditedCycling(stage, [via], { route: async (a, b) => { controller.abort(); return route(a, b, 1); } }, controller.signal), { name: "AbortError" });
});
it("does not introduce cycling at the forbidden end", () => {
  const c = context();
  assert.throws(() => applyCyclingEdit({ ...c, options: { ...c.options, cyclingPosition: "end-only" } }, stages(c)[0], links()), /where you chose to cycle/);
  assert.throws(() => applyCyclingEdit({ ...c, options: { ...c.options, cyclingPosition: "start-only" } }, stages(c)[1], [route(b, destination, 5)]), /where you chose to cycle/);
});
it("retimes repeated waypoint visits individually", () => {
  const c = context(), r = route(b, via, 5), back = route(via, b, 5);
  c.journey = { ...c.journey!, legsIncludeEndpoints: true, arrival: time(75), totalMinutes: 75,
    originStation: { ...c.journey!.originStation, bikeMinutes: 0 }, destinationStation: { ...c.journey!.destinationStation, bikeMinutes: 0 },
    transitLegs: [leg("transit", 25, 60), leg("bike", 60, 65, b, via, r), leg("bike", 65, 70, via, b, back), leg("bike", 70, 75, b, via, r)],
    waypoints: [{ place: via, arrival: time(65) }, { place: via, arrival: time(75) }] };
  const updated = applyCyclingEdit(c, stages(c)[0], [route(b, via, 7)]).journey!;
  assert.deepEqual(updated.waypoints!.map(w => +w.arrival), [+time(67), +time(77)]);
});
