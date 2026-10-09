import assert from "node:assert/strict";
import { it } from "node:test";
import { categorize, DEFAULT_OPTIONS, emptyNetwork, metrics, pareto, solve, validateOptions, type Options } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { boardingAllowance, checkedJourneyPrice, journeyTraffic, objectiveFareKey, reservationMetrics, routeTraffic } from "./journeyObjectives.ts";
import { objectiveFareRequests, MAX_OBJECTIVE_FARE_REQUESTS } from "./objectiveFares.ts";
import { onlineFareRequest, requestOnlineFare } from "./onlineFareClient.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";
import { TRIP_PRESETS } from "./tripPresets.ts";
import { recommend } from "./recommendations.ts";
import { CyclingClient } from "./cyclingClient.ts";
import { cyclingKey, zeroCycling, type CyclingRoute } from "./cycling.ts";
import type { Journey, Place, TransitLeg } from "./routing.ts";
import type { OnlineFare } from "./onlineFare.ts";
import { mixedRoutingFixture } from "./fixtures/mixedRouting.ts";
import { updateBicycleEvidence, type SearchSession } from "./api.ts";
import { TimetableClient } from "./timetableClient.ts";
import { bicycleJourneySummary, carriageForLeg, interpretBicycleAttributes, withTripInfoRule } from "./bicycleCarriage.ts";

const start = new Date("2026-10-09T06:00:00Z"), at = (m: number) => new Date(+start + m * 60_000);
const points: Place[] = [0, 1, 2].map(i => ({ label: `Point ${i}`, stopId: String(i), lat: 47 + i * .1, lon: 8 }));
const station = (i: number) => ({ ...points[i], id: String(i), name: points[i].label, distanceKm: 0, bikeMinutes: 0 });
function leg(id: string, from: number, to: number, departure: number, arrival: number,
  reservation: "required" | "not-required" | "unknown" = "unknown"): TransitLeg {
  const l: TransitLeg = { mode: "transit", from: points[from].label, to: points[to].label, fromId: String(from), toId: String(to),
    fromPoint: points[from], toPoint: points[to], departure: at(departure), arrival: at(arrival),
    departurePlatform: null, arrivalPlatform: null, service: id, serviceName: id, direction: null,
    operator: "Unreviewed fixture operator", category: "R" };
  l.bicycleEvidence = { permission: "allowed", fromId: l.fromId!, toId: l.toId!, departure: l.departure!.toISOString(),
    service: l.service, operator: l.operator!, conditions: [], source: { title: "Synthetic dated evidence", url: "https://example.com", checked: "2026-10-09" },
    prerequisites: { bikeTicket: "required", bikeReservation: reservation } };
  return l;
}
function journey(id: string, totalMinutes: number, boardings: number, bike = 0): Journey {
  const duration = (totalMinutes - bike) / boardings;
  const transitLegs = Array.from({ length: boardings }, (_, i) => leg(id + i, 0, 2, bike + i * duration + 3, bike + (i + 1) * duration));
  return { id, startTime: start, originStation: { ...station(0), bikeMinutes: bike }, destinationStation: station(2),
    departure: transitLegs[0].departure!, arrival: at(totalMinutes), trainMinutes: totalMinutes - bike - 3,
    waitMinutes: 3, totalMinutes, changes: boardings - 1, services: transitLegs.map(l => l.service), transitLegs };
}
const options: Options = { ...DEFAULT_OPTIONS, maxAccessMinutes: 0, maxEgressMinutes: 0, maxIntermediateMinutes: 0,
  maxBikeMinutes: 0, horizonMinutes: 240, bicycleScope: "allow-uncertain" };

