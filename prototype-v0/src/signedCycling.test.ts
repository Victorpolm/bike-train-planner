import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { gunzipSync } from "node:zlib";
import { CyclingClient } from "./cyclingClient.ts";
import { chooseCyclingRoute } from "./cyclingPreferences.ts";
import { parseCyclingRoute, type CycleSection, type CyclingRoute } from "./cycling.ts";
import { signedCyclingStretch } from "./signedCycling.ts";
import { DEFAULT_OPTIONS, validateOptions } from "./model.ts";
import { DEFAULT_HILLS } from "./hills.ts";

const from = { lon: 8.01, lat: 47.03 }, to = { lon: 8.01, lat: 47.032 };
const street = "highway=residential maxspeed=30 surface=asphalt";
const regional = " route_bicycle_rcn=yes";
function data(tags: string, seconds: number, bend = false) {
  return { features: [{ geometry: { type: "LineString", coordinates: [
    [from.lon, from.lat, 400], [bend ? 8.0101 : 8.01, 47.031, 400], [to.lon, to.lat, 400]] },
    properties: { "total-time": seconds, "track-length": bend ? 225 : 222,
      voicehints: [[1, 2]], messages: [["Longitude", "Latitude", "WayTags"], [8010000, 47032000, tags]] } }] };
}
function route(tags: string, seconds = 600, bend = false) {
  return parseCyclingRoute(data(tags, seconds, bend), from, to);
}
const length = (r: CyclingRoute) => signedCyclingStretch(r).longestM;
it("measures the uninterrupted ride within a network class across splits and overlapping memberships", () => {
  const base = route(street), section = base.sections[0];
  const part = (startM: number, endM: number, networks: string[], mode: CycleSection["mode"] = "cycle"): CycleSection => ({
    ...section, startM, endM, mode, tags: Object.fromEntries(networks.map(n => ["route_bicycle_" + n, "yes"])) });
  const parts = [part(0, 50, ["ncn"]), part(50, 80, ["ncn", "rcn"]), part(80, 150, ["rcn"]),
    part(150, 152, ["rcn"], "push"), part(152, 192, ["rcn"]), part(196, 222, ["rcn"])];
  assert.deepEqual(signedCyclingStretch({ ...base, sections: parts }), { longestM: 100, outsideM: 122 });
  assert.equal(length(route(street + " route_bicycle_rcn=proposed route_bicycle_mtb=yes")), 0);
  assert.equal(length(route(street + " cycleway=track")), 0);
  assert.equal(length(route(street + regional + " bicycle=dismount")), 0);
});
it("can trade time for signed riding inside a single allowance and rejects a one-second overrun", () => {
  const fast = route(street), signed = route(street + regional, 690, true);
  assert.equal(chooseCyclingRoute([signed, fast], "fastest")?.ridingSeconds, 600);
  const choice = chooseCyclingRoute([fast, signed], "fastest", undefined, true)!;
  assert.equal(choice.ridingSeconds, 690);
  assert.match(choice.preferenceNote!, /225 m/);
  assert.equal(chooseCyclingRoute([fast, route(street + regional, 691, true)], "fastest", undefined, true)?.ridingSeconds, 600);
  assert.equal(chooseCyclingRoute([fast, signed], "fastest", { ...DEFAULT_HILLS, mode: "gentler", extraMinutes: 1 }, true)?.ridingSeconds, 600);
});
it("preserves the chosen primary goal, stairs preference and unknown evidence", () => {
  const fast = route(street), signed = route(street + regional, 650, true);
  const easy = (alt: CyclingRoute) => chooseCyclingRoute([fast, alt], "simplest", undefined, true);
  assert.equal(easy({ ...signed, turnCount: 2 })?.ridingSeconds, 600);
  assert.equal(easy({ ...signed, turnCount: undefined })?.ridingSeconds, 600);
  assert.equal(easy(signed)?.ridingSeconds, 650);
  assert.equal(chooseCyclingRoute([fast, route(street + regional + " maxspeed=80", 630)], "lower-stress", undefined, true)?.ridingSeconds, 600);
  assert.equal(chooseCyclingRoute([fast, route(street + regional, 630)], "lower-stress", undefined, true)?.ridingSeconds, 630);
  const stairs = { ...signed, sections: signed.sections.map(s => ({ ...s, tags: { ...s.tags, highway: "steps" } })) };
  assert.equal(easy(stairs)?.ridingSeconds, 600);
});
it("avoids taking a longer signed detour just to accumulate distance", () => {
  const fast = route(street + regional), longer = route(street + regional, 650, true);
  assert.equal(chooseCyclingRoute([fast, longer], "fastest", undefined, true)?.ridingSeconds, 600);
});
it("reuses the same checked routes on a preference switch and retains the opt-in through a session fork", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async input => {
    const profile = new URL(String(input)).searchParams.get("profile")!;
    calls.push(profile);
    return Response.json(profile === "fastbike" ? data(street, 600) : data(street + regional, 650, true));
  };
  const make = (follow: boolean) => new CyclingClient(new AbortController().signal, fetcher, 0, true, null, undefined, "fastest", null, DEFAULT_HILLS, false, false, follow);
  const ordinary = make(false), on = make(true);
  assert.equal((await ordinary.route(from, to))?.ridingSeconds, 600);
  assert.equal((await on.route(from, to))?.ridingSeconds, 650);
  assert.equal(on.requests, 0);
  const fork = on.fork(new AbortController().signal);
  assert.equal(fork.followSignedRoutes, true);
  assert.equal((await fork.route(from, to))?.ridingSeconds, 650);
  assert.equal((await make(false).route(from, to))?.ridingSeconds, 600);
  assert.equal(calls.length, 2);
});
it("reads older saved options and validates the opt-in type", () => {
  assert.doesNotThrow(() => validateOptions({ ...DEFAULT_OPTIONS }));
  assert.doesNotThrow(() => validateOptions({ ...DEFAULT_OPTIONS, followSignedRoutes: true }));
  assert.throws(() => validateOptions({ ...DEFAULT_OPTIONS, followSignedRoutes: "yes" as never }), /signed cycling/);
});
it("keeps the stairs-free Zürich HG–Stadelhofen path despite 819 m of mapped network on the other candidate", () => {
  const a = { lat: 47.376427, lon: 8.548112 }, b = { lat: 47.36661115, lon: 8.54848502 };
  const paths = ["current-primary", "road-candidate"].map(name => {
    const capture = JSON.parse(readFileSync(new URL("./fixtures/eth-stadelhofen-2026-10-07/" + name + ".json", import.meta.url), "utf8"));
    return parseCyclingRoute(capture, a, b, 0, { flatSpeedKmh: 15, electricAssist: false });
  });
  assert.deepEqual(paths.map(p => Math.round(length(p))), [819, 0]);
  assert.equal(chooseCyclingRoute(paths, "fastest", undefined, true)?.distanceKm, 1.551);
});

