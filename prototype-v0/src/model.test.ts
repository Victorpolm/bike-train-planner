import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { addSections, addStationboard } from "./timetable.ts";
import { categorize, compareModels, DEFAULT_OPTIONS, emptyNetwork, metrics, pareto, solve,
  type Network, type Options, type Stop } from "./model.ts";
import { cyclingMinutes, haversineKm, type Journey, type Place } from "./routing.ts";
import { journeySteps } from "./itinerary.ts";

const start = new Date("2026-09-05T08:00:00+02:00");
const time = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const stops: Stop[] = [
  { id: "A", name: "Origin station", lat: 47, lon: 8 },
  { id: "B", name: "Alighting station", lat: 47.5, lon: 8 },
  { id: "C", name: "Other station", lat: 47.5, lon: 8.03 },
  { id: "D", name: "Destination station", lat: 48, lon: 9 },
];
const origin: Place = { ...stops[0], label: "Origin" }, destination: Place = { ...stops[3], label: "Destination" };
const limits: Options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0, horizonMinutes: 120, maxBikeMinutes: 20 };
function ride(n: Network, from: string, to: string, depart: number, arrive: number, mode: "transit" | "walk" = "transit") {
  const a = n.stops.get(from)!, b = n.stops.get(to)!;
  const id = `${from}-${to}-${depart}-${arrive}-${mode}`;
  n.edges.set(id, { id, from, to, leg: { mode, from: a.name, to: b.name, fromId: a.id, toId: b.id,
    fromPoint: a, toPoint: b, departure: time(depart), arrival: time(arrive), departurePlatform: "1", arrivalPlatform: "2",
    service: "Same line", serviceName: id, direction: b.name } });
}
function fixture() {
  const n = emptyNetwork(); stops.forEach(s => n.stops.set(s.id, s));
  ride(n, "A", "B", 5, 20); ride(n, "B", "D", 50, 80);
  ride(n, "C", "D", 34, 50); ride(n, "A", "D", 10, 90);
  return n;
}
const fastest = (journeys: Journey[]) => Math.min(...journeys.map(j => j.totalMinutes));
const vectors = (journeys: Journey[]) => [...new Set(pareto(journeys).map(j => { const m = metrics(j); return `${m.time},${m.bike},${m.boardings}`; }))].sort();

