import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { closestBikeParking, parkingAccess, type BikeParking } from "./bikeParking.ts";
import { zeroCycling, type CyclingRoute } from "./cycling.ts";
import { parseOsmParking } from "./osmParking.ts";
import { parkingAlongRoute, parkingIndex, parkingRouteScope, parkingStyle, PARKING_STYLES } from "./parkingMap.ts";
import type { Journey, Point, TransitLeg } from "./routing.ts";

const p = (lat: number, lon: number): Point => ({ lat, lon });
const facility = (id: string, point: Point): BikeParking => ({ id, name: id, ...point,
  operator: "Unknown", type: "BIKE_PARKING", covered: null, capacity: null, publicAccess: null, traits: [] });
const route = (points: Point[], id = "cycle"): CyclingRoute => ({ ...zeroCycling(points[0], points.at(-1)!), id,
  source: "BRouter", distanceKm: 2, points: points.map((point, i) => ({ ...point, distanceM: i * 100, elevationM: null })) });
const leg = (mode: TransitLeg["mode"], from: Point, to: Point, extra: Partial<TransitLeg> = {}): TransitLeg => ({ mode,
  from: "From", to: "To", fromPoint: from, toPoint: to, fromId: "from", toId: "to", geometry: [from, to],
  departure: new Date(0), arrival: new Date(600000), departurePlatform: null, arrivalPlatform: null,
  service: "Test", serviceName: null, direction: null, ...extra });
const journey = (legs: TransitLeg[], extra: Partial<Journey> = {}): Journey => ({ id: "selected", startTime: new Date(0),
  originStation: { ...legs[0].fromPoint!, id: "from", name: "From", distanceKm: 0, bikeMinutes: 0 },
  destinationStation: { ...legs.at(-1)!.toPoint!, id: "to", name: "To", distanceKm: 0, bikeMinutes: 0 },
  departure: new Date(0), arrival: new Date(600000), trainMinutes: 10, waitMinutes: 0, totalMinutes: 10,
  changes: 0, services: [], transitLegs: legs, legsIncludeEndpoints: true, ...extra });
const selectedScope = (selected: Journey) => parkingRouteScope({ journey: selected, cycling: null,
  bikeOnlySelected: false, origin: selected.originStation, destination: selected.destinationStation, waypoints: [] })!;
const cycleScope = (routes: CyclingRoute[]) => parkingRouteScope({ journey: null, cycling: { routes, distanceKm: 2, minutes: 10, arrival: new Date(0) },
  bikeOnlySelected: true, origin: routes[0].from, destination: routes.at(-1)!.to, waypoints: [] })!;
const ids = (facilities: readonly BikeParking[]) => facilities.map(f => f.id);

it("colours real ETH stands and wall loops differently without promoting covered/private parking", () => {
  const data = parseOsmParking(JSON.parse(readFileSync(new URL("./fixtures/eth-parking-osm.json", import.meta.url), "utf8")));
  const stands = data.facilities.find(f => f.id === "osm:node/321526421")!;
  const loops = data.facilities.find(f => f.id === "osm:node/7936524432")!;
  assert.equal(parkingStyle(stands), PARKING_STYLES.frame);
  assert.equal(parkingStyle(loops), PARKING_STYLES.wheel);
  assert.equal(loops.covered, true);
  const privateParking = data.facilities.find(f => f.id === "osm:way/263781904")!;
  assert.equal(parkingStyle(privateParking), PARKING_STYLES.unknown);
  assert.equal(parkingAccess(privateParking), "Private access");
  assert.equal(parkingStyle({ ...stands, parkingType: undefined, covered: true } as BikeParking), PARKING_STYLES.unknown);
});

it("keeps mixed wheel support, other equipment and unknown tags distinct", () => {
  for (const type of ["wall_loops", "rack", "ground_slots", " stands ; wall_loops "]) assert.equal(parkingStyle({ parkingType: type }), PARKING_STYLES.wheel);
  for (const type of ["stands", "wide_stands", "safe_loops", "stands;safe_loops", "bollard", "handlebar_holder", "bollard;handlebar_holder"]) assert.equal(parkingStyle({ parkingType: type }), PARKING_STYLES.frame);
  for (const type of ["lockers", "building"]) assert.equal(parkingStyle({ parkingType: type }), PARKING_STYLES.other);
  for (const type of [undefined, "", "yes", "unknown", "stands;unrecognised"]) assert.equal(parkingStyle({ parkingType: type }), PARKING_STYLES.unknown);
});

it("checks distance to the entire segment, applies the 100 m band and preserves order and input", () => {
  const scope = cycleScope([route([p(47, 8), p(47, 8.02)])]);
  const facilities = Object.freeze([facility("middle", p(47, 8.01)), facility("inside", p(47.00089, 8.01)),
    facility("outside", p(47.00091, 8.01)), facility("far", p(47.02, 8.01)), facility("bad", p(NaN, 8))]);
  const before = JSON.stringify(facilities);
  assert.deepEqual(ids(parkingAlongRoute(parkingIndex(facilities), scope)), ["middle", "inside"]);
  assert.equal(JSON.stringify(facilities), before);
  assert.deepEqual(parkingAlongRoute(parkingIndex(facilities), { ...scope, segments: [] }), []);
  assert.deepEqual(parkingAlongRoute(parkingIndex(facilities), scope, -1), []);
});

