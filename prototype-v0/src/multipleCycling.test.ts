import assert from "node:assert/strict";
import { it } from "node:test";
import { compareModels, DEFAULT_OPTIONS, emptyNetwork, metrics, solve, type Network, type Options } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { cyclingKey, parseCyclingRoute } from "./cycling.ts";
import { extend, plan, type SearchSession } from "./api.ts";
import { TimetableClient } from "./timetableClient.ts";
import { fareQuery } from "./onlineFare.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";
import { haversineKm, type Place, type Point } from "./routing.ts";
import { preferenceOptions } from "./preferences.ts";

// Synthetic services at Swiss coordinates; no live timetable or fare claims.
const start = new Date("2026-10-03T08:00:00+02:00");
const time = (m: number) => new Date(+start + m * 60_000);
const coordinates = [[46, 6], [46.3, 6.1], [46.3, 6.11], [46.6, 7], [46.6, 7.01], [46.9, 8], [46.9, 8.01], [47.1, 8.3]];
const stops = coordinates.map(([lat, lon], i) => ({ id: String(i), name: `Stop ${i}`, lat, lon }));
const place = (i: number): Place => ({ ...stops[i], stopId: stops[i].id, label: stops[i].name });
const options: Options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0, maxBikeMinutes: 15, maxIntermediateMinutes: 5, horizonMinutes: 180 };
function bike(n: Network, from: Point, to: Point, minutes = 5) {
  const route = parseCyclingRoute({ features: [{ geometry: { type: "LineString", coordinates: [[from.lon, from.lat, 400], [to.lon, to.lat, 400]] },
    properties: { "track-length": haversineKm(from, to) * 1000, "total-time": minutes * 60 } }] }, from, to, +start);
  n.cycling!.set(cyclingKey(from, to), { ...route, minutes });
}
function ride(n: Network, from: number, to: number, departure: number, arrival: number, mode: "transit" | "walk" = "transit") {
  const a = stops[from], b = stops[to], id = `${from}-${to}-${departure}`;
  const leg = { mode, from: a.name, to: b.name, fromId: a.id, toId: b.id, fromPoint: a, toPoint: b,
    departure: time(departure), arrival: time(arrival), service: id, serviceName: id, direction: b.name,
    departurePlatform: null, arrivalPlatform: null, category: "IC", operator: "Controlled operator" };
  n.edges.set(id, { id, from: a.id, to: b.id, leg });
  return leg;
}
function fixture(alternatives = false) {
  const n = emptyNetwork(); n.cycling = new Map(); stops.forEach(s => n.stops.set(s.id, s));
  ride(n, 0, 1, 5, 20); ride(n, 2, 3, 30, 45); ride(n, 4, 5, 55, 70);
  bike(n, stops[1], stops[2]); bike(n, stops[3], stops[4]);
  if (alternatives) { ride(n, 0, 5, 5, 130); ride(n, 2, 5, 30, 110); }
  return n;
}
const fastest = (journeys: { totalMinutes: number }[]) => Math.min(...journeys.map(j => j.totalMinutes));

it("Less cycling shares its 40 minutes freely between the two ends", () => {
  const from = { label: "Home", lat: 46, lon: 5.99 }, to = { label: "Work", lat: 46.9, lon: 8.02 };
  const o = preferenceOptions("less", "none");
  for (const [access, egress] of [[30, 5], [5, 30], [35, 5], [5, 35], [36, 5], [5, 36]]) {
    const n = fixture(); n.edges.clear(); n.cycling!.clear(); ride(n, 0, 5, 60, 100);
    bike(n, from, stops[0], access); bike(n, stops[5], to, egress);
    for (const mode of ["baseline", "extended"] as const) {
      const journeys = solve(n, from, to, start, o, mode).journeys;
      assert.equal(journeys.length > 0, access + egress <= 40, `${mode}: ${access} + ${egress}`);
      for (const journey of journeys) assert.equal(metrics(journey).bike, access + egress);
    }
  }
});

