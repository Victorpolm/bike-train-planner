import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { performanceNetwork } from "./fixtures/performance-network.mjs";
const current = fileURLToPath(new URL("..", import.meta.url));
if (!process.argv[2]) throw new Error("Supply the complete pre-change checkout.");
const baseline = resolve(process.argv[2]), samples = Number(process.argv[3] ?? 3);
if (!Number.isInteger(samples) || samples < 1 || samples > 7) throw new Error("Use 1–7 samples.");
const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const load = (root, path) => import(pathToFileURL(resolve(root, path)).href);
async function measure(root, condition) {
  const f = await performanceNetwork(root, 24, true);
  const { cyclingDurationOptions } = await load(root, "src/cyclingDuration.ts");
  const options = { ...f.options, ...cyclingDurationOptions(condition.amount), objectives: ["fastest", "fewer-boardings", "least-cycling"] };
  let operation;
  if (condition.kind === "solve") operation = () => f.model.solve(f.network, f.origin, f.destination, f.start, options, condition.mode);
  else {
    const { updateBicycleEvidence } = await load(root, "src/api.ts"), { TimetableClient } = await load(root, "src/timetableClient.ts");
    const empty = () => ({ journeys: [], reachable: [], explored: 0, retained: 0, limited: false });
    const session = { origin: f.origin, destination: f.destination, start: f.start, options, network: f.network,
      client: new TimetableClient(new AbortController().signal), originStations: [], destinationStations: [], baseline: empty(), extended: empty() };
    // A nonmatching evidence target forces a normal refresh without changing any input.
    const target = { fromId: "not-in-fixture", toId: "not-in-fixture" };
    operation = () => { updateBicycleEvidence(session, target, {}, () => {}); return { baseline: session.baseline, extended: session.extended, confirmed: session.confirmed, allTransit: session.allTransit }; };
  }
  const times = []; let hash, result;
  for (let i = 0; i <= samples; i++) {
    const before = performance.now(); result = operation(); const elapsed = performance.now() - before;
    const next = fingerprint(result); if (hash) assert.equal(next, hash, "Repeated full results changed"); hash = next;
    if (i) times.push(elapsed);
  }
  const solution = condition.kind === "solve" ? result : result.extended;
  return { medianMs: [...times].sort((a, b) => a - b)[Math.floor(samples / 2)], timesMs: times, fingerprint: hash,
    journeys: solution.journeys.length, explored: solution.explored, retained: solution.retained, limited: solution.limited };
}
const conditions = [
  ...["baseline", "extended"].flatMap(mode => ["at-most", "at-least"].map(rule => ({ kind: "solve", mode, amount: { mode: rule, minutes: 30 } }))),
  { kind: "unchanged refresh", mode: "extended", amount: { mode: "at-most", minutes: 30 } },
];
const results = [];
for (const condition of conditions) {
  const before = await measure(baseline, condition), after = await measure(current, condition);
  assert.equal(after.fingerprint, before.fingerprint, "Complete results differ from the pre-change release");
  const result = { condition, before, after, speedup: before.medianMs / after.medianMs }; results.push(result);
  console.error(JSON.stringify({ condition, beforeMs: before.medianMs, afterMs: after.medianMs, identical: true }));
}
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), stations: 24, hydrated: true, samples, warmups: 1, results,
  caveat: "Controlled synthetic CPU benchmark with real bundled transfer rules. The unchanged-refresh case measures exact repeated input, not an entire live acquisition. No phone/network speedup or routing completeness is claimed; minimum cases can reach the unchanged label allowance." }, null, 2));
