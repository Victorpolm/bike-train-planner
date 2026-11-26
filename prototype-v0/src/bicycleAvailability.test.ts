import { plan } from "./api.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { WalkingClient } from "./walking.ts";
import { walkingJourney } from "./walkingJourney.ts";
import assert from "node:assert/strict";
import { it } from "node:test";
import { bicycleActionLeg, bicycleOnTransitLeg, bicyclePossessionAtStages, hasOriginBicycle } from "./bicycleAvailability.ts";
import { canFollowWithBicycle } from "./bicycleContinuity.ts";
import { cyclingKey, zeroCycling } from "./cycling.ts";
import { DEFAULT_FARE_PROFILE, fareSummary } from "./fares.ts";
import { reservationMetrics } from "./journeyObjectives.ts";
import { DEFAULT_OPTIONS, categorize, emptyNetwork, metrics, solve, validateOptions, type Network, type Options } from "./model.ts";
import { navigationReplan, navigationTrip, remainingNavigationStops, type NavigationInput } from "./navigation.ts";
import { fareQuery } from "./onlineFare.ts";
import type { Place, Point, TransitLeg } from "./routing.ts";
import { encodeJourneyLibrary, parseJourneyLibrary, validateSavedTrip } from "./savedJourneys.ts";
import { restoreWaypointInputs, resolveWaypointInputs, reverseWaypointInputs } from "./waypointInputs.ts";
import { solveWaypoints } from "./waypoints.ts";
import { zeroWalking } from "./walking.ts";

const start = new Date("2026-10-08T06:00:00Z"), at = (m: number) => new Date(+start + m * 60_000);
const origin: Place = { label: "Home", lat: 47, lon: 8 };
const a: Place = { label: "Park at A", lat: 47.002, lon: 8, stopId: "8503000" };
const b: Place = { label: "Collect at B", lat: 47.2, lon: 8.3, stopId: "8507000" };
const destination: Place = { label: "Work", lat: 47.202, lon: 8.3 };
const options: Options = { ...DEFAULT_OPTIONS, takeBikeOnTransit: false, maxBikeMinutes: 9, maxAccessMinutes: 9,
  maxEgressMinutes: 9, maxWalkingMinutes: 10, horizonMinutes: 60, bicycleScope: "confirmed" };
function bike(n: Network, from: Point, to: Point, minutes: number) {
  n.cycling!.set(cyclingKey(from, to), { ...zeroCycling(from, to), minutes, distanceKm: minutes / 4, source: "BRouter", points: [{ ...from, distanceM: 0, elevationM: null }, { ...to, distanceM: minutes * 250, elevationM: null }] });
}
function walk(n: Network, from: Point, to: Point, minutes: number) {
  n.walking!.set(cyclingKey(from, to), { ...zeroWalking(from, to), minutes, distanceKm: minutes * .075, source: "OSRM foot", points: [{ ...from, distanceM: 0, elevationM: null }, { ...to, distanceM: minutes * 75, elevationM: null }] });
}
function ride(from: Place, to: Place, departure: number, arrival: number, permitted: boolean): TransitLeg {
  const leg: TransitLeg = { mode: "transit", from: from.label, to: to.label, fromPoint: from, toPoint: to,
    fromId: from.stopId, toId: to.stopId, departure: at(departure), arrival: at(arrival), service: `IR ${departure}`,
    serviceName: null, direction: null, operator: "SBB", category: "IR", departurePlatform: null, arrivalPlatform: null };
  leg.bicycleEvidence = { permission: permitted ? "allowed" : "prohibited", fromId: leg.fromId!, toId: leg.toId!,
    departure: leg.departure!.toISOString(), service: leg.service, operator: "SBB", conditions: [],
    source: { title: "Fixture service condition", url: "https://example.test/condition", checked: start.toISOString() },
    prerequisites: { bikeTicket: "required", bikeReservation: "not-required" } };
  return leg;
}
function addRide(n: Network, leg: TransitLeg) {
  for (const [point, id, name] of [[leg.fromPoint!, leg.fromId!, leg.from!], [leg.toPoint!, leg.toId!, leg.to!]] as const)
    n.stops.set(id, { ...point, id, name });
  n.edges.set(leg.service, { id: leg.service, from: leg.fromId!, to: leg.toId!, leg });
}
function fixture() {
  const n = emptyNetwork(); n.cycling = new Map(); n.walking = new Map();
  bike(n, origin, a, 4); bike(n, b, destination, 5);
  addRide(n, ride(a, b, 10, 30, false));
  const points = [origin, { ...a, bicycleAction: "park" as const }, { ...b, bicycleAction: "collect" as const }, destination];
  return { n, points };
}
function input(): NavigationInput {
  const { n, points } = fixture(), journey = solveWaypoints(n, points, start, options, "baseline").journeys[0];
  assert.ok(journey);
  return { key: journey.id, journey, cycling: null, origin, destination, waypoints: points.slice(1, -1), options, start, mode: "baseline" };
}

