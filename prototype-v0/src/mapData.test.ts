import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { exploredStops, journeyStops } from "./mapData.ts";
import { DEFAULT_OPTIONS, emptyNetwork, solve } from "./model.ts";
import { addSections } from "./timetable.ts";
import { cyclingOnly, type Place } from "./routing.ts";

function recordedJourney() {
  const recorded = JSON.parse(readFileSync(new URL("./fixtures/zurich-laax-2026-09-05.json", import.meta.url), "utf8"));
  const network = emptyNetwork(); addSections(network, recorded.sections);
  const origin = { ...network.stops.get("8503000")!, label: "Zürich HB" };
  const destination = { ...network.stops.get("8509786")!, label: "Laax GR, posta" };
  const solution = solve(network, origin, destination, new Date("2026-09-05T13:30:00+02:00"),
    { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0 }, "baseline");
  return { journey: solution.journeys.find(j => j.totalMinutes === 138)!, network };
}

describe("journey and candidate map stops", () => {
  it("pins the four boarding/alighting stops of the recorded train-walk-bus journey", () => {
    const { journey, network } = recordedJourney(), pins = journeyStops(journey);
    assert.equal(pins.length, 4);
    assert.deepEqual(pins.map(p => p.number), [1, 2, 3, 4]);
    assert.equal(pins[0].name, "Zürich HB");
    assert.equal(pins[1].name, "Chur");
    assert.match(pins[2].name, /Postauto/);
    assert.equal(pins[3].id, "8509786");
    assert.equal(pins[2].events[0].service, "B 81");
    assert.equal(pins[2].events[0].platform, "N");
    assert.deepEqual(pins.map(p => p.events[0].action), ["Board", "Alight", "Board", "Alight"]);
    assert.ok(network.stops.size > pins.length, "Passing stations are candidates, not transfer pins");
  });
  it("merges repeated station IDs and retains both arrival and onward boarding details", () => {
    const { journey } = recordedJourney();
    const first = journey.transitLegs[0], second = journey.transitLegs[2];
    const pins = journeyStops({ ...journey, transitLegs: [first, { ...second,
      fromId: first.toId, from: first.to, fromPoint: first.toPoint }] });
    assert.equal(pins.length, 3);
    assert.deepEqual(pins[1].events.map(e => [e.action, e.boarding]), [["Alight", 1], ["Board", 2]]);
    assert.equal(pins[1].events[1].platform, "N");
  });
  it("deduplicates explored stops by ID while preserving both endpoint roles", () => {
    const stop = { id: "s", name: "Station", lat: 47, lon: 8, kind: "bus" };
    const result = exploredStops([stop], [{ ...stop, distanceKm: 1, bikeMinutes: 4 }], [{ ...stop, distanceKm: 2, bikeMinutes: 8 }]);
    assert.equal(result.length, 1); assert.equal(result[0].notes.length, 3);
    assert.match(result[0].notes[1], /from origin/);
    assert.match(result[0].notes[2], /to destination/);
    assert.equal(result[0].kind, "bus");
  });
});

describe("cycling-only comparison", () => {
  it("uses the same ready-to-leave time, rounds cycling up, and works without transit", () => {
    const start = new Date("2026-09-05T21:59:30Z");
    const origin: Place = { lat: 47, lon: 8, label: "A" };
    const comparison = cyclingOnly(origin, { ...origin, lon: 8.1, label: "B" }, start);
    assert.ok(comparison.distanceKm > 7 && comparison.distanceKm < 8);
    assert.equal(comparison.minutes, 31);
    assert.equal(comparison.arrival.getTime() - start.getTime(), 31 * 60_000);
  });
  it("does not invent cycling between two selections of the same stop", () => {
    const origin = { lat: 47, lon: 8, label: "A", stopId: "same" };
    assert.equal(cyclingOnly(origin, { ...origin, lat: 47.001 }, new Date()).minutes, 0);
  });
});
