import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { parseCyclingRoute, type CyclingRoute } from "./cycling.ts";
import { chooseCyclingRoute, cyclingDetourMinutes } from "./cyclingPreferences.ts";
import { roadCrossings, routeStress } from "./cyclingStress.ts";
import { DEFAULT_HILLS } from "./hills.ts";

const from = { lon: 8, lat: 47 }, to = { lon: 8, lat: 47.002 };
const road = "highway=residential surface=asphalt", path = "highway=cycleway surface=asphalt";
function sample(first: string, second = first, node = "", hints: number[][] = [], seconds = 120): CyclingRoute {
  const messages = [["Longitude", "Latitude", "WayTags", "NodeTags"],
    [8000000, 47001000, first, node], [8000000, 47002000, second, ""]];
  return parseCyclingRoute({ features: [{ geometry: { type: "LineString", coordinates: [[8, 47], [8, 47.001], [8, 47.002]] },
    properties: { "total-time": seconds, "track-length": 222, messages, voicehints: hints } }] }, from, to, 0);
}
const score = (tags: string) => routeStress(sample(tags));
it("ranks 30 below 50 below 80 on the same road, with directional, zone and unknown limits", () => {
  const speed = (extra: string) => score(road + " " + extra);
  assert.ok(speed("maxspeed=30") < speed("maxspeed=50"));
  assert.ok(speed("maxspeed=50") < speed("maxspeed=80"));
  assert.equal(speed("zone:maxspeed=CH:30"), speed("maxspeed=30"));
  assert.equal(speed("maxspeed=50 zone:maxspeed=CH:30"), speed("maxspeed=50"));
  const directional = "maxspeed:forward=30 maxspeed:backward=80";
  assert.equal(speed(directional), speed("maxspeed=30"));
  assert.equal(speed(directional + " reversedirection=yes"), speed("maxspeed=80"));
  assert.ok(speed("maxspeed=30 maxspeed:conditional=50") > speed("maxspeed=30"));
});
it("distinguishes lorry designation, permission, traffic estimates and a physically separated lane", () => {
  assert.ok(score(road + " hgv=designated") > score(road));
  assert.equal(score(road + " hgv=yes"), score(road));
  assert.ok(score(road + " estimated_traffic_class=7") > score(road));
  assert.ok(score(road + " maxspeed=30 cycleway=lane") > score(road + " maxspeed=80 hgv=designated cycleway=track"));
  assert.equal(score(road + " cycleway=track"), score(road + " cycleway=track hgv=designated maxspeed=80"));
  assert.ok(score(road + " cycleway=separate") > score(road + " cycleway=track"));
});
it("rewards forest or water on rideable motor-free paths and checks conflicting access", () => {
  const shared = "highway=path surface=compacted bicycle=designated foot=yes motor_vehicle=no";
  for (const setting of ["estimated_forest_class=5", "estimated_river_class=4"]) {
    assert.ok(score(shared + " " + setting) < score(path));
    assert.ok(score(path + " " + setting) < score(path));
    assert.equal(score(road + " " + setting), score(road));
    assert.equal(score(shared + " motorcar=destination " + setting), score(shared + " motorcar=destination"));
    assert.equal(score(shared + " motor_vehicle:conditional=delivery " + setting), score(shared + " motor_vehicle:conditional=delivery"));
    assert.equal(score(shared + " bicycle=no " + setting), score(shared + " bicycle=no"));
    assert.equal(score(shared + " smoothness=impassable " + setting), score(shared + " smoothness=impassable"));
  }
});
it("resolves motor-access overrides from the specific mode to vehicle and general access", () => {
  const shared = "highway=path surface=compacted bicycle=yes";
  const forest = " estimated_forest_class=5";
  for (const access of ["access=no vehicle=yes", "motor_vehicle=no psv=yes", "motor_vehicle=no bus:conditional=yes"]) {
    assert.equal(score(shared + " " + access + forest), score(shared + " " + access));
  }
  const closed = shared + " access=yes vehicle=yes motor_vehicle=no";
  assert.ok(score(closed + forest) < score(closed));
});
it("counts each mapped crossing once, including split ways, and ignores longitudinal and grade-separated encounters", () => {
  const crossing = path + " cycleway=crossing", node = "highway=crossing crossing=traffic_signals";
  const plain = sample(path), cross = sample(path, path, node);
  assert.equal(roadCrossings(cross), 1);
  assert.equal(roadCrossings(sample(crossing, crossing, node)), 1);
  assert.equal(roadCrossings(sample(road, road, node)), 0);
  assert.equal(roadCrossings(sample(path, path + " bridge=yes", node)), 0);
  assert.equal(roadCrossings(sample(path, path, "railway=level_crossing highway=crossing")), 0);
  assert.equal(roadCrossings(sample(road, road, "estimated_crossing_class=6")), 1);
  assert.ok(routeStress(cross) > routeStress(plain));
});
it("penalizes an evidenced left turn across opposing traffic without counting ordinary bends, one-way turns or protected turns", () => {
  const main = "highway=secondary surface=asphalt oneway=no", turn = [[1, 2]];
  assert.equal(roadCrossings(sample(main, road, "", turn)), 1);
  assert.equal(roadCrossings(sample(main, road, "", [[1, 5]])), 0);
  assert.equal(roadCrossings(sample(main, main, "", turn)), 0);
  assert.equal(roadCrossings(sample(main + " oneway=yes", road, "", turn)), 0);
  assert.equal(roadCrossings(sample(main + " cycleway=track", road, "", turn)), 0);
});
it("enforces one fastest-based allowance to the second, with no floor and a 15-minute ceiling", () => {
  assert.deepEqual([0, 10, 20, 100, 240].map(cyclingDetourMinutes), [0, 1.5, 3, 15, 15]);
  for (const [baseline, boundary] of [[60, 69], [600, 690], [14400, 15300]]) {
    const fast = sample(road, road, "", [[1, 2]], baseline);
    const inside = sample(path, path, "", [], boundary);
    const outside = sample(path, path, "", [], boundary + 1);
    for (const pref of ["simplest", "lower-stress"] as const) {
      assert.equal(chooseCyclingRoute([fast, inside], pref)?.ridingSeconds, boundary);
      assert.equal(chooseCyclingRoute([fast, outside], pref)?.ridingSeconds, baseline);
      assert.equal(chooseCyclingRoute([fast, outside], pref, { ...DEFAULT_HILLS, mode: "gentler", extraMinutes: 60 })?.ridingSeconds, baseline);
    }
    assert.equal(chooseCyclingRoute([fast, { ...inside, turnCount: 1 }], "simplest")?.ridingSeconds, baseline);
  }
});
it("falls back to elapsed time when both paths lack traffic evidence and avoids presenting missing evidence as a quiet route", () => {
  const slow = sample("", "", "", [], 127), fast = sample("", "", "", [], 120);
  assert.equal(chooseCyclingRoute([slow, fast], "lower-stress")?.ridingSeconds, 120);
  assert.equal(chooseCyclingRoute([fast, sample(road, road, "", [], 127)], "lower-stress")?.ridingSeconds, 127);
});
it("retains mapped crossing evidence from the recorded ETH Zürich–Stadelhofen ride", () => {
  const data = JSON.parse(readFileSync(new URL("./fixtures/eth-stadelhofen-2026-10-07/current-primary.json", import.meta.url), "utf8"));
  const r = parseCyclingRoute(data, { lat: 47.376427, lon: 8.548112 }, { lat: 47.36661115, lon: 8.54848502 });
  const marked = r.crossingNodes!.filter(n => n.tags.highway === "crossing");
  assert.ok(marked.length > 0);
  assert.equal(new Set(marked.map(n => n.distanceM)).size, marked.length);
  assert.ok(roadCrossings(r) < marked.length);
});
