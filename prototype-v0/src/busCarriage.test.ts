import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { busCarriage, busCarriageLabel, busExclusions, busJourneySummary, isBus, transitAllowed, type BusPreference } from "./busCarriage.ts";
import { transitLegsFromSections, type TransportSection } from "./itinerary.ts";
import { addSections, addStationboard } from "./timetable.ts";
import { categorize, DEFAULT_OPTIONS, emptyNetwork, solve, validateOptions } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { plan } from "./api.ts";
import { journeyStops } from "./mapData.ts";
import { preferenceOptions } from "./preferences.ts";

const start = new Date("2026-09-21T08:00:00+02:00");
const time = (m: number) => new Date(start.getTime() + m * 60_000).toISOString();
const a = { id: "A", name: "Start", coordinate: { x: 30, y: 4 } };
const b = { id: "B", name: "Visit", coordinate: { x: 31, y: 5 } };
const d = { id: "D", name: "Finish", coordinate: { x: 32, y: 6 } };
const place = (s: typeof a) => ({ label: s.name, lat: s.coordinate.x, lon: s.coordinate.y, stopId: s.id });
const options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0, maxIntermediateMinutes: 0, maxBikeMinutes: 0 };
function section(operator: string | null, depart = 3, arrive = 40, from = a, to = d, category = "B"): TransportSection {
  return { journey: { category, operator, number: "81", name: `${operator}-${depart}-${arrive}` },
    departure: { station: from, departure: time(depart) }, arrival: { station: to, arrival: time(arrive) } };
}
const leg = (operator: string | null, category = "B") => transitLegsFromSections([section(operator, 3, 40, a, d, category)])[0];

it("keeps operator/category evidence and never treats missing metadata as bicycle permission", () => {
  const parsed = leg(" PAG ", " Bus ");
  assert.equal(parsed.operator, "PAG"); assert.equal(parsed.category, "Bus"); assert.ok(isBus(parsed));
  const postbus = busCarriage(parsed)!;
  assert.equal(postbus.permission, "conditional"); assert.equal(postbus.reservation, "check-service");
  assert.equal(postbus.capacity, "unknown"); assert.equal(postbus.reservationAvailability, "unknown");
  assert.equal(postbus.source?.checked, "2026-09-20");
  for (const operator of [null, "Unknown", "PAG subcontractor", "8"]) {
    const unknown = busCarriage(leg(operator))!;
    assert.equal(unknown.permission, "unknown"); assert.equal(unknown.source, undefined);
    assert.equal(transitAllowed(leg(operator), "known-rules"), false);
    assert.equal(transitAllowed(leg(operator), "include-unknown"), true);
  }
  assert.equal(busCarriage(leg("PAG", "IC")), null);
  assert.equal(isBus(leg("PAG", "EV")), true);
  assert.equal(busCarriage(leg("PAG", "EV"))!.permission, "unknown");
  assert.equal(transitAllowed(leg("PAG", "EV"), "known-rules"), false);
  assert.equal(transitAllowed(leg("BRER", "EV"), "include-unknown"), false);
  assert.equal(isBus({ ...parsed, category: null, service: "Bus 81" }), false);
  assert.equal(isBus({ ...parsed, mode: "walk" }), false);
});

it("applies sourced operator rules without overriding prohibitions or promising space", () => {
  for (const operator of ["PostAuto AG", "VBZ", "VBG", "VZO", "Stadtbus Winterthur", "tpg"]) {
    const bus = leg(operator), rule = busCarriage(bus)!;
    assert.equal(rule.permission, "conditional"); assert.equal(rule.capacity, "unknown");
    assert.ok(rule.source?.url.startsWith("https://"));
    assert.equal(transitAllowed(bus, "known-rules"), true);
    assert.equal(transitAllowed(bus, "no-buses"), false);
  }
  for (const operator of ["ABF", "BRER"]) for (const preference of ["known-rules", "include-unknown", "no-buses"] as const) {
    assert.equal(busCarriage(leg(operator))!.permission, "not-allowed");
    assert.equal(transitAllowed(leg(operator), preference), false);
  }
  assert.equal(busCarriage(leg("TPG"))!.ticket, "check-fare");
  assert.equal(busCarriage(leg("VBZ"))!.reservation, "unknown");
  assert.equal(transitAllowed(leg("SBB", "IC"), "no-buses"), true);
  assert.match(busJourneySummary([leg("PAG"), leg(null)])!, /unverified/);
  assert.match(busCarriageLabel(busCarriage(leg("PAG"))!), /conditional/);
});

