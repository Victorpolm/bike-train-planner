import test from "node:test";
import assert from "node:assert/strict";
import { parseOsmAmenities, validAmenityData, amenityDetails, closestAmenity, type Amenity } from "./osmAmenities.ts";
import { amenityLocationDetails, amenityLocationLinks, amenitySourceLinks, locationSummary } from "./amenityLocation.ts";
import { withReviewedAmenities, REVIEWED_AMENITIES, type ReviewedAmenityEntry } from "./reviewedAmenities.ts";
import { serviceKinds, serviceMatches } from "./osmServices.ts";
import { createAmenityHandler } from "../server/amenityHandler.ts";

const raw = (tags: Record<string, string>, id = 1) => ({ type: "node", id, lat: 47.376, lon: 8.548, tags });
const date = "2026-09-30T08:00:00Z";

test("retains floor labels and indoor directions across food, repairs and toilets without conflating floor with layer", () => {
  for (const [dataset, tags] of [[undefined, { amenity: "toilets" }], ["food", { amenity: "vending_machine", vending: "snacks" }],
    ["repairs", { amenity: "bicycle_repair_station" }]] as const) {
    const data = parseOsmAmenities({ elements: [raw({ ...tags, indoor: "yes", level: "2", "level:ref": "F", layer: "-1",
      "addr:housename": "Test building", "addr:unit": "F 12", description: "Beside the lift" })] }, date, dataset);
    assert.equal(validAmenityData(data, dataset), true);
    const f = data.facilities[0], lines = amenityDetails(f, dataset ?? "toilets");
    assert.equal(locationSummary(f), "Floor F");
    assert.ok(lines.includes("Mapped floor: F")); assert.ok(lines.includes("Room / unit: F 12"));
    assert.ok(lines.includes("Mapped description: Beside the lift"));
    assert.ok(!lines.some(line => line.includes("Floor -1") || line.includes("floor: -1")));
  }
});

test("unknown indoor floors stay unknown; separate floors at identical coordinates remain separate", () => {
  const data = parseOsmAmenities({ elements: [raw({ amenity: "toilets", indoor: "yes" }),
    raw({ amenity: "toilets", level: "-1" }, 2), raw({ amenity: "toilets", level: "1" }, 3)] }, date);
  const result = withReviewedAmenities(data.facilities, ["toilets"]);
  assert.equal(result.length, 3);
  assert.ok(amenityLocationDetails(result[0]).includes("Floor unknown"));
  assert.equal(locationSummary(result[1]), "Floor -1"); assert.equal(locationSummary(result[2]), "Floor 1");
});

test("HG is one approximate reported location and remains usable without an OSM response", () => {
  const food = withReviewedAmenities([], ["food"]);
  assert.equal(food.length, 1);
  const hg = food[0];
  assert.equal(hg.location?.floorLabel, "F"); assert.equal(hg.location?.precision, "building");
  assert.match(hg.location?.directions ?? "", /Starbucks/);
  assert.equal(hg.tags.vending, undefined); assert.equal(hg.tags.access, undefined); assert.equal(hg.tags.opening_hours, undefined);
  assert.ok(serviceMatches(hg, "food", ["vending"])); assert.ok(!serviceMatches(hg, "food", ["cafe"]));
  assert.deepEqual(serviceKinds({ amenity: "vending_machine", brand: "Selecta" }, "food"), []);
  assert.equal(closestAmenity(food, { lat: hg.lat, lon: hg.lon }, "food", ["vending"])?.facility.id, hg.id);
  assert.ok(amenitySourceLinks(hg).some(s => s.label.includes("owner report")));
  assert.ok(amenityDetails(hg, "food").some(s => s.includes("not the machine or an entrance")));
  assert.equal(withReviewedAmenities([], ["toilets"]).length, 0);
});

test("HB enrichment preserves OSM identity, restricted access, coordinates and raw floor evidence", () => {
  const data = parseOsmAmenities({ elements: [raw({ amenity: "toilets", level: "-1", access: "private", name: "McClean" }, 4424615154)] }, date);
  const before = structuredClone(data.facilities);
  const result = withReviewedAmenities(data.facilities, ["toilets"]), hb = result[0];
  assert.deepEqual(data.facilities, before); assert.equal(result.length, 1); assert.equal(hb.id, before[0].id);
  assert.equal(hb.lat, before[0].lat); assert.equal(hb.tags.level, "-1");
  assert.match(hb.location?.zone ?? "", /L7/); assert.match(amenityLocationLinks(hb)[0].href, /plan-zuerich-hb-a4.pdf$/);
  assert.ok(amenitySourceLinks(hb).some(s => s.label.includes("OpenStreetMap")));
  assert.ok(amenitySourceLinks(hb).some(s => s.label.includes("SBB")));
  assert.equal(closestAmenity(result, hb, "toilets"), null);
  assert.deepEqual(withReviewedAmenities(result, ["toilets"]), result);
});

test("an explicit reviewed OSM identity can retire a local addition without matching neighbours by distance", () => {
  const addition = REVIEWED_AMENITIES[0]; assert.equal(addition.kind, "addition");
  const entries: ReviewedAmenityEntry[] = [{ ...addition, replacesOsmIds: ["osm:node/20"] } as ReviewedAmenityEntry];
  const data = parseOsmAmenities({ elements: [raw({ amenity: "vending_machine", vending: "snacks" }, 20),
    raw({ amenity: "vending_machine", vending: "snacks", level: "G" }, 21)] }, date, "food");
  assert.equal(withReviewedAmenities(data.facilities, ["food"]).length, 3);
  const result = withReviewedAmenities(data.facilities, ["food"], entries);
  assert.equal(result.length, 2); assert.ok(result.every(f => f.id.startsWith("osm:")));
  assert.equal(result.find(f => f.id === "osm:node/21")?.location, undefined);
});

test("source links reject executable or credential-bearing URLs and network payloads cannot inject reviewed evidence", () => {
  const f = withReviewedAmenities([], ["food"])[0];
  const unsafe: Amenity = { ...f, location: { planUrl: "javascript:alert(1)" }, additionalSources: [
    { kind: "document", label: "Bad", url: "https://user:password@example.com", date: "2026-09-30" }] };
  assert.deepEqual(amenityLocationLinks(unsafe), []); assert.deepEqual(amenitySourceLinks(unsafe), []);
  const data = parseOsmAmenities({ elements: [raw({ amenity: "toilets" })] }, date);
  assert.equal(validAmenityData({ ...data, facilities: [{ ...data.facilities[0], location: { floorLabel: "fabricated" } }] }), false);
});

test("location-aware server cache refreshes preserve the new fields", async () => {
  const keys: string[] = [];
  const cache = { match: async (req: Request) => { keys.push(req.url); return undefined; }, put: async () => {} } as unknown as Cache;
  const handler = createAmenityHandler({ now: () => Date.parse(date), cache });
  const response = await handler(new Request("https://planner.example/api/amenities/v1"), async () => Response.json({ elements: [raw({ amenity: "toilets", level: "-1", description: "Under the main hall" })] }));
  const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.facilities[0].tags.level, "-1");
  assert.equal(data.facilities[0].tags.description, "Under the main hall");
  assert.ok(keys[0].includes("/api/amenities-cache/v2/"));
});