it("starts with a bicycle by default, independently of carriage and riding placement", () => {
  for (const cyclingPosition of ["anywhere", "start-only", "end-only"] as const) for (const takeBikeOnTransit of [true, false]) {
    const o = { ...DEFAULT_OPTIONS, cyclingPosition, takeBikeOnTransit };
    validateOptions(o); assert.equal(hasOriginBicycle(o), true);
    assert.deepEqual(bicyclePossessionAtStages([origin, a, destination], o), [true, true, true]);
  }
  assert.deepEqual(bicyclePossessionAtStages([origin, a, destination], { bicycleAtOrigin: false }), [false, false, false]);
});

it("requires explicit, valid intermediate actions and rejects impossible sequences before searching", () => {
  const collect: Place = { ...a, bicycleAction: "collect" }, park: Place = { ...a, bicycleAction: "park" };
  assert.throws(() => bicyclePossessionAtStages([origin, collect, destination], options), /already have/);
  assert.throws(() => bicyclePossessionAtStages([origin, park, destination], { bicycleAtOrigin: false }), /do not have/);
  assert.throws(() => bicyclePossessionAtStages([park, destination], options), /intermediate/);
  assert.throws(() => bicyclePossessionAtStages([origin, { ...park, lat: NaN }, destination], options), /valid location/);
  assert.throws(() => bicyclePossessionAtStages([origin, { ...park, bicycleAction: "invented" as "park" }, destination], options), /valid bicycle action/);
});

it("never parks a bicycle implicitly to board a service when carriage is disabled", () => {
  const { n } = fixture(); walk(n, b, destination, 5);
  assert.equal(solve(n, origin, destination, start, { ...options, cyclingPosition: "start-only" }, "baseline").journeys.length, 0);
  assert.equal(solveWaypoints(n, [origin, a, destination], start, options, "baseline").journeys.length, 0);
});

it("leaves and collects at the chosen stops, applying passenger eligibility before dominance", () => {
  for (const mode of ["baseline", "extended"] as const) {
    const { n, points } = fixture(), before = JSON.stringify([...n.edges]);
    const j = solveWaypoints(n, points, start, options, mode).journeys[0];
    assert.ok(j); assert.equal(j.totalMinutes, 35); assert.equal(metrics(j).bike, 9);
    assert.deepEqual(j.transitLegs.filter(l => l.bicycleAction).map(l => l.bicycleAction), ["park", "collect"]);
    assert.deepEqual(j.transitLegs.filter(l => l.mode === "transit").map(l => l.bicycleOnBoard), [false]);
    assert.equal(JSON.stringify([...n.edges]), before, "custody annotations must not change shared provider edges");
    assert.equal(fareSummary(j.transitLegs, DEFAULT_FARE_PROFILE).prohibited, false);
  }
});

it("does not reset cycling, boarding or time resources when bicycle status changes", () => {
  const { n, points } = fixture();
  assert.equal(solveWaypoints(n, points, start, { ...options, maxBikeMinutes: 8 }, "baseline").journeys.length, 0);
  assert.equal(solveWaypoints(n, points, start, { ...options, maxBoardings: 0 }, "baseline").journeys.length, 0);
  assert.equal(solveWaypoints(n, points, start, { ...options, arriveBy: at(34).toISOString() }, "baseline").journeys.length, 0);
  assert.ok(solveWaypoints(n, points, start, { ...options, minBikeMinutes: 9 }, "baseline").journeys.length);
});

it("walks to a declared pickup before riding, including a journey with no public transport", () => {
  const n = emptyNetwork(); n.cycling = new Map(); n.walking = new Map();
  walk(n, origin, a, 3); bike(n, a, destination, 5);
  const points = [origin, { ...a, bicycleAction: "collect" as const }, destination], o = { ...options, bicycleAtOrigin: false };
  const j = solveWaypoints(n, points, start, o, "baseline").journeys[0];
  assert.ok(j); assert.equal(j.totalMinutes, 8); assert.equal(metrics(j).walk, 3); assert.equal(metrics(j).bike, 5);
  assert.deepEqual(j.transitLegs.map(l => l.mode), ["walk", "stop", "bike"]);
  assert.ok(categorize([j], o).length, "the requested action journey must appear in results");
  assert.equal(fareSummary(j.transitLegs, DEFAULT_FARE_PROFILE).totalChf, 0);
  const arrival = solveWaypoints(n, points, start, { ...o, arriveBy: at(20).toISOString() }, "baseline").journeys[0];
  assert.equal(+arrival.startTime, +at(12)); assert.equal(+arrival.arrival, +at(20));
});

