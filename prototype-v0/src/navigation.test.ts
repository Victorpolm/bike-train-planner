import assert from "node:assert/strict";
import { it } from "node:test";
import { LocationWatch, ScreenAwake, usableFix, type LocationState } from "./locationTracking.ts";
import { navigationTrip, advanceProgress, remainingPath, navigationConnection, navigationReplan, navigationRide, remainingMinutes } from "./navigation.ts";
import { zeroCycling } from "./cycling.ts";
import { DEFAULT_OPTIONS } from "./model.ts";
import type { Journey, Point, TransitLeg } from "./routing.ts";

const now = Date.parse("2026-10-10T10:00:00Z"), at = (m: number) => new Date(now + m * 60_000);
const a = { lat: 47, lon: 8, label: "A" }, b = { lat: 47, lon: 8.02, label: "B" }, c = { lat: 47, lon: 8.04, label: "C" };
const fix = (point: Point, offset = 0, accuracy = 5) => ({ ...point, accuracy, timestamp: now + offset });
function route(points: Point[], minutes = 10) {
  return { ...zeroCycling(points[0], points.at(-1)!), id: JSON.stringify(points), distanceKm: 2, minutes,
    points: points.map((p, i) => ({ ...p, elevationM: 400, distanceM: i * 1000 })) };
}
function ride(from = b, to = c, departure = 20, arrival = 40): TransitLeg {
  return { mode: "transit", service: "IR 15", serviceName: null, direction: null, from: from.label, to: to.label,
    fromId: from.label, toId: to.label, fromPoint: from, toPoint: to, departure: at(departure), arrival: at(arrival),
    departurePlatform: "1", arrivalPlatform: "2", geometry: [from, to], geometryKind: "stops" };
}
function mixed() {
  const bike = route([a, b]);
  const leg: TransitLeg = { ...ride(a, b, 0, 10), mode: "bike", service: "Cycle", cyclingRoute: bike };
  const train = ride();
  const last = { ...leg, from: "C", to: "D", fromPoint: c, toPoint: { ...c, lon: 8.06 }, departure: at(40), arrival: at(50),
    cyclingRoute: route([c, { ...c, lon: 8.06 }]) };
  const station = (p: typeof a) => ({ ...p, id: p.label, name: p.label, distanceKm: 0, bikeMinutes: 0 });
  const journey: Journey = { id: "mixed", startTime: at(0), departure: at(20), arrival: at(50), totalMinutes: 50,
    trainMinutes: 20, waitMinutes: 10, changes: 0, services: [train.service], originStation: station(a), destinationStation: station(c),
    legsIncludeEndpoints: true, transitLegs: [leg, train, last], waypoints: [{ place: b, arrival: at(10) }] };
  return navigationTrip({ key: "mixed", journey, cycling: null, origin: a, destination: { ...c, lon: 8.06, label: "D" },
    waypoints: [b], options: { ...DEFAULT_OPTIONS }, mode: "baseline", start: at(0) });
}
function bike(points = [a, b, c]) {
  return navigationTrip({ key: "bike", journey: null, origin: a, destination: c, waypoints: [b],
    options: { ...DEFAULT_OPTIONS }, mode: "extended", start: at(0), cycling: { minutes: 20, distanceKm: 4, arrival: at(20),
      routes: points.length === 3 ? [route(points.slice(0, 2)), route(points.slice(1))] : [route(points)] } });
}

