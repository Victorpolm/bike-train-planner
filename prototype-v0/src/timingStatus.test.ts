import assert from "node:assert/strict";
import { it } from "node:test";
import { timingStatus, departureTiming, arrivalTiming, failedRealtimeRefresh, type Timing } from "./realtime.ts";
import type { TransitLeg } from "./routing.ts";

const now = Date.parse("2026-11-01T10:00:00Z");
const leg: TransitLeg = { mode: "transit", from: "A", to: "B", service: "IC 1", category: "IC", operator: "SBB",
  departure: new Date(now), arrival: new Date(now + 3600000), departurePlatform: null, arrivalPlatform: null, serviceName: null, direction: null,
  realtime: { checkedAt: new Date(now).toISOString(), providerTimestampVerified: true,
    estimatedDeparture: new Date(now).toISOString(), estimatedArrival: new Date(now + 3900000).toISOString(),
    cancelled: false, departureCancelled: false, arrivalCancelled: false, undefinedDelay: false, departurePlatform: null, arrivalPlatform: null } };
it("shows independent on-time departure and delayed arrival only from fresh estimates", () => {
  assert.equal(timingStatus(departureTiming(leg, now)), "On time");
  assert.equal(timingStatus(arrivalTiming(leg, now)), "Delayed by 5 min");
  assert.equal(timingStatus(departureTiming({ ...leg, realtime: undefined }, now)), "Scheduled · Live status unavailable");
  assert.equal(timingStatus(departureTiming({ ...leg, realtime: { ...leg.realtime!, estimatedDeparture: null } }, now)), "Scheduled · Live status unavailable");
});
it("never labels stale, failed, cancelled, or indefinite estimates as on time", () => {
  assert.equal(timingStatus(departureTiming(leg, now + 121000)), "Last estimate matched schedule · Update unavailable");
  assert.equal(timingStatus(arrivalTiming(leg, now + 121000)), "Last reported delay: 5 min · Update unavailable");
  for (const realtime of [failedRealtimeRefresh(leg.realtime), { ...leg.realtime!, providerTimestampVerified: false },
    { ...leg.realtime!, cancelled: true }, { ...leg.realtime!, departureCancelled: true }, { ...leg.realtime!, undefinedDelay: true }])
    assert.doesNotMatch(timingStatus(departureTiming({ ...leg, realtime }, now)), /On time/);
});
it("does not round short delays to on time and distinguishes early departures", () => {
  for (const [seconds, expected] of [[20, "Delayed by less than 1 min"], [-20, "less than 1 min early"], [-240, "4 min early"]] as const) {
    const changed = { ...leg, realtime: { ...leg.realtime!, estimatedDeparture: new Date(now + seconds * 1000).toISOString() } };
    assert.equal(timingStatus(departureTiming(changed, now)), expected);
  }
  const incomplete: Timing = { at: new Date(now), scheduled: null, basis: "estimated", freshness: "fresh", cancelled: false, undefinedDelay: false };
  assert.equal(timingStatus(incomplete), "Live status unavailable");
});
