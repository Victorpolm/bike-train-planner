import assert from "node:assert/strict";
import { it } from "node:test";
import { mixedRoutingFixture } from "./fixtures/mixedRouting.ts";
import { compareModels, solve, type Options } from "./model.ts";
import { bicycleLegAllowed } from "./bicyclePermission.ts";
import { applyBicycleEvidence } from "./ojpClient.ts";

it("preserves per-case parameter monotonicity with real cycling durations and mixed train/bus legs", () => {
  const f = mixedRoutingFixture(); let comparisons = 0;
  const sweeps: [keyof Options, unknown[], boolean][] = [
    ["maxBikeMinutes", [0, 15, 30, 60], true], ["maxBoardings", [1, 2, 4], true],
    ["horizonMinutes", [45, 90, 180], true], ["boardingMinutes", [0, 3, 8, 12], false],
    ["bicycleScope", ["confirmed", "allow-uncertain", "all-transit"], true],
    ["busPreference", ["no-buses", "known-rules", "include-unknown"], true],
  ];
  for (const offset of [0, 7, 40]) for (const mode of ["baseline", "extended"] as const) {
    const start = new Date(f.start.getTime() + offset * 60_000);
    for (const [key, values, relaxing] of sweeps) {
      let previous: number | undefined;
      for (const value of values) {
        const result = solve(f.network, f.origin, f.destination, start, { ...f.options, [key]: value }, mode);
        assert.equal(result.limited, false, "A truncated search cannot establish the invariant");
        const fastest = Math.min(...result.journeys.map(j => j.totalMinutes)); // No route stays Infinity; never drop failed cases.
        if (previous !== undefined) {
          assert.ok(relaxing ? fastest <= previous : fastest >= previous, `${mode}/${offset}/${key}/${value}: ${previous} → ${fastest}`);
          comparisons++;
        }
        previous = fastest;
      }
    }
    const both = compareModels(f.network, f.origin, f.destination, start, f.options);
    assert.ok(both.baseline.journeys.every(j => both.extended.journeys.some(e => e.id === j.id)));
  }
  assert.equal(comparisons, 84);
});

it("exercises cycling pace on non-station endpoints and changes useful mixed-mode results", () => {
  const arrivals: number[] = [];
  for (const flatSpeedKmh of [8, 15, 25, 35]) {
    const f = mixedRoutingFixture({ flatSpeedKmh, electricAssist: false });
    const result = solve(f.network, f.origin, f.destination, f.start, f.options, "extended");
    assert.equal(result.limited, false);
    assert.ok(result.journeys.every(j => j.originStation.bikeMinutes > 0 && j.destinationStation.bikeMinutes > 0));
    arrivals.push(Math.min(...result.journeys.map(j => j.totalMinutes)));
  }
  assert.ok(arrivals.every((value, i) => !i || value <= arrivals[i - 1]));
  assert.ok(arrivals[0] > arrivals.at(-1)!);
});

it("re-solves with a new prohibition after the permission cache was warm", () => {
  const f = mixedRoutingFixture();
  const options = { ...f.options, bicycleScope: "allow-uncertain" as const };
  solve(f.network, f.origin, f.destination, f.start, options, "extended");
  const target = [...f.network.edges.values()].find(e => e.leg.operator === "VBZ")!.leg;
  assert.equal(bicycleLegAllowed(target, "include-unknown"), true);
  applyBicycleEvidence(f.network, target, { permission: "prohibited", fromId: target.fromId!, toId: target.toId!,
    departure: target.departure!.toISOString(), service: target.service, operator: target.operator!, conditions: [],
    source: { title: "Synthetic updated evidence", url: "https://example.org/updated", checked: "2026-10-01" } });
  const result = solve(f.network, f.origin, f.destination, f.start, options, "extended");
  assert.ok(result.journeys.length > 0);
  assert.ok(result.journeys.every(j => j.transitLegs.every(l => !(l.fromId === target.fromId && l.toId === target.toId && l.departure?.getTime() === target.departure?.getTime()))));
});
