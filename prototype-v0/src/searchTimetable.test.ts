import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { searchBicycleAttributes, searchSections, searchTime } from "./searchTimetable.ts";
import { addSections } from "./timetable.ts";
import { emptyNetwork, DEFAULT_OPTIONS, categorize, metrics } from "./model.ts";
import { bicyclePermission, bicycleLegAllowed } from "./bicyclePermission.ts";
import { carriageForLeg, interpretBicycleAttributes } from "./bicycleCarriage.ts";
import { plan, updateBicycleEvidence } from "./api.ts";
import { recommend } from "./recommendations.ts";
import { preferenceOptions } from "./preferences.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { cyclingKey, samePlace, zeroCycling } from "./cycling.ts";
import type { Point } from "./routing.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/search-timetable-2026-09-24.json", import.meta.url), "utf8"));
const response = (data: unknown) => new Response(JSON.stringify(data));
const networkFor = (sample: unknown) => {
  const n = emptyNetwork();
  for (const sections of searchSections(sample as Parameters<typeof searchSections>[0])) assert.equal(addSections(n, sections), 0);
  return n;
};

it("parses public timetable wall times in Switzerland, including midnight and clock changes", () => {
  assert.equal(searchTime("2026-09-25 00:49:00"), "2026-09-24T22:49:00.000Z");
  assert.equal(searchTime("2026-11-03 00:49:30"), "2026-11-02T23:49:30.000Z");
  assert.equal(searchTime("2026-03-29 02:30:00"), null);
  assert.equal(searchTime("2026-11-31 10:00:00"), null);
  assert.equal(searchTime("2026-09-25 00:49:99"), null);
});

it("reads the published PostBus bike reservation and preserves it on timed exit prefixes", () => {
  const n = networkFor(fixture.postbus);
  const legs = [...n.edges.values()].map(e => e.leg).filter(l => l.category === "B" && l.service === "B 81");
  assert.ok(legs.length > 4);
  assert.ok(legs.every(l => bicyclePermission(l) === "confirmed"));
  assert.ok(legs.every(l => carriageForLeg(l).bikeReservation === "required"));
  assert.ok(legs.every(l => carriageForLeg(l).bikeTicket === "required"));
  assert.ok(legs.every(l => l.bicycleEvidence?.toId === l.toId));
  assert.ok(legs.every(l => l.bicycleEvidence?.source.url.includes("search.ch")));
});

it("honours replacement-bus prohibitions and never treats passenger seat reservations as bike reservations", () => {
  const legs = [...networkFor(fixture.replacement).edges.values()].map(e => e.leg);
  const prohibited = legs.filter(l => l.category === "EV");
  assert.ok(prohibited.length);
  assert.ok(prohibited.every(l => bicyclePermission(l) === "prohibited"));
  assert.ok(prohibited.every(l => !bicycleLegAllowed(l, "include-unknown", "allow-uncertain")));
  assert.ok(prohibited.every(l => bicycleLegAllowed(l, "include-unknown", "all-transit")));
  assert.equal(interpretBicycleAttributes(searchBicycleAttributes({ "0_8.6_R": "Platzreservierung möglich", "0_2.9_GR": "Gruppenreservierung obligatorisch" })).bikeReservation, "unknown");
  assert.equal(interpretBicycleAttributes(searchBicycleAttributes({ "1_4.2_VB": "VELOS: Platzzahl eingeschränkt" })).permission, "allowed");
});

it("uses the applicable SOB mainline policy with separate ticket and reservation sources, while a dated ban takes precedence", () => {
  const n = networkFor(fixture.chur);
  const leg = [...n.edges.values()].find(e => e.leg.operator === "SOB-sob")!.leg;
  const rule = carriageForLeg(leg);
  assert.equal(rule.permission, "confirmed"); assert.equal(rule.bikeTicket, "required");
  assert.equal(rule.bikeReservation, "not-required");
  assert.ok(rule.permissionSource?.url.includes("sob.ch")); assert.ok(rule.reservationSource?.url.includes("sob.ch"));
  assert.equal(bicyclePermission({ ...leg, category: "EV" }), "uncertain");
  assert.equal(bicyclePermission({ ...leg, operator: "Another railway" }), "uncertain");
  assert.equal(bicyclePermission({ ...leg, bicycleEvidence: { ...leg.bicycleEvidence!, permission: "prohibited" } }), "prohibited");
  assert.ok(!n.stops.has("0000176"), "an untimed tunnel is not an alighting point");
});

