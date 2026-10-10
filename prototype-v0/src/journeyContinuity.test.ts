import assert from "node:assert/strict";
import { it } from "node:test";
import { emptyJourneyLibrary, saveJourney, parseJourneyLibrary, encodeJourneyLibrary, loadJourneyLibrary, writeJourneyLibrary, JOURNEY_STORAGE_KEY, MAX_SAVED_JOURNEYS } from "./savedJourneys.ts";
import { reopenJourney } from "./reopenJourney.ts";
import { navigationTrip, remainingNavigationStops, navigationReplan, type NavigationInput } from "./navigation.ts";
import { withoutBicycle, canFollowWithBicycle } from "./bicycleContinuity.ts";
import { DEFAULT_OPTIONS, emptyNetwork, validateOptions, metrics } from "./model.ts";
import { cyclingKey, zeroCycling } from "./cycling.ts";
import { zeroWalking } from "./walking.ts";
import { walkingJourney } from "./walkingJourney.ts";
import { requiredVisitLeg, validateRequiredStops } from "./requiredVisits.ts";
import { solveWaypoints } from "./waypoints.ts";
import { plan } from "./api.ts";
import type { FacilityVisit, Place } from "./routing.ts";
const start = new Date("2026-10-10T10:00:00Z"), at = (m: number) => new Date(+start + m * 60000);
const a: Place = { lat: 47, lon: 8, label: "Start", stopId: "A" }, b: Place = { lat: 47, lon: 8.01, label: "Fountain", stopId: "B" }, c: Place = { lat: 47, lon: 8.02, label: "End", stopId: "C" };
const visit: FacilityVisit = { id: "water:1", name: "Fountain", category: "water", minutes: 7, lat: b.lat, lon: b.lon, openingHours: "24/7" };
const route = (from: Place, to: Place) => ({ ...zeroCycling(from, to), id: `${from.label}:${to.label}`, minutes: 10, distanceKm: .8,
  points: [from, to].map((p, i) => ({ ...p, distanceM: i * 800, elevationM: 400 })) });
function trip(): NavigationInput { return { key: "original", journey: null, cycling: { routes: [route(a, b), route(b, c)],
  stops: [{ afterRoute: 0, visit: { ...visit } }], minutes: 27, distanceKm: 1.6, departure: start, arrival: at(27) },
  origin: { ...a }, destination: { ...c }, waypoints: [], mode: "baseline", options: { ...DEFAULT_OPTIONS }, start }; }
const saved = () => saveJourney(emptyJourneyLibrary(), trip(), 1, "My ride", "one", start);
const fix = (point = b) => ({ ...point, timestamp: +start, accuracy: 5 });

