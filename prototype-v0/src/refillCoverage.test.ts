import assert from "node:assert/strict";
import { it } from "node:test";
import { refillCoverage } from "./refillCoverage.ts";
import { detourStages } from "./cyclingDetour.ts";
import { zeroCycling } from "./cycling.ts";
import type { Amenity } from "./osmAmenities.ts";
const a = { lat: 47, lon: 8, label: "Start" }, b = { lat: 47.1, lon: 8, label: "End" }, at = new Date("2026-10-05T08:00:00+02:00");
const route = { ...zeroCycling(a, b), id: "ride", minutes: 60, distanceKm: 12, points: [a, b] };
const stages = detourStages(null, { routes: [route], minutes: 60, distanceKm: 12, arrival: new Date(+at + 3600000) }, a, b, at);
const water = (id: string, lat: number, extra: Partial<Amenity> = {}): Amenity => ({ id, lat, lon: 8, name: id, url: "https://example.org", categories: ["water"], tags: {}, area: false, potable: "yes", ...extra });
it("sorts refills by riding order and computes the longest gap including endpoints", () => {
  const facilities = Object.freeze([water("later", 47.075), water("first", 47.025)]);
  const [coverage] = refillCoverage(stages, facilities, 300);
  assert.deepEqual(coverage.candidates.map(c => c.facility.id), ["first", "later"]);
  assert.ok(Math.abs(coverage.gap.fromKm - 3) < .001); assert.ok(Math.abs(coverage.gap.toKm - 9) < .001);
  assert.ok(Math.abs(coverage.gap.km - 6) < .001);
  assert.ok(Math.abs(+coverage.candidates[0].at - (+at + 15 * 60000)) < 1);
  assert.deepEqual(facilities.map(f => f.id), ["later", "first"]);
});
it("does not count non-potable, restricted or known closed water", () => {
  const list = [water("unknown", 47.01, { potable: "unknown" }), water("no", 47.02, { potable: "no" }), water("private", 47.03, { tags: { access: "private" } }), water("closed", 47.04, { tags: { opening_hours: "Mo 10:00-12:00" } })];
  const [coverage] = refillCoverage(stages, list, 300);
  assert.equal(coverage.candidates.length, 0); assert.equal(coverage.gap.km, 12);
});
it("labels seasonal and unknown opening instead of claiming verified running water", () => {
  const [coverage] = refillCoverage(stages, [water("seasonal", 47.025, { tags: { opening_hours: "24/7", seasonal: "summer" } }), water("unknown", 47.05)], 300);
  assert.equal(coverage.candidates.length, 2);
  assert.ok(coverage.candidates.every(c => c.hours.state === "unknown"));
});
it("requires an explicit wider radius for off-route refills", () => {
  const facility = water("off-route", 47.05, { lon: 8.006 });
  assert.equal(refillCoverage(stages, [facility], 300)[0].candidates.length, 0);
  assert.equal(refillCoverage(stages, [facility], 1000)[0].candidates.length, 1);
  for (const radius of [0, -1, NaN, Infinity]) assert.equal(refillCoverage(stages, [facility], radius).length, 0);
});
it("keeps separate cycling sections separate across a public-transport gap", () => {
  const other = { ...stages[0], id: "second", route: { ...route, from: { ...a, lat: 48 }, to: { ...b, lat: 48.1 }, points: [{ ...a, lat: 48 }, { ...b, lat: 48.1 }] } };
  const coverages = refillCoverage([stages[0], other], [water("between-trains", 47.5)], 1000);
  assert.equal(coverages.length, 2); assert.ok(coverages.every(c => c.candidates.length === 0 && c.gap.km === 12));
});
it("does not invent coverage for missing or zero-length cycling geometry", () => {
  for (const points of [[], [a], [a, a]]) assert.equal(refillCoverage([{ ...stages[0], route: { ...route, points, distanceKm: 0 } }], [water("pin", 47)], 300).length, 0);
});
