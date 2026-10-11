import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OFFICIAL_ROUTE_LAYER, OFFICIAL_CLOSURE_LAYER, officialBounds, officialSections, parseOfficialRoutes, parseOfficialClosures, lineMatch, lineKm, officialGuides, overlapsClosure, type OfficialRoute, type OfficialClosure, type OfficialClosureReply } from "./officialCycling.ts";
import { createOfficialCyclingHandler } from "../server/officialCyclingHandler.ts";
import { checkOfficialOption, applyOfficialOption } from "./officialCyclingClient.ts";
import { detourStages } from "./cyclingDetour.ts";
import { zeroCycling, type CyclingRoute } from "./cycling.ts";
import { DEFAULT_OPTIONS } from "./model.ts";
import type { EditContext } from "./cyclingEditor.ts";
import type { Point, Place } from "./routing.ts";

const p = (lon: number, lat = 47): Place => ({ lon, lat, label: String(lon) });
const line = [p(8), p(8.01), p(8.02), p(8.03)];
const raw = (points = line) => ({ type: "Feature", layerBodId: OFFICIAL_ROUTE_LAYER, featureId: "32.02",
  geometry: { type: "MultiLineString", coordinates: [points.map(p => [p.lon, p.lat])] },
  properties: { chmobil_title: "Rhein–Hirzel–Linth", chmobil_route_number: 32, chmobil_has_segment: true } });