it("Less cycling allows a longer Extended connection within the shared 40 minutes", () => {
  const from = { label: "Home", lat: 46, lon: 5.99 }, to = { label: "Work", lat: 46.9, lon: 8.02 };
  const o = preferenceOptions("less", "none");
  for (const middle of [25, 26]) {
    const n = fixture(); n.edges.clear(); n.cycling!.clear();
    ride(n, 0, 1, 10, 25); ride(n, 2, 5, 65, 85);
    bike(n, from, stops[0], 5); bike(n, stops[1], stops[2], middle); bike(n, stops[5], to, 10);
    assert.equal(solve(n, from, to, start, o, "baseline").journeys.length, 0);
    const journeys = solve(n, from, to, start, o, "extended").journeys;
    assert.equal(journeys.length > 0, middle === 25);
    for (const journey of journeys) {
      assert.equal(metrics(journey).middle, 25);
      assert.equal(metrics(journey).bike, 40);
    }
  }
});

it("Less cycling keeps one total budget across ordered stops", () => {
  const from = { label: "Home", lat: 46, lon: 5.99 }, to = { label: "Work", lat: 46.9, lon: 8.02 };
  const o = preferenceOptions("less", "none");
  for (const egress of [5, 10, 11]) {
    const n = fixture(); n.edges.clear(); n.cycling!.clear();
    ride(n, 0, 3, 40, 60); ride(n, 3, 5, 70, 90);
    bike(n, from, stops[0], 30); bike(n, stops[5], to, egress);
    for (const mode of ["baseline", "extended"] as const) {
      const journeys = solveWaypoints(n, [from, place(3), to], start, o, mode).journeys;
      assert.equal(journeys.length > 0, egress <= 10, `${mode}: 30 + ${egress}`);
      for (const journey of journeys) {
        assert.equal(metrics(journey).bike, 30 + egress);
        assert.equal(journey.waypoints?.[0].place.stopId, stops[3].id);
      }
    }
  }
});

it("finds the two-transfer winner and preserves useful zero/one-transfer alternatives", () => {
  const n = fixture(true), from = place(0), to = place(5);
  assert.equal(fastest(solve(n, from, to, start, options, "baseline").journeys), 130);
  assert.equal(fastest(solve(n, from, to, start, { ...options, maxCyclingTransfers: 1 }, "extended").journeys), 110);
  const both = compareModels(n, from, to, start, options);
  assert.equal(fastest(both.extended.journeys), 70);
  for (const duration of [70, 110, 130]) assert.ok(both.extended.journeys.some(j => j.totalMinutes === duration));
  const best = both.extended.journeys.find(j => j.totalMinutes === 70)!;
  assert.equal(metrics(best).boardings, 3); assert.equal(metrics(best).middle, 10);
  assert.equal(fareQuery(best.transitLegs, DEFAULT_FARE_PROFILE), null, "do not quote an unrelated through journey across two cycling gaps");
});

it("enforces the second connection's timing and shared cycling, boarding and horizon limits", () => {
  for (const patch of [{ maxBikeMinutes: 9 }, { maxBoardings: 2 }, { maxIntermediateMinutes: 4 }, { horizonMinutes: 69 }]) {
    assert.equal(solve(fixture(), place(0), place(5), start, { ...options, ...patch }, "extended").journeys.length, 0);
  }
  const n = fixture(); n.edges.delete("4-5-55"); ride(n, 4, 5, 53, 70);
  assert.equal(fastest(solve(n, place(0), place(5), start, options, "extended").journeys), 70);
  n.edges.delete("4-5-53"); ride(n, 4, 5, 53 - 1 / 60, 70);
  assert.equal(solve(n, place(0), place(5), start, options, "extended").journeys.length, 0);
});

it("rejects a third automatic transfer in both ordinary and ordered-stop searches", () => {
  const n = fixture(); bike(n, stops[5], stops[6]); ride(n, 6, 7, 80, 95);
  assert.equal(solve(n, place(0), place(7), start, options, "extended").journeys.length, 0);
  assert.equal(solveWaypoints(n, [place(0), place(3), place(7)], start, options, "extended").journeys.length, 0);
  assert.throws(() => solve(n, place(0), place(7), start, { ...options, maxCyclingTransfers: 3 }, "extended"), /0 to 2/);
});