it("does not fill the gap between separate cycling legs or follow the transit line", () => {
  const first = route([p(47, 8), p(47, 8.02)]), last = route([p(47, 8.08), p(47, 8.1)]);
  const selected = journey([leg("bike", first.from, first.to, { cyclingRoute: first }),
    leg("transit", first.to, last.from), leg("bike", last.from, last.to, { cyclingRoute: last })]);
  const facilities = [facility("access", p(47, 8.01)), facility("board", p(47.0005, 8.02)),
    facility("rail-only", p(47, 8.05)), facility("egress", p(47, 8.09))];
  assert.deepEqual(ids(parkingAlongRoute(parkingIndex(facilities), selectedScope(selected))), ["access", "board", "egress"]);
});

it("includes baseline access and egress routes, not an unselected cycling-only alternative", () => {
  const first = route([p(47, 8), p(47, 8.02)]), last = route([p(47, 8.08), p(47, 8.1)]);
  const selected = journey([leg("transit", first.to, last.from)], { legsIncludeEndpoints: false });
  selected.originStation.cyclingRoute = first; selected.destinationStation.cyclingRoute = last;
  const scope = parkingRouteScope({ journey: selected, bikeOnlySelected: false, origin: first.from, destination: last.to, waypoints: [],
    cycling: { distanceKm: 8, minutes: 30, arrival: new Date(0), routes: [route([p(47.03, 8), p(47.03, 8.1)])] } })!;
  const facilities = [facility("access", p(47, 8.01)), facility("egress", p(47, 8.09)), facility("other-choice", p(47.03, 8.05))];
  assert.deepEqual(ids(parkingAlongRoute(parkingIndex(facilities), scope)), ["access", "egress"]);
});

it("includes an intermediate cycling transfer and switches with the selected journey", () => {
  const from = p(47, 8), to = p(47, 8.04);
  const a = journey([leg("bike", from, to, { cyclingRoute: route([from, p(47.02, 8.02), to]) })]);
  const b = journey([leg("bike", from, to, { cyclingRoute: route([from, p(46.98, 8.02), to]) })], { id: "other" });
  const index = parkingIndex([facility("north", p(47.02, 8.02)), facility("south", p(46.98, 8.02))]);
  assert.deepEqual(ids(parkingAlongRoute(index, selectedScope(a))), ["north"]);
  assert.deepEqual(ids(parkingAlongRoute(index, selectedScope(b))), ["south"]);
  assert.notEqual(selectedScope(a).key, selectedScope(b).key);
});

it("treats schematic or missing walking paths as endpoint-only, while accepting explicitly routed paths", () => {
  const walk = leg("walk", p(47, 8), p(47, 8.02));
  const index = parkingIndex([facility("start", p(47, 8)), facility("middle", p(47, 8.01)), facility("finish", p(47, 8.02))]);
  for (const geometry of [walk.geometry, undefined]) {
    const scope = selectedScope(journey([{ ...walk, geometry }]));
    assert.equal(scope.incomplete, true);
    assert.deepEqual(ids(parkingAlongRoute(index, scope)), ["start", "finish"]);
  }
  const scope = selectedScope(journey([{ ...walk, geometryKind: "path" }]));
  assert.equal(scope.incomplete, false);
  assert.deepEqual(ids(parkingAlongRoute(index, scope)), ["start", "middle", "finish"]);
});

it("keeps snapped connector gaps explicit and never bridges an invalid path point", () => {
  const r = route([p(47, 8.004), p(47, 8.02), p(NaN, 8.03), p(47, 8.04), p(47, 8.05)]);
  r.from = p(47, 8); r.startGapM = 300;
  const scope = cycleScope([r]);
  const index = parkingIndex([facility("origin", r.from), facility("connector", p(47, 8.002)), facility("invalid-gap", p(47, 8.03))]);
  assert.equal(scope.incomplete, true);
  assert.deepEqual(ids(parkingAlongRoute(index, scope)), ["origin"]);
});

it("supports cycling-only stages and ranks the closest from A inside the filtered records", () => {
  const routes = [route([p(47, 8), p(47, 8.02)], "first"), route([p(47, 8.02), p(47.02, 8.02)], "second")];
  const facilities = [facility("off-path-closer", p(47.002, 8)), facility("on-first", p(47, 8.01)), facility("on-second", p(47.01, 8.02))];
  const filtered = parkingAlongRoute(parkingIndex(facilities), cycleScope(routes));
  assert.deepEqual(ids(filtered), ["on-first", "on-second"]);
  assert.equal(closestBikeParking(facilities, routes[0].from)?.facility.id, "off-path-closer");
  assert.equal(closestBikeParking(filtered, routes[0].from)?.facility.id, "on-first");
});

it("has no journey restriction before a result and retains endpoint-only scope for a missing cycling path", () => {
  const input = { journey: null, cycling: null, bikeOnlySelected: false, origin: p(47, 8), destination: p(47, 8.02), waypoints: [] };
  assert.equal(parkingRouteScope(input), null);
  const scope = parkingRouteScope({ ...input, bikeOnlySelected: true, cycling: { distanceKm: 2, minutes: 10, arrival: new Date(0) } })!;
  assert.equal(scope.incomplete, true);
  assert.deepEqual(ids(parkingAlongRoute(parkingIndex([facility("midpoint", p(47, 8.01)), facility("start", input.origin)]), scope)), ["start"]);
});
