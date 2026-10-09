import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { parseCyclingRoute } from "./cycling.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { chooseCyclingRoute } from "./cyclingPreferences.ts";

const from = { lat: 47.376427, lon: 8.548112 }, to = { lat: 47.36661115, lon: 8.54848502 };
const pace = { flatSpeedKmh: 15, electricAssist: false };
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/eth-stadelhofen-2026-10-07/${name}.json`, import.meta.url), "utf8"));
const primary = fixture("current-primary"), alternative = fixture("current-alternative"), legacy = fixture("legacy-alternative"), road = fixture("road-candidate");
const parse = (data: unknown) => parseCyclingRoute(data, from, to, 0, pace);
function withHints(hints: unknown) {
  const data = structuredClone(primary);
  data.features[0].properties.voicehints = hints;
  return parse(data);
}

it("counts turning decisions, including forks and roundabouts, without counting continue or endpoint instructions", () => {
  const last = primary.features[0].geometry.coordinates.length - 1;
  assert.equal(withHints([[0, 2], [1, 1], [2, 2], [2, 2], [3, 8], [4, 13], [5, 12], [6, 16], [7, 100], [last, 5]]).turnCount, 3);
  assert.equal(withHints([]).turnCount, 0);
  assert.equal(withHints([[1, 1], [2, 1]]).turnCount, 0);
});
it("keeps missing, malformed or unsupported turn instructions unknown rather than making them win as zero turns", () => {
  for (const hints of [undefined, null, {}, [[]], [[-1, 2]], [[1.5, 2]], [[1, "2"]], [[1, 99]], [[9999, 2]]]) {
    const unknown = withHints(hints);
    assert.equal(unknown.turnCount, undefined);
    assert.equal(chooseCyclingRoute([unknown, { ...unknown, turnCount: 4 }], "simplest")!.turnCount, 4);
  }
});
it("reproduces ETH HG–Stadelhofen and selects the shorter road candidate with fewer actual turns", () => {
  const a = parse(primary), b = parse(legacy), c = parse(road);
  assert.deepEqual([a.turnCount, b.turnCount, c.turnCount], [16, 16, 11]);
  assert.equal(chooseCyclingRoute([a, b], "simplest")!.distanceKm, 1.774);
  assert.equal(chooseCyclingRoute([a, b], "simplest")!.alternativesChecked, 1);
  const selected = chooseCyclingRoute([a, c], "simplest")!;
  assert.equal(selected.distanceKm, 1.551);
  assert.equal(selected.turnCount, 11);
  assert.equal(selected.carryingSeconds, 0);
  assert.equal(selected.blocked, false);
  assert.equal(selected.alternativesChecked, 2);
});
it("uses a bicycle road profile for Simplest while preserving the primary path and bicycle restrictions", async () => {
  const urls: URL[] = [];
  const client = new CyclingClient(new AbortController().signal, async input => {
    const url = new URL(String(input)); urls.push(url);
    return Response.json(url.searchParams.get("profile") === "fastbike" ? road : primary);
  }, 0, false, null, pace, "simplest", null);
  const selected = await client.route(from, to);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.get("profile"), "trekking");
  const params = urls[1].searchParams;
  assert.equal(params.get("profile"), "fastbike");
  assert.equal(params.get("alternativeidx"), "0");
  for (const flag of ["allow_steps", "allow_motorways", "allow_ferries"]) assert.equal(params.get("profile:" + flag), "0");
  assert.equal(params.get("profile:considerTurnRestrictions"), "1");
  assert.equal(params.get("profile:maxSpeed"), "45");
  assert.equal(params.has("profile:ignore_cycleroutes"), false);
  assert.equal(selected?.distanceKm, 1.551);
  assert.equal(client.requests, 2);
});
it("lets a 12-second Simplest alternative finish instead of discarding it after 2.5 seconds", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const client = new CyclingClient(new AbortController().signal, async (input, init) => {
    if (new URL(String(input)).searchParams.get("profile") !== "fastbike") return Response.json(alternative);
    return new Promise((resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      setTimeout(() => resolve(Response.json(road)), 12_000);
    });
  }, 0, false, null, pace, "simplest", null);
  const task = client.route(from, to);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(client.requests, 2);
  t.mock.timers.tick(12_000);
  assert.equal((await task)?.distanceKm, 1.551);
});
it("keeps the ordinary route when the road candidate is unavailable or less simple", async () => {
  for (const available of [false, true]) {
    const data = structuredClone(road);
    // More instructions than the primary; all are interior, real turn codes.
    data.features[0].properties.voicehints = Array.from({ length: 20 }, (_, i) => [i + 1, 2]);
    const original = structuredClone(alternative); // Stair-free comparison avoids a terrain preference deciding the outcome.
    const client = new CyclingClient(new AbortController().signal, async input => {
      if (new URL(String(input)).searchParams.get("profile") !== "fastbike") return Response.json(original);
      return available ? Response.json(data) : new Response("unavailable", { status: 503 });
    }, 0, false, null, pace, "simplest", null);
    assert.equal((await client.route(from, to))?.distanceKm, 1.925);
  }
});

it("Fastest checks the same road candidate as Simplest and reuses it without more requests", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async input => { calls++; return Response.json(new URL(String(input)).searchParams.get("profile") === "fastbike" ? road : primary); };
  const fastest = new CyclingClient(new AbortController().signal, fetcher, 0, true, null, pace, "fastest", null);
  const quick = await fastest.route(from, to);
  assert.equal(calls, 2); assert.equal(quick?.distanceKm, 1.551);
  const simplest = new CyclingClient(new AbortController().signal, fetcher, 0, true, null, pace, "simplest", null);
  const simple = await simplest.route(from, to);
  assert.equal(calls, 2); assert.ok(quick!.minutes <= simple!.minutes);
  assert.equal(simplest.requests, 0);
});
it("never labels the 7h04 candidate fastest when the shared pool contains a 6h46 candidate", () => {
  const route = parse(road), faster = { ...route, minutes: 406, turnCount: 20 }, slower = { ...route, minutes: 424, turnCount: 10 };
  assert.equal(chooseCyclingRoute([slower, faster], "fastest")!.minutes, 406);
  assert.ok(chooseCyclingRoute([slower, faster], "simplest")!.minutes >= 406);
});
