import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { amenityAccess, amenityDetails, amenityRestricted, amenityStyle, closestAmenity, OSM_AMENITY_API, OSM_AMENITY_QUERY, parseOsmAmenities, validAmenityData } from "./osmAmenities.ts";
import { parkingAlongRoute, parkingIndex } from "./parkingMap.ts";
import { loadAmenities, AmenityLoadError } from "./amenityClient.ts";
import { createAmenityHandler } from "../server/amenityHandler.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/water-toilets-osm.json", import.meta.url), "utf8"));
const node = (id: number, tags: Record<string, string>, lat = 47, lon = 8) => ({ type: "node", id, lat, lon, tags });
const parsed = (elements: unknown[]) => parseOsmAmenities({ elements }, "2026-09-29T12:00:00Z");
const request = () => new Request("https://planner.example/api/amenities/v1");

it("imports real Swiss water and toilet fixtures with stable OSM identities and source links", () => {
  const data = parseOsmAmenities(fixture);
  assert.equal(validAmenityData(data), true);
  assert.ok(data.facilities.some(f => f.categories.includes("water") && f.potable === "yes"));
  assert.ok(data.facilities.some(f => f.categories.includes("water") && f.potable === "no"));
  assert.ok(data.facilities.some(f => f.categories.includes("toilets") && f.tags.fee === "yes"));
  for (const f of data.facilities) assert.equal(f.url, `https://www.openstreetmap.org/${f.id.slice(4)}`);
});

it("never treats a decorative fountain, conditional water or a conflicting negative as drinking water", () => {
  const data = parsed([
    node(1, { amenity: "fountain" }), node(2, { amenity: "drinking_water" }),
    node(3, { amenity: "drinking_water", drinking_water: "no" }),
    node(4, { amenity: "drinking_water", drinking_water: "conditional" }),
    node(5, { amenity: "fountain", drinking_water: "yes", "drinking_water:legal": "no" }),
    node(6, { man_made: "drinking_fountain" }), node(7, { amenity: "fountain", drinking_water: "boil" }),
  ]);
  assert.deepEqual(data.facilities.map(f => f.potable), ["unknown", "yes", "no", "unknown", "unknown", "yes", "unknown"]);
  assert.match(amenityDetails(data.facilities[4], "water").join(" "), /No drinking water/);
  assert.equal(closestAmenity([data.facilities[0], data.facilities[2], data.facilities[4]], { lat: 47, lon: 8 }, "water"), null);
});

it("retains one identity for a place providing both services and supports ways and relations", () => {
  const both = node(1, { amenity: "toilets", drinking_water: "yes", fee: "no" });
  const data = parsed([both, both, { type: "way", id: 2, center: { lat: 47, lon: 8 }, tags: { amenity: "fountain" } },
    { type: "relation", id: 3, center: { lat: 47, lon: 8 }, tags: { amenity: "toilets" } }]);
  assert.equal(data.facilities.length, 3);
  assert.deepEqual(data.facilities[0].categories, ["water", "toilets"]);
  assert.equal(data.facilities[1].area, true); assert.equal(data.facilities[2].area, true);
  assert.match(amenityDetails(data.facilities[1], "water").join(" "), /entrance not verified/);
});

it("excludes inactive or invalid records and rejects partial upstream responses", () => {
  const data = parsed([node(1, { amenity: "toilets" }), node(2, { amenity: "fountain", disused: "yes" }),
    node(3, { amenity: "drinking_water", "disused:amenity": "drinking_water" }),
    node(4, { amenity: "toilets", abandoned: "yes" }), node(5, { amenity: "toilets" }, 91),
    node(-1, { amenity: "fountain" }), node(7, { amenity: "cafe" }), null]);
  assert.deepEqual(data.facilities.map(f => f.id), ["osm:node/1"]);
  assert.throws(() => parseOsmAmenities({ elements: fixture.elements, remark: "Query timed out" }), /Incomplete/);
  assert.equal(parseOsmAmenities({ elements: [], osm3s: { timestamp_osm_base: "117369" } }).updatedAt, undefined);
});

