import assert from "node:assert/strict";
import { it } from "node:test";
import { bicycleLegAllowed, bicyclePermission, type BicycleEvidence } from "./bicyclePermission.ts";
import { DEFAULT_OPTIONS, emptyNetwork, solve, type Network, type Options } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { recommend, compareCycling, waitingMinutes } from "./recommendations.ts";
import { findCandidateStations, plan, selectStationPairs, TimetableClient } from "./api.ts";
import type { CyclingComparison, Journey, Place, TransitLeg } from "./routing.ts";

const start = new Date("2026-09-21T08:00:00+02:00");
const time = (m: number) => new Date(start.getTime() + m * 60_000);
const points: Place[] = [0, 1, 2].map(i => ({ label: `Point ${i}`, stopId: String(i), lat: 30 + i, lon: 4 }));
const options: Options = { ...DEFAULT_OPTIONS, busPreference: "include-unknown", maxAccessMinutes: 0,
  maxEgressMinutes: 0, maxIntermediateMinutes: 0, maxBikeMinutes: 0 };
const proof = (leg: TransitLeg, permission: BicycleEvidence["permission"] = "allowed"): BicycleEvidence => ({
  permission, fromId: leg.fromId!, toId: leg.toId!, departure: leg.departure!.toISOString(), service: leg.service,
  operator: leg.operator ?? null, source: { title: "Controlled service evidence", url: "https://example.com/service", checked: "2026-09-21" },
  conditions: ["Controlled fixture only; reservation and capacity are not confirmed."],
});
function ride(n: Network, from: number, to: number, departure: number, arrival: number, evidence = false, category = "IC") {
  for (const p of points) n.stops.set(p.stopId!, { id: p.stopId!, name: p.label, lat: p.lat, lon: p.lon });
  const id = `${from}-${to}-${arrival}`, leg: TransitLeg = { mode: "transit", from: points[from].label, to: points[to].label,
    fromId: String(from), toId: String(to), departure: time(departure), arrival: time(arrival),
    departurePlatform: null, arrivalPlatform: null, service: id, serviceName: id, direction: null, category, operator: "Unreviewed operator" };
  if (evidence) leg.bicycleEvidence = proof(leg);
  n.edges.set(id, { id, from: String(from), to: String(to), leg });
  return leg;
}

it("requires exact service evidence for unreviewed operators in every transit mode", () => {
  for (const category of ["IC", "B", "Tram", "EV"]) {
    const leg = ride(emptyNetwork(), 0, 2, 3, 40, false, category);
    assert.equal(bicyclePermission(leg), "uncertain");
    assert.equal(bicycleLegAllowed(leg, "include-unknown", "confirmed"), false);
    leg.bicycleEvidence = proof(leg);
    assert.equal(bicyclePermission(leg), "confirmed");
    for (const patch of [{ departure: time(4).toISOString() }, { toId: "1" }, { service: "different" }, { operator: null }]) {
      assert.equal(bicyclePermission({ ...leg, bicycleEvidence: { ...leg.bicycleEvidence, ...patch } }), "uncertain");
    }
    leg.bicycleEvidence = proof(leg, "prohibited");
    for (const scope of ["confirmed", "allow-uncertain"] as const) assert.equal(bicycleLegAllowed(leg, "include-unknown", scope), false);
  }
  const prohibitedBus = ride(emptyNetwork(), 0, 2, 3, 40, false, "B");
  prohibitedBus.operator = "ABF";
  prohibitedBus.bicycleEvidence = proof(prohibitedBus);
  assert.equal(bicycleLegAllowed(prohibitedBus, "include-unknown"), false);
});

it("solves confirmed independently before pruning and applies a separate alternative window", () => {
  const n = emptyNetwork(); ride(n, 0, 2, 3, 20); ride(n, 0, 2, 3, 200, true);
  for (const mode of ["baseline", "extended"] as const) {
    const possible = solve(n, points[0], points[2], start, options, mode);
    const confirmed = solve(n, points[0], points[2], start, { ...options, bicycleScope: "confirmed" }, mode);
    assert.ok(possible.journeys.every(j => j.totalMinutes !== 200), "permissive pruning really removes the confirmed route");
    const result = recommend(confirmed.journeys, possible.journeys, possible.journeys, options);
    assert.equal(result.identical, false);
    assert.deepEqual(result.proposals.map(p => p.journey.totalMinutes), [200, 20]);
    assert.equal(result.groups[0].proposals[0].extraMinutes, 0);
  }
});

