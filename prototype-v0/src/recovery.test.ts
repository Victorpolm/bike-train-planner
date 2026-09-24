import assert from "node:assert/strict";
import { it, mock } from "node:test";
import { plan, searchWarnings, TimetableClient } from "./api.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { cyclingKey } from "./cycling.ts";
import { DEFAULT_OPTIONS, categorize, metrics, type Stop } from "./model.ts";
import { haversineKm, type Place, type Point } from "./routing.ts";

const response = (data: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(data), { status, headers });
const start = new Date("2026-09-25T08:00:00+02:00");
const time = (m: number) => new Date(+start + m * 60_000).toISOString();
const station = (s: Stop) => ({ id: s.id, name: s.name, icon: s.kind, coordinate: { x: s.lat, y: s.lon } });
const geometry = (a: Point, b: Point, minutes = 10) => ({ features: [{ geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
  properties: { "track-length": haversineKm(a, b) * 1000, "total-time": minutes * 60 } }] });
const endpoints = (input: RequestInfo | URL) => new URL(String(input)).searchParams.get("lonlats")!.split("|")
  .map(s => { const [lon, lat] = s.split(",").map(Number); return { lon, lat }; });

it("checks the one-train exit before nearer bus stops consume the cycling budget", async () => {
  // Relocated geometry exercises the reported HB–IR35–Baden–bus pattern without
  // publishing a traveller's home address or coordinates.
  const from: Place = { label: "Origin", lat: 30, lon: 4 }, to: Place = { label: "Bath", lat: 31, lon: 5 };
  const hb: Stop = { id: "HB", name: "Rail origin", kind: "train", lat: 30.005, lon: 4 };
  const baden: Stop = { id: "Baden", name: "Rail exit", kind: "train", lat: 31, lon: 5.012 };
  const buses = [1, 2, 3, 4, 5].map(i => ({ id: `bus${i}`, name: `Bus stop ${i}`, kind: "bus", lat: 31, lon: 5 + i * .001 }));
  let now = +start, calls = 0;
  const clock = mock.method(Date, "now", () => now);
  try {
    const result = await plan(from, to, "baseline", DEFAULT_OPTIONS, new AbortController().signal, () => {}, () => {}, {
      start, gapMs: 0,
      cyclingFetcher: async input => {
        const [a, b] = endpoints(input);
        if (a.lat === from.lat && b.lat === to.lat) return response(geometry(a, b, 600));
        now += 50_000;
        return response(geometry(a, b, a.lon === baden.lon ? 5 : 3));
      },
      fetcher: async input => {
        const url = new URL(String(input));
        if (url.pathname.endsWith("locations")) return response({ stations: (Number(url.searchParams.get("x")) < 31 ? [hb] : [...buses, baden]).map(station) });
        calls++;
        return response({ connections: [{ sections: [
          { journey: { category: "IR", number: "35" }, departure: { station: station(hb), departure: time(10) }, arrival: { station: station(baden), arrival: time(40) } },
          { journey: { category: "B", number: "5", passList: buses.slice(1).map((s, i) => ({ station: station(s), arrival: time(50 + i), departure: time(51 + i) })) },
            departure: { station: station(baden), departure: time(45) }, arrival: { station: station(buses[0]), arrival: time(60) } },
        ] }] });
      },
    });
    const fewest = categorize(result.baseline.journeys, DEFAULT_OPTIONS).find(p => p.categories.includes("Fewest boardings"))!.journey;
    assert.equal(metrics(fewest).boardings, 1);
    assert.equal(fewest.destinationStation.id, baden.id);
    assert.equal(fewest.totalMinutes, 45);
    assert.ok(result.network.cycling!.get(cyclingKey(baden, to)));
    assert.ok(calls > 0);
  } finally { clock.mock.restore(); }
});

it("returns a successful short cycling-only journey when every station-access check fails", async () => {
  const from: Place = { label: "Map point A", lat: 30, lon: 4 }, to: Place = { label: "Map point B", lat: 30.01, lon: 4.01 };
  const stop: Stop = { id: "near", name: "Nearby stop", lat: 30.005, lon: 4.005, kind: "bus" };
  const result = await plan(from, to, "baseline", DEFAULT_OPTIONS, new AbortController().signal, () => {}, () => {}, {
    start, gapMs: 0,
    fetcher: async () => response({ stations: [station(stop)] }),
    cyclingFetcher: async input => {
      const [a, b] = endpoints(input);
      return a.lat === from.lat && b.lat === to.lat ? response(geometry(a, b, 10)) : response({}, 503);
    },
  });
  assert.equal(result.cyclingStatus, "ready");
  assert.equal(result.cyclingComparison!.minutes, 10);
  assert.equal(result.baseline.journeys.length, 0);
  assert.ok(searchWarnings(result).some(w => w.includes("station-access checks")));
});