it("retains seasonal, fee, hours, bottle-filling and accessibility evidence without claiming current opening", () => {
  const [water, toilet] = parsed([
    node(1, { amenity: "drinking_water", seasonal: "yes", bottle: "yes", opening_hours: "Apr-Oct", fee: "no" }),
    node(2, { amenity: "toilets", access: "yes", fee: "yes", charge: "1 CHF", wheelchair: "yes", changing_table: "yes", opening_hours: "Mo-Fr 08:00-18:00" }),
  ]).facilities;
  assert.match(amenityDetails(water, "water").join(" "), /Seasonal operation: yes/);
  assert.match(amenityDetails(water, "water").join(" "), /Bottle filling mapped/);
  assert.match(amenityDetails(toilet, "toilets").join(" "), /not checked for arrival/);
  assert.match(amenityDetails(toilet, "toilets").join(" "), /Wheelchair access: yes/);
  assert.match(amenityDetails(toilet, "toilets").join(" "), /Fee applies/);
});

it("keeps unknown access distinct and excludes private, customer, key and closed facilities from closest", () => {
  const data = parsed([node(1, { amenity: "toilets", access: "private" }), node(2, { amenity: "toilets", access: "customers" }),
    node(3, { amenity: "toilets", access: "yes", centralkey: "eurokey" }),
    node(4, { amenity: "toilets", opening_hours: "closed" }), node(5, { amenity: "toilets" }, 47, 8.001),
    node(6, { amenity: "toilets", access: "yes" }, 47, 8.002)]);
  assert.ok(data.facilities.slice(0, 4).every(f => amenityRestricted(f, "toilets")));
  assert.equal(amenityAccess(data.facilities[4], "toilets"), "Access conditions not supplied");
  assert.equal(amenityStyle(data.facilities[4], "toilets").label, "Access unknown");
  assert.equal(closestAmenity(data.facilities, { lat: 47, lon: 8 }, "toilets")?.facility.id, "osm:node/5");
});

it("applies service-specific access and does not select unconfirmed water even if it is closer", () => {
  const data = parsed([node(1, { amenity: "fountain" }), node(2, { amenity: "drinking_water", access: "private" }),
    node(3, { amenity: "toilets", drinking_water: "yes", access: "yes", "drinking_water:access": "customers" }),
    node(4, { amenity: "drinking_water" }, 47, 8.002)]);
  assert.equal(amenityRestricted(data.facilities[2], "water"), true);
  assert.equal(amenityRestricted(data.facilities[2], "toilets"), false);
  assert.equal(closestAmenity(data.facilities, { lat: 47, lon: 8 }, "water")?.facility.id, "osm:node/4");
  assert.equal(closestAmenity(data.facilities, null, "water"), null);
});

it("uses the same corridor for water and toilets and updates the eligible nearest result", () => {
  const data = parsed([node(1, { amenity: "drinking_water" }, 47.002, 8), node(2, { amenity: "drinking_water" }, 47, 8.01),
    node(3, { amenity: "toilets" }, 47, 8.011), node(4, { amenity: "toilets" }, 47.02, 8.01)]);
  const index = parkingIndex(data.facilities), scope = { key: "journey", incomplete: false, segments: [[{ lat: 47, lon: 8 }, { lat: 47, lon: 8.02 }]] as const };
  const visible = parkingAlongRoute(index, { ...scope, segments: [...scope.segments] });
  assert.deepEqual(visible.map(f => f.id), ["osm:node/2", "osm:node/3"]);
  assert.equal(closestAmenity(visible, { lat: 47, lon: 8 }, "water")?.facility.id, "osm:node/2");
  assert.equal(closestAmenity(visible, { lat: 47, lon: 8 }, "toilets")?.facility.id, "osm:node/3");
});

it("shares and caches one fixed regional request without forwarding caller queries", async () => {
  const handler = createAmenityHandler(); let calls = 0;
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++; assert.equal(url, OSM_AMENITY_API); assert.equal(init?.method, "POST");
    assert.equal(new URLSearchParams(init?.body as URLSearchParams).get("data"), OSM_AMENITY_QUERY);
    return Response.json(fixture);
  };
  const replies = await Promise.all([handler(request(), fetcher), handler(new Request(request().url + "?query=arbitrary"), fetcher)]);
  assert.equal(calls, 1); assert.ok(replies.every(r => r.status === 200));
  assert.equal(replies[0].headers.get("Cache-Control"), "private, no-store");
  assert.equal((await replies[0].json()).schema, 1);
  await handler(request(), fetcher); assert.equal(calls, 1);
  assert.equal((await handler(new Request(request().url, { method: "POST" }), fetcher)).status, 405);
  assert.equal((await handler(new Request("https://planner.example/api/amenities/other"), fetcher)).status, 404);
});

