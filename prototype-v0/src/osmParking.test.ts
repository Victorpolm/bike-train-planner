import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { closestBikeParking, mergeBikeParking, parkingAccess, parkingDetails, parseBikeParking } from "./bikeParking.ts";
import { OSM_PARKING_API, OSM_PARKING_QUERY, parseOsmParking } from "./osmParking.ts";
import { createParkingHandler } from "../server/parkingHandler.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/eth-parking-osm.json", import.meta.url), "utf8"));
const osmRequest = () => new Request("https://planner.example/api/parking?source=osm");
const official = (url?: string) => parseBikeParking({ features: [{ id: "station", geometry: { type: "Point", coordinates: [8.54, 47.378] },
  properties: { parkingFacilityCategory: "BIKE", displayName: "Station parking", publicAccess: true,
    capacities: [{ categoryType: "STANDARD", total: 500 }], callToAction: { externalDesktop: { en: url } } } }] });

it("imports real ETH parking points and areas with access, equipment, capacity and source links", () => {
  const data = parseOsmParking(fixture);
  const eth = data.facilities.find(f => f.id === "osm:node/321526421")!;
  assert.equal(eth.operator, "ETH Zürich"); assert.equal(eth.parkingType, "stands");
  assert.equal(eth.capacity, 48); assert.equal(eth.covered, true); assert.equal(eth.fee, false);
  assert.equal(eth.url, "https://www.openstreetmap.org/node/321526421");
  const area = data.facilities.find(f => f.id === "osm:way/914770857")!;
  assert.equal(area.lat, 47.3770075); assert.match(area.traits.join(" "), /not an entrance/);
  const privateArea = data.facilities.find(f => f.id === "osm:way/263781904")!;
  assert.equal(privateArea.publicAccess, false); assert.match(parkingAccess(privateArea), /Private/);
  assert.match(parkingDetails(privateArea).join(" "), /Private access/);
});

it("selects OSM parking near both ETH campuses instead of the farther station and follows a changed start", () => {
  const facilities = mergeBikeParking([official(), parseOsmParking(fixture)]);
  const centre = closestBikeParking(facilities, { lat: 47.3763, lon: 8.5476 })!;
  assert.equal(centre.facility.id, "osm:node/11811170403");
  assert.ok(centre.distanceKm > .04 && centre.distanceKm < .045);
  const hongg = closestBikeParking(facilities, { lat: 47.4077, lon: 8.5077 })!;
  assert.equal(hongg.facility.id, "osm:node/7936524432");
  assert.ok(hongg.distanceKm < .04);
});

it("preserves unknowns and zeroes, imports relations, and excludes invalid or disused records", () => {
  const base = { type: "node", id: 1, lat: 47, lon: 8, tags: { amenity: "bicycle_parking" } };
  const data = parseOsmParking({ elements: [base, { ...base, id: 2, tags: { ...base.tags, covered: "no", capacity: "0", access: "customers", fee: "yes" } },
    { type: "relation", id: 3, center: { lat: 47.1, lon: 8 }, tags: base.tags },
    { ...base, id: 4, tags: { ...base.tags, disused: "yes" } }, { ...base, id: 5, lat: 99 },
    { type: "way", id: 6, tags: base.tags }, { ...base, id: 7, tags: { amenity: "parking" } }] });
  assert.equal(data.facilities.length, 3);
  assert.equal(data.facilities[0].publicAccess, null); assert.equal(data.facilities[0].covered, null);
  assert.equal(data.facilities[0].capacity, null); assert.equal(data.facilities[0].fee, null);
  assert.equal(data.facilities[1].capacity, 0); assert.equal(data.facilities[1].covered, false);
  assert.equal(parkingAccess(data.facilities[1]), "Customers only"); assert.equal(data.facilities[1].fee, true);
  assert.equal(data.facilities[2].id, "osm:relation/3");
  assert.throws(() => parseOsmParking({ elements: [base], remark: "runtime error: Query timed out" }), /Incomplete/);
});

