import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { amenityDetails, amenityRestricted, amenityStyle, closestAmenity, OSM_AMENITY_API, parseOsmAmenities, validAmenityData } from "./osmAmenities.ts";
import { mergeFoodData, OSM_SERVICE_QUERIES, SERVICE_FILTERS, serviceKinds, serviceLinks, serviceMatches, type ServiceDataset } from "./osmServices.ts";
import { clusterAmenities } from "./amenityClusters.ts";
import { parkingAlongRoute, parkingIndex } from "./parkingMap.ts";
import { createAmenityHandler, handleServices } from "../server/amenityHandler.ts";
import { loadAmenities, AmenityLoadError } from "./amenityClient.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/repair-food-osm.json", import.meta.url), "utf8"));
const node = (id: number, tags: Record<string, string>, lat = 47, lon = 8) => ({ type: "node", id, lat, lon, tags });
const parse = (elements: unknown[], dataset: ServiceDataset = "repairs") => parseOsmAmenities({ elements }, "2026-09-29T21:00:00Z", dataset);
const req = (dataset: ServiceDataset) => new Request(`https://planner.example/api/services/v1/${dataset}`);

it("retains real Swiss shops, DIY workshops, pump-only facilities and source evidence without inventing repairs", () => {
  const data = parseOsmAmenities(fixture, undefined, "repairs");
  assert.equal(validAmenityData(data, "repairs"), true);
  const shop = data.facilities.find(f => f.id === "osm:node/248003886")!;
  assert.ok(serviceKinds(shop.tags, "repairs").includes("shop"));
  assert.equal(serviceKinds(shop.tags, "repairs").includes("mechanic"), false);
  assert.match(amenityDetails(shop, "repairs").join(" "), /Repair service: unknown/);
  const pump = data.facilities.find(f => f.id === "osm:node/1493778334")!;
  assert.deepEqual(serviceKinds(pump.tags, "repairs"), ["pump"]);
  const diy = data.facilities.find(f => f.id === "osm:node/6328798483")!;
  assert.ok(serviceKinds(diy.tags, "repairs").includes("diy"));
  assert.match(amenityDetails(diy, "repairs").join(" "), /whether staff do the repair or guide/);
  assert.equal(data.facilities.some(f => f.id === "osm:node/107459322"), false); // Scuba compressed air.
});

it("requires bicycle evidence for generic air and honours explicit negative service information", () => {
  for (const tags of [{ amenity: "compressed_air" }, { amenity: "compressed_air", valves: "schrader" },
    { amenity: "compressed_air", valves: "presta", bicycle: "no" }, { amenity: "compressed_air", bicycle: "yes", "service:bicycle:pump": "no" }]) {
    assert.equal(serviceKinds(tags, "repairs").includes("pump"), false);
  }
  assert.deepEqual(serviceKinds({ amenity: "compressed_air", valves: "schrader; sclaverand" }, "repairs"), ["pump"]);
  assert.equal(serviceKinds({ shop: "bicycle", repair: "yes", "service:bicycle:repair": "no" }, "repairs").includes("mechanic"), false);
});

it("requires explicit food-machine contents and keeps quick food separate from optional dining", () => {
  const input = [node(1, { amenity: "vending_machine", vending: "bicycle_tube" }), node(2, { amenity: "vending_machine" }),
    node(3, { amenity: "vending_machine", vending: "tickets; snacks; drinks" }), node(4, { shop: "farm" }),
    node(5, { amenity: "cafe" }), node(6, { amenity: "restaurant" }), node(7, { shop: "bakery", amenity: "cafe" }),
    node(8, { amenity: "vending_machine", vending: "dog_food; drinkware" })];
  const quick = parse(input, "food"), dining = parse(input, "food-dining");
  assert.deepEqual(quick.facilities.map(f => f.id), ["osm:node/3", "osm:node/4", "osm:node/7"]);
  assert.deepEqual(dining.facilities.map(f => f.id), ["osm:node/5", "osm:node/6", "osm:node/7"]);
  assert.match(amenityDetails(quick.facilities[1], "food").join(" "), /ready-to-eat snacks and stock are unknown/);
  assert.ok(SERVICE_FILTERS.food.filter(f => f.default).every(f => !["cafe", "restaurant"].includes(f.kind)));
});

