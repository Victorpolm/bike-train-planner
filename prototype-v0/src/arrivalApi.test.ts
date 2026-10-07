import assert from "node:assert/strict";
import { it } from "node:test";
import { plan } from "./api.ts";
import { DEFAULT_OPTIONS } from "./model.ts";
import { OjpClient } from "./ojpClient.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { cyclingKey, zeroCycling } from "./cycling.ts";
import { swissDateParts } from "./timetableClient.ts";

const start = new Date("2026-10-05T06:00:00Z"), at = (m: number) => new Date(+start + m * 60_000);
const a = { id: "A", name: "A", label: "A", stopId: "A", lat: 47, lon: 8 };
const x = { id: "X", name: "X", label: "X", stopId: "X", lat: 47.1, lon: 8 };
const d = { id: "D", name: "D", label: "D", stopId: "D", lat: 47.2, lon: 8 };
const options = { ...DEFAULT_OPTIONS, maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0 };
const leg = (from: typeof a, to: typeof a, depart: number, arrive: number) => ({ from, to, mode: "transit", departure: at(depart).toISOString(),
  arrival: at(arrive).toISOString(), service: `${from.id}-${to.id}`, serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null });
const response = (legs: unknown[]) => Response.json({ legs, checked: start.toISOString(), warnings: [] });

it("rounds an arrival down, while departure queries round up across midnight and DST offsets", () => {
  assert.deepEqual(swissDateParts(new Date("2026-10-05T23:59:40+02:00"), true), { date: "2026-10-05", time: "23:59" });
  assert.deepEqual(swissDateParts(new Date("2026-10-05T23:59:40+02:00")), { date: "2026-10-06", time: "00:00" });
  assert.deepEqual(swissDateParts(new Date("2026-10-25T02:30:40+01:00"), true), { date: "2026-10-25", time: "02:30" });
});
it("uses the arrival flag in both timetable fallbacks and in OJP without subtracting a boarding buffer", async () => {
  for (const source of ["ojp", "search", "transport"]) {
    const signal = new AbortController().signal, bodies: any[] = [], urls: URL[] = [];
    const ojpClient = source === "ojp" ? new OjpClient(signal, async (_url, init) => { bodies.push(JSON.parse(String(init!.body))); return response([leg(a, d, 60, 100)]); }) : null;
    await plan(a, d, "baseline", options, signal, () => {}, () => {}, { start, arriveBy: at(100), cyclingClient: null, ojpClient, gapMs: 0,
      publicTimetable: source === "search", fetcher: async input => { const url = new URL(String(input)); urls.push(url); return Response.json({ connections: [], stations: [] }); } });
    if (source === "ojp") {
      assert.ok(bodies.length); assert.ok(bodies.every(b => b.arriveBy === true && b.departure === at(100).toISOString()));
    } else {
      const routes = urls.filter(u => u.pathname.endsWith(source === "search" ? "route.json" : "connections"));
      assert.ok(routes.length); assert.ok(routes.every(u => u.searchParams.get("time") === "09:40"));
      assert.ok(routes.every(u => u.searchParams.get(source === "search" ? "time_type" : "isArrivalTime") === (source === "search" ? "arrival" : "1")));
    }
  }
});
it("subtracts routed final cycling from the provider deadline and publishes only complete on-time journeys", async () => {
  const signal = new AbortController().signal, bodies: any[] = [];
  const home = { label: "Home", lat: 47.21, lon: 8 };
  const cycling = new CyclingClient(signal, async () => Response.json({ features: [] }), 0, false, null);
  cycling.routes.set(cyclingKey(d, home), { ...zeroCycling(d, home), minutes: 10, distanceKm: 1 });
  const ojpClient = new OjpClient(signal, async (_url, init) => { bodies.push(JSON.parse(String(init!.body))); return response([leg(a, d, 60, 90), leg(a, d, 70, 91)]); });
  const session = await plan(a, home, "baseline", { ...options, maxBikeMinutes: 10, maxEgressMinutes: 10 }, signal, () => {}, () => {}, {
    start, arriveBy: at(100), cyclingClient: cycling, cyclingFetcher: async () => Response.json({ features: [] }), ojpClient, gapMs: 0,
    fetcher: async () => Response.json({ stations: [{ id: d.id, name: d.name, coordinate: { x: d.lat, y: d.lon } }] }),
  });
  assert.equal(bodies[0].departure, at(90).toISOString());
  assert.equal(session.baseline.journeys.length, 1);
  assert.equal(+session.baseline.journeys[0].startTime, +at(57));
  assert.equal(+session.baseline.journeys[0].startTime + session.baseline.journeys[0].totalMinutes * 60_000, +at(100));
});
it("queries ordered stages from the destination backwards using the onward stage's feasible departure", async () => {
  const signal = new AbortController().signal, bodies: any[] = [];
  const ojpClient = new OjpClient(signal, async (_url, init) => {
    const body = JSON.parse(String(init!.body)); bodies.push(body);
    return response(body.from.id === "X" ? [leg(x, d, 70, 100)] : [leg(a, x, 30, 65)]);
  });
  const session = await plan(a, d, "baseline", options, signal, () => {}, () => {}, { start, arriveBy: at(100), waypoints: [x],
    cyclingClient: null, ojpClient, gapMs: 0, fetcher: async () => Response.json({ stations: [] }) });
  assert.deepEqual(bodies.map(b => [b.from.id, b.to.id, b.departure, b.arriveBy]), [
    ["X", "D", at(100).toISOString(), true], ["A", "X", at(67).toISOString(), true],
  ]);
  assert.ok(session.baseline.journeys.length);
  assert.equal(+session.baseline.journeys[0].startTime, +at(27));
  assert.equal(session.baseline.journeys[0].waypoints![0].place.label, "X");
});
it("keeps OJP departure and arrival requests separate in the client cache", async () => {
  const signal = new AbortController().signal, bodies: any[] = [];
  const client = new OjpClient(signal, async (_url, init) => { bodies.push(JSON.parse(String(init!.body))); return response([]); });
  for (const arrival of [false, true, false, true]) await client.connections(a, d, at(100), () => true, arrival);
  assert.equal(bodies.length, 2); assert.equal(bodies[0].arriveBy, undefined); assert.equal(bodies[1].arriveBy, true);
});
it("times the cycling-only reference backwards from arrival and marks rides outside the departure window", async () => {
  for (const earliest of [start, at(99)]) {
    const signal = new AbortController().signal;
    const session = await plan(a, d, "baseline", options, signal, () => {}, () => {}, { start: earliest, arriveBy: at(100), gapMs: 0,
      fetcher: async () => Response.json({ connections: [], stations: [] }),
      cyclingFetcher: async () => Response.json({ features: [{ geometry: { type: "LineString", coordinates: [[8, 47, 400], [8, 47.2, 400]] },
        properties: { "track-length": 22_240, "total-time": 3600 } }] }),
    });
    const comparison = session.cyclingComparison!;
    assert.ok(comparison); assert.equal(+comparison.arrival, +at(100));
    assert.equal(+comparison.departure! + comparison.minutes * 60_000, +comparison.arrival);
    assert.equal(comparison.outsideTimeWindow, +earliest === +at(99));
  }
});
