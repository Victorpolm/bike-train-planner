import assert from "node:assert/strict";
import { it } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { handleStationTransfers } from "../server/stationTransferHandler.ts";
import { StationTransferClient } from "./stationTransferClient.ts";
import { boardingCheck } from "./transferTimes.ts";
import { transferEndpointKey, type TransferEndpointQuery, type StaticTransferEndpoint } from "./staticTransfers.ts";
import { DEFAULT_OPTIONS, emptyNetwork, solve, metrics } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { fareQuery } from "./onlineFare.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";
import { plan } from "./api.ts";
import { OjpClient } from "./ojpClient.ts";
import type { Place, TransitLeg } from "./routing.ts";

const signal = new AbortController().signal;
const api: typeof fetch = (input, init) => handleStationTransfers(new Request(new URL(String(input), "https://app.test"), init));
const query = async (...endpoints: TransferEndpointQuery[]) => {
  const response = await api("/api/station-transfers/v1", { method: "POST", body: JSON.stringify({ endpoints }) });
  assert.equal(response.status, 200); return (await response.json()).endpoints as StaticTransferEndpoint[];
};
const zurich: Place = { label: "Zürich HB", stopId: "8503000", lat: 47.3782, lon: 8.5402 };
const a: Place = { label: "A", stopId: "A", lat: 47.5, lon: 8.7 }, d: Place = { label: "D", stopId: "D", lat: 47.6, lon: 8.8 };
const start = new Date("2026-10-06T06:00:00Z"), at = (min: number) => new Date(+start + min * 60_000);
const options = { ...DEFAULT_OPTIONS, maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0, maxIntermediateMinutes: 0, bicycleScope: "allow-uncertain" as const };
function leg(service: string, from: Place, to: Place, dep: number, arr: number): TransitLeg {
  return { mode: "transit", from: from.label, to: to.label, fromId: from.stopId, toId: to.stopId, fromPoint: from, toPoint: to,
    departure: at(dep), arrival: at(arr), departurePlatform: from === zurich ? "18" : null,
    arrivalPlatform: to === zurich ? "41/42" : null, service, serviceName: null, direction: null };
}
async function graph(...legs: TransitLeg[]) {
  const network = emptyNetwork();
  [a, zurich, d].forEach(p => network.stops.set(p.stopId!, { ...p, id: p.stopId!, name: p.label }));
  legs.forEach((l, i) => network.edges.set(String(i), { id: String(i), from: l.fromId!, to: l.toId!, leg: l }));
  await new StationTransferClient(api).hydrate(network, signal); return network;
}
const both = (n: Awaited<ReturnType<typeof graph>>) => [solve(n, a, d, start, options, "baseline"), solveWaypoints(n, [a, d], start, options, "baseline")];

it("loads the uploaded ZIP edition, exact Zürich and Bern platform rules and DIDOK mapping", async () => {
  const [z, b, didok, single] = await query({ ref: "ch:1:sloid:3000:502:42" }, { ref: "ch:1:sloid:7000:6:32" }, { ref: "8503000", platform: "41/42" }, { ref: "8503000", platform: "42" });
  assert.equal(z.minimums?.["ch:1:sloid:3000:10:18"], 420);
  assert.equal(b.minimums?.["ch:1:sloid:7000:1:1"], 360);
  assert.equal(didok.id, z.id); assert.equal(single.id, z.id);
  assert.equal(z.feed?.version, "20260930"); assert.equal(z.feed?.generalRules, 109116);
  assert.equal(z.feed?.excludedScopedRows, 1003843);
  assert.equal(z.feed?.zipSha256, "170cbc1648b12b8f6adf51200c7cef80b56726a522671327f48ee8c584c1bc22");
});
it("preserves generated platform sectors and refuses unknown or contradictory platform mappings", async () => {
  const [sector, missing, conflicting, noGuess, station] = await query(
    { ref: "ch:1:sloid:3000:501:33", platform: "33AB" },
    { ref: "8507000", platform: "1Z" }, { ref: "ch:1:sloid:3000:10:18", platform: "7" },
    { ref: "ch:1:sloid:999999999", platform: "1" }, { ref: "8503000" });
  assert.equal(sector.id, "ch:1:sloid:3000_gen:ch:1:sloid:3000:501:33_pf:33AB");
  for (const e of [missing, conflicting, noGuess]) assert.equal(e.status, "unmapped");
  assert.equal(station.id, "ch:1:sloid:3000"); assert.equal(station.minimums?.[station.id!], 420);
});

