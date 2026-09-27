import assert from "node:assert/strict";
import { it } from "node:test";
import { zeroCycling, type CyclingRoute } from "./cycling.ts";
import { analyseCyclingTerrain, terrainRule, modeTotals } from "./cyclingTerrain.ts";
import { chooseCyclingRoute } from "./cyclingPreferences.ts";
import { applySwisstopo, parseTopoReply, simplifyTopoLine, TLM_ROADS, TLM_HIKING, type TopoFeature } from "./swisstopo.ts";
import { handleSwisstopo } from "../server/swisstopoHandler.ts";
import { CyclingClient } from "./cyclingClient.ts";

const a = { lat: 47.3, lon: 8.4 }, b = { lat: 47.301, lon: 8.4 };
function route(tags: Record<string, string> = { highway: "cycleway" }): CyclingRoute {
  const points = [{ ...a, distanceM: 0, elevationM: 400 }, { ...b, distanceM: 100, elevationM: 400 }];
  return analyseCyclingTerrain({ ...zeroCycling(a, b), source: "BRouter", distanceKm: .1, ridingSeconds: 24, points, elevation: points,
    pace: { flatSpeedKmh: 15, electricAssist: false }, sections: [{ startM: 0, endM: 100, surface: "Unknown", infrastructure: "Unknown", speedLimit: "Unknown", tags }] });
}
const feature = (changes: Partial<TopoFeature> = {}): TopoFeature => ({ id: "road", layer: TLM_ROADS,
  lines: [[[a.lon, a.lat], [b.lon, b.lat]]], attributes: { objektart: "16", verkehrsbeschraenkung: "100", belagsart: "200" }, ...changes });
const apply = (r: CyclingRoute, features: TopoFeature[], complete = true) => applySwisstopo(r, { features, complete, checkedAt: "2026-09-27T09:00:00Z" });

