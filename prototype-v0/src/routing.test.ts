import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_BIKE_DISTANCE_KM,
  cyclingMinutes,
  haversineKm,
  parseDurationMinutes,
  samplePoints,
  type Journey,
} from "./routing.ts";
import { journeySteps, transitLegsFromSections } from "./itinerary.ts";

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

describe("journey decomposition", () => {
  const section = (from: string, to: string, departure: string, arrival: string) => ({
    journey: { category: "IR", number: "13", name: "IR 2317", to: "Chur" },
    departure: { station: { name: from }, departure, platform: "7" },
    arrival: { station: { name: to }, arrival, platform: "4" },
  });
  const legA = section("Zürich HB", "Sargans", "2026-09-05T23:30:00+02:00", "2026-09-06T00:25:00+02:00");
  const legB = section("Sargans", "Chur", "2026-09-06T00:35:00+02:00", "2026-09-06T01:00:00+02:00");
  const origin = { label: "Origin address", lat: 47.37, lon: 8.54 };
  const destination = { label: "Destination address", lat: 46.85, lon: 9.53 };
  const journey = (): Journey => ({
    id: "synthetic-overnight-transfer",
    startTime: new Date("2026-09-05T23:10:00+02:00"),
    originStation: { ...origin, id: "A", name: "Zürich HB", bikeMinutes: 10, distanceKm: 2.5 },
    destinationStation: { ...destination, id: "B", name: "Chur", bikeMinutes: 8, distanceKm: 2 },
    departure: new Date(legA.departure.departure), arrival: new Date(legB.arrival.arrival),
    trainMinutes: 90, waitMinutes: 10, totalMinutes: 118, changes: 1,
    services: ["IR 13"], transitLegs: transitLegsFromSections([legA, legB]),
  });

  it("retains each train's stops, scheduled times, platforms, direction and service identifier", () => {
    const [leg] = transitLegsFromSections([legA]);
    assert.equal(leg.from, "Zürich HB");
    assert.equal(leg.to, "Sargans");
    assert.equal(leg.service, "IR 13");
    assert.equal(leg.serviceName, "IR 2317");
    assert.equal(leg.direction, "Chur");
    assert.equal(leg.departurePlatform, "7");
    assert.equal(leg.arrivalPlatform, "4");
    assert.equal(leg.departure?.toISOString(), "2026-09-05T21:30:00.000Z");
    assert.equal(leg.arrival?.toISOString(), "2026-09-05T22:25:00.000Z");
  });

  it("keeps two separate rides even when both use the same line label", () => {
    const legs = transitLegsFromSections([legA, legB]);
    assert.equal(legs.filter((leg) => leg.mode === "transit").length, 2);
    assert.deepEqual(legs.map((leg) => leg.to), ["Sargans", "Chur"]);
  });

  it("decomposes an overnight journey into cycling, boarding, both trains, connection time and cycling", () => {
    const steps = journeySteps(journey(), origin, destination);
    assert.deepEqual(steps.map((step) => step.mode), ["bike", "wait", "transit", "wait", "transit", "bike"]);
    assert.equal(steps[0].from, "Origin address");
    assert.equal(steps[0].to, "Zürich HB");
    assert.equal(steps[1].arrival!.getTime() - steps[1].departure!.getTime(), 10 * 60_000);
    assert.equal(steps[3].title, "Connection time");
    assert.equal(steps[3].arrival!.getTime() - steps[3].departure!.getTime(), 10 * 60_000);
    assert.equal(steps[5].from, "Chur");
    assert.equal(steps[5].to, "Destination address");
    assert.equal(steps[5].arrival?.toISOString(), "2026-09-05T23:08:00.000Z");
    assert.equal(steps.at(-1)!.arrival!.getTime() - steps[0].departure!.getTime(), 118 * 60_000);
    for (let i = 1; i < steps.length; i++) assert.equal(steps[i].departure!.getTime(), steps[i - 1].arrival!.getTime());
  });

  it("preserves walking transfers without counting them as train rides", () => {
    const walk = {
      journey: null, walk: { duration: 240 },
      departure: { station: { name: "Sargans" }, departure: "2026-09-06T00:25:00+02:00" },
      arrival: { station: { name: "Sargans" }, arrival: "2026-09-06T00:29:00+02:00" },
    };
    const fixture = journey();
    fixture.transitLegs = transitLegsFromSections([legA, walk, legB]);
    const steps = journeySteps(fixture, origin, destination);
    assert.deepEqual(steps.map((step) => step.mode), ["bike", "wait", "transit", "walk", "wait", "transit", "bike"]);
    assert.equal(steps[3].title, "Transfer on foot");
    assert.equal(steps[4].arrival!.getTime() - steps[4].departure!.getTime(), 6 * 60_000);
  });

  it("keeps missing or malformed details unknown without inventing a train or a time", () => {
    const [leg] = transitLegsFromSections([{
      departure: { departure: "invalid", platform: "" }, arrival: null,
    }]);
    assert.equal(leg.mode, "unknown");
    assert.equal(leg.departure, null);
    assert.equal(leg.arrival, null);
    assert.equal(leg.from, null);
    assert.equal(leg.departurePlatform, null);
    assert.deepEqual(transitLegsFromSections(null), []);
  });

  it("uses an explicit unavailable-details block when a connection omits sections", () => {
    const fixture = journey();
    fixture.transitLegs = [];
    const steps = journeySteps(fixture, origin, destination);
    assert.deepEqual(steps.map((step) => step.mode), ["bike", "wait", "unknown", "bike"]);
    assert.match(steps[2].title, /details unavailable/);
    assert.equal(steps[2].from, "Zürich HB");
    assert.equal(steps[2].to, "Chur");
  });

  it("accepts API Unix timestamps and numeric platform values", () => {
    const [leg] = transitLegsFromSections([{
      ...legA,
      departure: { departureTimestamp: 1788643800, platform: 0 },
    }]);
    assert.equal(leg.departure?.getTime(), 1788643800000);
    assert.equal(leg.departurePlatform, "0");
  });
});