it("deduplicates stable IDs and explicit cross-source links without merging adjacent racks or adding capacity", () => {
  const osm = parseOsmParking(fixture), before = JSON.stringify(osm);
  assert.equal(mergeBikeParking([osm, osm]).length, osm.facilities.length);
  const linked = official("https://www.openstreetmap.org/way/263781904");
  const merged = mergeBikeParking([linked, osm]);
  assert.equal(merged.length, osm.facilities.length);
  const facility = merged.find(f => f.id === "station")!;
  assert.equal(facility.sources?.length, 2); assert.equal(facility.capacity, 500);
  assert.equal(facility.publicAccess, false); assert.equal(parkingAccess(facility), "Private access");
  assert.match(facility.traits.join(" "), /Access differs/);
  const adjacent = official(); adjacent.facilities[0].lat = osm.facilities[0].lat; adjacent.facilities[0].lon = osm.facilities[0].lon;
  assert.equal(mergeBikeParking([adjacent, osm]).length, osm.facilities.length + 1);
  const conflicting = mergeBikeParking([official("https://www.openstreetmap.org/node/321526421"), osm])[0];
  assert.equal(conflicting.capacity, null); assert.match(conflicting.traits.join(" "), /Capacity differs/);
  assert.equal(JSON.stringify(osm), before);
});

it("shares one national OSM request, keeps it independent of the origin, and rejects arbitrary sources", async () => {
  const handler = createParkingHandler(); let calls = 0;
  const fetcher = async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++; assert.equal(url, OSM_PARKING_API); assert.equal(new URLSearchParams(init?.body as URLSearchParams).get("data"), OSM_PARKING_QUERY);
    return Response.json(fixture);
  };
  const responses = await Promise.all([handler(osmRequest(), fetcher), handler(osmRequest(), fetcher)]);
  assert.equal(calls, 1); assert.ok(responses.every(r => r.ok));
  const data = await responses[0].json(); assert.equal(data.provider, "osm"); assert.equal(data.stale, false);
  assert.equal((await handler(new Request("https://planner.example/api/parking?source=https://elsewhere.invalid"), fetcher)).status, 400);
  assert.equal((await handler(new Request(osmRequest(), { method: "POST" }), fetcher)).status, 405);
  assert.equal(calls, 1);
});

it("serves bounded stale data after OSM failure, backs off repeated failures and rejects partial success", async () => {
  let clock = Date.parse("2026-09-29T12:00:00Z"), calls = 0;
  const handler = createParkingHandler({ now: () => clock });
  await handler(osmRequest(), async () => Response.json(fixture));
  clock += 25 * 60 * 60_000;
  const fail = async () => { calls++; return Response.json({ ...fixture, remark: "timeout" }); };
  assert.equal((await (await handler(osmRequest(), fail)).json()).stale, true);
  await handler(osmRequest(), fail); assert.equal(calls, 1);
  clock += 8 * 24 * 60 * 60_000;
  assert.equal((await handler(osmRequest(), fail)).status, 503);
  const fresh = createParkingHandler();
  assert.equal((await fresh(osmRequest(), fail)).status, 503);
  assert.equal((await fresh(new Request("https://planner.example/api/parking"), async () => Response.json({ features: [{ id: "ok",
    geometry: { type: "Point", coordinates: [8, 47] }, properties: { parkingFacilityCategory: "BIKE" } }] }))).status, 200);
});

it("reuses the shared edge cache across cold handlers with separate source keys", async () => {
  const entries = new Map<string, Response>();
  const cache = { match: async (key: Request) => entries.get(key.url)?.clone(),
    put: async (key: Request, response: Response) => { entries.set(key.url, response.clone()); } } as unknown as Cache;
  await createParkingHandler({ cache })(osmRequest(), async () => Response.json(fixture));
  const response = await createParkingHandler({ cache })(osmRequest(), async () => { throw new Error("Must use edge cache"); });
  assert.equal(response.status, 200); assert.equal((await response.json()).provider, "osm");
  assert.equal(entries.size, 1); assert.match([...entries.keys()][0], /\/api\/parking-cache\/v3\/osm$/);
});

it("rejects legacy or wrong-source edge cache data and serves the versioned source endpoint", async () => {
  for (const bad of [{ ...official(), provider: undefined }, official(), { ...parseOsmParking(fixture), fetchedAt: "invalid" }]) {
    let calls = 0;
    const cache = { match: async () => Response.json(bad), put: async () => {} } as unknown as Cache;
    const response = await createParkingHandler({ cache })(new Request("https://planner.example/api/parking/v3/osm"), async () => { calls++; return Response.json(fixture); });
    assert.equal(calls, 1); assert.equal((await response.json()).provider, "osm");
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(response.headers.get("X-Parking-Source"), "osm");
  }
});