it("retains required reservations through unrelated TripInfo notes, summaries and objective ranking", () => {
  const attribute = (code: string) => ({ code, text: code, scope: "service" as const });
  for (const code of ["A__VB", "A__VC", "A__VI", "A__VK", "A__VT", "A__VN"]) {
    const j = journey(code, 60, 1), l = j.transitLegs[0];
    l.operator = "SBB"; l.category = "IR"; l.service = "IR 35"; l.fromId = "8503000"; l.toId = "8507000";
    l.bicycleEvidence = { ...l.bicycleEvidence!, operator: l.operator, service: l.service, fromId: l.fromId, toId: l.toId };
    l.bicycleEvidence = withTripInfoRule(l.bicycleEvidence, interpretBicycleAttributes([attribute("A__VR")]), "2026-10-09");
    l.bicycleEvidence = withTripInfoRule(l.bicycleEvidence, interpretBicycleAttributes([attribute(code)]), "2026-10-09");
    assert.equal(carriageForLeg(l).bikeReservation, "required", code);
    assert.equal(carriageForLeg(l).reservationSource, undefined, "A generic rule cannot contradict the dated requirement");
    assert.equal(reservationMetrics([l]).required, 1);
    if (code === "A__VN") assert.equal(carriageForLeg(l).permission, "prohibited");
    else assert.match(bicycleJourneySummary([l])!, /bike reservation required/);
    const free = journey("no-reservation", 65, 1);
    free.transitLegs[0].bicycleEvidence!.prerequisites!.bikeReservation = "not-required";
    assert.equal(categorize([j, free], { ...options, objectives: ["fewer-reservations"] })[0].journey.id, free.id);
  }
});

it("keeps conflicting or explicitly unknown dated reservations out of complete-price and reservation winners", () => {
  const j = journey("conflict", 60, 1), l = j.transitLegs[0];
  l.operator = "SBB"; l.category = "IR"; l.service = "IR 35"; l.fromId = "8503000"; l.toId = "8507000";
  l.bicycleEvidence = { ...l.bicycleEvidence!, operator: l.operator, service: l.service, fromId: l.fromId, toId: l.toId };
  const unknown = structuredClone(l.bicycleEvidence);
  assert.equal(carriageForLeg(l).bikeReservation, "unknown");
  assert.equal(carriageForLeg({ ...l, bicycleEvidence: { ...unknown, prerequisites: undefined } }).bikeReservation, "not-required");
  const required = interpretBicycleAttributes([{ code: "A__VR", text: "", scope: "service" }]);
  const noReservation = { code: "I_9w2", text: "Die Mitnahme von Velos ist ohne Reservation möglich, sofern genügend Mitnahmeplätze vorhanden sind.", scope: "service" as const };
  for (const combined of [false, true]) {
    l.bicycleEvidence = withTripInfoRule(unknown, required, "2026-10-09");
    l.bicycleEvidence = withTripInfoRule(l.bicycleEvidence, interpretBicycleAttributes(combined ? [...required.attributes, noReservation] : [noReservation]), "2026-10-09");
    l.bicycleEvidence = withTripInfoRule(l.bicycleEvidence, interpretBicycleAttributes([{ code: "A__VB", text: "", scope: "service" }]), "2026-10-09");
    assert.equal(carriageForLeg(l).bikeReservation, "unknown");
    assert.equal(carriageForLeg(l).reservationSource, undefined);
    assert.match(l.bicycleEvidence.conditions.join(" "), /conflicting reservation/);
    assert.match(bicycleJourneySummary([l])!, /requirements need checking/);
    assert.equal(categorize([j], { ...options, objectives: ["fewer-reservations"] }).length, 0);
    assert.equal(checkedJourneyPrice(j, options, { profile: DEFAULT_FARE_PROFILE, quotes: new Map([[objectiveFareKey(j, DEFAULT_FARE_PROFILE), quote(20, 10)]]) }), null);
  }
});
function network(legs: TransitLeg[]) {
  const n = emptyNetwork(); points.forEach((_, i) => n.stops.set(String(i), station(i)));
  for (const l of legs) n.edges.set(l.service, { id: l.service, from: l.fromId!, to: l.toId!, leg: l });
  return n;
}
function road(kind: "busy" | "quiet" | "unknown", minutes = 5): CyclingRoute {
  const r = { ...zeroCycling(points[0], points[1]), minutes, distanceKm: 1,
    points: [{ lat: 47, lon: 8, distanceM: 0, elevationM: 400 }, { lat: 47.01, lon: 8, distanceM: 1000, elevationM: 400 }] };
  return { ...r, sections: [{ startM: 0, endM: 1000, surface: "Asphalt", infrastructure: kind === "quiet" ? "Separated cycleway" : "Unknown",
    speedLimit: "Unknown", tags: kind === "busy" ? { highway: "primary", maxspeed: "80" } : kind === "quiet" ? { highway: "cycleway" } : {} }] };
}
function quote(passenger: number | null, bicycle: number | null = null): OnlineFare {
  const offer = (chf: number | null) => chf === null ? null : { chf, product: "Fixture offer", productId: "test" };
  return { status: passenger === null ? "unavailable" : "quoted", checked: start.toISOString(), environment: "test", passenger: offer(passenger), bicycle: offer(bicycle) };
}