it("distinguishes riding, pushing, carrying and routes unsuitable with a bicycle", () => {
  assert.equal(terrainRule({ highway: "steps" }).mode, "carry");
  assert.equal(terrainRule({ highway: "steps", "ramp:bicycle": "yes" }).mode, "push");
  assert.equal(terrainRule({ highway: "footway" }).mode, "push");
  assert.equal(terrainRule({ highway: "footway", bicycle: "yes" }).mode, "cycle");
  assert.equal(terrainRule({ bicycle: "no", foot: "no" }).mode, "blocked");
  assert.equal(terrainRule({ bicycle: "dismount", foot: "yes" }).mode, "push");
  assert.equal(terrainRule({ access: "private", foot: "yes" }).mode, "push");
  for (const tags of [{ highway: "via_ferrata" }, { sac_scale: "alpine_hiking" }, { "mtb:scale": "5" }, { "swisstopo:objektart": "22" }])
    assert.equal(terrainRule(tags).mode, "blocked");
  assert.equal(terrainRule({ "swisstopo:befahrbarkeit": "1" }).mode, "cycle"); // Car access does not establish a bike ban.
});
it("adds walking/carrying time before routing and keeps terrain reanalysis stable", () => {
  const stairs = route({ highway: "steps" }), push = route({ bicycle: "dismount" });
  assert.equal(stairs.ridingSeconds, 0); assert.equal(stairs.carryingSeconds, 180); assert.equal(stairs.minutes, 3);
  assert.equal(push.pushingSeconds, 90); assert.equal(push.minutes, 2);
  assert.deepEqual(modeTotals(analyseCyclingTerrain(stairs)), modeTotals(stairs));
  assert.equal(route({ highway: "via_ferrata" }).minutes, Infinity);
  assert.equal(analyseCyclingTerrain({ ...route({ sac_scale: "alpine_hiking" }), pace: { flatSpeedKmh: 30, electricAssist: true } }).blocked, true);
});
it("matches aligned official features, preserves raw tags, and does not borrow crossing or ambiguous parallel restrictions", () => {
  const r = route({ highway: "path" }), checked = apply(r, [feature({ attributes: { kunstbaute: "900", belagsart: "200" } })]);
  assert.equal(checked.sections[0].mode, "carry"); assert.equal(checked.sections[0].tags.highway, "path");
  assert.equal(checked.sections[0].surface, "Other unpaved"); assert.equal(checked.topoCheck!.matchedMetres, 100);
  const crossing = feature({ lines: [[[8.399, 47.3005], [8.401, 47.3005]]], attributes: { objektart: "22" } });
  assert.equal(apply(r, [crossing]).blocked, false); assert.equal(apply(r, [crossing]).topoCheck!.matchedMetres, 0);
  const neighbour = feature({ id: "parallel", lines: [[[8.40001, 47.3], [8.40001, 47.301]]], attributes: { objektart: "22" } });
  assert.equal(apply(r, [feature(), neighbour]).blocked, false); assert.equal(apply(r, [feature(), neighbour]).topoCheck!.matchedMetres, 0);
  assert.equal(apply(r, [feature({ layer: TLM_HIKING, attributes: { hikingtype: "Alpinwanderweg" } })]).blocked, true);
  assert.equal(apply(r, [], false).topoCheck!.status, "partial");
});
it("retains short route bends and rejects invalid official geometry", () => {
  const bend = { lat: 47.3005, lon: 8.4002 };
  assert.deepEqual(simplifyTopoLine([a, bend, b]), [a, bend, b]);
  assert.throws(() => parseTopoReply({ invalid: true }));
  assert.equal(parseTopoReply({ results: [{ layerBodId: TLM_ROADS, geometry: { type: "LineString", coordinates: [[NaN, 4], [8, 47]] } }] }).length, 0);
});
it("avoids stairs on a bounded detour and compares distinct time, turn and traffic objectives", () => {
  const stairs = { ...route({ highway: "steps" }), minutes: 10, turnCount: 3 };
  const detour = { ...route(), minutes: 14, turnCount: 8 };
  assert.equal(chooseCyclingRoute([stairs, detour], "fastest")!.minutes, 14);
  assert.equal(chooseCyclingRoute([stairs, { ...detour, minutes: 25 }], "fastest")!.minutes, 10);
  const fast = { ...route({ highway: "primary", maxspeed: "80" }), minutes: 10, turnCount: 12 };
  const simple = { ...route({ highway: "residential" }), minutes: 12, turnCount: 4 };
  const quiet = { ...route(), minutes: 13, turnCount: 7, sections: route().sections.map(s => ({ ...s, infrastructure: "Separated cycleway" as const })) };
  assert.equal(chooseCyclingRoute([fast, simple, quiet], "fastest")!.minutes, 10);
  assert.equal(chooseCyclingRoute([fast, simple, quiet], "simplest")!.turnCount, 4);
  assert.equal(chooseCyclingRoute([fast, simple, quiet], "lower-stress")!.minutes, 13);
  assert.equal(chooseCyclingRoute([route({ highway: "via_ferrata" })], "fastest"), null);
});
it("bounds the server check, preserves partial results and reports outages instead of certifying access", async () => {
  const request = (points = [a, b]) => new Request("https://private.example/api/terrain", { method: "POST", body: JSON.stringify({ points }) });
  assert.equal((await handleSwisstopo(new Request("https://private.example/api/terrain"))).status, 405);
  assert.equal((await handleSwisstopo(request([{ lat: 0, lon: 0 }]))).status, 400);
  assert.equal((await handleSwisstopo(request(), async () => new Response("down", { status: 503 }))).status, 503);
  const raw = { featureId: "path", layerBodId: TLM_ROADS, properties: { objektart: 16 }, geometry: { type: "LineString", coordinates: [[8.4, 47.3], [8.4, 47.301]] } };
  const result = await handleSwisstopo(request(), async () => Response.json({ results: Array.from({ length: 200 }, () => raw) }));
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  const data = await result.json(); assert.equal(data.complete, false); assert.equal(data.features.length, 1);
});
it("an unavailable alternative or official check never erases an already usable cycling path", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => ++calls === 1 ? Response.json({ features: [{ geometry: { type: "LineString", coordinates: [[8.4, 47.3, 400], [8.4, 47.301, 400]] }, properties: { "total-time": 30, "track-length": 111 } }] }) : new Response("busy", { status: 429 });
  const client = new CyclingClient(new AbortController().signal, fetcher, 0, false, null, { flatSpeedKmh: 25, electricAssist: false }, "fastest", async () => new Response("down", { status: 503 }));
  const result = await client.route(a, b);
  assert.ok(result); assert.equal(result.topoCheck!.status, "unavailable"); assert.equal(result.alternativesChecked, 1);
});
it("recovers a disconnected station centroid at its nearby public anchor and includes the connector", async () => {
  const original = { id: "8503000", lat: 47.377847, lon: 8.540502 }, end = { lat: 47.3764, lon: 8.5481 };
  const calls: URL[] = [];
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input)); calls.push(url);
    if (calls.length === 1) return new Response("no track found at pass=0", { status: 400 });
    const [start] = url.searchParams.get("lonlats")!.split("|").map(p => p.split(",").map(Number));
    return Response.json({ features: [{ geometry: { type: "LineString", coordinates: [[...start, 400], [end.lon, end.lat, 400]] }, properties: { "total-time": 180, "track-length": 630 } }] });
  };
  const client = new CyclingClient(new AbortController().signal, fetcher, 0, false, null);
  const result = await client.route(original, end);
  assert.ok(result); assert.equal(calls.length, 2);
  assert.notEqual(calls[0].searchParams.get("lonlats"), calls[1].searchParams.get("lonlats"));
  assert.equal(result.from, original); assert.ok(result.startGapM > 20 && result.startGapM < 100);
  assert.ok(result.connectorMinutes > 0); assert.ok(result.minutes > 3);
});
