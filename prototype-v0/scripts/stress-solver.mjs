import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { performanceNetwork } from "./fixtures/performance-network.mjs";

// Differential verification against a complete pre-change checkout.
// node scripts/stress-solver.mjs /absolute/baseline-checkout 96
const root = fileURLToPath(new URL("..", import.meta.url));
if (!process.argv[2]) throw new Error("A pre-change baseline checkout is required");
const baseline = resolve(process.argv[2]), seeds = Number(process.argv[3] ?? 96);
if (!Number.isInteger(seeds) || seeds < 1 || seeds > 1000) throw new Error("Invalid seed count");
function mutate(f, seed) {
  let state = seed + 1;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const dates = ["2026-03-29T00:30:00Z", "2026-10-25T00:30:00Z", "2026-10-09T21:30:00Z", "2026-12-13T06:30:00Z"];
  const start = new Date(dates[seed % dates.length]), offset = +start - +f.start; f.start = start;
  for (const [id, edge] of f.network.edges) {
    if (random() < .1) { f.network.edges.delete(id); continue; }
    const l = edge.leg;
    l.departure = new Date(+l.departure + offset); l.arrival = new Date(+l.arrival + offset);
    if (random() < .3) {
      l.operator = "Unreviewed";
      l.bicycleEvidence = { permission: ["allowed", "unknown", "prohibited"][Math.floor(random() * 3)],
        fromId: l.fromId, toId: l.toId, departure: l.departure.toISOString(), operator: l.operator, service: l.service,
        source: { title: "Synthetic evidence", url: "https://example.org/fixture", checked: "2026-10-10" }, conditions: [],
        prerequisites: { bikeTicket: "required", bikeReservation: ["required", "not-required", "unknown"][Math.floor(random() * 3)] } };
    }
  }
  return f;
}
function signature(f, o, mode, limit) {
  const result = f.model.solve(f.network, f.origin, f.destination, f.start, o, mode, limit);
  const all = { journeys: [...result.journeys].sort((a, b) => a.id.localeCompare(b.id)), proposals: f.model.categorize(result.journeys, o),
    explored: result.explored, retained: result.retained, limited: result.limited };
  return { hash: createHash("sha256").update(JSON.stringify(all)).digest("hex"), journeys: result.journeys.length, limited: result.limited };
}
let comparisons = 0, nonempty = 0, capped = 0;
const fingerprint = createHash("sha256");
for (let seed = 0; seed < seeds; seed++) {
  const hydrated = seed % 2 === 0, size = 8 + seed % 5;
  const before = mutate(await performanceNetwork(baseline, size, hydrated, seed, 4), seed);
  const after = mutate(await performanceNetwork(root, size, hydrated, seed, 4), seed);
  for (const mode of ["baseline", "extended"]) for (const scope of ["confirmed", "allow-uncertain", "all-transit"]) {
    const options = { ...after.options, bicycleScope: scope, maxBoardings: [1, 2, 4, 6][seed % 4],
      maxBikeMinutes: [12, 25, 40][seed % 3], maxIntermediateMinutes: seed % 4 === 0 ? 0 : 8,
      horizonMinutes: [40, 90, 180][seed % 3],
      objectives: seed % 3 === 0 ? ["fastest", "fewer-boardings", "least-cycling"] : ["fastest", "fewer-reservations"],
      ...(seed % 3 === 1 ? { arriveBy: new Date(+after.start + 75 * 60_000).toISOString() } : {}) };
    const limit = seed % 7 === 0 ? 40 : 50_000;
    const a = signature(before, options, mode, limit), b = signature(after, options, mode, limit);
    assert.equal(b.hash, a.hash, `seed ${seed}, ${mode}, ${scope}, hydrated=${hydrated}`);
    comparisons++; nonempty += Number(b.journeys > 0); capped += Number(b.limited); fingerprint.update(b.hash);
  }
  if ((seed + 1) % 16 === 0) console.error(`${seed + 1} seeds / ${comparisons} full-result comparisons passed`);
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), seeds, comparisons, nonempty, capped,
  aggregateFingerprint: fingerprint.digest("hex"),
  coverage: ["full journey objects and category selections", "explored/retained counts and label caps", "three bicycle-permission scopes",
    "both routing modes", "arrival deadlines", "boarding/cycling/time budgets", "mandatory and unknown reservations",
    "hydrated and missing platform data", "DST, midnight and expired transfer feeds"],
  caveat: "Deterministic synthetic cases compared against pre-change code; equivalence is not a proof of global routing completeness." }, null, 2));
