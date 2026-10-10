import assert from "node:assert/strict";
import { it } from "node:test";
import { bindSearchTiming, SearchTiming } from "./searchTiming.ts";
import { fetchJson, waitFor } from "./http.ts";
import { TimetableClient } from "./timetableClient.ts";

it("records overlapping stages separately and freezes totals and first-result milestones", () => {
  let now = 100; const timing = new SearchTiming(() => now);
  const a = timing.begin("cycling"); now = 120; const b = timing.begin("network");
  now = 150; timing.result(false, true); a(); now = 160; timing.result(true, false); b();
  timing.refresh(false); timing.refresh(true); timing.solve(3);
  const snapshot = timing.report(); now = 180; timing.result(true, true);
  const active = timing.begin("queue"); now = 200; const final = timing.finish("cancelled");
  now = 500; active(); a(); timing.solve(); timing.refresh(true); timing.result(true, true); timing.begin("solving")();
  assert.deepEqual(timing.report(), final); assert.equal(final.elapsedMs, 100);
  assert.equal(final.firstResultMs, 50); assert.equal(final.firstTransitMs, 60);
  assert.deepEqual(final.stages, { cycling: { calls: 1, milliseconds: 50 }, network: { calls: 1, milliseconds: 40 }, queue: { calls: 1, milliseconds: 20 } });
  assert.equal(final.solverCalls, 3); assert.equal(final.reusedRefreshes, 1);
  assert.equal(snapshot.stages.queue, undefined);
  final.stages.network!.milliseconds = 999; assert.equal(timing.report().stages.network!.milliseconds, 40);
});
it("closes synchronous and asynchronous failed stages without changing their errors", async () => {
  let now = 0; const timing = new SearchTiming(() => now), error = new Error("original");
  assert.throws(() => timing.sync("solving", () => { now = 3; throw error; }), e => e === error);
  await assert.rejects(timing.measure("places", async () => { now = 8; throw error; }), e => e === error);
  assert.deepEqual(timing.finish("failed").stages, { solving: { calls: 1, milliseconds: 3 }, places: { calls: 1, milliseconds: 5 } });
});
it("measures reading the HTTP body as well as receiving headers without retaining request data", async () => {
  let now = 0; const timing = new SearchTiming(() => now), abort = new AbortController(); bindSearchTiming(abort.signal, timing);
  const data = await fetchJson("https://example.org/private?lat=47.123", abort.signal, 1000, async () => {
    now = 5; const response = Response.json({ ok: true }); response.json = async () => { now = 14; return { ok: true }; }; return response;
  });
  assert.deepEqual(data, { ok: true }); const result = timing.finish("complete");
  assert.deepEqual(result.stages.network, { calls: 1, milliseconds: 14 });
  assert.doesNotMatch(JSON.stringify(result), /47\.123|private|example|latitude/);
});
it("counts local queue waiting separately, sharing duplicate HTTP work", async () => {
  let now = 0, release!: () => void, started!: () => void;
  const timing = new SearchTiming(() => now), signal = new AbortController().signal;
  bindSearchTiming(signal, timing);
  const began = new Promise<void>(resolve => { started = resolve; }), blocked = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const client = new TimetableClient(signal, 0, async () => { if (++calls === 1) { started(); await blocked; } now += 4; return Response.json({ stations: [] }); });
  const params = new URLSearchParams({ x: "1" });
  const first = client.get("locations", params); await began;
  const next = client.get("locations", new URLSearchParams({ x: "2" })), shared = client.get("locations", params);
  now = 10; release(); await Promise.all([first, next, shared]);
  const report = timing.finish("complete"); assert.equal(calls, 2); assert.equal(report.stages.network!.calls, 2);
  assert.equal(report.stages.queue!.calls, 2); assert.ok(report.stages.queue!.milliseconds >= 14);
});
it("closes measured pacing waits on cancellation", async () => {
  let now = 0; const timing = new SearchTiming(() => now), abort = new AbortController(); bindSearchTiming(abort.signal, timing);
  const task = waitFor(1000, abort.signal); const rejected = assert.rejects(task, { name: "AbortError" });
  now = 11; abort.abort(); await rejected;
  assert.deepEqual(timing.finish("cancelled").stages.pacing, { calls: 1, milliseconds: 11 });
});