it("keeps three independent winners even when prohibited transit dominates the other graphs", () => {
  const n = emptyNetwork();
  const prohibited = ride(n, 0, 2, 3, 10, false, "B"); prohibited.operator = "ABF";
  ride(n, 0, 2, 3, 100, false, "BAT");
  ride(n, 0, 2, 3, 200, true);
  for (const mode of ["baseline", "extended"] as const) {
    const journeys = (["confirmed", "allow-uncertain", "all-transit"] as const).map(bicycleScope =>
      solve(n, points[0], points[2], start, { ...options, bicycleScope }, mode).journeys);
    const result = recommend(journeys[0], journeys[1], journeys[2], options);
    assert.deepEqual(result.groups.map(g => g.proposals[0].journey.totalMinutes), [200, 100, 10]);
    assert.ok(result.groups.every(g => g.proposals[0].extraMinutes === 0));
    assert.equal(bicyclePermission(prohibited), "prohibited", "comparison inclusion never changes the evidence");
    const withoutBuses = solve(n, points[0], points[2], start, { ...options, bicycleScope: "all-transit", busPreference: "no-buses" }, mode);
    assert.equal(withoutBuses.journeys[0].totalMinutes, 100);
  }
  // A prohibition supplied for a dated ferry segment has the same treatment.
  const ferry = ride(emptyNetwork(), 0, 2, 3, 10, false, "BAT");
  ferry.bicycleEvidence = proof(ferry, "prohibited");
  assert.equal(bicycleLegAllowed(ferry, "no-buses", "all-transit"), true);
  assert.equal(bicycleLegAllowed(ferry, "include-unknown", "allow-uncertain"), false);
});

it("retains prohibited legs only in the all-transit solve across an ordered visit", () => {
  const n = emptyNetwork(); ride(n, 0, 1, 3, 20, true);
  const onward = ride(n, 1, 2, 23, 40, false, "BAT");
  onward.bicycleEvidence = proof(onward, "prohibited");
  for (const mode of ["baseline", "extended"] as const) {
    for (const bicycleScope of ["confirmed", "allow-uncertain"] as const)
      assert.equal(solveWaypoints(n, points, start, { ...options, bicycleScope }, mode).journeys.length, 0);
    const all = solveWaypoints(n, points, start, { ...options, bicycleScope: "all-transit" }, mode);
    assert.equal(all.journeys[0].totalMinutes, 40);
    assert.equal(all.journeys[0].waypoints?.length, 1);
  }
});

it("acquires onward waypoint services for both uncertain and unrestricted arrivals", async () => {
  const station = (i: number) => ({ id: String(i), name: points[i].label, coordinate: { x: points[i].lat, y: points[i].lon } });
  const section = (from: number, to: number, dep: number, arr: number, category: string, operator: string) => ({
    journey: { category, operator, name: `Controlled ${from}-${to}-${arr}` },
    departure: { station: station(from), departure: time(dep).toISOString() },
    arrival: { station: station(to), arrival: time(arr).toISOString() },
  });
  for (const mode of ["baseline", "extended"] as const) {
    const onwardQueries: string[] = [];
    const result = await plan(points[0], points[2], mode, options, new AbortController().signal, () => {}, () => {}, {
      start, gapMs: 0, cyclingClient: null, waypoints: [points[1]], fetcher: async input => {
        const url = new URL(String(input));
        let sections;
        if (url.searchParams.get("from") === "0") sections = [section(0, 1, 3, 20, "B", "ABF"), section(0, 1, 3, 40, "BAT", "Boat operator")];
        else {
          const ready = url.searchParams.get("time")!; onwardQueries.push(ready);
          sections = [ready === "08:23" ? section(1, 2, 23, 30, "IC", "SBB") : section(1, 2, 43, 50, "IC", "SBB")];
        }
        return new Response(JSON.stringify({ connections: sections.map(s => ({ sections: [s] })) }));
      },
    });
    assert.deepEqual(onwardQueries, ["08:43", "08:23"]);
    assert.equal(result.confirmed?.baseline.journeys.length, 0);
    assert.equal(result.baseline.journeys[0].totalMinutes, 50);
    assert.equal(result.allTransit?.baseline.journeys[0].totalMinutes, 30);
    assert.ok(result.allTransit?.baseline.journeys[0].transitLegs.some(l => bicyclePermission(l) === "prohibited"));
  }
});