describe("bounded multimodal model", () => {
  it("allows ordinary changes in Baseline and improves arrival with one cycling leg in Extended", () => {
    const { baseline, extended } = compareModels(fixture(), origin, destination, start, limits);
    assert.equal(fastest(baseline.journeys), 80);
    assert.equal(fastest(extended.journeys), 50);
    assert.ok(baseline.journeys.every(j => extended.journeys.some(e => e.id === j.id)));
    const fastestRoute = extended.journeys.find(j => j.totalMinutes === 50)!;
    assert.equal(metrics(fastestRoute).middle, cyclingMinutes(haversineKm(stops[1], stops[2])));
    assert.equal(fastestRoute.changes, 1);
    const steps = journeySteps(fastestRoute, origin, destination);
    assert.equal(steps.filter(s => s.title === "Cycle between stops").length, 1);
    for (let i = 1; i < steps.length; i++) assert.equal(steps[i].departure!.getTime(), steps[i - 1].arrival!.getTime());
  });
  it("keeps the same optimum when an intermediate ride provides no benefit", () => {
    const n = fixture(); ride(n, "A", "D", 4, 25);
    const result = compareModels(n, origin, destination, start, limits);
    assert.equal(fastest(result.baseline.journeys), 25);
    assert.equal(fastest(result.extended.journeys), 25);
  });
  it("can rescue feasibility when Baseline has no complete journey", () => {
    const n = fixture(); n.edges.delete("B-D-50-80-transit"); n.edges.delete("A-D-10-90-transit");
    const result = compareModels(n, origin, destination, start, limits);
    assert.equal(result.baseline.journeys.length, 0);
    assert.equal(fastest(result.extended.journeys), 50);
  });
  it("enforces cumulative cycling, intermediate-leg, boarding and absolute time budgets", () => {
    const bike = cyclingMinutes(haversineKm(stops[1], stops[2]));
    for (const o of [{ maxBikeMinutes: bike - 1 }, { maxIntermediateMinutes: bike - 1 }, { maxBoardings: 1 }]) {
      const result = compareModels(fixture(), origin, destination, start, { ...limits, ...o });
      assert.ok(result.extended.journeys.every(j => metrics(j).middle === 0));
    }
    assert.equal(solve(fixture(), origin, destination, start, { ...limits, horizonMinutes: 49 }, "extended").journeys.length, 0);
    assert.equal(fastest(solve(fixture(), origin, destination, start, { ...limits, horizonMinutes: 50 }, "extended").journeys), 50);
  });
  it("includes initial and final cycling in the shared total budget", () => {
    const a = { ...origin, lon: origin.lon - .002 }, d = { ...destination, lon: destination.lon + .002 };
    const m = cyclingMinutes(haversineKm(stops[1], stops[2]));
    const result = solve(fixture(), a, d, start, { ...limits, maxAccessMinutes: 1, maxEgressMinutes: 1, maxBikeMinutes: m + 1 }, "extended");
    assert.ok(result.journeys.every(j => metrics(j).middle === 0));
  });
  it("accepts a departure exactly at bicycle arrival plus buffer; rejects one second earlier", () => {
    const n = fixture(), ready = 20 + cyclingMinutes(haversineKm(stops[1], stops[2])) + limits.boardingMinutes;
    n.edges.delete("C-D-34-50-transit"); ride(n, "C", "D", ready, 50);
    assert.equal(fastest(solve(n, origin, destination, start, limits, "extended").journeys), 50);
    n.edges.delete(`C-D-${ready}-50-transit`); ride(n, "C", "D", ready - 1 / 60, 50);
    assert.equal(fastest(solve(n, origin, destination, start, limits, "extended").journeys), 80);
  });
  it("cannot chain two intermediate cycling legs or finish immediately after an intermediate ride", () => {
    const n = fixture(); n.edges.clear();
    const e = { id: "E", name: "Third station", lat: 47.8, lon: 8 }, f = { ...e, id: "F", name: "Fourth station", lon: 8.03 };
    n.stops.set(e.id, e); n.stops.set(f.id, f);
    ride(n, "A", "B", 5, 20); ride(n, "C", "E", 34, 45); ride(n, "F", "D", 60, 80);
    assert.equal(solve(n, origin, destination, start, limits, "extended").journeys.length, 0);
    const c = { ...stops[2], label: "At C" };
    assert.equal(solve(n, origin, c, start, limits, "extended").journeys.length, 0);
  });
  it("retains a slower arrival at an interchange when it needs fewer boardings", () => {
    const n = fixture(); n.edges.clear();
    ride(n, "A", "C", 5, 10); ride(n, "C", "B", 14, 20); ride(n, "A", "B", 10, 25); ride(n, "B", "D", 30, 50);
    const journeys = solve(n, origin, destination, start, limits, "baseline").journeys;
    assert.ok(journeys.some(j => j.totalMinutes === 50 && j.changes === 1));
  });
  it("preserves Baseline routes even when the Extended resource limit is reached", () => {
    const result = solve(fixture(), origin, destination, start, limits, "extended", 2);
    assert.equal(result.limited, true);
    const compared = compareModels(fixture(), origin, destination, start, limits, 4);
    assert.ok(compared.baseline.journeys.length > 0);
    assert.equal(compared.extended.limited, true);
    assert.ok(compared.baseline.journeys.every(j => compared.extended.journeys.some(e => e.id === j.id)));
  });
  it("rejects malformed dates, backward timetable edges and invalid options", () => {
    const n = fixture(); n.edges.clear(); ride(n, "A", "D", 10, 5);
    assert.equal(solve(n, origin, destination, start, limits, "baseline").journeys.length, 0);
    assert.throws(() => solve(n, origin, destination, new Date("invalid"), limits, "baseline"));
    assert.throws(() => solve(n, origin, destination, start, { ...limits, maxBikeMinutes: NaN }, "baseline"));
  });
  it("matches exhaustive path enumeration across 54 shared-budget/model combinations", () => {
    // Independent enumeration without label dominance. The toy graph has no walking edges.
    const n = fixture(), bike = cyclingMinutes(haversineKm(stops[1], stops[2]));
    for (const budget of [0, bike - 1, bike]) for (const k of [1, 2, 3]) for (const horizon of [50, 80, 120]) for (const mode of ["baseline", "extended"] as const) {
      const expected: number[][] = [];
      const visit = (stop: string, t: number, b: number, boards: number, middle: boolean, needsTransit: boolean) => {
        if (t > horizon || b > budget || boards > k) return;
        if (stop === "D" && boards > 0 && !needsTransit) expected.push([t, b, boards]);
        for (const e of n.edges.values()) if (e.from === stop && e.leg.departure!.getTime() >= time(t + 3).getTime()) {
          visit(e.to, (e.leg.arrival!.getTime() - start.getTime()) / 60_000, b, boards + 1, middle, false);
        }
        if (mode === "extended" && boards > 0 && !middle && !needsTransit) for (const target of stops) {
          const minutes = cyclingMinutes(haversineKm(n.stops.get(stop)!, target));
          if (target.id !== stop && minutes > 0 && minutes <= limits.maxIntermediateMinutes) visit(target.id, t + minutes, b + minutes, boards, true, true);
        }
      };
      visit("A", 0, 0, 0, false, true);
      const expectedFront = [...new Set(expected.filter(a => !expected.some(b => b.every((v, i) => v <= a[i]) && b.some((v, i) => v < a[i]))).map(v => v.join(",")))].sort();
      const actual = solve(n, origin, destination, start, { ...limits, maxBikeMinutes: budget, maxBoardings: k, horizonMinutes: horizon }, mode);
      assert.deepEqual(vectors(actual.journeys), expectedFront, JSON.stringify({ budget, k, horizon, mode }));
    }
  });
});

