import test from "node:test";
import assert from "node:assert/strict";
import { handleFacilities } from "../server/facilityHandler.ts";
import { handleFare } from "../server/fareHandler.ts";
import { FACILITY_JOBS, mergeFacilitySources, type FacilityLoad } from "./facilitySources.ts";
import { loadFacilityJobs } from "./facilityClient.ts";
import { clearLocalPersonalData, LOCAL_PERSONAL_KEYS } from "./privacy.ts";
import { parseOsmAmenities } from "./osmAmenities.ts";
import { withReviewedAmenities } from "./reviewedAmenities.ts";

test("production facility handlers deny both unlicensed sources before cache or upstream access", async () => {
  for (const job of FACILITY_JOBS.filter(j => j.provider !== "swisstlm3d")) {
    const response = await handleFacilities(new Request("https://planner.example" + job.path), async () => { assert.fail("Disabled source must never fetch"); });
    assert.equal(response.status, 451); assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  const topography = FACILITY_JOBS.find(j => j.provider === "swisstlm3d")!;
  assert.equal((await handleFacilities(new Request("https://planner.example" + topography.path))).status, 200);
});
test("client policy suppresses old cached/enriched records without obscuring OSM facilities", async () => {
  const jobs = FACILITY_JOBS.filter(j => j.provider !== "swisstlm3d"), updates: FacilityLoad[] = [];
  await loadFacilityJobs(jobs, new AbortController().signal, l => updates.push(l), async () => { assert.fail("Disabled provider must not be requested"); });
  assert.equal(updates.filter(l => l.status === "error").length, jobs.length); assert.ok(updates.every(l => !l.data));
  const osm = parseOsmAmenities({ elements: [{ type: "node", id: 4424615154, lat: 47.378, lon: 8.54, tags: { amenity: "toilets", level: "-1" } }] }).facilities;
  const restricted = { ...osm[0], id: "sbb:8503000:1", provenance: { provider: "sbb" as const, retrievedAt: new Date().toISOString(), note: "old" } };
  assert.deepEqual(mergeFacilitySources(osm, [restricted], ["toilets"]), osm);
  assert.equal(mergeFacilitySources([restricted], [], ["toilets"]).length, 0);
  assert.deepEqual(withReviewedAmenities(osm, ["toilets"]), osm);
});
test("production fare endpoint cannot expose integration quotes even when credentials are configured", async () => {
  const response = await handleFare(new Request("https://planner.example/api/fares/quote", { method: "POST", body: "{}" }), { OJP_API_KEY: "test-not-real", OJP_FARE_API_KEY: "test-not-real" });
  assert.equal(response.status, 503); assert.match((await response.json()).error, /hidden/); assert.equal(response.headers.get("Cache-Control"), "no-store");
});
test("device-data deletion touches only this app's personal records and reports storage failure", () => {
  const storage = new Map<string, string>([...LOCAL_PERSONAL_KEYS.map(k => [k, "personal"] as [string, string]), ["unrelated", "keep"]]);
  clearLocalPersonalData({ removeItem: k => { storage.delete(k); } }); assert.deepEqual([...storage], [["unrelated", "keep"]]);
  assert.throws(() => clearLocalPersonalData({ removeItem: () => { throw new Error("storage denied"); } }), /storage denied/);
});
