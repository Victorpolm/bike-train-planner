import { performance } from "node:perf_hooks";
import { bicyclePermission, evaluateBicyclePermission } from "../src/bicyclePermission.ts";
import { compareModels } from "../src/model.ts";
import { mixedRoutingFixture } from "../src/fixtures/mixedRouting.ts";

// Offline diagnostic, not a CI timing threshold. No timetable, fare or route API.
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const measure = fn => { const start = performance.now(); fn(); return performance.now() - start; };
const f = mixedRoutingFixture(undefined, 40), legs = [...f.network.edges.values()].map(e => e.leg);
for (const leg of legs) if (bicyclePermission(leg) !== evaluateBicyclePermission(leg)) throw new Error("Permission mismatch");
const passes = reader => { for (let i = 0; i < 10; i++) for (const leg of legs) reader(leg); };
passes(bicyclePermission); passes(evaluateBicyclePermission);
const cold = [], warm = [], permission = [], cached = [];
const solve = g => compareModels(g.network, g.origin, g.destination, g.start, g.options);
for (let i = 0; i < 7; i++) {
  permission.push(measure(() => passes(evaluateBicyclePermission)));
  cached.push(measure(() => passes(bicyclePermission)));
  const g = mixedRoutingFixture(undefined, 40);
  cold.push(measure(() => solve(g)));
  warm.push(measure(() => solve(g)));
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), node: process.version,
  fixture: "synthetic mixed rail/bus, non-station endpoints, routed cycling durations", legs: legs.length,
  samples: 7, permissionPasses: 10, permissionMedianMs: median(permission), cachedPermissionMedianMs: median(cached),
  comparisonColdCacheMedianMs: median(cold), comparisonWarmCacheMedianMs: median(warm),
  caveat: "Cold/warm Baseline+Extended comparison on one synthetic graph; not a live full-search speedup or the PDF benchmark." }, null, 2));
