import assert from "node:assert/strict";
import { it } from "node:test";
import { closestBikeParking, type BikeParking } from "./bikeParking.ts";

const facility = (id: string, lat: number, lon: number): BikeParking => ({ id, lat, lon, name: id,
  operator: "Example operator", type: "BIKE_PARKING", covered: null, capacity: null, publicAccess: null, traits: [] });

it("finds the closest parking to the supplied start using geographic distance, without reordering the dataset", () => {
  const north = facility("north", 47.008, 8), east = facility("east", 47, 8.01);
  const facilities = Object.freeze([north, east]);
  const result = closestBikeParking(facilities, { lat: 47, lon: 8 })!;
  assert.equal(result.facility.id, "east"); // Longitude degrees are shorter at this latitude.
  assert.ok(result.distanceKm > .75 && result.distanceKm < .77);
  assert.deepEqual(facilities.map(f => f.id), ["north", "east"]);
  // A changed starting point must replace the former nearest facility.
  const changed = closestBikeParking(facilities, north)!;
  assert.equal(changed.facility.id, "north"); assert.equal(changed.distanceKm, 0);
});

it("handles a missing start, empty dataset and invalid coordinates without fabricating a parking result", () => {
  const valid = facility("valid", 47, 8);
  assert.equal(closestBikeParking([valid], null), null);
  assert.equal(closestBikeParking([], valid), null);
  assert.equal(closestBikeParking([valid], { lat: NaN, lon: 8 }), null);
  assert.equal(closestBikeParking([valid], { lat: 91, lon: 8 }), null);
  assert.equal(closestBikeParking([facility("bad", 47, Infinity)], valid), null);
});

it("breaks equal-distance ties consistently and preserves unknown or restricted access for the result display", () => {
  const a = facility("a", 47, 8), b = facility("b", 47, 8);
  a.publicAccess = false;
  assert.equal(closestBikeParking([b, a], a)?.facility.id, "a");
  assert.equal(closestBikeParking([a, b], a)?.facility.publicAccess, false);
  assert.equal(closestBikeParking([b], b)?.facility.publicAccess, null);
});