it("uses a conservative station maximum for known stations lacking a platform, without guessing identities", async () => {
  const [station, original, other, badPlatform, mismatched, unknown] = await query(
    { ref: "8503001" }, { ref: "ch:1:sloid:3001", stopId: "8503001" }, { ref: "8502113" },
    { ref: "8503001", platform: "999" }, { ref: "8503001", stopId: "8502113" },
    { ref: "ch:1:sloid:999999999", stopId: "8503001" });
  assert.equal(station.status, "station"); assert.equal(station.stationMaximumSeconds, 180);
  assert.equal(original.stationMaximumSeconds, 180); assert.equal(original.stationId, "8503001");
  assert.equal(other.stationMaximumSeconds, 240);
  for (const endpoint of [badPlatform, mismatched, unknown]) assert.equal(endpoint.status, "unmapped");
});

it("rejects a two-minute missing-platform transfer in both solvers and counts the three-minute estimate once", async () => {
  const interchange = { ...zurich, stopId: "8503001", label: "Zürich Altstetten" };
  for (const minutes of [2, 3]) {
    const first = leg("In", a, interchange, 5, 10), next = leg("Out", interchange, d, 10 + minutes, 30);
    const n = await graph(first, next); n.stops.set(interchange.stopId, { ...interchange, id: interchange.stopId, name: interchange.label });
    const check = boardingCheck([first], next, +at(10), 3);
    assert.equal(check.source, "gtfs"); assert.equal(check.minutes, 3);
    assert.match(check.note, /estimated because a platform is missing.*largest published general transfer/);
    assert.match(check.note, /does not verify the actual platform pair/);
    for (const result of both(n)) {
      assert.equal(result.journeys.length, minutes === 3 ? 1 : 0);
      if (minutes === 3) assert.equal(metrics(result.journeys[0]).walk, 3);
    }
    const walk = { ...leg("Walk", interchange, interchange, 10, 12), mode: "walk" as const };
    assert.equal(boardingCheck([first, walk], next, +at(12), 3).readyAt, +at(13));
    next.departurePlatform = "2";
    assert.match(boardingCheck([first], next, +at(10), 3).note, /platform changed/);
    next.departurePlatform = null; first.arrival = new Date("2026-12-13T08:00:00Z"); next.departure = new Date("2026-12-13T08:03:00Z");
    assert.match(boardingCheck([first], next, +first.arrival, 3).note, /outside that period/);
  }
});