it("uses stable identities for area centres, drops inactive services and validates each dataset separately", () => {
  const area = { type: "way", id: 1, center: { lat: 47, lon: 8 }, tags: { shop: "bakery" } };
  const data = parse([area, area, node(2, { shop: "bakery", "disused:shop": "bakery" }), node(3, { shop: "bakery" }, 100)], "food");
  assert.equal(data.facilities.length, 1); assert.equal(data.facilities[0].area, true);
  assert.equal(data.facilities[0].url, "https://www.openstreetmap.org/way/1");
  assert.equal(validAmenityData(data, "food"), true);
  assert.equal(validAmenityData(data), false); assert.equal(validAmenityData(data, "repairs"), false);
  assert.equal(validAmenityData({ ...data, dataset: "food-dining" }, "food-dining"), false);
});

it("closest food allows ordinary customers but excludes private, conditional, locked and closed places", () => {
  const data = parse([node(1, { shop: "bakery", access: "private" }), node(2, { shop: "bakery", locked: "yes" }),
    node(3, { shop: "bakery", opening_hours: "off" }), node(4, { shop: "bakery", "access:conditional": "yes @ (Mo-Fr)" }),
    node(5, { shop: "bakery", access: "customers", opening_hours: "Mo-Fr 08:00-18:00", fee: "no" }, 47, 8.001),
    node(6, { shop: "bakery" }, 47, 8.002)], "food");
  assert.ok(data.facilities.slice(0, 4).every(f => amenityRestricted(f, "food")));
  const closest = closestAmenity(data.facilities, { lat: 47, lon: 8 }, "food")!;
  assert.equal(closest.facility.id, "osm:node/5");
  assert.match(amenityDetails(closest.facility, "food").join(" "), /not checked for arrival/);
  assert.doesNotMatch(amenityDetails(closest.facility, "food").join(" "), /free of charge/);
});

it("a broken pump or closed workshop cannot win that subtype's closest search while other services remain usable", () => {
  const data = parse([node(1, { shop: "bicycle", "service:bicycle:pump": "yes", "service:bicycle:pump:operational_status": "broken", "service:bicycle:repair": "yes", "opening_hours:workshop": "closed" }),
    node(2, { "service:bicycle:pump": "yes" }, 47, 8.002), node(3, { "service:bicycle:repair": "yes" }, 47, 8.003)]);
  assert.equal(closestAmenity(data.facilities, { lat: 47, lon: 8 }, "repairs", ["pump"])?.facility.id, "osm:node/2");
  assert.equal(closestAmenity(data.facilities, { lat: 47, lon: 8 }, "repairs", ["mechanic"])?.facility.id, "osm:node/3");
  assert.equal(closestAmenity(data.facilities, { lat: 47, lon: 8 }, "repairs", ["shop"])?.facility.id, "osm:node/1");
  assert.equal(amenityStyle(data.facilities[0], "repairs", ["pump"]).label, "Restricted / unavailable");
  assert.equal(closestAmenity(data.facilities, { lat: 47, lon: 8 }, "repairs", []), null);
});

it("widens route proximity without changing geometry or mixing subtypes into closest results", () => {
  const data = parse([node(1, { "service:bicycle:pump": "yes" }, 47.0004), node(2, { shop: "bicycle" }, 47.004),
    node(3, { "service:bicycle:pump": "yes" }, 47.008), node(4, { "service:bicycle:pump": "yes" }, 47.02)]);
  const scope = { key: "selected", incomplete: false, segments: [[{ lat: 47, lon: 8 }, { lat: 47, lon: 8.01 }]] as [{ lat: number; lon: number }, { lat: number; lon: number }][] };
  const index = parkingIndex(data.facilities);
  assert.equal(parkingAlongRoute(index, scope, 100).length, 1);
  assert.equal(parkingAlongRoute(index, scope, 500).length, 2);
  const wide = parkingAlongRoute(index, scope, 1000);
  assert.equal(wide.length, 3); assert.equal(wide.filter(f => serviceMatches(f, "repairs", ["pump"])).length, 2);
  assert.equal(closestAmenity(wide, { lat: 47.004, lon: 8 }, "repairs", ["pump"])?.facility.id, "osm:node/1");
});

it("clusters retain every source record and do not alter closest ranking", () => {
  const data = parse([node(1, { shop: "bicycle" }), node(2, { shop: "bicycle" }, 47, 8.0001), node(3, { shop: "bicycle" }, 47, 8.1)]);
  const clustered = clusterAmenities(data.facilities, f => ({ x: f.lon * 1000, y: f.lat * 1000 }));
  assert.equal(clustered.length, 2);
  assert.deepEqual(clustered.flatMap(group => group.facilities).map(f => f.id).sort(), data.facilities.map(f => f.id).sort());
  assert.equal(closestAmenity(data.facilities, { lat: 47, lon: 8.0001 }, "repairs")?.facility.id, "osm:node/2");
});

