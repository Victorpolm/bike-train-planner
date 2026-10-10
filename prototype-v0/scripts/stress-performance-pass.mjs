import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { performanceNetwork } from "./fixtures/performance-network.mjs";
const current = fileURLToPath(new URL("..", import.meta.url));
if (!process.argv[2]) throw new Error("Supply a complete pre-change checkout.");
const baseline = resolve(process.argv[2]);
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function fixture(root, seed) {
  const f = await performanceNetwork(root, 8, seed % 2 === 0, seed, 4);
  const { solveWaypoints } = await import(pathToFileURL(resolve(root, "src/waypoints.ts")).href);
  f.solveWaypoints = solveWaypoints;
  let index = 0;
  for (const { leg } of f.network.edges.values()) {
    if (index++ % 5 !== seed % 5) continue;
    leg.realtime = { checkedAt: f.start.toISOString(), estimatedDeparture: new Date(+leg.departure + 240000).toISOString(),
      estimatedArrival: new Date(+leg.arrival + 240000).toISOString(), departurePlatform: seed % 3 === 0 ? "changed" : null,
      arrivalPlatform: null, cancelled: seed % 7 === 0, arrivalCancelled: false, departureCancelled: false, undefinedDelay: false };
  }
  return f;
}
let comparisons = 0, nonempty = 0, capped = 0;
const digest = createHash("sha256");
for (let seed = 0; seed < 24; seed++) {
  const a = await fixture(baseline, seed), b = await fixture(current, seed);
  for (const mode of ["baseline", "extended"]) for (const scope of ["confirmed", "allow-uncertain", "all-transit"]) for (const waypoints of [false, true]) {
    const options = { ...b.options, bicycleScope: scope, minBikeMinutes: [0, 6, 12][seed % 3],
      maxBoardings: 1 + seed % 4, horizonMinutes: [40, 75, 180][seed % 3],
      ...(seed % 4 === 0 ? { arriveBy: new Date(+b.start + 70 * 60000).toISOString() } : {}) };
    const run = f => {
      const via = [...f.network.stops.values()][3];
      return waypoints ? f.solveWaypoints(f.network, [f.origin, { ...via, stopId: via.id, label: "Via" }, f.destination], f.start, options, mode, seed % 5 === 0 ? 50 : 50000)
        : f.model.solve(f.network, f.origin, f.destination, f.start, options, mode, seed % 5 === 0 ? 50 : 50000);
    };
    const before = run(a), after = run(b);
    assert.equal(hash(after), hash(before), `seed ${seed}, ${mode}, ${scope}, waypoints=${waypoints}`);
    comparisons++; nonempty += Number(after.journeys.length > 0); capped += Number(after.limited); digest.update(hash(after));
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), comparisons, nonempty, capped, fingerprint: digest.digest("hex"),
  coverage: "Complete results, label counts/caps, both solvers and modes, all permission scopes, minimum durations, arrival deadlines, realtime delays/cancellations/platform changes and hydrated/missing transfer data." }, null, 2));