it("applies every permission scope to all three rides in a two-transfer journey", () => {
  const n = fixture();
  for (const { leg } of n.edges.values()) leg.bicycleEvidence = {
    permission: "allowed", fromId: leg.fromId!, toId: leg.toId!, departure: leg.departure!.toISOString(), service: leg.service,
    operator: leg.operator!, conditions: [], source: { title: "Controlled evidence", url: "https://example.org", checked: "2026-10-03" },
  };
  const last = n.edges.get("4-5-55")!.leg;
  for (const permission of ["allowed", "unknown", "prohibited"] as const) {
    last.bicycleEvidence = { ...last.bicycleEvidence!, permission };
    for (const bicycleScope of ["confirmed", "allow-uncertain", "all-transit"] as const) {
      const expected = bicycleScope === "all-transit" || permission === "allowed" || bicycleScope === "allow-uncertain" && permission === "unknown";
      assert.equal(solve(n, place(0), place(5), start, { ...options, bicycleScope }, "extended").journeys.length > 0, expected);
      assert.equal(solveWaypoints(n, [place(0), place(3), place(5)], start, { ...options, bicycleScope }, "extended").journeys.length > 0, expected);
    }
  }
});

it("beginning-only and end-only are hard constraints, independent of the extra ranking category", () => {
  const n = fixture(); n.edges.clear(); ride(n, 0, 5, 10, 80);
  const from = { label: "Home", lat: 46, lon: 5.99 }, to = { label: "Work", lat: 46.9, lon: 8.02 };
  bike(n, from, stops[0]); bike(n, stops[5], to);
  const o = { ...options, maxAccessMinutes: 10, maxEgressMinutes: 10 };
  for (const mode of ["baseline", "extended"] as const) for (const endpointPreference of ["none", "start", "end"] as const) {
    const beginning = solve(n, from, place(5), start, { ...o, endpointPreference, cyclingPosition: "start-only" }, mode).journeys;
    const ending = solve(n, place(0), to, start, { ...o, endpointPreference, cyclingPosition: "end-only" }, mode).journeys;
    assert.ok(beginning.length && ending.length);
    assert.ok(beginning.every(j => metrics(j).start === 5 && metrics(j).end === 0 && metrics(j).middle === 0));
    assert.ok(ending.every(j => metrics(j).start === 0 && metrics(j).end === 5 && metrics(j).middle === 0));
    for (const cyclingPosition of ["start-only", "end-only"] as const)
      assert.equal(solve(n, from, to, start, { ...o, endpointPreference, cyclingPosition }, mode).journeys.length, 0);
  }
  for (const cyclingPosition of ["start-only", "end-only"] as const)
    assert.equal(solve(fixture(), place(0), place(5), start, { ...options, cyclingPosition }, "extended").journeys.length, 0);
});

it("ordered stops cannot hide cycling in the forbidden part of the journey", () => {
  const n = fixture(); n.edges.clear(); ride(n, 0, 3, 10, 30); ride(n, 3, 5, 50, 70);
  const from = { label: "Home", lat: 46, lon: 5.99 }, via = { label: "Visit", lat: 46.6, lon: 7.02 }, to = { label: "Finish", lat: 46.9, lon: 8.02 };
  bike(n, from, stops[0]); bike(n, stops[3], via); bike(n, via, stops[3]); bike(n, stops[5], to);
  const o = { ...options, maxAccessMinutes: 10, maxEgressMinutes: 10, maxBikeMinutes: 30 };
  for (const mode of ["baseline", "extended"] as const) {
    assert.ok(solveWaypoints(n, [from, place(3), place(5)], start, { ...o, cyclingPosition: "start-only" }, mode).journeys.length);
    assert.ok(solveWaypoints(n, [place(0), place(3), to], start, { ...o, cyclingPosition: "end-only" }, mode).journeys.length);
    for (const cyclingPosition of ["start-only", "end-only"] as const)
      assert.equal(solveWaypoints(n, [place(0), via, place(5)], start, { ...o, cyclingPosition }, mode).journeys.length, 0);
  }
});

it("keeps timetable walking links usable at the non-cycling end", () => {
  const n = fixture(); n.edges.clear();
  ride(n, 0, 1, 0, 4, "walk"); ride(n, 1, 4, 7, 40); ride(n, 4, 5, 40, 45, "walk");
  for (const cyclingPosition of ["start-only", "end-only"] as const) {
    const o = { ...options, cyclingPosition };
    assert.equal(fastest(solve(n, place(0), place(5), start, o, "extended").journeys), 45);
    assert.equal(fastest(solveWaypoints(n, [place(0), place(4), place(5)], start, o, "extended").journeys), 45);
  }
});