it("checks every leg across ordered stops in both routing models", () => {
  const n = emptyNetwork(); ride(n, 0, 1, 3, 20); ride(n, 0, 1, 3, 40, true);
  const onward = ride(n, 1, 2, 50, 70, true, "Tram");
  for (const mode of ["baseline", "extended"] as const) {
    const strict = solveWaypoints(n, points, start, { ...options, bicycleScope: "confirmed" }, mode);
    assert.equal(strict.journeys[0].totalMinutes, 70);
    assert.ok(strict.journeys[0].transitLegs.filter(l => l.mode === "transit").every(l => bicyclePermission(l) === "confirmed"));
  }
  delete onward.bicycleEvidence;
  assert.equal(solveWaypoints(n, points, start, { ...options, bicycleScope: "confirmed" }, "baseline").journeys.length, 0);
  assert.ok(solveWaypoints(n, points, start, options, "baseline").journeys.length);
});

it("merges identical journeys while preserving different categories in the three searches", () => {
  const n = emptyNetwork(); ride(n, 0, 2, 3, 40, true);
  const j = solve(n, points[0], points[2], start, options, "baseline").journeys[0];
  const identical = recommend([j], [j], [j], options);
  assert.equal(identical.identical, true); assert.equal(identical.proposals.length, 1);
  assert.equal(identical.proposals[0].wins.length, 3);
  const faster: Journey = { ...j, id: "faster-with-more-active-time", totalMinutes: 30,
    originStation: { ...j.originStation, bikeMinutes: 5 } };
  const different = recommend([j], [j, faster], [j, faster], options);
  const shared = different.proposals.find(p => p.journey.id === j.id)!;
  assert.equal(different.proposals.length, 2); assert.equal(different.identical, false);
  assert.ok(shared.wins[0].categories.includes("Fastest"));
  assert.deepEqual(shared.wins[1].categories, ["Least cycling or walking"]);
  assert.equal(shared.wins[1].extraMinutes, 10);
});

it("compares the reported Zürich night totals against cycling without suppressing either scope", () => {
  const n = emptyNetwork(); ride(n, 0, 2, 100, 120, true);
  const base = solve(n, points[0], points[2], start, options, "baseline").journeys[0];
  const rail: Journey = { ...base, totalMinutes: 183, originStation: { ...base.originStation, bikeMinutes: 14 },
    transitLegs: [...base.transitLegs, { ...base.transitLegs[0], mode: "walk", departure: time(120), arrival: time(139) }] };
  const bus: Journey = { ...base, id: "night-bus", totalMinutes: 214, originStation: { ...base.originStation, bikeMinutes: 11 } };
  const cycling: CyclingComparison = { distanceKm: 5.5, minutes: 14, arrival: time(14), routes: [] };
  assert.equal(compareCycling(rail, cycling), "2 h 49 min longer · 19 min more cycling or walking than cycling only.");
  assert.equal(compareCycling(bus, cycling), "3 h 20 min longer · 3 min less cycling or walking than cycling only.");
  assert.equal(waitingMinutes(rail), 130);
  assert.equal(recommend([rail], [bus], [bus], options).proposals.length, 2);
  const kusnacht: Journey = { ...base, totalMinutes: 55, originStation: { ...base.originStation, bikeMinutes: 35 } };
  assert.equal(compareCycling(kusnacht, { ...cycling, minutes: 30 }), "25 min longer · 5 min more cycling or walking than cycling only.");
});