it("recovers a transient timetable busy response without disabling later station pairs", async () => {
  let calls = 0;
  const client = new TimetableClient(new AbortController().signal, 0, async () => ++calls === 1
    ? response({}, 429, { "Retry-After": "0" }) : response({ connections: [{ id: "Baden–Zürich" }] }));
  assert.deepEqual(await client.get("connections", new URLSearchParams({ from: "Baden", to: "Zürich" })), { connections: [{ id: "Baden–Zürich" }] });
  assert.ok(await client.get("connections", new URLSearchParams({ from: "Wettingen", to: "Zürich" })));
  assert.equal(calls, 3); assert.equal(client.failures, 0); assert.equal(client.warnings.size, 0);
});

it("honours a long Retry-After without immediate retries or a false empty timetable", async () => {
  let calls = 0;
  const client = new TimetableClient(new AbortController().signal, 0, async () => { calls++; return response({}, 429, { "Retry-After": "120" }); });
  assert.equal(await client.get("connections", new URLSearchParams({ from: "a" })), null);
  assert.equal(await client.get("connections", new URLSearchParams({ from: "b" })), null);
  assert.equal(calls, 1); assert.ok([...client.warnings].some(w => w.includes("busy")));
});

it("rechecks a transiently failed cycling link and clears its stale warning after recovery", async () => {
  const a = { lat: 30, lon: 4 }, b = { lat: 30.01, lon: 4.01 };
  let calls = 0;
  const client = new CyclingClient(new AbortController().signal, async () => ++calls <= 2 ? response({}, 503) : response(geometry(a, b)), 0, false);
  assert.equal(await client.route(a, b), null);
  assert.equal(client.routes.has(cyclingKey(a, b)), false);
  assert.ok(await client.route(a, b));
  assert.equal(calls, 3); assert.equal(client.warnings.size, 0); assert.equal(client.failedLinks.size, 0);
});

it("keeps the cycling budget available while waiting for timetable data", async () => {
  const a = { lat: 30, lon: 4 }, b = { lat: 30.01, lon: 4.01 };
  let now = +start;
  const clock = mock.method(Date, "now", () => now);
  try {
    const client = new CyclingClient(new AbortController().signal, async () => response(geometry(a, b)), 0, false);
    now += 160_000;
    assert.ok(await client.route(a, b));
  } finally { clock.mock.restore(); }
});

it("uses a checked bicycle road route after a cycling-service outage, leaving missing details unknown", async () => {
  const { parseFallbackRoute } = await import("./cyclingFallback.ts");
  const a = { lat: 30, lon: 4 }, b = { lat: 30.01, lon: 4.01 };
  const data = { code: "Ok", routes: [{ distance: haversineKm(a, b) * 1000, duration: 600,
    geometry: { type: "LineString", coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }, legs: [{ steps: [{ mode: "cycling" }] }] }] };
  const client = new CyclingClient(new AbortController().signal, async () => { throw new TypeError("Failed to fetch"); }, 0, false,
    async input => { assert.ok(String(input).startsWith("https://routing.openstreetmap.de/routed-bike/")); return response(data); });
  const route = await client.route(a, b);
  assert.equal(route!.source, "OSRM"); assert.equal(route!.minutes, 10);
  assert.equal(route!.ascentM, null); assert.equal(route!.elevationCoverage, 0);
  assert.ok(route!.sections.every(s => s.surface === "Unknown" && s.infrastructure === "Unknown"));
  assert.equal(client.requests, 2); assert.equal(client.failedLinks.size, 0);
  for (const mode of ["ferry", "train", "pushing bike", undefined]) {
    const mixed = structuredClone(data);
    mixed.routes[0].legs[0].steps.push({ mode: mode as string });
    assert.throws(() => parseFallbackRoute(mixed, a, b), /bicycle-only/);
  }
});

it("does not fall back after a conclusive disconnected-path or off-network response", async () => {
  for (const message of ["no track found at pass=0", "from-position not mapped in existing datafile"]) {
    let backups = 0;
    const client = new CyclingClient(new AbortController().signal, async () => new Response(message, { status: 400 }), 0, false,
      async () => { backups++; return response({}); });
    assert.equal(await client.route({ lat: 30, lon: 4 }, { lat: 30.01, lon: 4.01 }), null);
    assert.equal(backups, 0);
  }
});

it("waits for a short Retry-After before retrying a timetable request", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"] });
  let calls = 0;
  const client = new TimetableClient(new AbortController().signal, 0, async () => ++calls === 1
    ? response({}, 429, { "Retry-After": "2" }) : response({ connections: [] }));
  const task = client.get("connections", new URLSearchParams({ from: "a" }));
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(1999);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  t.mock.timers.tick(1);
  assert.deepEqual(await task, { connections: [] });
  assert.equal(calls, 2);
});