const now = () => new Date().toISOString();
const official = (): OfficialRoute => parseOfficialRoutes({ results: [raw()] }, now()).routes[0];
const closure = (points: Point[], kind: "closed_way" | "detour" = "closed_way"): OfficialClosure => ({ id: "1", kind, parts: [points], duration: "until further notice", url: "https://map.geo.admin.ch/" });
const request = (kind = "routes", bounds = [7.98, 46.98, 8.04, 47.02]) => new Request("https://planner.example/api/official-cycling", { method: "POST", body: JSON.stringify({ kind, bounds }) });
function road(from: Point, to: Point, points: Point[], minutes: number): CyclingRoute {
  let m = 0;
  const geometry = points.map((p, i) => { if (i) m += lineKm([points[i - 1], p]) * 1000; return { ...p, distanceM: m, elevationM: 400 }; });
  return { ...zeroCycling(from, to), points: geometry, elevation: geometry, source: "BRouter", minutes, distanceKm: m / 1000, ridingSeconds: minutes * 60 };
}
function setup() {
  const from = p(7.998), to = p(8.032), start = new Date("2026-10-12T08:00:00Z"), route = road(from, to, [from, to], 20);
  const context: EditContext = { journey: null, cycling: { minutes: 20, distanceKm: route.distanceKm, arrival: new Date(+start + 20 * 60_000), routes: [route] },
    origin: from, destination: to, start, options: { ...DEFAULT_OPTIONS, maxBikeMinutes: 60 } };
  const stage = detourStages(null, context.cycling, from, to, start)[0], section = officialSections([official()], from, to)[0];
  const client = { guidedRoute: async () => road(line[0], line.at(-1)!, line, 25), route: async (a: Point, b: Point) => road(a, b, [a, b], 2) };
  const closures = async (): Promise<OfficialClosureReply> => ({ closures: [], incomplete: false, checkedAt: now() });
  return { context, stage, section, client, closures, signal: new AbortController().signal };
}
test("official API preserves multipart geometry, identity, source title and canonical unpadded links", () => {
  const feature = raw(); feature.geometry.coordinates.push([[8.5, 47.2], [8.51, 47.2]]);
  const parsed = parseOfficialRoutes({ results: [feature] }, now());
  assert.equal(parsed.routes[0].parts.length, 2); assert.equal(parsed.routes[0].url, "https://schweizmobil.ch/en/cycling-in-switzerland/route-32/stage-2");
  assert.equal(parsed.incomplete, false); assert.equal(parseOfficialRoutes({ results: [feature] }, now(), 1).incomplete, true);
});
test("malformed identities and geometry become explicit partial coverage", () => {
  for (const change of [{ layerBodId: "hiking" }, { featureId: "../../bad" }, { geometry: { type: "LineString", coordinates: [[0, 0], [8, 47]] } },
    { properties: { chmobil_route_number: "32", chmobil_title: "bad" } }]) {
    const reply = parseOfficialRoutes({ results: [{ ...raw(), ...change }] }, now()); assert.equal(reply.routes.length, 0); assert.equal(reply.incomplete, true);
  }
  assert.throws(() => parseOfficialRoutes({}, now()));
});
test("suggestions follow a connected portion toward the destination in either orientation", () => {
  const route = official(), forward = officialSections([route], p(7.999), p(8.029))[0], reverse = officialSections([route], p(8.029), p(7.999))[0];
  assert.ok(forward.points[0].lon < forward.points.at(-1)!.lon); assert.ok(reverse.points[0].lon > reverse.points.at(-1)!.lon);
  assert.ok(forward.distanceKm > 2); assert.equal(officialSections([route], p(8.2), p(8.3)).length, 0);
  assert.equal(officialSections([{ ...route, parts: [[p(8), p(8.001)], [p(8.029), p(8.03)]] }], p(8), p(8.03)).length, 0);
});
test("shortlist is bounded to three distinct routes and does not bridge disconnected parts", () => {
  const routes = Array.from({ length: 8 }, (_, n) => ({ ...official(), id: String(n + 1), number: n + 1 }));
  const found = officialSections([...routes, routes[0]], p(7.999), p(8.031)); assert.equal(found.length, 3); assert.equal(new Set(found.map(r => r.route.number)).size, 3);
});
test("two-way overlap rejects shortcut geometry and samples long segments", () => {
  const curved = [p(8), p(8.01, 47.01), p(8.02)];
  assert.ok(lineMatch(curved, curved) > .999); assert.ok(lineMatch([curved[0], curved[2]], curved) < .5);
  assert.ok(lineMatch(line, [line[0], line.at(-1)!]) > .999);
  const dense = Array.from({ length: 200 }, (_, i) => p(8 + i / 10000, 47 + Math.sin(i / 10) / 1000));
  const guides = officialGuides(dense); assert.ok(guides.length <= 50); assert.equal(guides[0], dense[0]); assert.equal(guides.at(-1), dense.at(-1));
});
test("closure machine role, not translated label, controls rejection including a short crossing", () => {
  const f = { ...raw(), layerBodId: OFFICIAL_CLOSURE_LAYER, featureId: "abc-1", properties: { sperrungen_type: "detour", sperrungen_type_en: "Closure with detour", duration_en: "until further notice" } };
  assert.equal(parseOfficialClosures({ results: [f] }, now()).closures[0].kind, "detour");
  const crossing = [p(8.015, 46.9998), p(8.015, 47.0002)];
  assert.equal(overlapsClosure([line], [closure(crossing, "detour")]), undefined); assert.ok(overlapsClosure([line], [closure(crossing)]));
  assert.equal(overlapsClosure([line], [closure([p(8, 47.1), p(8.03, 47.1)])]), undefined);
  assert.equal(parseOfficialClosures({ results: [{ ...f, properties: { sperrungen_type: "unrecognized" } }] }, now()).incomplete, true);
});
test("search areas are rounded outward, Swiss-only and bounded", () => {
  const b = officialBounds([p(8.003, 47.003), p(8.019, 47.019)]); assert.ok(b[0] < 8.003 && b[2] > 8.019);
  assert.throws(() => officialBounds([p(0)]), /Switzerland/);
  assert.throws(() => officialBounds([p(6, 46), p(10, 47)]), /shorter/);
});
test("server uses fixed layer URLs, coalesces duplicate requests and respects cache ages", async () => {
  let time = Date.now(), calls = 0; const handler = createOfficialCyclingHandler(() => time);
  const fetcher: typeof fetch = async (url, init) => { calls++; const u = new URL(String(url)); assert.equal(u.hostname, "api3.geo.admin.ch"); assert.equal(u.searchParams.get("returnGeometry"), "true"); assert.ok(init?.signal);
    return Response.json({ results: u.searchParams.get("layers")!.includes("sperrungen") ? [] : [raw()] }); };
  const [a, b] = await Promise.all([handler(request(), fetcher), handler(request(), fetcher)]); assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(calls, 1);
  await handler(request(), fetcher); assert.equal(calls, 1); time += 86400001; await handler(request(), fetcher); assert.equal(calls, 2);
  await handler(request("closures"), fetcher); time += 900001; await handler(request("closures"), fetcher); assert.equal(calls, 4);
});
test("server rejects injection, oversized bodies and unavailable/malformed upstream data", async () => {
  const handler = createOfficialCyclingHandler(), never: typeof fetch = async () => { assert.fail("No upstream call"); };
  for (const req of [request("https://attacker.invalid"), request("routes", [0, 0, 1, 1]), new Request("https://p/api/official-cycling", { method: "POST", body: "x".repeat(1025) })]) assert.equal((await handler(req, never)).status, 400);
  assert.equal((await handler(new Request("https://p/api/official-cycling"), never)).status, 405);
  assert.equal((await handler(request(), async () => new Response("no", { status: 500 }))).status, 503);
  assert.equal((await handler(request(), async () => Response.json({ notResults: [] }))).status, 503);
});
test("checked official section preserves the original journey and adds attributed evidence", async () => {
  const s = setup(), before = JSON.stringify(s.context); const checked = await checkOfficialOption(s.context, s.stage, s.section, s.client, s.signal, s.closures);
  assert.equal(checked.minutes, 29); assert.equal(checked.edit.cycling!.routes!.length, 3); assert.equal(checked.routes[1].officialRoute?.number, 32);
  assert.equal(JSON.stringify(s.context), before); assert.ok(checked.routes[1].officialRoute!.matchedPercent >= 95);
});
test("applying a preview rechecks changed cycling limits and closure age", async () => {
  const s = setup(), checked = await checkOfficialOption(s.context, s.stage, s.section, s.client, s.signal, s.closures);
  assert.throws(() => applyOfficialOption({ ...s.context, options: { ...s.context.options, maxBikeMinutes: 28 } }, s.stage, checked), /cycling limit/);
  for (const checkedAt of ["invalid", new Date(Date.now() - 31 * 60000).toISOString(), new Date(Date.now() + 5 * 60000).toISOString()])
    assert.throws(() => applyOfficialOption(s.context, s.stage, { ...checked, checkedAt }), /expired/);
  assert.equal(applyOfficialOption(s.context, s.stage, checked).cycling?.minutes, 29);
});
test("options respect cycling maximum, minimum, arrival window and fail closed on closure uncertainty", async () => {
  const s = setup();
  for (const options of [{ maxBikeMinutes: 28 }, { minBikeMinutes: 30, maxBikeMinutes: 60 }, { horizonMinutes: 25 }]) {
    await assert.rejects(checkOfficialOption({ ...s.context, options: { ...s.context.options, ...options } }, s.stage, s.section, s.client, s.signal, s.closures));
  }
  for (const reply of [{ closures: [], incomplete: true, checkedAt: now() }, { closures: [], incomplete: false, checkedAt: "2026-01-01T00:00:00Z" },
    { closures: [closure([p(8.015, 46.9998), p(8.015, 47.0002)])], incomplete: false, checkedAt: now() }])
    await assert.rejects(checkOfficialOption(s.context, s.stage, s.section, s.client, s.signal, async () => reply), /closure|Closure/);
});
test("partial connectors, divergent paths, stale selections and cancellation never yield an applicable edit", async () => {
  const s = setup();
  await assert.rejects(checkOfficialOption(s.context, s.stage, s.section, { ...s.client, route: async () => null }, s.signal, s.closures), /connection/);
  await assert.rejects(checkOfficialOption(s.context, s.stage, s.section, { ...s.client, guidedRoute: async () => road(line[0], line.at(-1)!, [line[0], p(8.015, 47.02), line.at(-1)!], 30) }, s.signal, s.closures), /diverges/);
  await assert.rejects(checkOfficialOption(s.context, { ...s.stage, route: { ...s.stage.route } }, s.section, s.client, s.signal, s.closures), /changed/);
  const c = new AbortController(); c.abort(); await assert.rejects(checkOfficialOption(s.context, s.stage, s.section, s.client, c.signal, s.closures), { name: "AbortError" });
});