it("merges quick and optional food by identity, retains the newer record and discloses stale input", () => {
  const quick = parse([node(1, { shop: "bakery", amenity: "cafe", name: "Older" }), node(2, { shop: "farm" })], "food");
  const dining = parse([node(1, { shop: "bakery", amenity: "cafe", name: "Newer" }), node(3, { amenity: "restaurant" })], "food-dining");
  dining.fetchedAt = "2026-09-29T22:00:00Z"; quick.stale = true;
  const merged = mergeFoodData(quick, dining)!;
  assert.equal(merged.facilities.length, 3); assert.equal(merged.facilities[0].name, "Newer");
  assert.equal(merged.stale, true); assert.equal(merged.fetchedAt, quick.fetchedAt);
  assert.equal(mergeFoodData(undefined, dining)?.facilities.length, 2);
  assert.equal(mergeFoodData(quick)?.facilities.length, 2); assert.equal(mergeFoodData(), undefined);
});

it("contact links accept ordinary websites and phone numbers and reject executable or malformed values", () => {
  assert.deepEqual(serviceLinks({ website: "www.example.ch", phone: "+41 44 123 45 67" }), [{ label: "Website", href: "https://www.example.ch/" }, { label: "Call", href: "tel:+41441234567" }]);
  for (const website of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/test", "https://user:pass@example.ch"]) assert.deepEqual(serviceLinks({ website }), []);
  assert.deepEqual(serviceLinks({ phone: "------" }), []);
});

it("independent handlers share in-flight requests, use fixed queries and do not let a food failure block repairs", async () => {
  const repairs = createAmenityHandler({ dataset: "repairs" }), food = createAmenityHandler({ dataset: "food" });
  let calls = 0;
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++; assert.equal(url, OSM_AMENITY_API);
    const query = new URLSearchParams(init?.body as URLSearchParams).get("data");
    return query === OSM_SERVICE_QUERIES.repairs ? Response.json(fixture) : new Response("Unavailable", { status: 503 });
  };
  const [a, b, c] = await Promise.all([repairs(req("repairs"), fetcher), repairs(new Request(req("repairs").url + "?query=arbitrary&lat=99"), fetcher), food(req("food"), fetcher)]);
  assert.deepEqual([a.status, b.status, c.status], [200, 200, 503]); assert.equal(calls, 2);
  assert.equal((await repairs(req("repairs"), fetcher)).status, 200); assert.equal(calls, 2);
  assert.equal((await handleServices(new Request("https://planner.example/api/services/v1/anything"), fetcher)).status, 404);
  assert.doesNotMatch(OSM_SERVICE_QUERIES.food, /cafe|restaurant/); assert.match(OSM_SERVICE_QUERIES["food-dining"], /cafe/);
});

it("the service client selects the exact dataset endpoint and rejects a cross-category cache reply", async () => {
  for (const dataset of ["repairs", "food", "food-dining"] as const) {
    const data = parseOsmAmenities(fixture, undefined, dataset);
    const result = await loadAmenities(new AbortController().signal, async (url, init) => {
      assert.equal(url, `/api/services/v1/${dataset}`); assert.equal(init?.cache, "no-store"); return Response.json(data);
    }, { dataset });
    assert.equal(result.dataset, dataset);
  }
  let calls = 0;
  await assert.rejects(loadAmenities(new AbortController().signal, async () => { calls++; return Response.json(parseOsmAmenities(fixture, undefined, "repairs")); }, { dataset: "food", retryDelayMs: 0 }),
    (error: unknown) => error instanceof AmenityLoadError && error.code === "response");
  assert.equal(calls, 2);
});

it("service cache validation rejects a different dataset and repairs refreshes retain bounded stale data", async () => {
  let now = Date.parse("2026-09-29T21:00:00Z"), calls = 0;
  const cache = { match: async () => Response.json(parseOsmAmenities(fixture, new Date(now).toISOString(), "food")), put: async () => {} } as unknown as Cache;
  const handler = createAmenityHandler({ dataset: "repairs", cache, now: () => now });
  const fetcher = async () => { calls++; return calls === 1 ? Response.json(fixture) : new Response("Unavailable", { status: 503 }); };
  assert.equal((await handler(req("repairs"), fetcher)).status, 200); assert.equal(calls, 1);
  now += 24 * 60 * 60_000 + 1;
  const stale = await (await handler(req("repairs"), fetcher)).json(); assert.equal(stale.stale, true); assert.equal(stale.dataset, "repairs");
  now += 8 * 24 * 60 * 60_000;
  assert.equal((await handler(req("repairs"), fetcher)).status, 503);
});