describe("category selection", () => {
  it("selects distinct trade-offs and merges duplicate winners", () => {
    const { extended } = compareModels(fixture(), origin, destination, start, limits);
    const cards = categorize(extended.journeys, limits);
    assert.equal(cards.length, 3);
    assert.equal(cards.find(c => c.categories.includes("Fastest"))!.journey.totalMinutes, 50);
    assert.equal(cards.find(c => c.categories.includes("Least cycling"))!.journey.totalMinutes, 80);
    assert.equal(cards.find(c => c.categories.includes("Fewest changes"))!.journey.totalMinutes, 90);
    const one = categorize([extended.journeys[0]], limits);
    assert.equal(one.length, 1); assert.equal(one[0].categories.length, 3);
  });
  it("applies the arrival allowance only to presentation, and excludes pure cycling", () => {
    const { extended } = compareModels(fixture(), origin, destination, start, limits);
    const fakeBikeOnly = { ...extended.journeys[0], id: "bike-only", transitLegs: [], totalMinutes: 1 };
    const cards = categorize([...extended.journeys, fakeBikeOnly], { ...limits, extraTimeMinutes: 0 });
    assert.equal(cards.length, 1); assert.equal(cards[0].journey.totalMinutes, 50);
    assert.ok(extended.journeys.some(j => j.totalMinutes === 90));
  });
  it("retains endpoint trade-offs which are dominated in the three main criteria", () => {
    const j = solve(fixture(), origin, destination, start, limits, "baseline").journeys[0];
    const a = { ...j, id: "a", totalMinutes: 80, originStation: { ...j.originStation, bikeMinutes: 10 } };
    const b = { ...j, id: "b", totalMinutes: 85, originStation: { ...j.originStation, bikeMinutes: 0 }, destinationStation: { ...j.destinationStation, bikeMinutes: 15 } };
    assert.equal(pareto([a, b]).length, 1);
    assert.equal(categorize([a, b], { ...limits, endpointPreference: "start" }).find(c => c.categories.includes("Shorter ride at start"))!.journey.id, "b");
    assert.ok(categorize([a, b], { ...limits, endpointPreference: "end" }).length <= 4);
  });
});

describe("recorded timetable normalization", () => {
  it("routes the recorded Zürich HB → Chur → Laax train, walk and bus itinerary", () => {
    const recorded = JSON.parse(readFileSync(new URL("./fixtures/zurich-laax-2026-09-05.json", import.meta.url), "utf8"));
    const n = emptyNetwork(); assert.equal(addSections(n, recorded.sections), 0);
    const a = { ...n.stops.get("8503000")!, label: "Zürich HB" }, b = { ...n.stops.get("8509786")!, label: "Laax GR, posta" };
    const result = compareModels(n, a, b, new Date("2026-09-05T13:30:00+02:00"), { ...limits, horizonMinutes: 240 });
    assert.equal(fastest(result.baseline.journeys), 138);
    const j = result.baseline.journeys.find(j => j.totalMinutes === 138)!;
    assert.deepEqual(j.transitLegs.map(l => l.mode), ["transit", "walk", "transit"]);
    assert.deepEqual(j.services, ["IC 3", "B 81"]);
    assert.equal(j.changes, 1);
    assert.equal(j.transitLegs[2].departurePlatform, "N");
    assert.equal(fastest(result.extended.journeys), 138);
  });
  it("ignores pass-through points without an arrival and creates one-boarding exit prefixes", () => {
    const n = emptyNetwork();
    const point = (s: Stop, arrival: number | null, departure: number | null) => ({ station: { id: s.id, name: s.name, coordinate: { x: s.lat, y: s.lon } },
      arrival: arrival === null ? null : time(arrival).toISOString(), departure: departure === null ? null : time(departure).toISOString() });
    const a = point(stops[0], null, 5), b = point(stops[1], 20, 21), c = point(stops[2], null, null), d = point(stops[3], 50, null);
    assert.equal(addStationboard(n, [{ category: "IC", number: "3", name: "trip", stop: a, passList: [a, b, c, d] }]), 0);
    assert.ok(n.edges.size === 2);
    assert.ok(!n.stops.has("C"));
    const j = solve(n, origin, destination, start, limits, "baseline").journeys[0];
    assert.equal(j.changes, 0); assert.equal(j.totalMinutes, 50);
  });
});