it("a station identifier cannot teleport a pickup to another entrance", () => {
  const { n, points } = fixture();
  points[2] = { ...points[2], lat: b.lat + .02 };
  bike(n, points[2], destination, 5);
  assert.equal(solveWaypoints(n, points, start, options, "baseline").journeys.length, 0);
});

it("checks every onward service with the bicycle after pickup, while retaining an earlier passenger-only service", () => {
  const { n } = fixture(), c = { label: "C", lat: 47.4, lon: 8.6, stopId: "8507500" };
  walk(n, origin, a, 4); bike(n, c, destination, 5);
  const onward = ride(b, c, 35, 45, true); addRide(n, onward);
  const points = [origin, { ...b, bicycleAction: "collect" as const }, destination];
  n.cycling!.delete(cyclingKey(b, destination));
  const o = { ...options, bicycleAtOrigin: false, takeBikeOnTransit: true };
  const j = solveWaypoints(n, points, start, o, "baseline").journeys[0];
  assert.ok(j); assert.deepEqual(j.transitLegs.filter(l => l.mode === "transit").map(l => l.bicycleOnBoard), [false, true]);
  assert.equal(solveWaypoints(n, points, start, { ...o, maxBoardings: 1 }, "baseline").journeys.length, 0);
  onward.bicycleEvidence!.permission = "prohibited";
  assert.equal(solveWaypoints(n, points, start, o, "baseline").journeys.length, 0);
});

it("uses actual per-leg carriage for fare, reservation and query scope", () => {
  const passenger = { ...ride(a, b, 10, 30, false), bicycleOnBoard: false }, carried = { ...ride(a, b, 35, 50, true), bicycleOnBoard: true };
  passenger.bicycleEvidence!.prerequisites!.bikeReservation = "required";
  assert.deepEqual(reservationMetrics([passenger, carried]), { required: 0, unknown: 0, prohibited: 0 });
  assert.equal(bicycleOnTransitLeg(carried, false), true, "an explicit recorded state beats a legacy fallback");
  assert.equal(fareQuery([passenger, carried], DEFAULT_FARE_PROFILE)?.bicycle, false);
  const fare = fareSummary([passenger, bicycleActionLeg("collect", b, +at(30)), carried], DEFAULT_FARE_PROFILE,
    { status: "quoted", checked: start.toISOString(), environment: "test", passenger: { chf: 10, product: "Passenger", productId: "test" }, bicycle: { chf: 99, product: "Wrong whole route", productId: "test" } });
  assert.equal(fare.prohibited, false); assert.equal(fare.passengerChf, 10); assert.equal(fare.bikeChf, 15);
  assert.equal(fare.online?.bicycle, null); assert.equal(fare.reservationChf, 0);
  carried.bicycleEvidence!.prerequisites!.bikeReservation = "required";
  assert.equal(fareSummary([passenger, bicycleActionLeg("collect", b, +at(30)), carried], DEFAULT_FARE_PROFILE).reservationChf, null,
    "do not assert a through reservation across a custody switch");
});

it("keeps pending actions during replanning and applies them only after explicit stage completion", () => {
  const trip = navigationTrip(input()), park = trip.stages.findIndex(s => s.leg?.bicycleAction === "park"), collect = trip.stages.findIndex(s => s.leg?.bicycleAction === "collect");
  const replan = (index: number) => navigationReplan(trip, index, false, null,
    { ...a, accuracy: 5, timestamp: +start }, +start);
  assert.equal(replan(park).options.bicycleAtOrigin, true);
  assert.deepEqual(remainingNavigationStops(trip, park).map(p => p.bicycleAction), ["park", "collect"]);
  assert.equal(replan(park + 1).options.bicycleAtOrigin, false);
  assert.deepEqual(replan(park + 1).waypoints.map(p => p.bicycleAction), ["collect"]);
  assert.equal(replan(collect).options.bicycleAtOrigin, false);
  assert.equal(replan(collect + 1).options.bicycleAtOrigin, true);
  assert.equal(replan(collect + 1).options.bicycleCollectedAt?.lat, b.lat);
  assert.equal(replan(collect + 1).options.maxBikeMinutes, 5);
  assert.equal(replan(collect + 1).options.maxBoardings, options.maxBoardings - 1);
});