it("builds cycling-only and mixed stages with explicit waypoint completion, without wait or schematic street paths", () => {
  const trip = mixed();
  assert.deepEqual(trip.stages.map(s => s.mode), ["bike", "transit", "bike"]);
  assert.deepEqual(trip.stages.map(s => s.completedVisits), [1, 1, 1]);
  assert.equal(trip.stages[1].path.length, 0);
  assert.deepEqual(bike().stages.map(s => s.completedVisits), [1, 1]);
});
it("tracks remaining street distance and planned time without mutating the original route", () => {
  const stage = bike().stages[0], before = JSON.stringify(stage);
  const progress = advanceProgress(stage, fix({ ...a, lon: 8.01 }), null, now)!;
  assert.ok(Math.abs(progress.distanceM / stage.lengthM - .5) < .001);
  assert.ok(Math.abs(remainingMinutes(stage, progress) - 5) < .001);
  assert.equal(remainingPath(stage, progress).at(-1), stage.path.at(-1));
  assert.equal(JSON.stringify(stage), before);
});
it("rejects stale, imprecise, malformed and out-of-order GPS for progress", () => {
  const stage = bike().stages[0], first = advanceProgress(stage, fix(a), null, now)!;
  for (const value of [fix(b, -25_000), fix(b, 0, 100), fix({ lat: NaN, lon: 8 }), fix(b, -1)])
    assert.equal(advanceProgress(stage, value, first, now), first);
  assert.equal(usableFix(fix(a, 2000), now), false);
  assert.equal(usableFix(fix(a, 0, 0), now), false);
});
it("does not jump to the end of a closed loop or a later crossing", () => {
  const points = [a, b, { ...b, lat: 47.02 }, { ...a, lat: 47.02 }, a];
  const stage = bike(points).stages[0];
  const start = advanceProgress(stage, fix(a), null, now)!;
  const next = advanceProgress(stage, fix({ ...a, lon: 8.0001 }, 5000), start, now + 5000)!;
  assert.ok(start.distanceM < 1); assert.ok(next.distanceM < 30);
});
it("requires sustained accurate off-route fixes, preserves progress and allows backtracking without refunding distance", () => {
  const stage = bike().stages[0];
  const first = advanceProgress(stage, fix({ ...a, lon: 8.01 }), null, now)!;
  const outside = { ...a, lat: 47.004, lon: 8.01 };
  const warning = advanceProgress(stage, fix(outside, 5000), first, now + 5000)!;
  assert.equal(warning.offRoute, false); assert.equal(warning.distanceM, first.distanceM);
  const confirmed = advanceProgress(stage, fix(outside, 14000), warning, now + 14000)!;
  assert.equal(confirmed.offRoute, true);
  const back = advanceProgress(stage, fix({ ...a, lon: 8.009 }, 19000), confirmed, now + 19000)!;
  assert.equal(back.offRoute, false); assert.ok(back.distanceM < first.distanceM); assert.equal(back.highWaterM, first.distanceM);
});
it("never produces off-route warnings from transit lines", () => {
  assert.equal(advanceProgress(mixed().stages[1], fix({ lat: 46, lon: 7 }), null, now), null);
});
it("reacquires progress after a long hidden interval without changing stages or trusting an instant GPS jump", () => {
  const stage = bike([a, { ...a, lon: 8.3 }]).stages[0];
  const first = advanceProgress(stage, fix(a), null, now)!;
  const jumped = advanceProgress(stage, fix({ ...a, lon: 8.1 }, 1000), first, now + 1000)!;
  assert.equal(jumped.distanceM, 0); assert.equal(jumped.offSince, now + 1000);
  const resumed = advanceProgress(stage, fix({ ...a, lon: 8.1 }, 20 * 60000), first, now + 20 * 60000)!;
  assert.ok(resumed.distanceM > 7000); assert.equal(resumed.offSince, null);
});
it("uses live departure/platform and boarding allowance for the GPS connection estimate, preserving scheduled identity", () => {
  const trip = mixed(), stage = trip.stages[0], leg = trip.journey!.transitLegs[1];
  const progress = advanceProgress(stage, fix(a), null, now)!;
  const scheduled = navigationConnection(trip, 0, false, progress, trip.journey, fix(a), now)!;
  assert.equal(scheduled.slackMinutes, 7); assert.equal(scheduled.stale, true);
  const updated = { ...leg, realtime: { checkedAt: at(0).toISOString(), estimatedDeparture: at(25).toISOString(), estimatedArrival: at(45).toISOString(),
    departurePlatform: "4", arrivalPlatform: "5", cancelled: false, departureCancelled: false, arrivalCancelled: false, undefinedDelay: false } };
  const live = { ...trip.journey!, transitLegs: [trip.journey!.transitLegs[0], updated, trip.journey!.transitLegs[2]] };
  const estimate = navigationConnection(trip, 0, false, progress, live, fix(a), now)!;
  assert.equal(estimate.slackMinutes, 12); assert.equal(estimate.platform, "4"); assert.equal(estimate.stale, false);
  assert.equal(navigationRide(trip.stages[1], live), updated); assert.equal(leg.realtime, undefined);
  assert.equal(navigationConnection(trip, 0, false, progress, live, fix(a, -25_000), now)!.slackMinutes, null);
  assert.equal(navigationConnection(trip, 1, true, null, live, fix(c), now), null);
});
it("reports missed connections and cancellations without automatically changing the active service", () => {
  const trip = mixed();
  assert.ok(navigationConnection(trip, 1, false, null, trip.journey, fix(b, 25 * 60000), +at(25))!.slackMinutes! < 0);
  trip.journey!.transitLegs[1].realtime = { checkedAt: at(0).toISOString(), estimatedDeparture: null, estimatedArrival: null,
    departurePlatform: null, arrivalPlatform: null, cancelled: true, departureCancelled: false, arrivalCancelled: false, undefinedDelay: true };
  assert.equal(navigationConnection(trip, 1, false, null, trip.journey, fix(b), now)!.unavailable, true);
});
it("keeps additional live platform walking in the GPS estimate after navigation has started", () => {
  const trip = mixed(), leg = trip.journey!.transitLegs[1];
  const transfer: TransitLeg = { ...leg, mode: "walk", service: "Access to new platform", departure: at(10), arrival: at(15), stationAccess: true };
  const live = { ...trip.journey!, transitLegs: [trip.journey!.transitLegs[0], transfer, leg, trip.journey!.transitLegs[2]] };
  const progress = advanceProgress(trip.stages[0], fix(a), null, now);
  assert.equal(+navigationConnection(trip, 0, false, progress, live, fix(a), now)!.stationArrival!, +at(15));
});
it("keeps an allowance for an unmapped route endpoint instead of claiming arrival at the road end", () => {
  const trip = bike(); trip.stages[0].endGapM = 100; trip.stages[0].endPoint = { ...b, lat: b.lat + .0009 };
  const progress = advanceProgress(trip.stages[0], fix(b), null, now)!;
  assert.equal(remainingMinutes(trip.stages[0], progress), 1.5);
  const access = advanceProgress(trip.stages[0], fix(trip.stages[0].endPoint!, 10000), progress, now + 10000)!;
  assert.equal(access.offSince, null);
});
it("reroutes from now, keeps unvisited waypoints and subtracts used cycling and boarding budgets", () => {
  const trip = mixed(), originalOptions = JSON.stringify(trip.options);
  const access = advanceProgress(trip.stages[0], fix({ ...a, lon: 8.01 }), null, now)!;
  const first = navigationReplan(trip, 0, false, access, fix(a), now);
  assert.deepEqual(first.waypoints, [b]); assert.equal(first.options.maxBikeMinutes, 85); assert.equal(first.options.maxAccessMinutes, 55);
  const last = navigationReplan(trip, 2, false, null, fix(c), now);
  assert.deepEqual(last.waypoints, []); assert.equal(last.options.maxBikeMinutes, 80); assert.equal(last.options.maxBoardings, 3);
  assert.equal(last.options.cyclingPace, trip.options.cyclingPace); assert.equal(last.mode, trip.mode);
  assert.equal(+last.start, now); assert.equal(last.origin.label, "Current location"); assert.equal(JSON.stringify(trip.options), originalOptions);
});
it("subtracts completed cycling from the minimum without counting transit or waiting", () => {
  const trip = mixed(); trip.options = { ...trip.options, minBikeMinutes: 20 };
  const access = advanceProgress(trip.stages[0], fix({ ...a, lon: 8.01 }), null, now)!;
  assert.equal(navigationReplan(trip, 0, false, access, fix(a), now).options.minBikeMinutes, 15);
  assert.equal(navigationReplan(trip, 2, false, null, fix(c), now).options.minBikeMinutes, 10);
  trip.options.minBikeMinutes = 5;
  assert.equal(navigationReplan(trip, 2, false, null, fix(c), now).options.minBikeMinutes, 0);
});
it("does not discard a requested visit merely because GPS is near it", () => {
  const trip = bike(), progress = advanceProgress(trip.stages[0], fix(b), null, now);
  assert.deepEqual(navigationReplan(trip, 0, false, progress, fix(b), now).waypoints, [b]);
  assert.deepEqual(navigationReplan(trip, 1, false, null, fix(b), now).waypoints, []);
});
it("blocks replanning with stale GPS, while boarded, after a passed deadline or after bicycle custody changes", () => {
  const trip = mixed();
  assert.throws(() => navigationReplan(trip, 1, true, null, fix(b), now), /alighted/);
  assert.throws(() => navigationReplan(trip, 0, false, null, fix(a, -21000), now), /fresh/);
  trip.options.arriveBy = at(-1).toISOString();
  assert.throws(() => navigationReplan(trip, 0, false, null, fix(a), now), /deadline/);
  delete trip.options.arriveBy; trip.options.takeBikeOnTransit = false; trip.options.cyclingPosition = "start-only";
  const passenger = navigationReplan(trip, 1, false, null, fix(b), now);
  assert.equal(passenger.options.walkingOnly, true); assert.equal(passenger.options.maxBikeMinutes, 0);
  assert.equal(passenger.options.takeBikeOnTransit, false);
  trip.options.cyclingPosition = "end-only";
  assert.throws(() => navigationReplan(trip, 1, false, null, fix(b), now), /bicycle/);
  trip.options.takeBikeOnTransit = true; trip.options.maxBoardings = 1;
  assert.throws(() => navigationReplan(trip, 2, false, null, fix(c), now), /boarding limit/);
});

