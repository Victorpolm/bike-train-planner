import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { plan, type SearchSession } from "./api.ts";
import { compareModels, DEFAULT_OPTIONS, emptyNetwork, metrics, solve } from "./model.ts";
import { addSections } from "./timetable.ts";
import { preferenceOptions } from "./preferences.ts";
import { MAJOR_STATIONS } from "./majorStations.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/libingen-epfl-2026-09-18.json", import.meta.url), "utf8"));
const response = (data: unknown) => new Response(JSON.stringify(data));

it("retains the recorded daytime Libingen–EPFL journey and includes next-morning trains in late-evening searches", () => {
  for (const [sample, start, total, walking] of [
    [fixture.day, "2026-09-21T08:00:00+02:00", 266, 1],
    [fixture.night, "2026-09-18T23:20:00+02:00", 666, 3],
  ] as const) {
    const network = emptyNetwork();
    assert.equal(addSections(network, sample.connections[0].sections), 0);
    // This older reduced fixture omits operators; opt in explicitly rather than invent permission.
    const options = { ...DEFAULT_OPTIONS, busPreference: "include-unknown" as const };
    const models = compareModels(network, fixture.origin, fixture.destination, new Date(start), options);
    for (const solution of [models.baseline, models.extended]) {
      const viaVillage = solution.journeys.find(j => j.originStation.id === "8506786" && j.destinationStation.id === "8501118");
      assert.ok(viaVillage);
      assert.equal(viaVillage.totalMinutes, total);
      assert.equal(metrics(viaVillage).boardings, 4);
      assert.equal(metrics(viaVillage).bike, 9);
      assert.equal(metrics(viaVillage).walk, walking);
    }
    if (sample === fixture.night) {
      const oldWindow = solve(network, fixture.origin, fixture.destination, new Date(start),
        { ...options, horizonMinutes: 480 }, "baseline");
      assert.equal(oldWindow.journeys.length, 0);
    }
  }
});

it("publishes an overnight proposal from the real acquisition flow without spending the remaining time on location expansion", async () => {
  const urls: URL[] = [], published: SearchSession[] = [];
  const result = await plan(fixture.origin, fixture.destination, "baseline", DEFAULT_OPTIONS,
    new AbortController().signal, () => {}, s => published.push(s), { cyclingClient: null,
      start: new Date("2026-09-18T23:20:00+02:00"), gapMs: 0,
      fetcher: async input => {
        const url = new URL(String(input)); urls.push(url);
        if (url.pathname.endsWith("locations")) return response(fixture.originLocations);
        return response(url.searchParams.get("from") === "8506786" && url.searchParams.get("to") === "8501118"
          ? { connections: fixture.night.connections } : { connections: [] });
      },
    });
  assert.ok(published.some(s => s.baseline.journeys.length > 0));
  assert.ok(result.baseline.journeys.some(j => j.totalMinutes === 666));
  assert.equal(result.client.failures, 0);
  assert.equal(urls.filter(u => u.pathname.endsWith("locations")).length, 2);
  assert.ok(urls.some(u => u.searchParams.get("from") === "8506206"));
});

it("checks Rapperswil–Renens under More cycling even when nearer bus queries return no journeys", async () => {
  const start = new Date("2026-09-21T08:00:00+02:00"), urls: URL[] = [];
  const options = preferenceOptions("more", "none");
  const rapperswil = MAJOR_STATIONS.find(s => s.id === "8503110")!;
  const renens = MAJOR_STATIONS.find(s => s.id === "8501118")!;
  // Only the recorded Rapperswil pair returns connections in this acquisition
  // scenario: neighboring bus stops must not consume every query slot.
  const result = await plan(fixture.origin, fixture.destination, "baseline", options,
    new AbortController().signal, () => {}, () => {}, { cyclingClient: null, start, gapMs: 0, fetcher: async input => {
      const url = new URL(String(input)); urls.push(url);
      if (url.pathname.endsWith("locations")) return response(fixture.originLocations);
      if (url.searchParams.get("from") !== rapperswil.id || url.searchParams.get("to") !== renens.id) return response({ connections: [] });
      assert.equal(url.searchParams.get("date"), "2026-09-21");
      assert.equal(url.searchParams.get("time"), "09:21");
      return response({ connections: fixture.rapperswil.connections });
    } });
  assert.ok(result.baseline.journeys.some(j => j.originStation.id === rapperswil.id && j.destinationStation.id === renens.id));
  const journey = result.baseline.journeys.find(j => j.originStation.id === rapperswil.id && j.destinationStation.id === renens.id)!;
  assert.equal(journey.totalMinutes, 300);
  assert.equal(metrics(journey).bike, 86);
  assert.equal(metrics(journey).boardings, 2);
  assert.equal(urls.filter(u => u.pathname.endsWith("connections")).length, 4);
  assert.ok(result.baseline.journeys.every(j => metrics(j).bike <= options.maxBikeMinutes));
});