it("round-trips exact paths, facility duration, Date objects and resume stage without storing GPS or navigation machinery", () => {
  const active = { ...navigationTrip(trip()), fix: { secret: true }, progress: { secret: true } };
  const library = saveJourney(emptyJourneyLibrary(), active, 1, "My ride", "one", start);
  const raw = encodeJourneyLibrary(library), restored = parseJourneyLibrary(raw);
  assert.doesNotMatch(raw, /"fix"|"progress"|"stages"|secret/);
  assert.deepEqual(restored, library); assert.ok(restored.journeys[0].trip.cycling!.arrival instanceof Date);
  assert.equal(restored.journeys[0].stage, 1); assert.equal(restored.journeys[0].trip.cycling!.stops![0].visit.minutes, 7);
});
it("takes an independent snapshot instead of mutating saved routes on subsequent edits", () => {
  const t = trip(), library = saveJourney(emptyJourneyLibrary(), t, 0, "", "one", start);
  t.cycling!.routes![0].points[0].lat = 40; t.cycling!.stops![0].visit.minutes = 99; t.options.maxBikeMinutes = 1;
  assert.equal(library.journeys[0].trip.cycling!.routes![0].points[0].lat, 47);
  assert.equal(library.journeys[0].trip.cycling!.stops![0].visit.minutes, 7);
  assert.equal(library.journeys[0].trip.options.maxBikeMinutes, 90);
  assert.equal(library.journeys[0].name, "Start → End");
});
it("reopens a dated snapshot without fetching or manufacturing a fresh timetable", () => {
  const entry = saved().journeys[0], session = reopenJourney(entry);
  assert.equal(session.start, entry.trip.start); assert.equal(session.savedAt, entry.savedAt);
  assert.equal(session.client.requests, 0); assert.equal(session.network.edges.size, 0);
  assert.equal(session.cyclingComparison, entry.trip.cycling);
  assert.match([...session.client.warnings].join(" "), /saved itinerary/);
});
it("reports blocked or corrupt storage without deleting existing data", () => {
  const bad = loadJourneyLibrary({ getItem: () => "{broken" }); assert.equal(bad.library.journeys.length, 0); assert.match(bad.notice, /not been removed/);
  const denied = loadJourneyLibrary({ getItem: () => { throw new Error("denied"); } }); assert.match(denied.notice, /could not be read/);
  const current = saved(), next = { ...current, journeys: [] };
  const failed = writeJourneyLibrary(current, next, { setItem: () => { throw new Error("quota"); } });
  assert.equal(failed.saved, false); assert.equal(failed.library, current); assert.match(failed.notice, /could not save/);
});
it("persists rename/delete and parked location without erasing the other records", () => {
  let raw = "", key = ""; const storage = { setItem(k: string, value: string) { key = k; raw = value; } };
  const current = saved(), next = { ...current, parked: { place: b, parkedAt: start, collectionAt: at(60), cyclingOptions: { ...DEFAULT_OPTIONS } },
    journeys: current.journeys.map(j => ({ ...j, name: "Commute" })) };
  assert.equal(writeJourneyLibrary(current, next, storage).saved, true); assert.equal(key, JOURNEY_STORAGE_KEY);
  assert.equal(parseJourneyLibrary(raw).journeys[0].name, "Commute"); assert.deepEqual(parseJourneyLibrary(raw).parked!.place, b);
  writeJourneyLibrary(next, { ...next, journeys: [] }, storage);
  assert.equal(parseJourneyLibrary(raw).journeys.length, 0); assert.equal(+parseJourneyLibrary(raw).parked!.parkedAt, +start);
});
it("enforces count, stage, schema, date, geometry and option validation before accepting saved data", () => {
  let full = emptyJourneyLibrary(); for (let i = 0; i < MAX_SAVED_JOURNEYS; i++) full = saveJourney(full, trip(), 0, "Ride", String(i), start);
  assert.throws(() => saveJourney(full, trip(), 0, "Ride", "extra"), /12 journeys/);
  assert.throws(() => saveJourney(emptyJourneyLibrary(), trip(), 9, "Ride", "x"), /stage/);
  for (const change of [(v: any) => v.version = 2, (v: any) => v.journeys[0].savedAt = { $date: "bad" },
    (v: any) => v.journeys[0].trip.cycling.routes[0].points[0].lat = 999,
    (v: any) => v.journeys[0].trip.options.maxBikeMinutes = -1,
    (v: any) => v.journeys.push(v.journeys[0])]) {
    const v = JSON.parse(encodeJourneyLibrary(saved())); change(v); assert.throws(() => parseJourneyLibrary(JSON.stringify(v)));
  }
  assert.throws(() => parseJourneyLibrary('{"__proto__":{"polluted":true}}'), /property/);
});
it("keeps ordered uncompleted facility visits with their dwell time until explicit stage completion", () => {
  const t = navigationTrip(trip());
  assert.deepEqual(t.stages.map(s => s.mode), ["bike", "stop", "bike"]);
  for (const i of [0, 1]) { const stops = remainingNavigationStops(t, i); assert.equal(stops.length, 1); assert.equal(stops[0].visit!.minutes, 7); }
  assert.deepEqual(remainingNavigationStops(t, 2), []);
  const reroute = navigationReplan(t, 1, false, null, fix(), +start);
  assert.equal(reroute.waypoints[0].visit!.minutes, 7); assert.equal(reroute.options.maxBikeMinutes, 80);
});
it("merges ordinary stops and repeated facility visits in actual route order", () => {
  const t = trip(); t.waypoints = [b];
  t.cycling!.routes!.push(route(c, a)); t.cycling!.stops!.push({ afterRoute: 1, visit: { ...visit, lat: c.lat, lon: c.lon } });
  t.destination = a; t.cycling!.minutes = 44; t.cycling!.arrival = at(44);
  const all = remainingNavigationStops(navigationTrip(t), 0);
  assert.deepEqual(all.map(p => p.visit ? `visit:${p.visit.id}` : p.label), ["Fountain", "visit:water:1", "visit:water:1"]);
});
it("does not consider a required visit complete merely on reaching its point", () => {
  const t = trip(); t.waypoints = [{ ...b, visit }];
  const stages = navigationTrip(t).stages;
  assert.deepEqual(stages.map(s => s.completedVisits), [0, 1, 1]);
  assert.equal(remainingNavigationStops(navigationTrip(t), 1).length, 1);
  assert.equal(remainingNavigationStops(navigationTrip(t), 2).length, 0);
});
it("uses passenger transport with zero cycling while parked, retaining other routing constraints", () => {
  const original = { ...DEFAULT_OPTIONS, minBikeMinutes: 20, arriveBy: at(90).toISOString() };
  const next = withoutBicycle(original); validateOptions(next);
  assert.equal(next.takeBikeOnTransit, false); assert.equal(next.bicycleScope, "all-transit");
  for (const field of ["maxBikeMinutes", "minBikeMinutes", "maxAccessMinutes", "maxEgressMinutes", "maxIntermediateMinutes", "maxCyclingTransfers"] as const) assert.equal(next[field], 0);
  assert.equal(next.arriveBy, original.arriveBy); assert.equal(next.maxBoardings, original.maxBoardings); assert.equal(original.minBikeMinutes, 20);
  assert.throws(() => validateOptions({ ...next, maxBikeMinutes: 1 }), /parked bicycle/);
});
it("allows inspection but blocks following a bicycle route until collection is confirmed", () => {
  const parked = { place: b, parkedAt: start };
  assert.equal(canFollowWithBicycle(trip(), parked), false);
  assert.equal(canFollowWithBicycle(trip(), null), true);
});
function walkingNetwork() {
  const n = emptyNetwork(); n.walking = new Map();
  for (const [from, to] of [[a, b], [b, c], [a, c]]) n.walking.set(cyclingKey(from, to), { ...zeroWalking(from, to), minutes: to === c && from === a ? 20 : 10, distanceKm: .8, points: [{ ...from, distanceM: 0, elevationM: 0 }, { ...to, distanceM: 800, elevationM: 0 }] });
  return n;
}
it("offers a checked direct walk back to the bicycle, with zero transit and zero cycling", () => {
  const journey = walkingJourney(walkingNetwork(), [a, c], start, withoutBicycle(DEFAULT_OPTIONS))!;
  assert.equal(journey.totalMinutes, 20); assert.equal(metrics(journey).bike, 0); assert.equal(metrics(journey).boardings, 0);
  assert.deepEqual(journey.transitLegs.map(l => l.mode), ["walk"]);
  const t = { ...trip(), journey, cycling: null, options: withoutBicycle(DEFAULT_OPTIONS) };
  assert.equal(canFollowWithBicycle(t, { place: b, parkedAt: start }), true);
  assert.ok(saveJourney(emptyJourneyLibrary(), t, 0, "Return", "return", start));
});
it("walking return keeps visits, arrival deadline, opening hours and per-section limits", () => {
  const n = walkingNetwork(), points = [a, { ...b, visit }, c], o = withoutBicycle(DEFAULT_OPTIONS);
  const j = walkingJourney(n, points, start, { ...o, arriveBy: at(30).toISOString() })!;
  assert.equal(+j.startTime, +at(3)); assert.equal(+j.arrival, +at(30)); assert.equal(j.totalMinutes, 27);
  assert.deepEqual(j.transitLegs.map(l => l.mode), ["walk", "stop", "walk"]);
  for (const opts of [{ ...o, horizonMinutes: 26 }, { ...o, maxWalkingMinutes: 9 }, { ...o, arriveBy: at(26).toISOString() }]) assert.equal(walkingJourney(n, points, start, opts), null);
  assert.equal(walkingJourney(n, [a, { ...b, visit: { ...visit, openingHours: "off" } }, c], start, o), null);
  assert.equal(walkingJourney(emptyNetwork(), [a, c], start, o), null);
});
it("validates separate ordinary-stop and facility limits and disallows mismatched facility points", () => {
  const stop = { ...b, visit }; validateRequiredStops([...Array(4).fill(a), ...Array(5).fill(stop)]);
  for (const stops of [Array(5).fill(a), Array(6).fill(stop), [{ ...b, lat: 46, visit }], [{ ...b, visit: { ...visit, minutes: -1 } }]]) assert.throws(() => validateRequiredStops(stops));
  assert.equal(requiredVisitLeg({ ...b, visit }, +start)!.arrival!.getTime(), +at(7));
});
function transitNetwork() {
  const n = emptyNetwork(); for (const p of [a, b, c]) n.stops.set(p.stopId!, { ...p, id: p.stopId!, name: p.label });
  function ride(from: Place, to: Place, dep: number, arr: number) { const id = `${from.stopId}-${to.stopId}-${dep}`; n.edges.set(id, { id, from: from.stopId!, to: to.stopId!,
    leg: { mode: "transit", from: from.label, to: to.label, fromPoint: from, toPoint: to, fromId: from.stopId, toId: to.stopId, service: id,
      departure: at(dep), arrival: at(arr), departurePlatform: null, arrivalPlatform: null, serviceName: null, direction: null } }); }
  ride(a, b, 5, 20); ride(b, c, 23, 40); ride(b, c, 30, 50);
  return n;
}
for (const mode of ["baseline", "extended"] as const) {
  it(`replanned facility duration misses the early train and retains later feasible service (${mode})`, () => {
    const options = { ...DEFAULT_OPTIONS, maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0, maxIntermediateMinutes: 0 };
    const result = solveWaypoints(transitNetwork(), [a, { ...b, visit }, c], start, options, mode);
    assert.ok(result.journeys.length); assert.equal(+result.journeys[0].arrival, +at(50));
    assert.equal(result.journeys[0].transitLegs.filter(l => l.mode === "stop")[0].facilityVisit!.minutes, 7);
    assert.equal(metrics(result.journeys[0]).bike, 0);
    assert.equal(solveWaypoints(transitNetwork(), [a, { ...b, visit }, c], start, { ...options, arriveBy: at(45).toISOString() }, mode).journeys.length, 0);
    assert.equal(solveWaypoints(transitNetwork(), [a, { ...b, visit: { ...visit, openingHours: "off" } }, c], start, options, mode).journeys.length, 0);
  });
  it(`parked-bicycle transit search uses walking and preserves required visits (${mode})`, () => {
    const result = solveWaypoints(transitNetwork(), [a, { ...b, visit }, c], start, withoutBicycle(DEFAULT_OPTIONS), mode);
    assert.ok(result.journeys.length); assert.ok(result.journeys.every(j => j.transitLegs.every(l => l.mode !== "bike")));
    assert.ok(result.journeys.every(j => +j.arrival >= +at(50)));
  });
}
it("the real acquisition flow publishes a checked walking route without making a bicycle route request", async () => {
  const seen: string[] = [], updates: number[] = [];
  const result = await plan(a, c, "baseline", withoutBicycle(DEFAULT_OPTIONS), new AbortController().signal, () => {}, s => updates.push(s.baseline.journeys.length), {
    start, gapMs: 0, fetcher: async input => { seen.push(String(input)); return new Response(JSON.stringify({ connections: [] })); },
    walkingFetcher: async input => { seen.push(String(input)); return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 1600, duration: 1200,
      geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [c.lon, c.lat]] }, legs: [{ steps: [{ mode: "walking" }] }] }] })); },
    cyclingFetcher: async () => { throw new Error("Bicycle routing must not be used while parked"); },
  });
  assert.equal(result.cyclingClient, undefined); assert.equal(result.cyclingComparison, undefined);
  assert.ok(result.baseline.journeys.length); assert.ok(updates.some(n => n > 0));
  assert.equal(result.baseline.journeys[0].transitLegs[0].mode, "walk");
  assert.ok(seen.length > 0);
});
it("arrive-by departure seeds include a facility visit before the first train", () => {
  const n = transitNetwork(); n.edges.delete("A-B-5"); n.edges.delete("B-C-23");
  n.cycling = new Map([[cyclingKey(a, b), route(a, b)]]);
  const o = { ...DEFAULT_OPTIONS, arriveBy: at(50).toISOString(), maxBikeMinutes: 10, maxAccessMinutes: 10, maxEgressMinutes: 0, maxIntermediateMinutes: 0 };
  for (const mode of ["baseline", "extended"] as const) {
    const result = solveWaypoints(n, [a, { ...b, visit }, c], start, o, mode);
    assert.ok(result.journeys.length); assert.equal(+result.journeys[0].startTime, +at(10));
    assert.equal(result.journeys[0].transitLegs.find(l => l.mode === "stop")!.arrival!.getTime(), +at(27));
  }
});
it("saved mixed timetables retain live identity and scheduled Dates without mutating their source", () => {
  const journey = solveWaypoints(transitNetwork(), [a, { ...b, visit }, c], start, { ...DEFAULT_OPTIONS, maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0 }, "baseline").journeys[0];
  const t = { ...trip(), journey, cycling: null, waypoints: [{ ...b, visit }] };
  const stored = saveJourney(emptyJourneyLibrary(), t, 0, "Transit", "transit", start).journeys[0];
  assert.equal(JSON.stringify(stored.trip.journey), JSON.stringify(journey)); assert.ok(stored.trip.journey!.transitLegs[0].arrival instanceof Date);
  assert.equal(reopenJourney(stored).savedAt, stored.savedAt);
  assert.equal(remainingNavigationStops(navigationTrip(stored.trip), 0).filter(p => p.visit).length, 1);
});