it("sets the requested Commuter/Bikepacking objective sets and validates custom selections", () => {
  assert.deepEqual(TRIP_PRESETS.commuter.objectives, ["fastest", "fewer-boardings", "least-cycling"]);
  assert.deepEqual(TRIP_PRESETS.bikepacking.objectives, ["fastest", "fewer-boardings", "less-traffic"]);
  for (const objectives of [[], ["fastest", "fastest"], ["invented"]])
    assert.throws(() => validateOptions({ ...options, objectives } as Options));
  validateOptions({ ...options, objectives: ["cheapest", "fewer-reservations"] });
});
it("selects the 134-minute/two-boarding compromise instead of the 178-minute extreme", () => {
  const journeys = [journey("fast", 120, 3, 15), journey("compromise", 134, 2, 12), journey("extreme", 178, 1, 10)];
  const winner = categorize(journeys, options).find(p => p.categories.includes("Fewer boardings"))!;
  assert.equal(winner.journey.id, "compromise"); assert.equal(winner.extraMinutes, 14);
  assert.match(winner.explanations!.join(" "), /1 fewer boarding/);
});
it("uses a proportional boarding allowance without a fixed thirty-minute cap, including exact boundaries", () => {
  assert.equal(boardingAllowance(40), 10); assert.equal(boardingAllowance(240), 60); assert.equal(boardingAllowance(300), 75);
  const fast = journey("fast", 40, 2), limit = journey("limit", 50, 1), late = journey("late", 50 + 1 / 60, 1);
  const select = (other: Journey) => categorize([fast, other], options).find(p => p.categories.includes("Fewer boardings"))!.journey.id;
  assert.equal(select(limit), "limit"); assert.equal(select(late), "fast");
  const long = journey("long", 240, 2), tooLong = journey("extra31", 271, 1);
  assert.equal(categorize([long, tooLong], options).find(p => p.categories.includes("Fewer boardings"))!.journey.id, "long");
});
it("values each avoided boarding at thirty minutes and caps a five-hour reference at seventy-five extra minutes", () => {
  const fast = journey("five-hours", 300, 4);
  const select = (minutes: number, boardings: number) => categorize([fast, journey("alternative", minutes, boardings)], options)
    .find(p => p.categories.includes("Fewer boardings"))!.journey.id;
  assert.equal(select(329, 3), "alternative");
  assert.equal(select(330, 3), "five-hours", "equal weighted scores favour the faster journey");
  assert.equal(select(331, 3), "five-hours");
  assert.equal(select(359, 2), "alternative");
  assert.equal(select(360, 2), "five-hours");
  assert.equal(select(375, 1), "alternative", "the unrelated sixty-minute window must not cut off the compromise");
  assert.equal(select(375 + 1 / 60, 1), "five-hours", "even one second over the 25% cap is rejected");
});
it("extends only the boarding comparison, preserving other objectives and fare-request windows", () => {
  const fast = journey("fast", 300, 4, 20), fewer = journey("fewer", 375, 1);
  const o: Options = { ...options, objectives: ["fastest", "fewer-boardings", "least-cycling", "cheapest"], takeBikeOnTransit: false };
  const quotes = new Map([[objectiveFareKey(fast, DEFAULT_FARE_PROFILE, false), quote(50)], [objectiveFareKey(fewer, DEFAULT_FARE_PROFILE, false), quote(10)]]);
  const result = categorize([fast, fewer], o, { profile: DEFAULT_FARE_PROFILE, quotes });
  assert.deepEqual(result.find(p => p.journey.id === fewer.id)!.categories, ["Fewer boardings"]);
  assert.deepEqual(new Set(result.find(p => p.journey.id === fast.id)!.categories), new Set(["Fastest", "Least cycling", "Lowest checked price"]));
  assert.match(result.find(p => p.journey.id === fewer.id)!.explanations!.join(" "), /75 minutes.*wider comparison window.*60 minutes/);
  assert.match(result.find(p => p.journey.id === fast.id)!.explanations!.join(" "), /Compared within 60 minutes of the fastest eligible journey/);
  assert.equal(objectiveFareRequests([{ journeys: [fast, fewer], options: o }], DEFAULT_FARE_PROFILE, +start - 1000).eligible, 1);
  assert.equal(categorize([fast, fewer], { ...o, objectives: ["fastest", "least-cycling"] }).length, 1);
});
it("allows seventy-five minutes of earlier departure on a five-hour Arrive-by reference while enforcing its deadline", () => {
  const latest = { ...journey("latest", 300, 4), startTime: at(100) };
  const earlier = { ...journey("earlier", 375, 1), startTime: at(25) };
  const tooEarly = { ...journey("too-early", 376, 1), startTime: at(24) };
  const missesDeadline = { ...journey("misses-deadline", 374, 1), startTime: at(28) };
  const cards = categorize([latest, earlier, tooEarly, missesDeadline], { ...options, arriveBy: at(400).toISOString() });
  const winner = cards.find(p => p.categories.includes("Fewer boardings"))!;
  assert.equal(winner.journey.id, "earlier"); assert.equal(winner.extraMinutes, 75);
});
it("retains and selects the long boarding compromise through both routing models and permission scopes", () => {
  const places = Array.from({ length: 5 }, (_, i) => ({ label: `Long ${i}`, stopId: `long-${i}`, lat: 47 + i * .1, lon: 8 }));
  const n = emptyNetwork();
  places.forEach(p => n.stops.set(p.stopId, { ...p, id: p.stopId, name: p.label, distanceKm: 0, bikeMinutes: 0 }));
  const add = (id: string, from: number, to: number, departure: number, arrival: number) => {
    const l = leg(id, 0, 1, departure, arrival, "not-required");
    Object.assign(l, { fromId: places[from].stopId, toId: places[to].stopId, from: places[from].label, to: places[to].label,
      fromPoint: places[from], toPoint: places[to] });
    Object.assign(l.bicycleEvidence!, { fromId: l.fromId, toId: l.toId });
    n.edges.set(id, { id, from: l.fromId!, to: l.toId!, leg: l });
  };
  add("first", 0, 1, 3, 60); add("second", 1, 2, 65, 125);
  add("third", 2, 3, 130, 190); add("fourth", 3, 4, 195, 300);
  add("direct", 0, 4, 3, 375);
  for (const mode of ["baseline", "extended"] as const) for (const bicycleScope of ["confirmed", "allow-uncertain", "all-transit"] as const) {
    const o = { ...options, horizonMinutes: 480, bicycleScope };
    const result = solve(n, places[0], places[4], start, o, mode);
    assert.equal(result.limited, false);
    const winner = categorize(result.journeys, o).find(p => p.categories.includes("Fewer boardings"))!;
    assert.deepEqual(winner.journey.services, ["direct"]); assert.equal(winner.extraMinutes, 75);
  }
});
it("uses latest-departure loss for Arrive by and does not rank the shorter displayed duration", () => {
  const latest = { ...journey("latest", 60, 2), startTime: at(100) };
  const earlier = { ...journey("earlier", 75, 1), startTime: at(85) };
  const tooEarly = { ...journey("too-early", 50, 1), startTime: at(84) };
  const o = { ...options, arriveBy: at(200).toISOString() };
  const cards = categorize([latest, earlier, tooEarly], o);
  assert.equal(cards.find(p => p.categories.includes("Leave latest"))!.journey.id, "latest");
  assert.equal(cards.find(p => p.categories.includes("Fewer boardings"))!.journey.id, "earlier");
});
it("offers only selected objectives, merges identical winners and keeps cycling only outside transit categories", () => {
  const j = journey("same", 60, 1), pure = { ...j, id: "pure", transitLegs: [], totalMinutes: 1 };
  const cards = categorize([j, pure], { ...options, objectives: ["fewer-boardings", "least-cycling"] });
  assert.equal(cards.length, 1); assert.equal(cards[0].journey.id, j.id);
  assert.deepEqual(new Set(cards[0].categories), new Set(["Fewer boardings", "Least cycling"]));
});
it("keeps less-cycling trade-offs even when they require more walking", () => {
  const fast = journey("cycle", 60, 1, 5), walk = journey("walk", 65, 1);
  walk.transitLegs.push({ ...leg("walk", 1, 2, 40, 55), mode: "walk" });
  assert.equal(pareto([fast, walk], "none", options).length, 2);
  assert.equal(categorize([fast, walk], options).find(p => p.categories.includes("Least cycling"))!.journey.id, "walk");
});
it("retains a reservation-free prefix through the same onward service in Baseline, Extended and ordered visits", () => {
  const n = network([leg("fast-reserved", 0, 1, 3, 20, "required"), leg("slower-unreserved", 0, 1, 4, 25, "not-required"), leg("onward", 1, 2, 30, 60, "not-required")]);
  const o: Options = { ...options, objectives: ["fastest", "fewer-reservations"] };
  for (const mode of ["baseline", "extended"] as const) for (const via of [false, true]) {
    const result = via ? solveWaypoints(n, points, start, o, mode) : solve(n, points[0], points[2], start, o, mode);
    const win = categorize(result.journeys, o).find(p => p.categories.includes("Fewer mandatory bicycle reservations"))!;
    assert.equal(reservationMetrics(win.journey.transitLegs).required, 0);
    assert.ok(win.journey.transitLegs.some(l => l.service === "slower-unreserved"));
  }
});
it("never interprets unknown reservation rules or prohibited carriage as no reservation", () => {
  const unknown = journey("unknown", 40, 1), known = journey("known", 45, 1), prohibited = journey("prohibited", 35, 1);
  known.transitLegs = [leg("known", 0, 2, 3, 45, "required")];
  prohibited.transitLegs = [leg("prohibited", 0, 2, 3, 35, "not-required")];
  prohibited.transitLegs[0].bicycleEvidence!.permission = "prohibited";
  const o: Options = { ...options, objectives: ["fewer-reservations"] };
  assert.equal(categorize([unknown, known, prohibited], o)[0].journey.id, "known");
  assert.equal(categorize([unknown, prohibited], o).length, 0);
  assert.equal(reservationMetrics(unknown.transitLegs, false).required, 0);
  assert.equal(categorize([unknown], { ...o, takeBikeOnTransit: false })[0].journey.id, "unknown");
});
it("preserves distinct unpriced service sequences and compares their later complete quotes", () => {
  const n = network([leg("fast-expensive", 0, 1, 3, 20), leg("slower-cheap", 0, 1, 4, 25), leg("onward", 1, 2, 30, 60)]);
  const o: Options = { ...options, objectives: ["fastest", "cheapest"], takeBikeOnTransit: false, cyclingPosition: "start-only" };
  for (const via of [false, true]) {
    const result = via ? solveWaypoints(n, points, start, o, "baseline") : solve(n, points[0], points[2], start, o, "baseline");
    const cheap = result.journeys.find(j => j.transitLegs.some(l => l.service === "slower-cheap"))!;
    assert.ok(cheap, "non-price dominance must not delete the cheaper prefix");
    const quotes = new Map(result.journeys.map(j => [objectiveFareKey(j, DEFAULT_FARE_PROFILE, false), quote(j.id === cheap.id ? 12 : 30)]));
    assert.equal(categorize(result.journeys, o, { profile: DEFAULT_FARE_PROFILE, quotes }).find(p => p.categories.includes("Lowest checked price"))!.journey.id, cheap.id);
  }
});
it("prices the complete passenger/bike/reservation total rather than the passenger component alone", () => {
  const a = journey("a", 60, 1), b = journey("b", 65, 1);
  for (const j of [a, b]) { const l = j.transitLegs[0]; l.operator = "SBB"; l.category = "IR"; l.fromId = "8503000"; l.toId = "8507000"; l.bicycleEvidence = undefined; }
  const quotes = new Map([[objectiveFareKey(a, DEFAULT_FARE_PROFILE), quote(10, 10)], [objectiveFareKey(b, DEFAULT_FARE_PROFILE), quote(12, 3)]]);
  const context = { profile: DEFAULT_FARE_PROFILE, quotes };
  assert.equal(checkedJourneyPrice(a, options, context), 20); assert.equal(checkedJourneyPrice(b, options, context), 15);
  assert.equal(categorize([a, b], { ...options, objectives: ["cheapest"] }, context)[0].journey.id, "b");
});
it("cannot win cheapest with an absent or partial fare; profile and bicycle-custody queries stay separate", () => {
  const unknown = journey("unknown", 40, 1), known = journey("known", 60, 1);
  const context = { profile: DEFAULT_FARE_PROFILE, quotes: new Map([[objectiveFareKey(known, DEFAULT_FARE_PROFILE, false), quote(15)]]) };
  const o: Options = { ...options, objectives: ["cheapest"], takeBikeOnTransit: false };
  assert.equal(categorize([unknown, known], o, context)[0].journey.id, "known");
  assert.equal(categorize([unknown, known], { ...o, takeBikeOnTransit: true }, context).length, 0);
  assert.equal(categorize([unknown, known], o, { ...context, profile: { passenger: "half-fare", annualBikePass: false } }).length, 0);
  assert.deepEqual(recommend([], [unknown], [], { ...o, bicycleScope: "allow-uncertain" }, context).unavailable, ["cheapest"]);
});
it("bounds price requests, includes non-winning slower candidates, deduplicates service quotes and skips historical dates", () => {
  const js = Array.from({ length: 12 }, (_, i) => journey("fare" + i, 60 + i, 1));
  const o: Options = { ...options, objectives: ["cheapest"], takeBikeOnTransit: false };
  const requests = objectiveFareRequests([{ journeys: [...js, { ...js[0], id: "duplicate" }], options: o }], DEFAULT_FARE_PROFILE, +start - 1000);
  assert.equal(requests.eligible, 12); assert.equal(requests.keys.length, MAX_OBJECTIVE_FARE_REQUESTS);
  assert.ok(requests.keys.includes(objectiveFareKey(js[5], DEFAULT_FARE_PROFILE, false)));
  assert.equal(objectiveFareRequests([{ journeys: js, options: o }], DEFAULT_FARE_PROFILE, +at(100)).keys.length, 0);
  assert.equal(onlineFareRequest(js[0].transitLegs, DEFAULT_FARE_PROFILE, false, +at(100)).past, true);
});
it("reuses the same serialized fare request for objective comparison and visible cards", async () => {
  const key = objectiveFareKey(journey("deduplicate", 60, 1), DEFAULT_FARE_PROFILE, false);
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return Response.json(quote(12)); };
  const replies = await Promise.all([requestOnlineFare(key, fetcher), requestOnlineFare(key, fetcher)]);
  assert.equal(calls, 1); assert.equal(replies[0].quote?.passenger?.chf, 12); assert.deepEqual(replies[0], replies[1]);
});
it("does not let unknown road attributes win the lower-traffic category", () => {
  const journeys = ["busy", "quiet", "unknown"].map((kind, i) => ({ ...journey(kind, 60 + i, 1, 5), originStation: { ...station(0), bikeMinutes: 5, cyclingRoute: road(kind as "busy" | "quiet" | "unknown") } }));
  assert.ok(journeyTraffic(journeys[0]).exposure > journeyTraffic(journeys[1]).exposure);
  assert.ok(journeyTraffic(journeys[2]).unknown > 0);
  assert.equal(categorize(journeys, { ...options, objectives: ["less-traffic"] })[0].journey.id, "quiet");
  assert.equal(categorize([journeys[2]], { ...options, objectives: ["less-traffic"] }).length, 0);
  assert.ok(routeTraffic(undefined, 5).unknown > 0);
});
it("preserves a lower-exposure access path through the same train and during ordered visits", () => {
  const n = network([leg("onward", 1, 2, 20, 60)]), home: Place = { label: "Home", lat: 46.99, lon: 8 };
  const side = { ...station(0), id: "side", name: "Side", lat: 47.001 };
  n.stops.set(side.id, side);
  const walk = { ...leg("walk-link", 0, 1, 8, 10), fromId: "side", mode: "walk" as const };
  n.edges.set("walk-link", { id: "walk-link", from: "side", to: "1", leg: walk });
  n.cycling = new Map([[cyclingKey(home, n.stops.get("1")!), road("busy", 3)], [cyclingKey(home, side), road("quiet", 4)]]);
  const o: Options = { ...options, objectives: ["fastest", "less-traffic"], maxAccessMinutes: 5, maxBikeMinutes: 5 };
  const result = solve(n, home, points[2], start, o, "baseline");
  assert.ok(result.journeys.some(j => j.originStation.id === "side"));
  const win = categorize(result.journeys, o).find(p => p.categories.includes("Less traffic exposure"))!;
  assert.equal(win.journey.originStation.id, "side");
  const end: Place = { label: "End", lat: 47.21, lon: 8 };
  n.cycling.set(cyclingKey(points[2], end), { ...road("quiet", 2), from: points[2], to: end });
  const via = solveWaypoints(n, [home, points[2], end], start, { ...o, maxEgressMinutes: 5, maxBikeMinutes: 10 }, "baseline");
  assert.ok(via.journeys.some(j => j.transitLegs.some(l => l.service === "walk-link")));
});
it("keeps the ordinary cycling route and separately retains a feasible low-traffic candidate", async () => {
  const from = { lat: 47, lon: 8 }, to = { lat: 47.01, lon: 8 };
  const data = (quiet: boolean) => ({ features: [{ geometry: { type: "LineString", coordinates: quiet ? [[8,47,400],[8.001,47.005,400],[8,47.01,400]] : [[8,47,400],[8,47.01,400]] },
    properties: { "track-length": quiet ? 1200 : 1112, "total-time": quiet ? 360 : 300,
      messages: [["Longitude", "Latitude", "WayTags"], [8000000,47010000,quiet ? "highway=cycleway surface=asphalt" : "highway=primary maxspeed=80 surface=asphalt"]] } }] });
  const client = new CyclingClient(new AbortController().signal, async input => Response.json(data(new URL(String(input)).searchParams.get("profile:avoid_unsafe") === "1")), 0, false, null, undefined, "fastest", null, undefined, true);
  const ordinary = await client.route(from, to), alternative = client.trafficRoutes.get(cyclingKey(from, to));
  assert.equal(ordinary!.minutes, 5); assert.equal(alternative!.minutes, 6);
  assert.ok(routeTraffic(alternative).exposure < routeTraffic(ordinary!).exposure);
  assert.equal(client.fork(new AbortController().signal).trafficRoutes.size, 1);
});
it("keeps the bounded mixed-mode search feasible with all six objectives selected", () => {
  const f = mixedRoutingFixture(undefined, 3);
  const o: Options = { ...f.options, objectives: ["fastest", "fewer-boardings", "least-cycling", "less-traffic", "fewer-reservations", "cheapest"] };
  for (const mode of ["baseline", "extended"] as const) {
    const result = solve(f.network, f.origin, f.destination, f.start, o, mode);
    assert.ok(result.journeys.length); assert.equal(result.limited, false);
    assert.ok(result.journeys.every(j => metrics(j).bike <= o.maxBikeMinutes && metrics(j).boardings <= o.maxBoardings));
  }
});

