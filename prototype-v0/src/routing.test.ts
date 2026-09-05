import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_BIKE_DISTANCE_KM,
  cyclingMinutes,
  haversineKm,
  parseDurationMinutes,
  samplePoints,
} from "./routing.ts";

describe("prototype routing helpers", () => {
  it("turns the 20 minute assumption into a five kilometre radius", () => {
    assert.equal(MAX_BIKE_DISTANCE_KM, 5);
    assert.equal(cyclingMinutes(5), 20);
  });

  it("computes plausible distances", () => {
    const zurichToBern = haversineKm(
      { lat: 47.3778, lon: 8.5405 },
      { lat: 46.948, lon: 7.4474 },
    );
    assert.ok(zurichToBern > 90);
    assert.ok(zurichToBern < 100);
  });

  it("creates a centre plus four sampling points", () => {
    assert.equal(samplePoints({ lat: 47.37, lon: 8.54 }).length, 5);
  });

  it("parses Swiss Transport API durations", () => {
    assert.equal(parseDurationMinutes("00d01:43:00"), 103);
  });
});