it("saves and restores actions and actual carriage, rejecting a mismatched saved action route", () => {
  const trip = input(); validateSavedTrip(trip);
  const library = parseJourneyLibrary(encodeJourneyLibrary({ version: 1, parked: null,
    journeys: [{ id: "fixture", name: "Explicit bicycle switches", savedAt: start, trip, stage: 0 }] }));
  assert.deepEqual(library.journeys[0].trip.waypoints.map(p => p.bicycleAction), ["park", "collect"]);
  assert.equal(library.journeys[0].trip.journey!.transitLegs.find(l => l.mode === "transit")!.bicycleOnBoard, false);
  const corrupted = structuredClone(trip); corrupted.journey!.transitLegs.find(l => l.bicycleAction === "collect")!.toPoint = origin;
  assert.throws(() => validateSavedTrip(corrupted), /do not match/);
});

it("preserves actions through typed input, restore and reversed return planning", async () => {
  const trip = input(); let id = 0;
  const inputs = restoreWaypointInputs(trip.waypoints, trip.options, () => String(++id));
  inputs[0].value = { text: "A typed replacement" };
  const places = await resolveWaypointInputs(inputs, async () => a);
  assert.deepEqual(places.map(p => typeof p === "string" ? undefined : p.bicycleAction), ["park", "collect"]);
  const reverse = reverseWaypointInputs(inputs, true);
  assert.equal(reverse.bicycleAtOrigin, true); assert.deepEqual(reverse.vias.map(p => p.bicycleAction), ["park", "collect"]);
  assert.equal(reverse.vias[0].id, inputs[1].id);
});

it("allows a passenger prefix to a second bicycle without erasing a different parked-bike record", () => {
  const trip = input(), parked = { place: a, parkedAt: start };
  assert.equal(canFollowWithBicycle(trip, parked), false);
  const navigation = navigationTrip(trip), afterPark = navigation.stages.findIndex(s => s.leg?.bicycleAction === "park") + 1;
  assert.equal(canFollowWithBicycle(trip, parked, afterPark), true);
  assert.deepEqual(parked, { place: a, parkedAt: start });
});


it("acquires the passenger stage between explicit park and pickup without creating a cycling-only comparison", async () => {
  const { n, points } = fixture(), signal = new AbortController().signal;
  const cycling = new CyclingClient(signal, async () => Response.json({ features: [] }), 0, false, null);
  for (const [key, route] of n.cycling!) cycling.routes.set(key, route);
  const walking = new WalkingClient(signal, async () => Response.json({ code: "NoRoute" }));
  const queries: URL[] = [];
  const station = (p: Place) => ({ id: p.stopId, name: p.label, coordinate: { x: p.lat, y: p.lon } });
  const session = await plan(origin, destination, "baseline", options, signal, () => {}, () => {}, {
    start, waypoints: points.slice(1, -1), cyclingClient: cycling, walkingClient: walking, gapMs: 0,
    cyclingFetcher: async () => Response.json({ features: [] }), fetcher: async input => {
      const url = new URL(String(input)); queries.push(url);
      if (url.pathname.endsWith("locations")) {
        const p = Number(url.searchParams.get("x")) < 47.1 ? a : b;
        return Response.json({ stations: [station(p)] });
      }
      return Response.json({ connections: [{ sections: [{ journey: { category: "IR", operator: "SBB", number: "10",
        bicycleData: { attributes: [{ code: "A__VN", text: "Bicycles: carriage prohibited", scope: "service" }],
          source: { title: "Fixture restriction", url: "https://example.test/rule", checked: start.toISOString() } } },
        departure: { station: station(a), departure: at(10).toISOString() }, arrival: { station: station(b), arrival: at(30).toISOString() } }] }] });
    },
  });
  const j = session.baseline.journeys[0]; assert.ok(j);
  assert.equal(session.options.bicycleAtOrigin, true); assert.equal(session.cyclingComparison, undefined);
  assert.equal(j.totalMinutes, 35); assert.equal(j.transitLegs.find(l => l.mode === "transit")!.bicycleOnBoard, false);
  assert.ok(queries.some(q => q.searchParams.get("from") === a.stopId && q.searchParams.get("to") === b.stopId));
});

