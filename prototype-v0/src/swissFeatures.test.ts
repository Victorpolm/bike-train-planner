import assert from "node:assert/strict";
import { it } from "node:test";
import { operatorBicycleRule, sbbIcReservation } from "./operatorBicycleRules.ts";
import { bicyclePermission, bicycleLegAllowed } from "./bicyclePermission.ts";
import { carriageForLeg, interpretBicycleAttributes } from "./bicycleCarriage.ts";
import { bikeDayPrice, DEFAULT_FARE_PROFILE, fareSummary, readFareProfile } from "./fares.ts";
import { parseBikeParking } from "./bikeParking.ts";
import { handleParking } from "../server/parkingHandler.ts";
import { SearchDeadline } from "./searchDeadline.ts";
import { plan, searchWarnings } from "./api.ts";
import { DEFAULT_OPTIONS } from "./model.ts";
import type { TransitLeg } from "./routing.ts";

const leg = (date = "2026-09-22T10:00:00+02:00", changes: Partial<TransitLeg> = {}): TransitLeg => ({
  mode: "transit", from: "Zürich HB", to: "Baden", fromId: "8503000", toId: "8503504",
  departure: new Date(date), arrival: new Date(Date.parse(date) + 30 * 60_000),
  departurePlatform: null, arrivalPlatform: null, service: "IC 1", category: "IC", operator: "SBB",
  serviceName: null, direction: null, ...changes,
});

it("applies the seasonal Swiss IC reservation calendar including exceptions and Swiss local dates", () => {
  for (const [day, service, expected] of [
    ["2026-03-20", "IC 5", "not-required"], ["2026-03-21", "IC 5", "required"],
    ["2026-09-22", "IC 5", "required"], ["2026-09-22", "IC 1", "not-required"],
    ["2026-09-25", "IC 1", "required"], ["2026-09-27", "IC 1", "required"],
    ["2026-04-02", "IC 1", "required"], ["2026-04-06", "IC 1", "required"],
    ["2026-05-13", "IC 1", "required"], ["2026-05-14", "IC 1", "required"],
    ["2026-05-25", "IC 1", "required"], ["2026-08-01", "IC 1", "required"],
    ["2026-10-31", "IC 5", "required"], ["2026-11-01", "IC 5", "not-required"],
  ]) assert.equal(sbbIcReservation(leg(day + "T10:00:00+02:00", { service })), expected, `${day} ${service}`);
  assert.equal(sbbIcReservation(leg("2026-09-24T22:30:00Z")), "required");
  assert.equal(sbbIcReservation(leg(undefined, { service: "IC 284" })), "unknown");
  for (const category of ["EC", "ICE", "RJX"]) assert.equal(sbbIcReservation(leg("2026-11-02T10:00:00Z", { category })), "required");
});

it("verifies covered Swiss services without treating rush-hour regional trains or replacements as verified", () => {
  assert.equal(bicyclePermission(leg()), "confirmed");
  assert.equal(carriageForLeg(leg(undefined, { category: "IR", service: "IR 35" })).bikeReservation, "not-required");
  assert.equal(bicyclePermission(leg(undefined, { operator: "OJP:33", category: "RE" })), "confirmed");
  assert.equal(bicyclePermission(leg(undefined, { operator: "RhB", category: "RE" })), "confirmed");
  assert.equal(carriageForLeg(leg(undefined, { operator: "RhB", category: "RE" })).bikeReservation, "unknown");
  assert.equal(operatorBicycleRule(leg(undefined, { operator: "RhB", category: "PE" })), null);
  assert.equal(operatorBicycleRule(leg(undefined, { category: "EV" })), null);
  assert.equal(operatorBicycleRule(leg(undefined, { toId: "8000105" })), null);
  const regional = { category: "S", service: "S 12" };
  assert.equal(bicyclePermission(leg("2026-09-22T05:55:00+02:00", { ...regional, arrival: new Date("2026-09-22T09:05:00+02:00") })), "uncertain");
  assert.equal(bicyclePermission(leg("2026-09-22T10:00:00+02:00", regional)), "confirmed");
  assert.equal(bicyclePermission(leg("2026-09-26T07:00:00+02:00", regional)), "confirmed");
});

it("honours dated prohibitions and restricted international carriage before operator defaults", () => {
  const base = leg();
  const restricted: TransitLeg = { ...base, bicycleEvidence: { permission: "unknown", fromId: base.fromId!, toId: base.toId!,
    departure: base.departure!.toISOString(), service: base.service, operator: base.operator!,
    source: { title: "Dated timetable", url: "https://example.org", checked: "2026-09-25" },
    conditions: ["Bicycle carriage is restricted to international travel; eligibility must be checked for your boarded segment."] } };
  assert.equal(bicyclePermission(restricted), "uncertain");
  restricted.bicycleEvidence!.permission = "prohibited";
  assert.equal(bicyclePermission(restricted), "prohibited");
  assert.equal(bicycleLegAllowed(restricted, "include-unknown", "allow-uncertain"), false);
  assert.equal(bicycleLegAllowed(restricted, "include-unknown", "all-transit"), true);
  assert.equal(fareSummary([restricted], DEFAULT_FARE_PROFILE).knownBikeTotal, null);
});

it("interprets staff loading, local tickets and international-only attributes independently", () => {
  const rule = (...codes: string[]) => interpretBicycleAttributes(codes.map(code => ({ code: "A__" + code, text: "", scope: "service" })));
  assert.equal(rule("VC").permission, "allowed");
  assert.equal(rule("VR", "VI").permission, "unknown");
  assert.equal(rule("VR", "VI", "VN").permission, "prohibited");
  assert.equal(rule("VK").permission, "unknown");
  assert.equal(rule("VT").permission, "unknown");
  assert.ok(rule("VK").notes.some(n => n.includes("local transport operator")));
});