it("discovers local Zürich bus stops beside rail hubs and reserves a local connection query", async () => {
  const origin: Place = { label: "Controlled Zürich address", lat: 47.375, lon: 8.54 };
  const client = new TimetableClient(new AbortController().signal, 0, async () => new Response(JSON.stringify({ stations: [
    { id: "local-bus", name: "Local bus stop", icon: "bus", coordinate: { x: origin.lat, y: origin.lon } },
  ] })));
  const stations = await findCandidateStations(origin, 60, client, () => {});
  assert.equal(client.requests, 1); assert.ok(stations.some(s => s.id === "local-bus"));
  assert.ok(stations.some(s => s.kind === "train"));
  const destinations = stations.map(s => ({ ...s, id: `end-${s.id}` }));
  const pairs = selectStationPairs(stations, destinations, 90);
  assert.ok(pairs.some(([a, b]) => a.kind === "bus" && b.kind === "bus"));
  assert.ok(pairs.some(([a, b]) => a.kind === "train" && b.kind === "train"));
});

it("publishes verified access from a reviewed VBZ policy for dated daytime and night services", async () => {
  const station = (p: Place) => ({ id: p.stopId, name: p.label, coordinate: { x: p.lat, y: p.lon } });
  for (const hour of [8, 1]) {
    const departure = new Date(`2026-09-21T${String(hour).padStart(2, "0")}:00:00+02:00`);
    const t = (m: number) => new Date(departure.getTime() + m * 60_000).toISOString();
    const result = await plan(points[0], points[2], "baseline", options, new AbortController().signal, () => {}, () => {}, {
      start: departure, gapMs: 0, cyclingClient: null, fetcher: async () => new Response(JSON.stringify({ connections: [{ sections: [{
        journey: { category: "B", operator: "VBZ", name: "Controlled departure" },
        departure: { station: station(points[0]), departure: t(hour === 8 ? 3 : 180) },
        arrival: { station: station(points[2]), arrival: t(hour === 8 ? 15 : 195) },
      }] }] })),
    });
    assert.ok(result.baseline.journeys.length); assert.equal(result.confirmed?.baseline.journeys.length, 1);
    assert.equal(result.baseline.journeys[0].totalMinutes, hour === 8 ? 15 : 195);
    assert.equal(result.allTransit?.baseline.journeys[0].id, result.baseline.journeys[0].id);
  }
});

it("keeps allowed services verified when ticket or reservation requirements are unknown", async () => {
  const { carriageForLeg, bicycleJourneySummary } = await import("./bicycleCarriage.ts");
  for (const category of ["B", "T", "IR", "BAT"]) {
    const leg = ride(emptyNetwork(), 0, 2, 3, 40, true, category);
    leg.bicycleEvidence!.prerequisites = { bikeTicket: "unknown", bikeReservation: "unknown" };
    assert.equal(carriageForLeg(leg).permission, "confirmed");
    assert.equal(carriageForLeg(leg).bikeReservation, "unknown");
    assert.match(bicycleJourneySummary([leg])!, /access verified on every transit leg/);
    assert.equal(bicycleLegAllowed(leg, "include-unknown", "confirmed"), true);
  }
});

it("applies reviewed bus and tram permission while preserving explicit bans and unmatched policies", async () => {
  const { carriageForLeg, bicycleJourneySummary } = await import("./bicycleCarriage.ts");
  for (const operator of ["VBZ", "VBG", "VZO", "Stadtbus Winterthur", "tpg"]) {
    for (const category of ["B", "T"]) {
      const leg = { ...ride(emptyNetwork(), 0, 2, 3, 40, false, category), operator };
      assert.equal(bicyclePermission(leg), "confirmed");
      assert.ok(carriageForLeg(leg).permissionSource?.url.startsWith("https://"));
      leg.bicycleEvidence = proof(leg, "prohibited");
      assert.equal(bicyclePermission(leg), "prohibited");
      assert.equal(bicycleLegAllowed(leg, "include-unknown", "confirmed"), false);
      assert.equal(bicycleLegAllowed(leg, "include-unknown", "all-transit"), true);
    }
  }
  const unknown = ride(emptyNetwork(), 0, 2, 3, 40, false, "B");
  for (const operator of ["PAG", "Unreviewed operator"]) assert.equal(bicyclePermission({ ...unknown, operator }), "uncertain");
  assert.equal(bicyclePermission({ ...unknown, operator: "VBZ", category: "EV" }), "uncertain");
  const known = { ...unknown, operator: "VBZ", service: "B 5" };
  assert.equal(carriageForLeg(known).bikeTicket, "required");
  assert.match(bicycleJourneySummary([known, unknown])!, new RegExp(`1 of 2 services verified · access unknown on ${unknown.service}`));
});
