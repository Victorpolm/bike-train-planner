import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { performanceNetwork } from "./fixtures/performance-network.mjs";

// Run alone, not alongside other CPU benchmarks. A baseline is a separate full
// source checkout with dependencies available, never a copied model with new dependencies.
// node scripts/benchmark-speed.mjs /absolute/baseline-checkout 36 5
const currentRoot = fileURLToPath(new URL("..", import.meta.url));
const baselineRoot = process.argv[2] ? resolve(process.argv[2]) : null;
const size = Number(process.argv[3] ?? 36), samples = Number(process.argv[4] ?? 5);
if (!Number.isInteger(size) || size < 8 || size > 60 || !Number.isInteger(samples) || samples < 1 || samples > 15) throw new Error("Invalid fixture size/sample count");
function fingerprint(result, model, options) {
  const content = { journeys: [...result.journeys].sort((a, b) => a.id.localeCompare(b.id)),
    proposals: model.categorize(result.journeys, options), explored: result.explored, retained: result.retained, limited: result.limited };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
async function measure(root, hydrated, mode) {
  const f = await performanceNetwork(root, size, hydrated), times = []; let result, digest;
  for (let i = 0; i <= samples; i++) {
    const before = performance.now();
    result = f.model.solve(f.network, f.origin, f.destination, f.start, f.options, mode, 100_000);
    const elapsed = performance.now() - before;
    const nextDigest = fingerprint(result, f.model, f.options);
    if (digest) assert.equal(nextDigest, digest, "Repeated searches changed their full result");
    digest = nextDigest;
    if (i) times.push(elapsed);
  }
  const ordered = [...times].sort((a, b) => a - b);
  return { medianMs: ordered[Math.floor(samples / 2)], minMs: ordered[0], maxMs: ordered.at(-1), timesMs: times,
    edges: f.network.edges.size, journeys: result.journeys.length, explored: result.explored, retained: result.retained, limited: result.limited, fingerprint: digest };
}
const results = [];
for (const hydrated of [false, true]) for (const mode of ["baseline", "extended"]) {
  const before = baselineRoot ? await measure(baselineRoot, hydrated, mode) : null;
  const after = await measure(currentRoot, hydrated, mode);
  if (before) assert.equal(after.fingerprint, before.fingerprint, "Full journeys, categories or label counts differ");
  const item = { hydrated, mode, before, after, speedup: before ? before.medianMs / after.medianMs : null };
  results.push(item); console.error(JSON.stringify({ hydrated, mode, beforeMs: before?.medianMs, afterMs: after.medianMs, identical: before ? true : undefined }));
}
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), stations: size, samples, warmups: 1, results,
  caveat: "Synthetic geometry and timetable, with actual bundled platform-transfer lookups. CPU-only solve timings; not the external Uster–Baden fixture or end-to-end provider/browser latency." }, null, 2));
