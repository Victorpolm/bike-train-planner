import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { candidateBands, extend, geocode, plan, selectStations, swissDateParts, TimetableClient, type SearchSession } from "./api.ts";
import { atEndpoint, DEFAULT_OPTIONS, emptyNetwork, solve } from "./model.ts";
import { KNOWN_PLACES } from "./places.ts";

const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
describe("live data boundaries", () => {
  it("rounds boarding readiness up across midnight in Swiss time", () => {
    assert.deepEqual(swissDateParts(new Date("2026-09-05T23:59:30+02:00")), { date: "2026-09-06", time: "00:00" });
    assert.deepEqual(swissDateParts(new Date("2026-01-05T08:00:00+01:00")), { date: "2026-01-05", time: "08:00" });
  });
  it("falls back from failed or empty address geocoding to actual timetable stop coordinates", async () => {
    for (const empty of [true, false]) {
      const place = await geocode("Laax, Posta", new AbortController().signal, async input => {
        if (String(input).includes("geo.admin.ch")) {
          if (empty) return response({ results: [] });
          throw new Error("Service unavailable");
        }
        return response({ stations: [{ id: "8509786", name: "Laax GR, posta", coordinate: { x: 46.806492, y: 9.258086 } }] });
      });
      assert.equal(place.label, "Laax GR, posta"); assert.equal(place.lat, 46.806492);
    }
    const abort = new AbortController(); abort.abort();
    await assert.rejects(geocode("Laax", abort.signal, async () => { throw new Error("aborted"); }));
  });
  it("includes bus stops with commas and stations beyond the initial 20-minute radius", () => {
    const point = { label: "Endpoint", lat: 47, lon: 8 };
    const candidates = selectStations([
      { id: "bus", name: "Village, Posta", kind: "bus", lat: 47, lon: 8 },
      { id: "rail", name: "Distant rail", kind: "train", lat: 47.06, lon: 8 },
    ], point, 40);
    assert.equal(candidates.length, 2);
    assert.ok(candidates[1].bikeMinutes > 20 && candidates[1].bikeMinutes <= 40);
    assert.deepEqual(candidateBands(55), [20, 40, 55]);
    assert.deepEqual(candidateBands(0), [0]);
  });
  it("serializes requests, shares cached responses and does not conflate API failures with no connections", async () => {
    let active = 0, peak = 0, calls = 0;
    const client = new TimetableClient(new AbortController().signal, 0, async () => {
      calls++; active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 2)); active--;
      return response({ connections: [] });
    });
    const params = new URLSearchParams({ from: "a" });
    const values = await Promise.all([client.get("connections", params), client.get("connections", params), client.get("locations", params)]);
    assert.equal(peak, 1); assert.equal(calls, 2); assert.equal(client.failures, 0);
    assert.deepEqual(values[0], { connections: [] });
    const failing = new TimetableClient(new AbortController().signal, 0, async () => response({}, 503));
    assert.equal(await failing.get("connections", params), null);
    assert.equal(failing.failures, 1); assert.ok(failing.warnings.size > 0);
  });
  it("stops after rate limiting and explicitly reports a request cap", async () => {
    const limited = new TimetableClient(new AbortController().signal, 0, async () => response({}, 429));
    await limited.get("connections", new URLSearchParams({ from: "a" }));
    await limited.get("connections", new URLSearchParams({ from: "b" }));
    assert.equal(limited.requests, 1); assert.ok([...limited.warnings].some(w => w.includes("busy")));
    const capped = new TimetableClient(new AbortController().signal, 0, async () => response({}), 1);
    await capped.get("locations", new URLSearchParams({ x: "1" }));
    await capped.get("locations", new URLSearchParams({ x: "2" }));
    assert.equal(capped.requests, 1); assert.ok([...capped.warnings].some(w => w.includes("limit")));
  });
  it("bounds elapsed search time and can start a later Extended phase without resetting the request budget", async () => {
    let now = Date.now();
    const clock = mock.method(Date, "now", () => now);
    try {
      const client = new TimetableClient(new AbortController().signal, 0, async () => response({ connections: [] }));
      now += 90_001;
      assert.equal(await client.get("connections", new URLSearchParams({ from: "a" })), null);
      assert.equal(client.requests, 0);
      assert.ok([...client.warnings].some(w => w.includes("time limit")));
      client.beginPhase();
      assert.deepEqual(await client.get("connections", new URLSearchParams({ from: "b" })), { connections: [] });
      assert.equal(client.requests, 1);
    } finally { clock.mock.restore(); }
  });
  it("cancels queued requests before sending them", async () => {
    const abort = new AbortController(); let calls = 0;
    const client = new TimetableClient(abort.signal, 0, async () => { calls++; return response({}); });
    abort.abort(); await assert.rejects(client.get("locations", new URLSearchParams()));
    assert.equal(calls, 0);
  });
  it("accepts a 13-second timetable response that the old 8-second timeout discarded", async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const client = new TimetableClient(new AbortController().signal, 0, (_input, init) => new Promise((resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
      setTimeout(() => resolve(response({ connections: [] })), 13_000);
    }));
    const task = client.get("connections", new URLSearchParams({ from: "a" }));
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(13_000);
    assert.deepEqual(await task, { connections: [] });
    assert.equal(client.failures, 0);
  });
  it("uses stop identity for zero cycling despite coordinate differences between providers", () => {
    const point = KNOWN_PLACES.find(p => p.stopId === "8503000")!;
    assert.equal(atEndpoint({ id: point.stopId!, name: point.label, lat: 47.377847, lon: 8.540502 }, point).bikeMinutes, 0);
  });
  it("publishes the first route before a stalled alternative, skips selected-place lookups, and preserves that snapshot after cancel", async () => {
    const origin = KNOWN_PLACES.find(p => p.stopId === "8503000")!, destination = KNOWN_PLACES.find(p => p.stopId === "8507000")!;
    const start = new Date("2026-09-05T08:00:00+02:00"), time = (m: number) => new Date(start.getTime() + m * 60000).toISOString();
    const stop = (p: typeof origin) => ({ id: p.stopId!, name: p.label, coordinate: { x: p.lat, y: p.lon } });
    const abort = new AbortController(), urls: URL[] = [], updates: SearchSession[] = [];
    let stalled!: () => void;
    const pending = new Promise<void>(resolve => { stalled = resolve; });
    const task = plan(origin, destination, "baseline", DEFAULT_OPTIONS, abort.signal, () => {}, s => updates.push(s), { cyclingClient: null,
      start, gapMs: 0, fetcher: async (input, init) => {
        urls.push(new URL(String(input)));
        if (urls.length === 1) return response({ connections: [{ sections: [{ journey: { name: "IC1", category: "IC", number: "1" },
          departure: { station: stop(origin), departure: time(10) }, arrival: { station: stop(destination), arrival: time(70) } }] }] });
        stalled();
        return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true }));
      },
    });
    const rejected = assert.rejects(task, { name: "AbortError" });
    await pending;
    assert.equal(updates[0].baseline.journeys.length, 0);
    assert.equal(updates[0].origin, origin);
    assert.equal(updates[0].start, start);
    const published = updates.find(s => s.baseline.journeys.length > 0)!;
    assert.ok(published);
    assert.equal(published.baseline.journeys[0].totalMinutes, 70);
    assert.ok(urls.every(u => u.pathname.endsWith("connections")));
    const ids = published.baseline.journeys.map(j => j.id);
    abort.abort(); await rejected;
    assert.deepEqual(published.baseline.journeys.map(j => j.id), ids);
  });
  it("publishes resolved endpoints before the first request and keeps the cycling comparison available after failures", async () => {
    const origin = KNOWN_PLACES.find(p => p.stopId === "8503000")!, destination = KNOWN_PLACES.find(p => p.stopId === "8509786")!;
    const updates: SearchSession[] = [];
    const result = await plan(origin, destination, "baseline", DEFAULT_OPTIONS, new AbortController().signal, () => {}, s => updates.push(s), { cyclingClient: null,
      gapMs: 0, fetcher: async () => {
        assert.ok(updates.length > 0);
        assert.equal(updates[0].origin, origin);
        assert.equal(updates[0].destination, destination);
        return response({}, 503);
      },
    });
    assert.ok(result.client.failures > 0);
    assert.equal(result.baseline.journeys.length, 0);
    assert.equal(result.origin, origin);
    assert.equal(result.destination, destination);
  });
  it("seeds Extended from a departure board even with no Baseline solution", async () => {
    const start = new Date("2026-09-05T08:00:00+02:00"), time = (m: number) => new Date(start.getTime() + m * 60000).toISOString();
    const a = { id: "a", name: "A", lat: 47, lon: 8 }, b = { id: "b", name: "B", lat: 47.5, lon: 8 };
    const c = { id: "c", name: "C", lat: 47.5, lon: 8.03 }, d = { id: "d", name: "D", lat: 48, lon: 9 };
    const stop = (s: typeof a, arrive: number | null, depart: number | null) => ({ station: { id: s.id, name: s.name, coordinate: { x: s.lat, y: s.lon } },
      arrival: arrive === null ? null : time(arrive), departure: depart === null ? null : time(depart) });
    const urls: URL[] = [];
    const client = new TimetableClient(new AbortController().signal, 0, async input => {
      const url = new URL(String(input)); urls.push(url);
      if (url.pathname.endsWith("stationboard")) return response({ stationboard: [{ name: "first", category: "IC", number: "1",
        stop: stop(a, null, 5), passList: [stop(a, null, 5), stop(b, 20, null)] }] });
      if (url.pathname.endsWith("locations")) return response({ stations: [{ id: c.id, name: c.name, icon: "bus", coordinate: { x: c.lat, y: c.lon } }] });
      if (url.searchParams.get("from") === c.id) return response({ connections: [{ sections: [{ journey: { name: "second", category: "B", number: "2", operator: "PAG" },
        departure: stop(c, null, 34), arrival: stop(d, 50, null) }] }] });
      return response({ connections: [] });
    });
    const network = emptyNetwork(); [a, d].forEach(s => network.stops.set(s.id, s));
    const origin = { ...a, label: "A" }, destination = { ...d, label: "D" };
    const options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0 };
    const session: SearchSession = { origin, destination, network, client, start, options,
      originStations: [{ ...a, distanceKm: 0, bikeMinutes: 0 }], destinationStations: [{ ...d, distanceKm: 0, bikeMinutes: 0 }],
      baseline: solve(network, origin, destination, start, options, "baseline"), extended: null };
    assert.equal(session.baseline.journeys.length, 0);
    const result = await extend(session, () => {});
    assert.equal(result.baseline.journeys.length, 0);
    assert.equal(Math.min(...result.extended!.journeys.map(j => j.totalMinutes)), 50);
    assert.ok(urls.every(u => !u.searchParams.has("transportations[]")));
    const count = client.requests;
    await extend(result, () => {});
    assert.equal(client.requests, count);
  });
});