it("returns bounded stale data, cools down failures, and refuses expired fallback", async () => {
  let now = Date.parse("2026-09-29T12:00:00Z"), calls = 0;
  const handler = createAmenityHandler({ now: () => now });
  const fetcher = async () => { calls++; return calls === 1 ? Response.json(fixture) : new Response("Down", { status: 503 }); };
  assert.equal((await handler(request(), fetcher)).status, 200);
  now += 24 * 60 * 60_000 + 1;
  assert.equal((await (await handler(request(), fetcher)).json()).stale, true); assert.equal(calls, 2);
  await handler(request(), fetcher); assert.equal(calls, 2);
  now += 8 * 24 * 60 * 60_000;
  const unavailable = await handler(request(), fetcher);
  assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get("Retry-After"), "60");
});

it("rejects cache/schema contamination and oversized or partial upstream data", async () => {
  let calls = 0;
  const wrong = { ...parseOsmAmenities(fixture), schema: 2 };
  const cache = { match: async () => Response.json(wrong), put: async () => {} } as unknown as Cache;
  const handler = createAmenityHandler({ cache });
  const response = await handler(request(), async () => { calls++; return Response.json(fixture); });
  assert.equal(response.status, 200); assert.equal(calls, 1);
  for (const result of [Response.json({ elements: fixture.elements, remark: "Timeout" }),
    new Response("{}", { headers: { "Content-Length": String(17 * 1024 * 1024) } })]) {
    assert.equal((await createAmenityHandler()(request(), async () => result)).status, 503);
  }
  const valid = parseOsmAmenities(fixture); valid.facilities[0].url = "javascript:alert(1)";
  assert.equal(validAmenityData(valid), false);
});

it("the client uses the versioned source, bypasses browser caching and validates the response", async () => {
  const data = parseOsmAmenities(fixture);
  const result = await loadAmenities(new AbortController().signal, async (url, init) => {
    assert.equal(url, "/api/amenities/v1"); assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin");
    return Response.json(data);
  });
  assert.deepEqual(result, JSON.parse(JSON.stringify(data)));
});

it("the client exposes sign-in, access and cooldown failures without automatic repeats", async () => {
  for (const [status, type, code] of [[401, "application/json", "session"], [200, "text/html", "session"], [403, "application/json", "access"], [503, "application/json", "source"]] as const) {
    let calls = 0;
    await assert.rejects(loadAmenities(new AbortController().signal, async () => { calls++; return new Response("{}", { status, headers: { "Content-Type": type, "Retry-After": "60" } }); }),
      (error: unknown) => error instanceof AmenityLoadError && error.code === code);
    assert.equal(calls, 1);
  }
});

it("the client retries malformed/transient replies once and respects an aborted selection", async () => {
  const data = parseOsmAmenities(fixture); let calls = 0;
  const result = await loadAmenities(new AbortController().signal, async () => { calls++; return Response.json(calls === 1 ? { schema: 1, facilities: [] } : data); }, { retryDelayMs: 0 });
  assert.equal(calls, 2); assert.equal(result.facilities.length, data.facilities.length);
  calls = 0;
  await assert.rejects(loadAmenities(new AbortController().signal, async () => { calls++; throw new TypeError("Network failed"); }, { retryDelayMs: 0 }));
  assert.equal(calls, 2);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadAmenities(controller.signal, async () => { throw new Error("Must not fetch"); }), { name: "AbortError" });
});

it("the client deadline includes a stalled response body", async () => {
  let calls = 0;
  await assert.rejects(loadAmenities(new AbortController().signal, async (_url, init) => {
    calls++;
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode('{"schema":'));
      init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
    } }), { headers: { "Content-Type": "application/json" } });
  }, { timeoutMs: 10 }), (error: unknown) => error instanceof AmenityLoadError && error.code === "timeout");
  assert.equal(calls, 1);
});

it("serves a bounded stale edge dataset before a slow background refresh finishes", async () => {
  let now = Date.parse("2026-10-09T12:00:00Z");
  const handler = createAmenityHandler({ now: () => now });
  await handler(request(), async () => Response.json(fixture));
  now += 2 * 86_400_000;
  let finish!: (response: Response) => void;
  const work: Promise<unknown>[] = [];
  const response = await handler(request(), () => new Promise<Response>(resolve => { finish = resolve; }), task => work.push(task));
  assert.equal((await response.json()).stale, true); assert.equal(work.length, 1);
  finish(Response.json(fixture)); await Promise.all(work);
  const fresh = await handler(request(), async () => { throw new Error("Fresh cache should be reused"); });
  assert.equal((await fresh.json()).stale, false);
});