it("continues on foot with a retained bicycle after start-only riding has finished", () => {
  const n = emptyNetwork(); n.walking = new Map(); walk(n, origin, destination, 7);
  const o = { ...DEFAULT_OPTIONS, bicycleAtOrigin: true, cyclingFinished: true, cyclingPosition: "start-only" as const };
  const j = walkingJourney(n, [origin, destination], start, o); assert.ok(j);
  assert.equal(j.transitLegs[0].bicycleWithTraveller, true); assert.equal(metrics(j).bike, 0); assert.equal(metrics(j).walk, 7);
  assert.ok(categorize([j], o).length, "checked walking continuations remain visible");
});


it("keeps repeated facility occurrences distinct when collection is followed by a return and leave", () => {
  const trip = input(), rack = { ...b, visit: { id: "same-rack", name: b.label, lat: b.lat, lon: b.lon, category: "parking" as const, minutes: 0 } };
  const collect: Place = { ...rack, bicycleAction: "collect" }, park: Place = { ...rack, bicycleAction: "park" };
  // Use occurrence indices explicitly: both visits have the same physical ID.
  const navigation = navigationTrip(trip);
  navigation.waypoints = [collect, { ...a, label: "Other visit" }, park];
  const stage = navigation.stages[0];
  navigation.stages = [
    { ...stage, mode: "stop", leg: { ...bicycleActionLeg("collect", collect, +start), facilityVisit: collect.visit }, completedVisits: 0 },
    { ...stage, mode: "stop", leg: bicycleActionLeg("collect", collect, +start), completedVisits: 1 },
    { ...stage, leg: undefined, completedVisits: 2 },
    { ...stage, mode: "stop", leg: { ...bicycleActionLeg("park", park, +start), facilityVisit: park.visit }, completedVisits: 2 },
    { ...stage, mode: "stop", leg: bicycleActionLeg("park", park, +start), completedVisits: 3 },
  ];
  assert.deepEqual(remainingNavigationStops(navigation, 0).map(p => p.bicycleAction), ["collect", undefined, "park"]);
  assert.deepEqual(remainingNavigationStops(navigation, 3).map(p => p.bicycleAction), ["park"]);
});

it("blocks following legacy implicit parking and pickup snapshots until their actions are explicit", () => {
  for (const cyclingPosition of ["start-only", "end-only", "anywhere"] as const) {
    const trip = input();
    trip.options = { ...trip.options, cyclingPosition, bicycleAtOrigin: undefined };
    trip.waypoints = [];
    trip.journey = { ...trip.journey!, legsIncludeEndpoints: false,
      originStation: { ...trip.journey!.originStation, bikeMinutes: 0 },
      destinationStation: { ...trip.journey!.destinationStation, bikeMinutes: 0 },
      transitLegs: trip.journey!.transitLegs.filter(l => l.mode === "transit").map(l => ({ ...l, bicycleOnBoard: undefined, bicycleWithTraveller: undefined })) };
    assert.equal(canFollowWithBicycle(trip, null), false, cyclingPosition);
    assert.throws(() => navigationReplan(navigationTrip(trip), 0, false, null,
      { ...origin, accuracy: 5, timestamp: +start }, +start), /older journey/);
  }
  const reference = input();
  reference.options = { ...reference.options, bicycleAtOrigin: undefined, cyclingPosition: "end-only" };
  reference.waypoints = []; reference.journey = null; reference.cycling = zeroCycling(origin, destination);
  assert.equal(canFollowWithBicycle(reference, null), false);
});

it("keeps explicit actions followable when their initial bicycle status uses the documented default", () => {
  const trip = input(); trip.options = { ...trip.options, bicycleAtOrigin: undefined };
  assert.equal(canFollowWithBicycle(trip, null), true);
  assert.equal(navigationReplan(navigationTrip(trip), 0, false, null,
    { ...origin, accuracy: 5, timestamp: +start }, +start).options.bicycleAtOrigin, true);
});


it("does not follow a pushing-only route with a planned leave when its bicycle is parked elsewhere", () => {
  const trip = input(), park = trip.waypoints[0];
  trip.waypoints = [park];
  trip.journey = { ...trip.journey!, originStation: { ...trip.journey!.originStation, bikeMinutes: 0 },
    destinationStation: { ...trip.journey!.destinationStation, bikeMinutes: 0 },
    transitLegs: [{ ...bicycleActionLeg("park", park, +at(4)), mode: "walk", bicycleAction: undefined, bicycleWithTraveller: true,
      fromPoint: origin, toPoint: park, departure: start, arrival: at(4) }, bicycleActionLeg("park", park, +at(4))] };
  assert.equal(canFollowWithBicycle(trip, { place: b, parkedAt: start }), false);
});