it("replays Vevey–Montreux and buys a longer mapped stretch only when the selected goal permits it", () => {
  const captures = JSON.parse(readFileSync(new URL("./fixtures/signed-vevey-montreux-2026-11-18/routes.json", import.meta.url), "utf8"));
  const routes = ["trekking", "fastbike"].map(profile => parseCyclingRoute(
    JSON.parse(gunzipSync(Buffer.from(captures[profile], "base64")).toString()),
    { lon: 6.84458, lat: 46.46315 }, { lon: 6.90987, lat: 46.43534 }, 0, { flatSpeedKmh: 15, electricAssist: false }));
  const quick = chooseCyclingRoute(routes, "fastest")!;
  const followed = chooseCyclingRoute(routes, "fastest", undefined, true)!;
  assert.deepEqual([quick.minutes, followed.minutes], [31, 33]);
  assert.deepEqual([Math.round(length(quick)), Math.round(followed.signedNetworkStretchM!)], [4959, 6266]);
  assert.deepEqual([quick.turnCount, followed.turnCount], [7, 23]);
  assert.equal(chooseCyclingRoute(routes, "simplest", undefined, true)?.turnCount, 7);
  assert.equal(chooseCyclingRoute(routes, "lower-stress", undefined, true)?.distanceKm, followed.distanceKm);
});
