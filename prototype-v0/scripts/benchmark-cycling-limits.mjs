import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { performanceNetwork } from "./fixtures/performance-network.mjs";
import { cyclingDurationOptions } from "../src/cyclingDuration.ts";

// Run alone. Measures CPU sensitivity on a fixed synthetic network; no provider
// requests, GPS measurements, browser timings or national completeness claim.
// node scripts/benchmark-cycling-limits.mjs 24 3
const root = fileURLToPath(new URL("..", import.meta.url));
const stations = Number(process.argv[2] ?? 24), samples = Number(process.argv[3] ?? 3);
if (!Number.isInteger(stations) || stations < 8 || stations > 32 || !Number.isInteger(samples) || samples < 1 || samples > 5)
  throw new Error("Use 8–32 stations and 1–5 measured samples.");
const f = await performanceNetwork(root, stations, true), results = [];
for (const amount of [{ mode: "at-most", minutes: 30 }, { mode: "at-most", minutes: 45 },
  { mode: "none", minutes: 0 }, { mode: "at-least", minutes: 30 }]) {
  const options = { ...f.options, ...cyclingDurationOptions(amount),
    objectives: ["fastest", "fewer-boardings", "least-cycling"] };
  for (const mode of ["baseline", "extended"]) {
    const times = []; let result, fingerprint;
    for (let i = 0; i <= samples; i++) {
      const began = performance.now();
      result = f.model.solve(f.network, f.origin, f.destination, f.start, options, mode);
      const elapsed = performance.now() - began;
      assert.ok(result.journeys.every(j => {
        const bike = f.model.metrics(j).bike;
        return bike >= options.minBikeMinutes && bike <= options.maxBikeMinutes;
      }));
      const hash = createHash("sha256").update(JSON.stringify(result)).digest("hex");
      if (fingerprint) assert.equal(hash, fingerprint, "Repeated results changed");
      fingerprint = hash;
      if (i) times.push(elapsed);
    }
    const item = { amount, mode, medianMs: [...times].sort((a, b) => a - b)[Math.floor(samples / 2)],
      timesMs: times, explored: result.explored, retained: result.retained, journeys: result.journeys.length,
      limited: result.limited, fingerprint };
    results.push(item); console.error(JSON.stringify({ amount, mode, medianMs: item.medianMs, explored: item.explored, limited: item.limited }));
  }
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), stations, edges: f.network.edges.size, samples, warmups: 1,
  horizonMinutes: f.options.horizonMinutes, maxBoardings: f.options.maxBoardings, results,
  caveat: "Controlled CPU-only single-solve measurements on synthetic geometry/timetables with actual bundled station-transfer rules. Not end-to-end live search, phone performance, a before/after speed claim, or a national-completeness proof. The real app also acquires provider data and repeats solves across graph updates, modes and distinct bicycle-permission scopes." }, null, 2));
