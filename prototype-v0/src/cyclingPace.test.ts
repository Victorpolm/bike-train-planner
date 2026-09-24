import assert from "node:assert/strict";
import { it } from "node:test";
import { CYCLING_PRESETS, slopeSpeedKmh, pacedRidingSeconds, validateCyclingPace } from "./cyclingPace.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { cyclingKey, parseCyclingRoute } from "./cycling.ts";
import { parseFallbackRoute } from "./cyclingFallback.ts";
import { DEFAULT_OPTIONS, emptyNetwork, solve } from "./model.ts";
import { haversineKm } from "./routing.ts";

it("matches editable flat speeds and gives stronger riders a larger advantage on climbs", () => {
  for (const preset of Object.values(CYCLING_PRESETS)) {
    assert.ok(Math.abs(slopeSpeedKmh(0, preset) - preset.flatSpeedKmh) < .00001);
    assert.ok(slopeSpeedKmh(.08, preset) < preset.flatSpeedKmh);
    assert.ok(slopeSpeedKmh(-.08, preset) > preset.flatSpeedKmh);
    assert.ok(slopeSpeedKmh(-.3, preset) <= 45);
  }
  const { regular, strong, electric } = CYCLING_PRESETS;
  const flatGain = strong.flatSpeedKmh / regular.flatSpeedKmh;
  assert.ok(slopeSpeedKmh(.08, strong) / slopeSpeedKmh(.08, regular) > flatGain + .3);
  assert.ok(slopeSpeedKmh(.08, electric) > slopeSpeedKmh(.08, strong));
  assert.ok(slopeSpeedKmh(.03, electric) < 25, "assistance fades out at 25 km/h");
  const sameFlat = { ...regular, electricAssist: true };
  assert.ok(Math.abs(slopeSpeedKmh(0, sameFlat) - 20) < .00001);
  assert.ok(slopeSpeedKmh(.08, sameFlat) > slopeSpeedKmh(.08, regular) * 2);
  for (const flatSpeedKmh of [NaN, 0, 7, 36, Infinity]) assert.throws(() => validateCyclingPace({ ...regular, flatSpeedKmh }));
});

it("sums uphill and downhill time separately even when net elevation gain is zero", () => {
  const flat = [{ distanceM: 0, elevationM: 400 }, { distanceM: 1000, elevationM: 400 }, { distanceM: 2000, elevationM: 400 }];
  const hills = flat.map((point, i) => ({ ...point, elevationM: i === 1 ? 480 : 400 }));
  const regular = pacedRidingSeconds(flat, 2, CYCLING_PRESETS.regular);
  assert.ok(Math.abs(regular - 360) < .001);
  assert.ok(pacedRidingSeconds(hills, 2, CYCLING_PRESETS.regular) > regular * 2);
  assert.ok(pacedRidingSeconds(hills, 2, CYCLING_PRESETS.strong) < pacedRidingSeconds(hills, 2, CYCLING_PRESETS.regular));
  assert.ok(Math.abs(pacedRidingSeconds(flat.map(p => ({ ...p, elevationM: null })), 2, CYCLING_PRESETS.regular) - regular) < .001);
});

const from = { label: "Home", lat: 30, lon: 4 }, station = { id: "A", name: "Station", lat: 30.036, lon: 4 };
const distance = haversineKm(from, station);
const geometry = { type: "LineString", coordinates: Array.from({ length: 41 }, (_, i) => [4, from.lat + (station.lat - from.lat) * i / 40, 400]) };
const data = { features: [{ geometry, properties: { "track-length": distance * 1000, "total-time": 900 } }] };

it("uses pace for catching a train and for the total cycling budget, preserving walking connectors", () => {
  const start = new Date("2026-09-25T08:00:00+02:00"), at = (min: number) => new Date(+start + min * 60_000);
  const to = { label: "Destination", stopId: "B", lat: 31, lon: 4 };
  const network = emptyNetwork(); network.stops.set("A", station); network.stops.set("B", { ...to, id: "B", name: "Destination" });
  for (const dep of [12, 40]) network.edges.set(String(dep), { id: String(dep), from: "A", to: "B", leg: {
    mode: "transit", from: "Station", to: "Destination", fromId: "A", toId: "B", service: `R ${dep}`, serviceName: null,
    direction: null, departure: at(dep), arrival: at(dep + 10), departurePlatform: null, arrivalPlatform: null,
  } });
  for (const [preset, arrival] of [[CYCLING_PRESETS.relaxed, 50], [CYCLING_PRESETS.strong, 22]] as const) {
    const route = parseCyclingRoute(data, from, station, Date.now(), preset);
    network.cycling = new Map([[cyclingKey(from, station), route]]);
    const options = { ...DEFAULT_OPTIONS, cyclingPace: preset, maxEgressMinutes: 0 };
    assert.equal(Math.min(...solve(network, from, to, start, options, "baseline").journeys.map(j => j.totalMinutes)), arrival);
    assert.equal(solve(network, from, to, start, { ...options, maxBikeMinutes: 9 }, "baseline").journeys.length > 0, preset === CYCLING_PRESETS.strong);
  }
  const offsetFrom = { ...from, lon: from.lon - .001 };
  const slow = parseCyclingRoute(data, offsetFrom, station, Date.now(), CYCLING_PRESETS.relaxed);
  const fast = parseCyclingRoute(data, offsetFrom, station, Date.now(), CYCLING_PRESETS.strong);
  assert.ok(slow.connectorMinutes > 1); assert.equal(slow.connectorMinutes, fast.connectorMinutes);
});

