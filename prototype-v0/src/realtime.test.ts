import assert from "node:assert/strict";
import { it } from "node:test";
import { parseOjpDetails, ojpTripInfoRequest, ojpTripRequest, type OjpReference } from "./ojp.ts";
import { arrivalTime, departureTime, effectivePlatform, realtimeKey, realtimeStale, type TransitRealtime } from "./realtime.ts";
import { realtimeJourney } from "./realtimeJourney.ts";
import { DEFAULT_OPTIONS, emptyNetwork, solve } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { boardingCheck } from "./transferTimes.ts";
import { createOjpHandler } from "../server/ojpHandler.ts";
import type { TransitLeg } from "./routing.ts";
const stamp = "2026-10-09T08:00:00.000Z", time = (m: number) => new Date(Date.parse(stamp) + m * 60_000);
const ref: OjpReference = { journeyRef: "dated", operatingDay: "2026-10-09", fromRef: "A", toRef: "B", departure: time(10).toISOString(), arrival: time(30).toISOString(), fromOrder: 1, toOrder: 2, bikeFiltered: false, attributes: [] };
const xml = (options = "", departure = time(15).toISOString(), arrival = time(35).toISOString(), call = "") => `<OJP><OJPResponse><ServiceDelivery><OJPTripInfoDelivery><ResponseTimestamp>${stamp}</ResponseTimestamp><TripInfoResult><Service><JourneyRef>dated</JourneyRef><OperatingDayRef>2026-10-09</OperatingDayRef>${options}</Service><OnwardCall><Order>1</Order><StopPointRef>A</StopPointRef><PlannedQuay><Text>1</Text></PlannedQuay><EstimatedQuay><Text>4</Text></EstimatedQuay><ServiceDeparture><TimetabledTime>${ref.departure}</TimetabledTime>${departure ? `<EstimatedTime>${departure}</EstimatedTime>` : ""}</ServiceDeparture>${call}</OnwardCall><OnwardCall><Order>2</Order><StopPointRef>B</StopPointRef><ServiceArrival><TimetabledTime>${ref.arrival}</TimetabledTime>${arrival ? `<EstimatedTime>${arrival}</EstimatedTime>` : ""}</ServiceArrival></OnwardCall></TripInfoResult></OJPTripInfoDelivery></ServiceDelivery></OJPResponse></OJP>`;
const update = (minutes = 0): TransitRealtime => ({ checkedAt: stamp, estimatedDeparture: time(10 + minutes).toISOString(), estimatedArrival: time(30 + minutes).toISOString(), departurePlatform: null, arrivalPlatform: null, cancelled: false, departureCancelled: false, arrivalCancelled: false, undefinedDelay: false });
function fixture() {
  const network = emptyNetwork();
  ["A", "B", "C"].forEach((id, i) => network.stops.set(id, { id, name: id, lat: 47, lon: 8 + i * .1 }));
  const ride = (id: string, from: string, to: string, departure: number, arrival: number): TransitLeg => ({ mode: "transit", from, to, fromId: from, toId: to, departure: time(departure), arrival: time(arrival), departurePlatform: "1", arrivalPlatform: "2", service: id, serviceName: null, category: "IR", operator: "SBB", direction: null,
    ojp: { ...ref, journeyRef: id, fromRef: from, toRef: to, departure: time(departure).toISOString(), arrival: time(arrival).toISOString() } });
  for (const leg of [ride("first", "A", "B", 10, 30), ride("second", "B", "C", 34, 50)]) network.edges.set(leg.service, { id: leg.service, from: leg.fromId!, to: leg.toId!, leg });
  const origin = { label: "A", lat: 47, lon: 8, stopId: "A" }, destination = { label: "C", lat: 47, lon: 8.2, stopId: "C" };
  const options = { ...DEFAULT_OPTIONS, maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0, boardingMinutes: 3 };
  return { network, origin, destination, options };
}
it("requests explanatory realtime and retains scheduled exact-segment identity", () => {
  const d = parseOjpDetails(xml(), ref); assert.equal(d.realtime!.estimatedDeparture, time(15).toISOString()); assert.equal(d.realtime!.departurePlatform, "4");
  assert.equal(ref.departure, time(10).toISOString());
  assert.match(ojpTripInfoRequest(ref, stamp), /<UseRealtimeData>explanatory/);
  const p = { id: "A", name: "A", lat: 47, lon: 8 };
  assert.match(ojpTripRequest({ from: p, to: p, departure: stamp }, false, stamp), /<UseRealtimeData>explanatory/);
  assert.throws(() => parseOjpDetails(xml(), { ...ref, operatingDay: "2026-10-10" }), /mismatch/);
  assert.throws(() => parseOjpDetails(xml(), { ...ref, departure: time(11).toISOString() }), /segment/);
});
it("distinguishes cancellation, skipped boarding, unknown delay and absent estimates from on-time", () => {
  assert.equal(parseOjpDetails(xml("<Cancelled>true</Cancelled><UndefinedDelay>true</UndefinedDelay>"), ref).realtime!.cancelled, true);
  const skipped = parseOjpDetails(xml("", "", "", "<NotServicedStop>true</NotServicedStop>"), ref).realtime!;
  assert.equal(skipped.departureCancelled, true); assert.equal(skipped.estimatedDeparture, null); assert.equal(skipped.estimatedArrival, null);
  assert.equal(parseOjpDetails(xml("", "malformed", time(9).toISOString()), ref).realtime!.estimatedArrival, null);
  assert.equal(realtimeStale(update(), +time(3)), true); assert.equal(realtimeStale(update(), +time(1)), false);
});
it("uses late and early estimates in both solvers and excludes cancelled services in every scope", () => {
  const f = fixture(), first = f.network.edges.get("first")!.leg;
  assert.ok(solve(f.network, f.origin, f.destination, time(0), f.options, "baseline").journeys.length);
  first.realtime = update(5);
  for (const bicycleScope of ["confirmed", "allow-uncertain", "all-transit"] as const) {
    const options = { ...f.options, bicycleScope };
    assert.equal(solve(f.network, f.origin, f.destination, time(0), options, "baseline").journeys.length, 0);
    assert.equal(solveWaypoints(f.network, [f.origin, f.destination], time(0), options, "baseline").journeys.length, 0);
  }
  first.realtime = { ...update(), cancelled: true };
  assert.equal(solve(f.network, f.origin, f.destination, time(0), { ...f.options, bicycleScope: "all-transit" }, "baseline").journeys.length, 0);
  first.realtime = update(-5);
  assert.equal(+departureTime(first)!, +time(5)); assert.equal(+arrivalTime(first)!, +time(25));
});
it("keeps a disrupted selected journey and fare identities visible with a missed-connection warning", () => {
  const f = fixture(), raw = solve(f.network, f.origin, f.destination, time(0), f.options, "baseline").journeys[0];
  const original = raw.transitLegs[0]; original.fareSources = [];
  const result = realtimeJourney(raw, new Map([[realtimeKey(original), update(5)]]));
  assert.equal(result.journey.id, raw.id); assert.equal(result.journey.transitLegs[0].departure, original.departure);
  assert.equal(result.journey.transitLegs[0].fareSources, original.fareSources); assert.equal(original.realtime, undefined);
  assert.ok(result.issues.some(s => /connection.*no longer feasible/.test(s)));
});
it("uses current platform evidence and never reuses an exact planned-platform allowance after a change", () => {
  const f = fixture(), a = f.network.edges.get("first")!.leg, b = f.network.edges.get("second")!.leg;
  b.transferRules = [{ incomingJourneyRef: a.ojp!.journeyRef, incomingOperatingDay: ref.operatingDay, operatingDay: ref.operatingDay, fromRef: "B", toRef: "B", arrival: a.ojp!.arrival, departure: b.ojp!.departure, seconds: 600, kind: "walk" }];
  assert.equal(boardingCheck([a], b, +time(30), 3).source, "ojp");
  b.realtime = { ...update(), estimatedDeparture: null, estimatedArrival: null, departurePlatform: "8" };
  assert.equal(effectivePlatform(b, "departure"), "8"); assert.notEqual(boardingCheck([a], b, +time(30), 3).source, "ojp");
});
it("coalesces concurrent realtime checks and refreshes after the short cache lifetime", async t => {
  let calls = 0; t.mock.timers.enable({ apis: ["Date"], now: +time(0) });
  const handle = createOjpHandler(async () => { calls++; return new Response(xml()); }, 0);
  const request = () => new Request("https://app.example/api/ojp/tripinfo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ref) });
  const results = await Promise.all([handle(request(), { OJP_API_KEY: "test" }), handle(request(), { OJP_API_KEY: "test" })]);
  assert.equal(calls, 1); assert.equal((await results[0].json() as { realtime: TransitRealtime }).realtime.departurePlatform, "4");
  t.mock.timers.tick(16_000); await handle(request(), { OJP_API_KEY: "test" }); assert.equal(calls, 2);
});