it("makes each selected permission mode change the acquired route and displayed winners across train, tram, boat and bus", async () => {
  const start = new Date("2026-11-02T08:00:00+01:00");
  for (const [type, category] of [["train", "R"], ["tram", "T"], ["ship", "BAT"], ["bus", "B"]]) {
    const sample = { connections: [
      ["10", { "0_1.6_VN": "VELOS: Keine Beförderung möglich" }],
      ["20", {}], ["30", { "0_1.5_VR": "VELOS: Reservierung obligatorisch" }],
    ].map(([minute, attributes]) => ({ legs: [{ stopid: "A", name: "A", lat: 30, lon: 4, departure: "2026-11-02 08:03:00", type, "*G": category, "*L": minute,
      operator: "Controlled operator", attributes, exit: { stopid: "B", name: "B", lat: 31, lon: 4, arrival: `2026-11-02 08:${minute}:00` } }] })) };
    for (const [bicycleScope, minutes] of [["confirmed", 30], ["allow-uncertain", 20], ["all-transit", 10]] as const) {
      const options = { ...DEFAULT_OPTIONS, bicycleScope, maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0 };
      const s = await plan({ label: "A", stopId: "A", lat: 30, lon: 4 }, { label: "B", stopId: "B", lat: 31, lon: 4 }, "baseline", options,
        new AbortController().signal, () => {}, () => {}, { start, publicTimetable: true, cyclingClient: null, gapMs: 0, fetcher: async input => {
          const url = new URL(String(input)); assert.equal(url.hostname, "search.ch");
          assert.equal(url.searchParams.get("show_attributes"), "1");
          assert.equal(url.searchParams.get("date"), "11/02/2026"); return response(sample);
        } });
      assert.equal(s.baseline.journeys[0].totalMinutes, minutes);
      const result = recommend(s.confirmed!.baseline.journeys, s.baseline.journeys, s.allTransit!.baseline.journeys, options);
      assert.equal(result.groups.length, 1); assert.equal(result.groups[0].scope, bicycleScope);
      const leg = s.baseline.journeys[0].transitLegs.find(l => l.mode === "transit")!;
      updateBicycleEvidence(s, leg, { ...leg.bicycleEvidence!, permission: "prohibited" }, () => {});
      if (bicycleScope !== "all-transit") assert.ok(s.baseline.journeys.every(j => j.totalMinutes !== minutes));
    }
  }
});

it("discovers the omitted late train to Chur and compares later exits using routed cycling times under Above 150", async () => {
  const origin = { label: "Zürich HB", stopId: "8503000", kind: "train", lat: 47.377847, lon: 8.540502 };
  const destination = { label: "Laax GR, posta", stopId: "8509786", kind: "bus", lat: 46.806492, lon: 9.258086 };
  const options = preferenceOptions("unrestricted", "none", "include-unknown", "allow-uncertain");
  const queries: URL[] = [], checked: string[] = [], signal = new AbortController().signal;
  const cycling = new CyclingClient(signal);
  cycling.route = async (from: Point & { id?: string; stopId?: string }, to: Point & { id?: string; stopId?: string }) => {
    const id = from.id ?? from.stopId; checked.push(id ?? "");
    // Deliberately controlled road times: a train exit chosen by straight-line
    // distance can be much slower over mountain terrain. These aren't live estimates.
    const minutes = samePlace(from, to) ? 0 : id === "8509000" && to.stopId === destination.stopId ? 110 : 300;
    const route = { ...zeroCycling(from, to), minutes, ridingSeconds: minutes * 60, distanceKm: minutes / 4 };
    cycling.routes.set(cyclingKey(from, to), route); return route;
  };
  const s = await plan(origin, destination, "baseline", options, signal, () => {}, () => {}, {
    start: new Date("2026-11-02T23:00:00+01:00"), publicTimetable: true, cyclingClient: cycling, gapMs: 0,
    cyclingFetcher: async () => response({}, 400), fetcher: async input => {
      const url = new URL(String(input)); queries.push(url);
      if (url.pathname.endsWith("locations")) return response({ stations: [] });
      return response(url.searchParams.get("to") === "8509000" ? fixture.chur : fixture.overnight);
    },
  });
  const chur = queries.find(q => q.searchParams.get("to") === "8509000");
  assert.ok(chur); assert.equal(chur.searchParams.get("time"), "23:03");
  assert.equal(chur.searchParams.get("date"), "11/02/2026");
  const fastest = categorize(s.baseline.journeys, options).find(p => p.categories.includes("Fastest"))!.journey;
  assert.equal(fastest.destinationStation.id, "8509000");
  assert.equal(fastest.totalMinutes, 219); assert.equal(metrics(fastest).boardings, 1);
  assert.equal(fastest.departure.toISOString(), "2026-11-02T22:12:00.000Z");
  assert.ok(checked.includes("8509000")); assert.ok(s.client.requests <= 18);
});

it("applies the domestic SBB InterRegio rule narrowly and keeps explicit reservation conflicts unresolved", () => {
  const leg = [...networkFor(fixture.chur).edges.values()].find(e => e.leg.operator === "SBB" && e.leg.toId === "8509000")!.leg;
  const rule = carriageForLeg(leg);
  assert.equal(rule.permission, "confirmed"); assert.equal(rule.bikeReservation, "not-required");
  assert.ok(rule.permissionSource?.title.includes("InterRegio"));
  for (const patch of [{ category: "S" }, { category: "EV" }, { toId: "8000000" }, { operator: "Unknown" }])
    assert.equal(bicyclePermission({ ...leg, ...patch }), "uncertain");
  const conflicting = { ...leg, bicycleEvidence: { ...leg.bicycleEvidence!, permission: "allowed" as const,
    conditions: ["The provider gives conflicting reservation conditions. Confirm with the operator before boarding."] } };
  assert.equal(carriageForLeg(conflicting).bikeReservation, "unknown");
  const mandatory = { ...leg, bicycleEvidence: { ...leg.bicycleEvidence!, prerequisites: { bikeTicket: "required" as const, bikeReservation: "required" as const } } };
  assert.equal(carriageForLeg(mandatory).bikeReservation, "required");
});
