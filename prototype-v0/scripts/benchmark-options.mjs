import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import * as current from "../src/model.ts";
import { mixedRoutingFixture } from "../src/fixtures/mixedRouting.ts";
import { parseCyclingRoute } from "../src/cycling.ts";

// Offline diagnostic, no CI timing threshold. Optional argument: an older model
// module next to src/model.ts, so its relative imports resolve to the same deps.
const fixture = mixedRoutingFixture(undefined, 40);
const base = current.compareModels(fixture.network, fixture.origin, fixture.destination, fixture.start, fixture.options).extended.journeys[0];
const raw = JSON.parse(gunzipSync(Buffer.from(JSON.parse(readFileSync(new URL("../src/fixtures/epfl-basel-2026-10-09/trekking.json", import.meta.url))).gzip, "base64")).toString());
const path = parseCyclingRoute(raw, { lat: 46.5226, lon: 6.5664 }, { lat: 47.5476, lon: 7.5896 }, Date.now(), { flatSpeedKmh: 25, electricAssist: false });
const journeys = Array.from({ length: 240 }, (_, i) => ({ ...base, id: `benchmark-${i}`, totalMinutes: base.totalMinutes + i / 5,
  originStation: { ...base.originStation, cyclingRoute: path }, destinationStation: { ...base.destinationStation, cyclingRoute: path } }));
const options = { ...fixture.options, objectives: ["fastest", "fewer-boardings", "least-cycling", "less-traffic", "fewer-reservations"], climbOptimization: true };
const measure = module => {
  const times = []; let result;
  for (let i = 0; i < 9; i++) { const start = performance.now(); result = module.categorize(journeys, options); times.push(performance.now() - start); }
  return { medianMs: times.slice(2).sort((a, b) => a - b)[3], result };
};
const after = measure(current), before = process.argv[2] ? measure(await import(pathToFileURL(process.argv[2]).href)) : null;
if (before && JSON.stringify(before.result) !== JSON.stringify(after.result)) throw new Error("Different proposals");
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), candidates: journeys.length, elevationPointsPerEndpoint: path.elevation.length,
  samples: 7, beforeMedianMs: before?.medianMs, afterMedianMs: after.medianMs, identicalProposals: before ? true : undefined,
  caveat: "Synthetic candidate set with recorded long-route geometry; category computation only, not total live search latency." }, null, 2));