it("isolates cached timings by flat pace and electric assistance across search clients", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response(JSON.stringify(data)); };
  const client = (flatSpeedKmh: number, electricAssist = false) => new CyclingClient(new AbortController().signal, fetcher, 0, true, null, { flatSpeedKmh, electricAssist });
  const slow = await client(15).route(from, station), fast = await client(30).route(from, station);
  assert.ok(slow!.minutes > fast!.minutes);
  assert.equal(calls, 2);
  assert.equal((await client(15).route(from, station))!.minutes, slow!.minutes); assert.equal(calls, 2);
  assert.equal((await client(15, true).route(from, station))!.pace?.electricAssist, true); assert.equal(calls, 3);
});

it("uses the selected pace on backup paths while keeping missing elevation explicit", () => {
  const response = { code: "Ok", routes: [{ distance: distance * 1000, duration: 900,
    geometry: { ...geometry, coordinates: geometry.coordinates.map(p => p.slice(0, 2)) }, legs: [{ steps: [{ mode: "cycling" }] }] }] };
  const slow = parseFallbackRoute(response, from, station, CYCLING_PRESETS.relaxed);
  const fast = parseFallbackRoute(response, from, station, CYCLING_PRESETS.strong);
  assert.equal(fast.source, "OSRM"); assert.equal(fast.ascentM, null); assert.equal(fast.elevationCoverage, 0);
  assert.ok(slow.minutes > fast.minutes); assert.equal(fast.pace?.flatSpeedKmh, 28);
  assert.ok(Math.abs(fast.ridingSeconds - distance / 28 * 3600) < .001);
});

it("propagates the selected pace to timetable readiness and the independent cycling comparison", async () => {
  const { plan } = await import("./api.ts");
  const { preferenceOptions } = await import("./preferences.ts");
  const to = { label: "Destination", stopId: "B", lat: 31, lon: 4 };
  const b = { id: "B", name: "Destination", ...to };
  const stationData = (p: typeof station) => ({ id: p.id, name: p.name, icon: "train", coordinate: { x: p.lat, y: p.lon } });
  for (const pace of [CYCLING_PRESETS.relaxed, CYCLING_PRESETS.strong]) {
    const queryTimes: string[] = [];
    const result = await plan(from, to, "baseline", { ...preferenceOptions("balanced", "none", "include-unknown", "allow-uncertain", pace), maxEgressMinutes: 0 },
      new AbortController().signal, () => {}, () => {}, { start: new Date("2026-09-25T08:00:00+02:00"), gapMs: 0,
        cyclingFetcher: async input => {
          const pairs = new URL(String(input)).searchParams.get("lonlats")!.split("|").map(s => s.split(",").map(Number));
          const a = { lon: pairs[0][0], lat: pairs[0][1] }, z = { lon: pairs[1][0], lat: pairs[1][1] };
          return new Response(JSON.stringify({ features: [{ geometry: { type: "LineString", coordinates: pairs },
            properties: { "track-length": haversineKm(a, z) * 1000, "total-time": 600 } }] }));
        },
        fetcher: async input => {
          const url = new URL(String(input));
          if (url.pathname.endsWith("locations")) return new Response(JSON.stringify({ stations: [stationData(Number(url.searchParams.get("x")) < 30.5 ? station : b)] }));
          queryTimes.push(url.searchParams.get("time")!);
          return new Response(JSON.stringify({ connections: [{ sections: [{ journey: { category: "IR", name: "Controlled train" },
            departure: { station: stationData(station), departure: "2026-09-25T08:40:00+02:00" },
            arrival: { station: stationData(b), arrival: "2026-09-25T08:50:00+02:00" },
          }] }] }));
        },
      });
    await result.cyclingTask;
    assert.equal(queryTimes[0], pace === CYCLING_PRESETS.relaxed ? "08:20" : "08:12");
    assert.equal(result.cyclingClient?.pace?.flatSpeedKmh, pace.flatSpeedKmh);
    assert.equal(result.comparisonClient?.pace?.flatSpeedKmh, pace.flatSpeedKmh);
    assert.equal(result.cyclingComparison?.routes?.[0].pace?.flatSpeedKmh, pace.flatSpeedKmh);
  }
});