it("does not double-charge connecting bicycle reservations or make the bike free with GA or Halbtax", () => {
  const first = leg("2026-09-25T10:00:00+02:00");
  const second = leg("2026-09-25T11:00:00+02:00", { service: "IC 5" });
  for (const passenger of ["full", "half-fare", "ga"] as const) {
    const fare = fareSummary([first, second], { passenger, annualBikePass: false });
    assert.equal(fare.required, 2); assert.equal(fare.reservationChf, 2);
    assert.equal(fare.bikeChf, 15); assert.equal(fare.knownBikeTotal, 17);
  }
  assert.equal(fareSummary([first, second], { passenger: "ga", annualBikePass: true }).knownBikeTotal, 2);
  assert.equal(fareSummary([leg(undefined, { category: "IR" })], DEFAULT_FARE_PROFILE).reservationChf, 0);
  const breakLeg = leg(undefined, { mode: "bike" });
  assert.equal(fareSummary([first, breakLeg, second], DEFAULT_FARE_PROFILE).reservationChf, null);
});

it("bounds price validity and day-pass coverage and does not extrapolate prices to unknown operators", () => {
  assert.equal(bikeDayPrice(new Date("2026-12-12T12:00:00Z")), 15);
  assert.equal(bikeDayPrice(new Date("2026-12-13T12:00:00Z")), 16);
  assert.equal(bikeDayPrice(new Date("2028-01-01T12:00:00Z")), null);
  const overnight = leg("2026-09-25T23:00:00+02:00", { arrival: new Date("2026-09-26T04:59:00+02:00") });
  assert.equal(fareSummary([overnight], DEFAULT_FARE_PROFILE).singleDayPass, true);
  overnight.arrival = new Date("2026-09-26T05:01:00+02:00");
  assert.equal(fareSummary([overnight], DEFAULT_FARE_PROFILE).bikeChf, null);
  const unknown = fareSummary([leg(undefined, { operator: "Unknown railway" })], { passenger: "ga", annualBikePass: true });
  assert.equal(unknown.bikeChf, null); assert.equal(unknown.knownBikeTotal, null);
  assert.deepEqual(readFareProfile({ passenger: "bogus", annualBikePass: "true" }), DEFAULT_FARE_PROFILE);
});

const parkingFeature = { id: "rack", geometry: { type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [8.5, 47.3] }] },
  properties: { parkingFacilityCategory: "BIKE", parkingFacilityType: "BIKE_PARKING_COVERED", displayName: "Station parking",
    capacities: [{ categoryType: "STANDARD", total: 0 }], callToAction: { externalDesktop: { en: "javascript:alert(1)" } } } };
it("imports bicycle facilities only, preserves zero capacity and unknown fields, and rejects unsafe links", () => {
  const result = parseBikeParking({ features: [parkingFeature, parkingFeature,
    { ...parkingFeature, id: "car", properties: { parkingFacilityCategory: "CAR" } },
    { ...parkingFeature, id: "bad", geometry: { type: "Point", coordinates: [8, 999] } }] });
  assert.equal(result.facilities.length, 1);
  assert.equal(result.facilities[0].covered, true); assert.equal(result.facilities[0].capacity, 0);
  assert.equal(result.facilities[0].publicAccess, null); assert.equal(result.facilities[0].url, undefined);
  assert.match(result.coverage, /not an inventory of every/);
});
it("handles parking failures independently and shares one in-flight dataset request", async () => {
  const request = new Request("https://private.example/api/parking");
  assert.equal((await handleParking(new Request(request, { method: "POST" }))).status, 405);
  assert.equal((await handleParking(request, async () => new Response("down", { status: 503 }))).status, 503);
  let calls = 0;
  const fetcher = async () => { calls++; return Response.json({ features: [parkingFeature] }); };
  const results = await Promise.all([handleParking(request, fetcher), handleParking(request, fetcher)]);
  assert.equal(calls, 1); assert.ok(results.every(r => r.ok));
  assert.equal((await results[0].json()).facilities.length, 1);
});

it("ends an operation which ignores cancellation at the deadline and preserves explicit user cancellation", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const parent = new AbortController(), deadline = new SearchDeadline(parent.signal, 40);
  const result = deadline.run(() => new Promise(() => {}));
  const check = assert.rejects(result, { name: "TimeoutError" });
  t.mock.timers.tick(40); await check; assert.equal(deadline.expired, true);
  const cancelled = new SearchDeadline(parent.signal, 40);
  const abortCheck = assert.rejects(cancelled.run(() => new Promise(() => {})), { name: "AbortError" });
  parent.abort(); await abortCheck; assert.equal(cancelled.expired, false);
});

it("keeps a completed cycling-only result when the whole search deadline interrupts stalled station checks", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const from = { label: "Map point A", lat: 30, lon: 4 }, to = { label: "Map point B", lat: 30.01, lon: 4.01 };
  const task = plan(from, to, "baseline", DEFAULT_OPTIONS, new AbortController().signal, () => {}, () => {}, {
    deadlineMs: 100, gapMs: 0, start: new Date("2026-09-25T10:00:00Z"),
    fetcher: async () => new Promise(() => {}),
    cyclingFetcher: async () => Response.json({ features: [{ geometry: { type: "LineString", coordinates: [[4, 30], [4.01, 30.01]] },
      properties: { "track-length": 1470, "total-time": 600 } }] }),
  });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(100);
  const result = await task;
  assert.equal(result.searchIncomplete, true);
  assert.equal(result.cyclingStatus, "ready"); assert.equal(result.cyclingComparison!.minutes, 10);
  assert.ok(searchWarnings(result).some(w => w.includes("Completed routes are kept")));
});
