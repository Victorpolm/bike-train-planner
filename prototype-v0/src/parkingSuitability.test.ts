import assert from "node:assert/strict";
import { it } from "node:test";
import { frameSupport, maxStayMinutes, parkingAssessment, parkingDetourTarget, parkingInformation, parkingShortlist, parkingVisitAllowed, type ParkingPreferences } from "./parkingSuitability.ts";
import { mergeBikeParking, parseBikeParking, type BikeParking } from "./bikeParking.ts";
import { parseOsmParking } from "./osmParking.ts";

const at = (h: number) => new Date(`2026-10-05T${String(h).padStart(2, "0")}:00:00+02:00`);
const base: BikeParking = { id: "stand", name: "Station stand", lat: 47, lon: 8, operator: "Mapped operator", type: "BIKE_PARKING", capacity: 24, covered: null, publicAccess: null, fee: null, traits: [] };
const pref: ParkingPreferences = { radiusKm: 2, arrival: at(9), retrieval: at(11), preferFrame: true, preferCovered: true, requireFree: false, requireOpen: false, allowConditional: false };
it("excludes private access and requires an explicit choice for entry conditions", () => {
  for (const access of ["private", "no"]) for (const allow of [false, true]) assert.equal(parkingVisitAllowed({ ...base, access }, allow), false);
  for (const f of [{ ...base, access: "members" }, { ...base, publicAccess: false }, { ...base, tags: { locked: "yes" } }, { ...base, tags: { "access:conditional": "yes @ (Mo-Fr)" } }]) {
    assert.equal(parkingAssessment(f, pref).eligible, false);
    assert.equal(parkingAssessment(f, { ...pref, allowConditional: true }).eligible, true);
  }
  assert.equal(parkingAssessment(base, pref).eligible, true);
});
it("checks retrieval access separately and does not require a garage to stay open while parked", () => {
  const f = { ...base, openingHours: "Mo 08:00-10:00,16:00-18:00" };
  assert.equal(parkingAssessment(f, pref).eligible, false);
  assert.equal(parkingAssessment(f, { ...pref, retrieval: at(17) }).eligible, true);
  assert.equal(parkingAssessment(f, { ...pref, arrival: at(7), retrieval: at(17) }).eligible, false);
  assert.equal(parkingAssessment(f, { ...pref, retrieval: at(8) }).eligible, false);
});
it("keeps unknown hours visible unless confirmed mapped hours are required", () => {
  assert.equal(parkingAssessment(base, pref).arrival, "unknown");
  assert.equal(parkingAssessment(base, { ...pref, requireOpen: true }).eligible, false);
  assert.equal(parkingAssessment({ ...base, openingHours: "24/7" }, { ...pref, requireOpen: true }).eligible, true);
  assert.equal(parkingAssessment({ ...base, openingHours: "24/7", tags: { seasonal: "summer" } }, { ...pref, requireOpen: true }).eligible, false);
});
it("does not infer free parking from an unknown or conditional price", () => {
  for (const fee of [undefined, null, true]) assert.equal(parkingAssessment({ ...base, fee }, { ...pref, requireFree: true }).eligible, false);
  assert.equal(parkingAssessment({ ...base, fee: false }, { ...pref, requireFree: true }).eligible, true);
  assert.equal(parkingAssessment({ ...base, fee: false, tags: { "fee:conditional": "yes @ (08:00-18:00)" } }, { ...pref, requireFree: true }).eligible, false);
});
it("checks supported maximum-stay units and preserves unparsed restrictions", () => {
  for (const [raw, expected] of [["30 minutes", 30], ["2 hrs", 120], ["1.5 hours", 90], ["1 day", 1440], ["2 weeks", 20160]] as const) assert.equal(maxStayMinutes(raw), expected);
  for (const raw of [undefined, "30", "Mo-Fr 2 hours", "unlimited", "-1 hour"]) assert.equal(maxStayMinutes(raw), null);
  assert.equal(parkingAssessment({ ...base, tags: { maxstay: "2 hours" } }, pref).eligible, true);
  assert.equal(parkingAssessment({ ...base, tags: { maxstay: "90 minutes" } }, pref).eligible, false);
  assert.match(parkingAssessment({ ...base, tags: { maxstay: "conditional" } }, pref).warnings.join(" "), /Maximum stay needs checking/);
});
it("ranks evidence-based equipment preferences before proximity without mutating inputs", () => {
  const nearby = { ...base, id: "near" }, supported = { ...base, id: "supported", lat: 47.001, covered: true, parkingType: "stands" };
  const records = Object.freeze([nearby, supported]);
  assert.deepEqual(parkingShortlist(records, base, pref).map(r => r.facility.id), ["supported", "near"]);
  assert.deepEqual(parkingShortlist(records, base, { ...pref, preferFrame: false, preferCovered: false }).map(r => r.facility.id), ["near", "supported"]);
  assert.deepEqual(records.map(r => r.id), ["near", "supported"]);
  for (const parkingType of ["wall_loops", "handlebar_holder", undefined, "stands;wall_loops"]) assert.equal(frameSupport({ ...base, parkingType }), false);
});
it("applies radius bounds and deterministic ties without creating candidates from invalid points", () => {
  const a = { ...base, id: "a" }, b = { ...base, id: "b" };
  assert.deepEqual(parkingShortlist([b, a, { ...base, id: "far", lat: 48 }], base, pref).map(r => r.facility.id), ["a", "b"]);
  for (const radiusKm of [NaN, -1, 0]) assert.equal(parkingShortlist([a], base, { ...pref, radiusKm }).length, 0);
  assert.equal(parkingShortlist([a], null, pref).length, 0);
  assert.equal(parkingShortlist([a], { lat: NaN, lon: 8 }, pref).length, 0);
  assert.equal(parkingShortlist([a], { lat: 91, lon: 8 }, pref).length, 0);
});
it("preserves OSM entry, floor, duration and security facts with point-role uncertainty", () => {
  const tags = { amenity: "bicycle_parking", maxstay: "2 days", surveillance: "camera", supervised: "no", authentication: "membership_card", level: "-1", entrance: "yes", "access:conditional": "members @ (22:00-06:00)" };
  const f = parseOsmParking({ elements: [{ type: "node", id: 1, lat: 47, lon: 8, tags }] }, "2026-10-10T15:00:00Z").facilities[0];
  assert.equal(f.tags?.authentication, "membership_card"); assert.equal(f.locationRole, "entrance");
  assert.equal(f.sources?.[0].retrievedAt, "2026-10-10T15:00:00Z");
  assert.match(parkingInformation(f).join(" "), /Mapped floor: -1/);
  assert.match(parkingInformation(f).join(" "), /not been verified on site/);
  assert.match(parkingInformation(f).join(" "), /not live availability/);
  const area = parseOsmParking({ elements: [{ type: "way", id: 2, center: { lat: 47, lon: 8 }, tags }] }).facilities[0];
  assert.equal(area.locationRole, "area"); assert.match(parkingInformation(area).join(" "), /Area centre/);
});
it("preserves official station identifiers verbatim and merges only explicit identities", () => {
  const official = parseBikeParking({ features: [{ id: "official", geometry: { type: "Point", coordinates: [8, 47] }, properties: { parkingFacilityCategory: "BIKE", uic: "08503000", didokId: "3000", publicAccess: true, capacities: [{ categoryType: "STANDARD", total: 24 }], callToAction: { externalDesktop: { en: "https://www.openstreetmap.org/node/1" } } } }] });
  assert.deepEqual(official.facilities[0].stationIds, [{ scheme: "uic", value: "08503000" }, { scheme: "didok", value: "3000" }]);
  const osm = parseOsmParking({ elements: [{ type: "node", id: 1, lat: 47, lon: 8, tags: { amenity: "bicycle_parking", access: "private", capacity: "25", maxstay: "1 day" } }, { type: "node", id: 2, lat: 47, lon: 8, tags: { amenity: "bicycle_parking" } }] });
  const merged = mergeBikeParking([official, osm]); assert.equal(merged.length, 2);
  assert.equal(merged[0].capacity, null); assert.equal(merged[0].publicAccess, false);
  assert.equal(merged[0].tags?.maxstay, "1 day"); assert.equal(merged[0].sources?.length, 2);
  assert.equal(parkingAssessment(merged[0], pref).eligible, false);
  assert.match(parkingAssessment(merged[0], pref).warnings.join(" "), /Sources disagree/);
});
it("keeps parking visits explicit about bicycle continuity and access restrictions", () => {
  assert.match(parkingDetourTarget(base).note!, /continues with your bicycle/);
  assert.ok(parkingDetourTarget({ ...base, access: "members" }).unavailable);
  assert.equal(parkingDetourTarget({ ...base, access: "members" }, true).unavailable, undefined);
  assert.equal(parkingDetourTarget({ ...base, url: "javascript:alert(1)" }).url, undefined);
});