it("allows walking after the final ride through a requested stop without permitting another boarding", () => {
  const n = fixture(); n.edges.clear(); ride(n, 0, 3, 10, 30); bike(n, stops[3], stops[4]);
  ride(n, 4, 5, 40, 45, "walk"); ride(n, 5, 7, 50, 65);
  const o = { ...options, cyclingPosition: "end-only" as const, maxAccessMinutes: 10, maxEgressMinutes: 10 };
  assert.equal(fastest(solveWaypoints(n, [place(0), place(4), place(5)], start, o, "extended").journeys), 45);
  assert.equal(solveWaypoints(n, [place(0), place(4), place(7)], start, o, "extended").journeys.length, 0);
});

it("discovers a second cycling connection even when the first onward query has no through journey", async () => {
  for (const withWaypoint of [false, true]) {
    const urls: URL[] = [], n = emptyNetwork();
    for (const i of [0, 5, ...(withWaypoint ? [3] : [])]) n.stops.set(stops[i].id, stops[i]);
    const station = (i: number) => ({ id: stops[i].id, name: stops[i].name, coordinate: { x: stops[i].lat, y: stops[i].lon } });
    const call = (i: number, departure: number | null, arrival: number | null) => ({ station: station(i), departure: departure === null ? null : time(departure).toISOString(), arrival: arrival === null ? null : time(arrival).toISOString() });
    const client = new TimetableClient(new AbortController().signal, 0, async input => {
      const url = new URL(String(input)); urls.push(url); let data: unknown = {};
      if (url.pathname.endsWith("stationboard")) {
        const first = url.searchParams.get("id") === "0", second = url.searchParams.get("id") === "2";
        if (first || second) data = { stationboard: [{ name: first ? "First" : "Second", category: "IC", number: first ? "1" : "2",
          stop: call(first ? 0 : 2, first ? 5 : 30, null), passList: [call(first ? 0 : 2, first ? 5 : 30, null), call(first ? 1 : 3, null, first ? 20 : 45)] }] };
      } else if (url.pathname.endsWith("locations")) {
        const i = Number(url.searchParams.get("x")) < 46.5 ? 2 : 4; data = { stations: [station(i)] };
      } else if (url.searchParams.get("from") === "4" && url.searchParams.get("to") === "5") data = { connections: [{ sections: [{ journey: { name: "Third", category: "IC", number: "3" }, departure: call(4, 55, null), arrival: call(5, null, 70) }] }] };
      return new Response(JSON.stringify(data));
    });
    const endpoint = (i: number) => ({ ...stops[i], bikeMinutes: 0, distanceKm: 0 });
    const session: SearchSession = { origin: place(0), destination: place(5), network: n, client, start, options,
      originStations: [endpoint(0)], destinationStations: [endpoint(5)], baseline: solve(n, place(0), place(5), start, options, "baseline"), extended: null,
      ...(withWaypoint ? { waypoints: [place(3)], waypointStations: [[endpoint(0)], [endpoint(3)], [endpoint(5)]] } : {}) };
    client.claimRequests(18); // Baseline already spent its allowance; Extended is a new user action.
    const result = await extend(session, () => {});
    assert.ok(result.client.requests <= 18);
    assert.equal(fastest(result.extended!.journeys), 70, `waypoint=${withWaypoint}`);
    assert.ok(urls.some(u => u.pathname.endsWith("stationboard") && u.searchParams.get("id") === "2"));
    assert.ok(urls.some(u => u.pathname.endsWith("connections") && u.searchParams.get("from") === "4"));
    assert.ok(client.requests <= 18);
    const count = client.requests; await extend(result, () => {}); assert.equal(client.requests, count);
  }
});

it("restricted placement avoids intermediate discovery and explains a missing walking connection", async () => {
  const n = fixture(), client = new TimetableClient(new AbortController().signal, 0, async () => { throw new Error("Unexpected discovery"); });
  const o = { ...options, cyclingPosition: "start-only" as const };
  const session: SearchSession = { origin: place(0), destination: place(5), network: n, client, start, options: o,
    originStations: [], destinationStations: [], baseline: solve(n, place(0), place(5), start, o, "baseline"), extended: null };
  await extend(session, () => {}); assert.equal(client.requests, 0);
  await assert.rejects(plan(place(0), { label: "Off-stop address", lat: 46.9, lon: 8.04 }, "baseline", o,
    new AbortController().signal, () => {}, () => {}, { start, cyclingClient: null, gapMs: 0, fetcher: async () => new Response(JSON.stringify({ stations: [] })) }), /No checked walking path/);
});