it("does not apply one station's maximum to a different station or an unmatched explicit platform", async () => {
  const first = leg("In", a, { ...zurich, stopId: "8503001" }, 5, 10);
  const next = leg("Out", { ...zurich, stopId: "8502113" }, d, 20, 30);
  await graph(first, next);
  assert.notEqual(boardingCheck([first], next, +at(10), 3).source, "gtfs");
  next.fromId = "8503001"; next.departurePlatform = "999"; await graph(first, next);
  assert.notEqual(boardingCheck([first], next, +at(10), 3).source, "gtfs");
});
it("applies the imported seven-minute minimum in both solvers, once, retaining fare identity", async () => {
  for (const minutes of [6, 7]) {
    const first = leg("In", a, zurich, 5, 10), next = leg("Out", zurich, d, 10 + minutes, 30);
    for (const result of both(await graph(first, next))) {
      assert.equal(result.journeys.length, minutes === 7 ? 1 : 0);
      if (minutes === 7) {
        const j = result.journeys[0]; assert.equal(metrics(j).walk, 7);
        assert.equal(j.transitLegs.filter(l => l.stationTransfer).length, 1);
        assert.deepEqual(fareQuery(j.transitLegs, DEFAULT_FARE_PROFILE), fareQuery([first, next], DEFAULT_FARE_PROFILE));
      }
    }
  }
});
it("keeps a later arrival with a faster platform transfer during dominance pruning", async () => {
  const first = leg("Early, remote platform", a, zurich, 5, 10), later = leg("Later, nearby platform", a, zurich, 6, 11), next = leg("Out", zurich, d, 16, 30);
  const network = await graph(first, later, next);
  // Distinct platform contexts with scoped static records isolate dominance from the data import.
  first.stationArrival = { ...first.stationArrival!, minimums: { [next.stationDeparture!.id!]: 600 } };
  later.arrivalPlatform = "18";
  later.stationArrival = { ...first.stationArrival!, key: transferEndpointKey({ ref: "8503000", stopId: "8503000", platform: "18" }), id: next.stationDeparture!.id, minimums: { [next.stationDeparture!.id!]: 300 } };
  for (const result of both(network)) {
    assert.equal(result.journeys.length, 1); assert.ok(result.journeys[0].transitLegs.includes(later));
  }
});
it("counts walking already present, preserves exact OJP priority and resets after cycling", async () => {
  const first = leg("In", a, zurich, 5, 10), next = leg("Out", zurich, d, 17, 30); await graph(first, next);
  const walk = { ...leg("Walk", zurich, zurich, 10, 17), mode: "walk" as const };
  const check = boardingCheck([first, walk], next, +at(17), 3);
  assert.equal(check.source, "gtfs"); assert.equal(check.readyAt, +at(17)); assert.equal(check.transferLeg, undefined);
  const bike = { ...walk, mode: "bike" as const };
  assert.equal(boardingCheck([first, bike], next, +at(17), 3).source, "estimate");
  first.ojp = { journeyRef: "in", operatingDay: "2026-10-06", fromRef: "A", toRef: "8503000", fromOrder: 1, toOrder: 2, departure: first.departure!.toISOString(), arrival: first.arrival!.toISOString(), bikeFiltered: false, attributes: [] };
  next.ojp = { ...first.ojp, journeyRef: "out", fromRef: "8503000", toRef: "D", departure: next.departure!.toISOString(), arrival: next.arrival!.toISOString() };
  next.transferRules = [{ incomingJourneyRef: "in", incomingOperatingDay: "2026-10-06", operatingDay: "2026-10-06", fromRef: "8503000", toRef: "8503000", arrival: first.arrival!.toISOString(), departure: next.departure!.toISOString(), seconds: 180, kind: "walk" }];
  assert.equal(boardingCheck([first], next, +at(10), 3).source, "ojp");
  assert.equal(boardingCheck([first], next, +at(10), 3).minutes, 3);
  next.transferRules[0].seconds = null;
  assert.equal(boardingCheck([first], next, +at(10), 3).readyAt, Infinity);
});
it("checks Swiss dates against feed validity and rejects changed platform identity", async () => {
  const first = leg("In", a, zurich, 5, 10), next = leg("Out", zurich, d, 17, 30); await graph(first, next);
  assert.equal(boardingCheck([first], next, +first.arrival!, 3).source, "gtfs");
  first.arrival = new Date("2026-12-12T23:00:00Z"); next.departure = new Date("2026-12-12T23:07:00Z");
  const expired = boardingCheck([first], next, +first.arrival, 3);
  assert.equal(expired.source, "swiss-default"); assert.match(expired.note, /outside that period/);
  first.arrival = at(10); next.departure = at(17); next.departurePlatform = "999";
  assert.match(boardingCheck([first], next, +at(10), 3).note, /platform changed/);
});
it("bounds endpoint batches, caches successes and recovers failed lookups on a new action", async () => {
  const network = emptyNetwork();
  for (let i = 0; i < 30; i++) {
    const l = leg(String(i), { ...a, stopId: `unknown-${i}` }, zurich, 5, 10);
    network.edges.set(String(i), { id: String(i), from: l.fromId!, to: l.toId!, leg: l });
  }
  let calls = 0, fail = true;
  const client = new StationTransferClient(async (url, init) => { calls++; assert.ok(JSON.parse(String(init?.body)).endpoints.length <= 24); return fail ? new Response("", { status: 503 }) : api(url, init); });
  await client.hydrate(network, signal); assert.equal(calls, 1); assert.equal(client.warnings.size, 1);
  fail = false; const retry = client.fork(); await retry.hydrate(network, signal); assert.equal(calls, 3);
  await retry.hydrate(network, signal); assert.equal(calls, 3); assert.equal(retry.warnings.size, 0);
  const bad = await api("/api/station-transfers/v1", { method: "POST", body: JSON.stringify({ endpoints: Array(25).fill({ ref: "8503000" }) }) }); assert.equal(bad.status, 400);
  assert.equal((await api("/api/station-transfers/v1")).status, 405);
});
it("hydrates the actual asynchronous planner before publishing transit results", async () => {
  const first = leg("In", a, zurich, 5, 10), next = leg("Out", zurich, d, 16, 30);
  const ojpClient = new OjpClient(signal, async () => Response.json({ checked: start.toISOString(), warnings: [], legs: [first, next].map(l => ({
    mode: l.mode, from: { id: l.fromId, name: l.from, ...l.fromPoint }, to: { id: l.toId, name: l.to, ...l.toPoint }, departure: l.departure!.toISOString(), arrival: l.arrival!.toISOString(),
    departurePlatform: l.departurePlatform, arrivalPlatform: l.arrivalPlatform, service: l.service, serviceName: null, direction: null,
  })) }));
  let lookedUp = 0, transitPublications = 0;
  const result = await plan(a, d, "baseline", options, signal, () => {}, s => {
    if (s.network.edges.size) { transitPublications++; assert.ok(lookedUp > 0); assert.equal(s.baseline.journeys.length, 0); }
  }, { start, cyclingClient: null, gapMs: 0, ojpClient, stationTransferFetcher: async (u, i) => { lookedUp++; return api(u, i); }, fetcher: async () => Response.json({ stations: [], connections: [] }) });
  assert.ok(lookedUp > 0); assert.ok(transitPublications > 0); assert.equal(result.baseline.journeys.length, 0);
});
it("the importer excludes route/trip/calendar rules and stay-on-board rows reproducibly", () => {
  const dir = mkdtempSync(join(process.cwd(), ".station-import-"));
  try {
    const script = `import zipfile\nwith zipfile.ZipFile(${JSON.stringify(join(dir, "fixture.zip"))},'w') as z:\n z.writestr('stops.txt','stop_id,original_stop_id,parent_station,platform_code,didok,location_type\\na,a,,1,8500001,\\nb,b,,2,8500001,\\n')\n z.writestr('feed_info.txt','feed_version,feed_start_date,feed_end_date\\ntest,20251214,20261212\\n')\n z.writestr('transfers.txt','from_stop_id,to_stop_id,from_route_id,to_route_id,from_trip_id,to_trip_id,transfer_type,min_transfer_time,service_id\\na,b,,,,,2,420,\\na,b,r,,,,2,30,\\nb,a,,,,,2,10,weekday\\nb,a,,,,,4,,\\n')\n`;
    writeFileSync(join(dir, "fixture.py"), script);
    assert.equal(spawnSync("python", [join(dir, "fixture.py")], { encoding: "utf8" }).status, 0);
    const output = join(dir, "out.json"), args = ["scripts/import-station-transfers.py", join(dir, "fixture.zip"), "--output", output];
    const run = () => { const p = spawnSync("python", args, { encoding: "utf8" }); assert.equal(p.status, 0, p.stderr); return readFileSync(output, "utf8"); };
    const one = run(); assert.equal(run(), one);
    const decoded = JSON.parse(gunzipSync(Buffer.from(JSON.parse(one).gzip, "base64")).toString());
    assert.deepEqual(decoded.rules, [[0, 1, 420]]); assert.equal(decoded.feed.excludedScopedRows, 2); assert.equal(decoded.feed.excludedOtherTypes, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

it("resolves a realtime platform change within the explicitly identified station without accepting contradictory stations", async () => {
  const [changed, planned, wrongStation] = await query(
    { ref: "ch:1:sloid:3000:10:18", stopId: "8503000", platform: "42", platformChanged: true },
    { ref: "ch:1:sloid:3000:10:18", stopId: "8503000", platform: "42" },
    { ref: "ch:1:sloid:3000:10:18", stopId: "8507000", platform: "42", platformChanged: true });
  assert.equal(changed.id, "ch:1:sloid:3000:502:42");
  assert.equal(planned.status, "unmapped"); assert.equal(wrongStation.status, "unmapped");
});
