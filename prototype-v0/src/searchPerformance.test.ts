import assert from "node:assert/strict";
import { it } from "node:test";
import { plan, type SearchSession } from "./api.ts";
import { DEFAULT_OPTIONS, emptyNetwork, solve } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { KNOWN_PLACES } from "./places.ts";
import type { TransitLeg } from "./routing.ts";
import type { SearchTimingReport } from "./searchTiming.ts";

const origin = KNOWN_PLACES.find(p => p.stopId === "8503000")!, destination = KNOWN_PLACES.find(p => p.stopId === "8507000")!;
const start = new Date("2026-10-10T06:00:00Z"), time = (m: number) => new Date(+start + m * 60000);
const options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0, maxBikeMinutes: 0, maxIntermediateMinutes: 0 };
const reply = { connections: [{ sections: [{ journey: { name: "IC1", category: "IC", number: "1" },
  departure: { station: { id: origin.stopId, name: origin.label, coordinate: { x: origin.lat, y: origin.lon } }, departure: time(10).toISOString() },
  arrival: { station: { id: destination.stopId, name: destination.label, coordinate: { x: destination.lat, y: destination.lon } }, arrival: time(70).toISOString() } }] }] };
const content = (s: SearchSession) => ({ baseline: s.baseline, extended: s.extended, confirmed: s.confirmed, allTransit: s.allTransit });
async function run(reuseRouting: boolean, mutate?: (s: SearchSession) => void) {
  let now = 0, calls = 0; const reports: SearchTimingReport[] = [], updates: ReturnType<typeof content>[] = [];
  const result = await plan(origin, destination, "baseline", options, new AbortController().signal, () => {}, s => {
    updates.push(structuredClone(content(s))); mutate?.(s);
  }, { start, gapMs: 0, cyclingClient: null, reuseRouting, timingClock: () => ++now,
    onTiming: report => reports.push(report), fetcher: async () => { calls++; return Response.json(calls === 1 ? reply : { connections: [], stations: [] }); } });
  return { result, reports, updates, calls };
}
it("reuses unchanged refreshes with identical full results, publications and provider requests", async () => {
  const off = await run(false), on = await run(true);
  assert.deepEqual(content(on.result), content(off.result)); assert.deepEqual(on.updates, off.updates); assert.equal(on.calls, off.calls);
  const a = on.result.timing!, b = off.result.timing!;
  assert.ok(a.reusedRefreshes >= 2); assert.equal(b.reusedRefreshes, 0); assert.ok(a.solverCalls < b.solverCalls);
  assert.equal(a.status, "complete"); assert.ok(a.firstResultMs! <= a.elapsedMs); assert.equal(a.firstResultMs, a.firstTransitMs);
  assert.equal(a.stages.network!.calls, on.calls); assert.ok(a.stages.timetable); assert.ok(a.stages.solving); assert.ok(a.stages.reuse);
  assert.deepEqual(on.reports.at(-1), a); assert.equal(on.reports[0].firstResultMs, null);
});
it("invalidates reused results after an in-place realtime cancellation", async () => {
  const mutation = () => { let changed = false; return (s: SearchSession) => {
    if (changed || !s.baseline.journeys.length) return; changed = true;
    for (const edge of s.network.edges.values()) edge.leg.realtime = { checkedAt: start.toISOString(), estimatedArrival: null,
      estimatedDeparture: null, departurePlatform: null, arrivalPlatform: null, cancelled: true, departureCancelled: false, arrivalCancelled: false, undefinedDelay: false };
  }; };
  const a = await run(true, mutation()), b = await run(false, mutation());
  assert.equal(a.result.baseline.journeys.length, 0); assert.deepEqual(content(a.result), content(b.result));
});
it("isolates cached solution containers from filters applied to published results", async () => {
  const filter = () => { let filtered = false; return (s: SearchSession) => {
    if (filtered || !s.baseline.journeys.length) return; filtered = true;
    s.baseline.journeys.splice(0); s.baseline.reachable.splice(0);
    if (s.confirmed) s.confirmed.baseline.journeys = [];
    if (s.allTransit) s.allTransit.baseline.journeys = [];
  }; };
  const a = await run(true, filter()), b = await run(false, filter());
  assert.ok(a.result.baseline.journeys.length); assert.deepEqual(content(a.result), content(b.result));
});
it("reports cancellation and closes timing even when places have not resolved", async () => {
  const abort = new AbortController(), reports: SearchTimingReport[] = [];
  abort.abort(); await assert.rejects(plan("unknown origin", "unknown destination", "baseline", options, abort.signal, () => {}, () => {}, { onTiming: r => reports.push(r) }), { name: "AbortError" });
  assert.equal(reports.at(-1)?.status, "cancelled"); assert.equal(reports.at(-1)?.firstResultMs, null);
});
it("records a failed action without requiring a published session", async () => {
  const reports: SearchTimingReport[] = [];
  await assert.rejects(plan(origin, destination, "baseline", { ...options, maxBoardings: 0 }, new AbortController().signal, () => {}, () => {}, { onTiming: r => reports.push(r) }));
  assert.equal(reports.at(-1)?.status, "failed"); assert.equal(reports.at(-1)?.firstTransitMs, null);
});
it("records deadline termination and preserves the last completed results", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const reports: SearchTimingReport[] = []; let waiting!: () => void; const blocked = new Promise<void>(r => { waiting = r; });
  const pending = plan(origin, destination, "baseline", options, new AbortController().signal, () => {}, () => {}, { start, gapMs: 0, cyclingClient: null, deadlineMs: 100,
    onTiming: r => reports.push(r), fetcher: async (_url, init) => { waiting(); return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason))); } });
  await blocked; t.mock.timers.tick(101); const result = await pending;
  assert.equal(result.searchIncomplete, true); assert.equal(result.timing!.status, "limited"); assert.equal(reports.at(-1)?.status, "limited");
});
function networkFixture() {
  const network = emptyNetwork();
  for (const p of [origin, destination]) network.stops.set(p.stopId!, { id: p.stopId!, name: p.label, lat: p.lat, lon: p.lon });
  const leg = (id: string, departure: number, arrival: number): TransitLeg => ({ mode: "transit", from: origin.label, to: destination.label,
    fromId: origin.stopId, toId: destination.stopId, fromPoint: origin, toPoint: destination, departure: time(departure), arrival: time(arrival),
    service: id, serviceName: id, direction: null, departurePlatform: null, arrivalPlatform: null,
    ojp: { journeyRef: id, operatingDay: "2026-10-10", fromRef: origin.stopId!, toRef: destination.stopId!, departure: time(departure).toISOString(), arrival: time(arrival).toISOString() } });
  const add = (l: TransitLeg) => network.edges.set(l.service, { id: l.service, from: origin.stopId!, to: destination.stopId!, leg: l });
  return { network, leg, add };
}
it("rejects departed and out-of-window vehicles before reading their station-access rules in both solvers", () => {
  for (const mode of ["baseline", "extended"] as const) for (const waypoint of [false, true]) {
    const f = networkFixture(); let validReads = 0;
    for (const l of [f.leg("departed", -1, 10), f.leg("too late", 10, 61)]) {
      Object.defineProperty(l, "accessRules", { get() { throw new Error("An impossible service reached boarding checks"); } }); f.add(l);
    }
    const valid = f.leg("valid", 3, 30); Object.defineProperty(valid, "accessRules", { get() { validReads++; return []; } }); f.add(valid);
    const o = { ...options, horizonMinutes: 60 };
    const result = waypoint ? solveWaypoints(f.network, [origin, destination], start, o, mode) : solve(f.network, origin, destination, start, o, mode);
    assert.ok(result.journeys.length); assert.ok(validReads > 0);
  }
});
it("uses realtime estimates and retains the exact boarding/arrival boundary", () => {
  for (const mode of ["baseline", "extended"] as const) for (const waypoint of [false, true]) {
    const f = networkFixture(), delayed = f.leg("delayed", -10, 20);
    delayed.realtime = { checkedAt: start.toISOString(), estimatedDeparture: time(3).toISOString(), estimatedArrival: time(60).toISOString(),
      departurePlatform: null, arrivalPlatform: null, cancelled: false, departureCancelled: false, arrivalCancelled: false, undefinedDelay: false }; f.add(delayed);
    const o = { ...options, horizonMinutes: 60 };
    const solveIt = () => waypoint ? solveWaypoints(f.network, [origin, destination], start, o, mode) : solve(f.network, origin, destination, start, o, mode);
    assert.ok(solveIt().journeys.length); delayed.realtime.estimatedDeparture = time(2).toISOString(); assert.equal(solveIt().journeys.length, 0);
  }
});
