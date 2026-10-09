import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { it } from "node:test";
import { parseCyclingRoute } from "./cycling.ts";
import { chooseCyclingRoute } from "./cyclingPreferences.ts";
const read = (profile: string) => JSON.parse(gunzipSync(Buffer.from(JSON.parse(readFileSync(new URL(`./fixtures/epfl-basel-2026-10-09/${profile}.json`, import.meta.url), "utf8")).gzip, "base64")).toString());
it("keeps Fastest at least as fast as Simplest for the recorded EPFL–Basel paths at three paces", () => {
  const raw = [read("trekking"), read("fastbike")];
  for (const flatSpeedKmh of [15, 20, 25]) {
    const routes = raw.map(data => parseCyclingRoute(data, { lat: 46.5226, lon: 6.5664 }, { lat: 47.5476, lon: 7.5896 }, 0, { flatSpeedKmh, electricAssist: false }));
    const fastest = chooseCyclingRoute(routes, "fastest")!, simple = chooseCyclingRoute(routes, "simplest")!;
    assert.ok(fastest.minutes <= simple.minutes);
    assert.equal(fastest.alternativesChecked, 2);
    if (flatSpeedKmh === 25) { assert.deepEqual(routes.map(r => r.minutes), [556, 504]); assert.equal(fastest.minutes, 504); }
  }
});