it("re-solves low-traffic variants against exact boarding times while preserving ordinary results and scopes", () => {
  const early = leg("early", 0, 2, 8, 40, "not-required"), later = leg("later", 0, 2, 12, 45, "not-required");
  const n = network([early, later]), home: Place = { label: "Home", lat: 46.99, lon: 8 };
  const signal = new AbortController().signal;
  const client = new CyclingClient(signal, async () => { throw new Error("No new route request expected"); }, 0, false, null);
  const normal = { ...road("busy", 5), from: home, to: points[0] }, quiet = { ...road("quiet", 6), from: home, to: points[0] };
  quiet.points = [{ ...quiet.points[0] }, { ...quiet.points[1], lon: 8.001 }];
  client.routes.set(cyclingKey(home, points[0]), normal); client.trafficRoutes.set(cyclingKey(home, points[0]), quiet);
  n.cycling = client.routes;
  const o: Options = { ...options, objectives: ["fastest", "less-traffic"], maxAccessMinutes: 10, maxBikeMinutes: 10 };
  const session: SearchSession = { origin: home, destination: points[2], start, options: o, network: n,
    client: new TimetableClient(signal), cyclingClient: client, originStations: [], destinationStations: [],
    baseline: solve(n, home, points[2], start, o, "baseline"), extended: null };
  updateBicycleEvidence(session, early, early.bicycleEvidence!, () => {});
  const ordinary = session.baseline.journeys.find(j => !j.id.startsWith("traffic:"))!;
  const variant = session.baseline.journeys.find(j => j.id.startsWith("traffic:"))!;
  assert.equal(ordinary.totalMinutes, 40); assert.equal(variant.totalMinutes, 45);
  assert.equal(variant.transitLegs[0].service, "later", "six-minute access misses the 08-minute service plus boarding allowance");
  assert.ok(session.confirmed!.baseline.journeys.length);
  const cards = categorize(session.baseline.journeys, o);
  assert.equal(cards.find(p => p.categories.includes("Fastest"))!.journey.totalMinutes, 40);
  assert.equal(cards.find(p => p.categories.includes("Less traffic exposure"))!.journey.totalMinutes, 45);
});

it("does not generate repeated zero-time walking cycles when preserving fare histories", () => {
  const rides = [leg("in", 0, 1, 3, 20), leg("out", 1, 2, 24, 60)];
  const loop = { ...leg("zero-loop", 1, 1, 20, 20), mode: "walk" as const };
  const n = network([...rides, loop]);
  const result = solve(n, points[0], points[2], start, { ...options, objectives: ["cheapest"] }, "baseline", 100);
  assert.ok(result.journeys.length); assert.equal(result.limited, false);
  assert.ok(result.journeys.every(j => j.transitLegs.filter(l => l.service === "zero-loop").length <= 1));
});