function locationHarness() {
  const callbacks: { success: PositionCallback; error: PositionErrorCallback }[] = [], cleared: number[] = [], states: LocationState[] = [];
  const geo = { watchPosition(success: PositionCallback, error: PositionErrorCallback, options: PositionOptions) {
    assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }); callbacks.push({ success, error }); return callbacks.length - 1;
  }, clearWatch(id: number) { cleared.push(id); } };
  const tracker = new LocationWatch(geo, state => states.push(state), () => now);
  const position = (timestamp = now) => ({ timestamp, coords: { latitude: 47, longitude: 8, accuracy: 5 } }) as GeolocationPosition;
  return { tracker, callbacks, cleared, states, position };
}
it("does not ask for location before Start and clears watch zero on Stop, ignoring late callbacks", () => {
  const h = locationHarness(); assert.equal(h.callbacks.length, 0);
  h.tracker.start(); h.callbacks[0].success(h.position()); assert.equal(h.states.at(-1)!.status, "tracking");
  h.tracker.stop(); h.callbacks[0].success(h.position());
  assert.deepEqual(h.cleared, [0]); assert.equal(h.states.at(-1)!.status, "idle"); assert.equal(h.states.at(-1)!.fix, null);
});
it("pauses while hidden, resumes with a new watch and never accepts the old session's fix", () => {
  const h = locationHarness(); h.tracker.start(); h.tracker.pause();
  h.callbacks[0].success(h.position()); assert.equal(h.states.at(-1)!.status, "paused");
  h.tracker.resume(); h.callbacks[0].success(h.position()); assert.equal(h.states.at(-1)!.status, "locating");
  h.callbacks[1].success(h.position()); assert.equal(h.states.at(-1)!.status, "tracking");
  h.tracker.stop(); h.tracker.resume(); assert.equal(h.callbacks.length, 2);
});
it("shows denied/timeout errors, ignores bad timestamps and permits an explicit retry", () => {
  const h = locationHarness(); h.tracker.start();
  h.callbacks[0].success(h.position(now - 30000)); assert.equal(h.states.at(-1)!.status, "locating");
  h.callbacks[0].error({ code: 3 } as GeolocationPositionError); assert.match(h.states.at(-1)!.message, /timed out/);
  h.callbacks[0].error({ code: 1 } as GeolocationPositionError); assert.match(h.states.at(-1)!.message, /denied/);
  h.callbacks[0].success(h.position()); assert.equal(h.states.at(-1)!.status, "error");
  h.tracker.start(); h.callbacks[1].success(h.position()); assert.equal(h.states.at(-1)!.status, "tracking");
});
it("handles unsupported location and a browser exception without leaving an active watch", () => {
  const states: LocationState[] = [];
  new LocationWatch(undefined, s => states.push(s)).start(); assert.match(states.at(-1)!.message, /unavailable/);
  new LocationWatch({ watchPosition: () => { throw new Error("blocked"); }, clearWatch: () => {} }, s => states.push(s)).start();
  assert.match(states.at(-1)!.message, /blocked/);
});
it("releases a wake-lock request that resolves after Stop instead of leaking it", async () => {
  let resolve!: (lock: WakeLockSentinel) => void, releases = 0;
  const states: string[] = [];
  const lock = { release: async () => { releases++; }, addEventListener: () => {} } as unknown as WakeLockSentinel;
  const controller = new ScreenAwake(() => new Promise(r => { resolve = r; }), s => states.push(s));
  const pending = controller.enable(); controller.disable(); resolve(lock); await pending;
  assert.equal(releases, 1); assert.equal(states.at(-1), "off");
});
it("releases acquired wake locks on hide and supports reacquisition or rejection", async () => {
  let releases = 0; const states: string[] = [];
  const lock = { release: async () => { releases++; }, addEventListener: () => {} } as unknown as WakeLockSentinel;
  const controller = new ScreenAwake(async () => lock, s => states.push(s));
  await controller.enable(); assert.equal(states.at(-1), "on"); controller.disable(); assert.equal(releases, 1);
  await controller.enable(); assert.equal(states.at(-1), "on"); controller.disable(); assert.equal(releases, 2);
  await new ScreenAwake(undefined, s => states.push(s)).enable(); assert.equal(states.at(-1), "unavailable");
  await new ScreenAwake(async () => { throw new Error("battery"); }, s => states.push(s)).enable(); assert.equal(states.at(-1), "unavailable");
});