it("filters prohibited and unverified buses before dominance and ranking in both models", () => {
  const network = emptyNetwork();
  addSections(network, [section("ABF", 3, 20), section(null, 3, 25), section("PAG", 3, 40), section("SBB", 3, 60, a, d, "IC")]);
  for (const mode of ["baseline", "extended"] as const) {
    for (const [busPreference, arrival, operator] of [["known-rules", 40, "PAG"], ["include-unknown", 25, null], ["no-buses", 60, "SBB"]] as const) {
      const limits = { ...options, busPreference };
      const result = solve(network, place(a), place(d), start, limits, mode);
      const fastest = categorize(result.journeys, limits)[0].journey;
      assert.equal(fastest.totalMinutes, arrival);
      assert.equal(fastest.transitLegs[0].operator, operator);
      assert.ok(result.journeys.every(j => j.transitLegs.every(l => l.operator !== "ABF")));
    }
  }
});

it("enforces the same bus preference across requested stops without missing onward trains", () => {
  const network = emptyNetwork();
  addSections(network, [section("ABF", 3, 20, a, b), section(null, 3, 25, a, b), section("PAG", 3, 40, a, b),
    section("SBB", 3, 60, a, b, "IC"), section("SBB", 30, 50, b, d, "IC"), section("SBB", 45, 70, b, d, "IC"), section("SBB", 65, 90, b, d, "IC")]);
  for (const mode of ["baseline", "extended"] as const) for (const [busPreference, arrival] of [["known-rules", 70], ["include-unknown", 50], ["no-buses", 90]] as const) {
    const limits = { ...options, busPreference };
    const result = solveWaypoints(network, [place(a), place(b), place(d)], start, limits, mode);
    assert.equal(categorize(result.journeys, limits)[0].journey.totalMinutes, arrival);
    assert.ok(result.journeys.every(j => j.transitLegs.every(l => l.operator !== "ABF")));
  }
});

it("uses operator rules in the production acquisition flow and preserves unverified opt-in", async () => {
  for (const [busPreference, expected] of [["known-rules", 40], ["include-unknown", 25], ["no-buses", 60]] as const) {
    const result = await plan(place(a), place(d), "baseline", { ...options, busPreference }, new AbortController().signal, () => {}, () => {}, {
      start, gapMs: 0, cyclingClient: null, fetcher: async input => {
        const url = new URL(String(input));
        assert.ok(url.pathname.endsWith("connections"));
        return new Response(JSON.stringify({ connections: [section("ABF", 3, 20), section(null, 3, 25), section("PAG", 3, 40), section("SBB", 3, 60, a, d, "IC")].map(s => ({ sections: [s] })) }));
      },
    });
    assert.equal(categorize(result.baseline.journeys, result.options)[0].journey.totalMinutes, expected);
    assert.ok(result.network.edges.size >= 4, "Keep rejected edges for coverage explanations; never use them for feasibility");
  }
});

it("retains rules on station-board exits and counts one excluded departure across pass-stop prefixes", () => {
  const network = emptyNetwork();
  const bus = section("BRER", 3, 40);
  const journey = { ...bus.journey!, stop: bus.departure!, passList: [bus.departure!, { station: b, arrival: time(20) }, bus.arrival!] };
  assert.equal(addStationboard(network, [journey]), 0);
  assert.equal(network.edges.size, 2);
  for (const edge of network.edges.values()) assert.equal(busCarriage(edge.leg)!.permission, "not-allowed");
  const excluded = busExclusions([...network.edges.values()].map(e => e.leg), "include-unknown");
  assert.deepEqual(excluded, { prohibited: 1, unknown: 0, preference: 0 });
  assert.equal(solve(network, place(a), place(d), start, options, "extended").journeys.length, 0);
});

it("keeps the recorded Zürich–Laax bus, its source and bicycle condition on map pins", () => {
  const recorded = JSON.parse(readFileSync(new URL("./fixtures/zurich-laax-2026-09-05.json", import.meta.url), "utf8"));
  const network = emptyNetwork(); addSections(network, recorded.sections);
  const origin = { ...network.stops.get("8503000")!, label: "Zürich HB" };
  const destination = { ...network.stops.get("8509786")!, label: "Laax GR, posta" };
  const result = solve(network, origin, destination, new Date("2026-09-05T13:30:00+02:00"), options, "baseline");
  const journey = result.journeys.find(j => j.totalMinutes === 138)!;
  assert.ok(journey);
  const bus = journey.transitLegs.find(isBus)!;
  assert.equal(bus.operator, "PAG"); assert.equal(bus.category, "B");
  assert.equal(busCarriage(bus)!.reservation, "check-service");
  assert.match(busCarriage(bus)!.source!.url, /postauto/);
  assert.match(journeyStops(journey).find(p => p.name.includes("Postauto"))!.events[0].bicycle!, /PostBus.*conditional/);
});

it("validates each bus preference with every cycling allowance", () => {
  for (const cycling of ["less", "balanced", "more", "unrestricted"] as const) for (const busPreference of ["known-rules", "include-unknown", "no-buses"] as const) {
    const configured = preferenceOptions(cycling, "none", busPreference);
    validateOptions(configured); assert.equal(configured.busPreference, busPreference);
  }
  assert.throws(() => validateOptions({ ...options, busPreference: "all-allowed" as BusPreference }), /bus preference/);
});