test("recorded Zürich Route32 section has a close match and cannot be replaced by its endpoint chord", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/official-cycling-2026-10-11/route32-section.json", import.meta.url), "utf8"));
  assert.ok(lineMatch(fixture.section, fixture.road) >= .95); assert.ok(lineMatch(fixture.road, fixture.section) >= .95);
  assert.ok(lineMatch(fixture.section, [fixture.section[0], fixture.section.at(-1)]) < .5);
});

test("mixed journey official option keeps its exact train and rejects a missed boarding", async () => {
  const s = setup(), station = s.context.destination, finish = p(8.06), start = s.context.start;
  const transit = { mode: "transit" as const, from: station.label, to: finish.label, fromId: "8503000", toId: "8503016", fromPoint: station, toPoint: finish,
    departure: new Date(+start + 40 * 60000), arrival: new Date(+start + 65 * 60000), departurePlatform: null, arrivalPlatform: null, service: "S test", serviceName: null, direction: null };
  const journey = { id: "fixed-train", startTime: start, originStation: { ...station, id: "8503000", name: station.label, bikeMinutes: 20, distanceKm: s.stage.route.distanceKm, cyclingRoute: s.stage.route },
    destinationStation: { ...finish, id: "8503016", name: finish.label, bikeMinutes: 0, distanceKm: 0 }, departure: transit.departure, arrival: transit.arrival, trainMinutes: 25, waitMinutes: 20, totalMinutes: 65, changes: 0, services: ["S test"], transitLegs: [transit] };
  const context: EditContext = { ...s.context, journey, cycling: null, destination: finish, options: { ...s.context.options, maxAccessMinutes: 60 } };
  const stage = detourStages(journey, null, context.origin, finish, start)[0];
  const result = await checkOfficialOption(context, stage, s.section, s.client, s.signal, s.closures);
  assert.equal(result.edit.journey!.transitLegs.find(l => l.mode === "transit"), transit); assert.equal(+result.edit.journey!.arrival, +journey.arrival);
  await assert.rejects(checkOfficialOption(context, stage, s.section, { ...s.client, guidedRoute: async () => road(line[0], line.at(-1)!, line, 39) }, s.signal, s.closures), /miss/);
});
