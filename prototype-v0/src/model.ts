import { arrivalTime, departureTime, moveAfter, realtimeUnavailable } from "./realtime.ts";
import { cyclingDurationFits, cyclingMinimumResource } from "./cyclingDuration.ts";
import { boardingCheck, transferContextKey } from "./transferTimes.ts";
import { addClimb, climbingTradeoff, climbVector, hillSearch, journeyClimb, routeClimb, validateHills, type Climb, type HillPreferences } from "./hills.ts";
import { validateCyclingPace, type CyclingPace } from "./cyclingPace.ts";
import { ROUTE_PREFERENCES, type RoutePreference } from "./cyclingPreferences.ts";
import { cyclingMinutes, haversineKm, type Journey, type Place, type Point, type Station, type TransitLeg } from "./routing.ts";
import { cachedCycling, type CyclingRoute } from "./cycling.ts";
import { type BusPreference } from "./busCarriage.ts";
import { BICYCLE_SCOPES, bicycleLegAllowed, type BicycleScope } from "./bicyclePermission.ts";
import { cachedWalking, DEFAULT_WALKING_MINUTES, walkingLeg, type WalkingRoute } from "./walking.ts";
import { BOARDING_COMPROMISE, JOURNEY_OBJECTIVES, boardingAllowance, checkedJourneyPrice, farePathKey, journeyTraffic, objectiveResources, reservationMetrics, wantsObjective, type JourneyObjective, type ObjectiveFareContext } from "./journeyObjectives.ts";

export type ModelMode = "baseline" | "extended";
export type EndpointPreference = "none" | "start" | "end" | "both";
export type CyclingPosition = "anywhere" | "start-only" | "end-only";
export type Options = {
  /** Continuation while the bicycle is stored elsewhere. */
  walkingOnly?: boolean;
  objectives?: readonly JourneyObjective[];
  /** Destination deadline, including the final cycling/walking sections. */
  arriveBy?: string;
  hills?: HillPreferences;
  climbOptimization?: boolean;
  cyclingPosition?: CyclingPosition;
  takeBikeOnTransit?: boolean;
  maxWalkingMinutes?: number;
  maxCyclingTransfers?: number;
  maxBikeMinutes: number;
  /** Shared across the whole journey, including ordered waypoint stages. */
  minBikeMinutes?: number;
  maxAccessMinutes: number;
  maxEgressMinutes: number;
  maxIntermediateMinutes: number;
  maxBoardings: number;
  horizonMinutes: number;
  boardingMinutes: number;
  /** Alternative window for objectives other than the proportional boarding compromise. */
  extraTimeMinutes: number;
  endpointPreference: EndpointPreference;
  busPreference: BusPreference;
  bicycleScope?: BicycleScope;
  cyclingPace?: CyclingPace;
  cyclingRoutePreference?: RoutePreference;
};
export const DEFAULT_OPTIONS: Options = {
  cyclingPosition: "anywhere", takeBikeOnTransit: true, maxWalkingMinutes: DEFAULT_WALKING_MINUTES, maxCyclingTransfers: 2,
  maxBikeMinutes: 90, maxAccessMinutes: 60, maxEgressMinutes: 60,
  maxIntermediateMinutes: 20, maxBoardings: 4, horizonMinutes: 1440,
  boardingMinutes: 3, extraTimeMinutes: 60, endpointPreference: "none", busPreference: "include-unknown",
};
export function cyclingTransferLimit(o: Options, mode: ModelMode): number {
  return !o.walkingOnly && mode === "extended" && (o.cyclingPosition ?? "anywhere") === "anywhere"
    ? Math.min(o.maxCyclingTransfers ?? 2, o.maxBoardings - 1) : 0;
}
export function endpointCyclingLimit(o: Options, direction: "access" | "egress"): number {
  if (direction === "access" && o.cyclingPosition === "end-only" || direction === "egress" && o.cyclingPosition === "start-only") return 0;
  return Math.min(o.maxBikeMinutes, direction === "access" ? o.maxAccessMinutes : o.maxEgressMinutes);
}
export const endpointIsWalking = (o: Options, direction: "access" | "egress") =>
  !!o.walkingOnly || direction === "access" && o.cyclingPosition === "end-only" || direction === "egress" && o.cyclingPosition === "start-only";
export const endpointMinutes = (station: Station) => station.bikeMinutes + (station.walkMinutes ?? 0);
export const endpointTravelLimit = (o: Options, direction: "access" | "egress") => endpointIsWalking(o, direction)
  ? o.maxWalkingMinutes ?? DEFAULT_WALKING_MINUTES : endpointCyclingLimit(o, direction);
export const journeyLegAllowed = (leg: TransitLeg, o: Options) => !realtimeUnavailable(leg) && bicycleLegAllowed(leg, o.busPreference,
  o.takeBikeOnTransit === false ? "all-transit" : o.bicycleScope);
export type Stop = { id: string; name: string; lat: number; lon: number; kind?: string };
export type Edge = { id: string; from: string; to: string; leg: TransitLeg };
export type Network = { stops: Map<string, Stop>; edges: Map<string, Edge>; cycling?: Map<string, CyclingRoute | null>;
  walking?: Map<string, WalkingRoute | null> };
export const emptyNetwork = (): Network => ({ stops: new Map(), edges: new Map() });
export function cyclingLink(network: Network, from: Point & { id?: string; stopId?: string }, to: Point & { id?: string; stopId?: string }, pace?: CyclingPace) {
  if (network.cycling) {
    const route = cachedCycling(network.cycling, from, to);
    return { minutes: route?.minutes ?? Infinity, distanceKm: route?.distanceKm ?? Infinity, route: route ?? undefined };
  }
  const distanceKm = (from.stopId ?? from.id) && (from.stopId ?? from.id) === (to.stopId ?? to.id) ? 0 : haversineKm(from, to);
  return { minutes: cyclingMinutes(distanceKm, pace), distanceKm, route: undefined };
}
export const atEndpoint = (stop: Stop, point: Place, network?: Network, direction: "access" | "egress" = "access", o?: Options): Station => {
  if (o && endpointIsWalking(o, direction)) {
    const route = direction === "access" ? cachedWalking(network?.walking, point, stop) : cachedWalking(network?.walking, stop, point);
    return { ...stop, distanceKm: route?.distanceKm ?? Infinity, bikeMinutes: 0, walkMinutes: route?.minutes ?? Infinity, walkingRoute: route };
  }
  if (network?.cycling) {
    const link = direction === "access" ? cyclingLink(network, point, stop) : cyclingLink(network, stop, point);
    return { ...stop, distanceKm: link.distanceKm, bikeMinutes: link.minutes, cyclingRoute: link.route };
  }
  const distanceKm = point.stopId === stop.id ? 0 : haversineKm(stop, point);
  return { ...stop, distanceKm, bikeMinutes: cyclingMinutes(distanceKm, o?.cyclingPace) };
};

export function validateOptions(o: Options) {
  if (o.walkingOnly !== undefined && typeof o.walkingOnly !== "boolean") throw new Error("Invalid bicycle availability.");
  if (o.walkingOnly && (o.takeBikeOnTransit !== false || o.maxBikeMinutes !== 0 || (o.minBikeMinutes ?? 0) !== 0))
    throw new Error("A parked bicycle cannot be used before collection.");
  if (o.minBikeMinutes !== undefined && (!Number.isInteger(o.minBikeMinutes) || o.minBikeMinutes < 0 || o.minBikeMinutes > o.maxBikeMinutes))
    throw new Error("The cycling minimum must be a whole number from 0 to the cycling maximum.");
  if (o.objectives !== undefined && (!Array.isArray(o.objectives) || !o.objectives.length
    || o.objectives.some(value => !JOURNEY_OBJECTIVES.includes(value)) || new Set(o.objectives).size !== o.objectives.length))
    throw new Error("Choose at least one valid journey objective, without duplicates.");
  if (o.arriveBy !== undefined && (typeof o.arriveBy !== "string" || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(o.arriveBy) || !Number.isFinite(Date.parse(o.arriveBy))))
    throw new Error("Choose a valid arrival date and time.");
  if (o.hills) validateHills(o.hills);
  if (o.climbOptimization !== undefined && typeof o.climbOptimization !== "boolean") throw new Error("Invalid climbing optimization.");
  if (o.cyclingPosition !== undefined && !["anywhere", "start-only", "end-only"].includes(o.cyclingPosition)) throw new Error("Invalid cycling position.");
  if (o.takeBikeOnTransit !== undefined && typeof o.takeBikeOnTransit !== "boolean") throw new Error("Invalid bicycle carriage choice.");
  if (o.takeBikeOnTransit === false && (o.cyclingPosition ?? "anywhere") === "anywhere") throw new Error("Choose cycling only at the beginning or end when your bike stays off public transport.");
  if (o.maxWalkingMinutes !== undefined && (!Number.isInteger(o.maxWalkingMinutes) || o.maxWalkingMinutes < 0 || o.maxWalkingMinutes > 60)) throw new Error("Walking sections must be between 0 and 60 minutes.");
  if (o.maxCyclingTransfers !== undefined && (!Number.isInteger(o.maxCyclingTransfers) || o.maxCyclingTransfers < 0 || o.maxCyclingTransfers > 2)) throw new Error("Cycling connections must be a whole number from 0 to 2.");
  if (o.cyclingRoutePreference !== undefined && !ROUTE_PREFERENCES.includes(o.cyclingRoutePreference)) throw new Error("Invalid cycling route preference.");
  if (o.cyclingPace) validateCyclingPace(o.cyclingPace);
  const bounds: [keyof Options, number, number][] = [
    ["maxBikeMinutes", 0, 1440], ["maxAccessMinutes", 0, 1440], ["maxEgressMinutes", 0, 1440],
    ["maxIntermediateMinutes", 0, 1440], ["maxBoardings", 1, 8], ["horizonMinutes", 30, 1440],
    ["boardingMinutes", 0, 15], ["extraTimeMinutes", 0, 1440],
  ];
  for (const [key, min, max] of bounds) {
    const value = o[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${key} must be a whole number between ${min} and ${max}.`);
    }
  }
  if (!["none", "start", "end", "both"].includes(o.endpointPreference)) throw new Error("Invalid endpoint preference.");
  if (!["known-rules", "include-unknown", "no-buses"].includes(o.busPreference)) throw new Error("Invalid bus preference.");
  if (o.bicycleScope !== undefined && !BICYCLE_SCOPES.includes(o.bicycleScope)) throw new Error("Invalid bicycle permission scope.");
}

export function metrics(j: Journey, threshold = 6) {
  const climb = journeyClimb(j, threshold);
  const duration = (l: TransitLeg) => l.departure && l.arrival
    ? Math.max(0, (l.arrival.getTime() - l.departure.getTime()) / 60_000) : 0;
  const boardings = j.transitLegs.filter(l => l.mode === "transit").length;
  const first = j.transitLegs.findIndex(l => l.mode === "transit");
  const last = j.transitLegs.reduce((found, l, i) => l.mode === "transit" ? i : found, -1);
  const walking = (legs: TransitLeg[]) => legs.filter(l => l.mode === "walk").reduce((sum, l) => sum + duration(l), 0);
  const biking = (legs: TransitLeg[]) => legs.filter(l => l.mode === "bike").reduce((sum, l) => sum + duration(l), 0);
  const middle = biking(j.transitLegs.slice(first + 1, last));
  const walk = walking(j.transitLegs), bike = j.originStation.bikeMinutes + biking(j.transitLegs) + j.destinationStation.bikeMinutes;
  return { ascent: climb.unknown ? Infinity : climb.ascent, steepM: climb.unknown ? Infinity : climb.steepM,
    excessM: climb.unknown ? Infinity : climb.excessM, time: j.totalMinutes, leave: -j.startTime.getTime(), bike, walk, active: bike + walk,
    start: j.originStation.bikeMinutes, end: j.destinationStation.bikeMinutes, middle, boardings,
    activeStart: j.originStation.bikeMinutes + walking(j.transitLegs.slice(0, Math.max(0, first))) + biking(j.transitLegs.slice(0, Math.max(0, first))),
    activeEnd: j.destinationStation.bikeMinutes + walking(j.transitLegs.slice(last + 1)) + biking(j.transitLegs.slice(last + 1)) };
}
export const dominates = (a: number[], b: number[]) => a.every((v, i) => v <= b[i]) && a.some((v, i) => v < b[i]);
export function pareto(journeys: Journey[], endpoint: EndpointPreference = "none", options?: Options): Journey[] {
  const vector = (j: Journey) => {
    const m = metrics(j);
    return [m.time, m.active, m.boardings, ...(options && wantsObjective(options, "least-cycling") ? [m.bike] : []),
      ...(options ? objectiveResources(j.transitLegs, options, [{ route: j.originStation.cyclingRoute, minutes: j.originStation.bikeMinutes }, { route: j.destinationStation.cyclingRoute, minutes: j.destinationStation.bikeMinutes }]) : []),
      ...(options?.arriveBy ? [m.leave] : []), ...(options && hillSearch(options) ? climbVector(journeyClimb(j, options.hills?.maxUphillPercent), options.hills?.mode === "gentler") : []),
      ...(["start", "both"].includes(endpoint) ? [m.activeStart] : []), ...(["end", "both"].includes(endpoint) ? [m.activeEnd] : [])];
  };
  const unique = [...new Map(journeys.map(j => [j.id, j])).values()];
  const vectors = unique.map(vector);
  const fareKeys = unique.map(j => options ? farePathKey(j.transitLegs, options) : "");
  return unique.filter((_, i) => !vectors.some((v, k) => k !== i
    && fareKeys[i] === fareKeys[k] && dominates(v, vectors[i])));
}
export type Proposal = { journey: Journey; categories: string[]; extraMinutes: number; cyclingSaved: number; activeSaved: number; climbingSaved?: number; explanations?: string[] };
export function objectiveCandidatePool(journeys: Journey[], o: Options) {
  const mixed = [...new Map(journeys.filter(j => j.transitLegs.some(leg => leg.mode === "transit")
    && ((o.minBikeMinutes ?? 0) <= 0 || metrics(j).bike + 1e-9 >= o.minBikeMinutes!)
    && (!o.arriveBy || +j.startTime + j.totalMinutes * 60_000 <= Date.parse(o.arriveBy))).map(j => [j.id, j])).values()];
  const best = Math.min(...mixed.map(j => o.arriveBy ? -+j.startTime / 60_000 : j.totalMinutes));
  return mixed.filter(j => (o.arriveBy ? -+j.startTime / 60_000 : j.totalMinutes) - best <= o.extraTimeMinutes);
}
export function categorize(journeys: Journey[], o: Options, fares?: ObjectiveFareContext): Proposal[] {
  const metricCache = new Map<Journey, ReturnType<typeof metrics>>();
  const measured = (journey: Journey) => {
    let value = metricCache.get(journey);
    if (!value) { value = metrics(journey, o.hills?.maxUphillPercent); metricCache.set(journey, value); }
    return value;
  };
  // Pure cycling never competes for the mixed-journey categories.
  const mixed = objectiveCandidatePool(journeys, o);
  if (!mixed.length) return [];
  const compare = (keys: (keyof ReturnType<typeof metrics>)[]) => (a: Journey, b: Journey) => {
    const am = measured(a), bm = measured(b);
    for (const key of keys) if (am[key] !== bm[key]) return am[key] - bm[key];
    return a.id.localeCompare(b.id);
  };
  const fastest = [...mixed].sort(compare(o.arriveBy ? ["leave", "time", "active", "boardings"] : ["time", "active", "boardings"]))[0];
  const extraTime = (j: Journey) => o.arriveBy ? (+fastest.startTime - +j.startTime) / 60_000 : j.totalMinutes - fastest.totalMinutes;
  const frontier = pareto(mixed.filter(j => extraTime(j) <= o.extraTimeMinutes), o.endpointPreference, o);
  const definitions: [string, (keyof ReturnType<typeof metrics>)[]][] = [];
  if (wantsObjective(o, "fastest")) definitions.push([o.arriveBy ? "Leave latest" : "Fastest", o.arriveBy ? ["leave", "time", "active", "boardings"] : ["time", "active", "boardings"]]);
  if (wantsObjective(o, "least-cycling")) definitions.push(["Least cycling", ["bike", "time", "walk", "boardings"]]);
  if (["start", "both"].includes(o.endpointPreference)) definitions.push(["Least cycling or walking at start", ["activeStart", "time", "active", "boardings"]]);
  if (["end", "both"].includes(o.endpointPreference)) definitions.push(["Least cycling or walking at arrival", ["activeEnd", "time", "active", "boardings"]]);
  if (o.hills?.mode === "gentler") definitions.push(["Gentlest cycling", ["excessM", "steepM", "ascent", "time"]]);
  const proposals = new Map<string, Proposal>();
  const add = (winner: Journey | undefined, category: string, explanation?: string) => {
    if (!winner) return;
    const window = category !== "Fastest" && category !== "Leave latest" && category !== "Fewer boardings"
      ? `Compared within ${o.extraTimeMinutes} minutes ${o.arriveBy ? "before the latest eligible departure" : "of the fastest eligible journey"}.` : "";
    explanation = [explanation, window].filter(Boolean).join(" ") || undefined;
    const existing = proposals.get(winner.id);
    if (existing) { existing.categories.push(category); if (explanation) (existing.explanations ??= []).push(explanation); }
    else proposals.set(winner.id, { journey: winner, categories: [category], extraMinutes: extraTime(winner),
      cyclingSaved: measured(fastest).bike - measured(winner).bike,
      activeSaved: measured(fastest).active - measured(winner).active, ...(explanation ? { explanations: [explanation] } : {}) });
  };
  for (const [category, keys] of definitions) {
    const eligible = category === "Gentlest cycling"
      ? frontier.filter(j => !journeyClimb(j, o.hills?.maxUphillPercent).unknown) : frontier;
    const winner = [...eligible].sort(compare(keys))[0];
    add(winner, category);
  }
  if (wantsObjective(o, "fewer-boardings")) {
    const allowance = boardingAllowance(fastest.totalMinutes);
    // This objective has its own relative window. Do not discard a useful long
    // journey at the general (normally 60-minute) window used by other objectives.
    const boardingFrontier = pareto(objectiveCandidatePool(journeys, { ...o, extraTimeMinutes: allowance }), o.endpointPreference, o);
    const score = (j: Journey) => extraTime(j) + BOARDING_COMPROMISE.minutesPerBoarding * measured(j).boardings;
    const winner = [...boardingFrontier].filter(j => extraTime(j) <= allowance + 1e-9)
      .sort((a, b) => score(a) - score(b) || extraTime(a) - extraTime(b) || compare(["active", "boardings"])(a, b))[0];
    const saved = winner ? measured(fastest).boardings - measured(winner).boardings : 0;
    const window = ` Compared within ${allowance} minutes ${o.arriveBy ? "before the latest eligible departure" : "of the fastest eligible journey"}.`
      + (allowance > o.extraTimeMinutes ? ` This is a wider comparison window than the ${o.extraTimeMinutes} minutes used by the other alternatives.` : "");
    add(winner, "Fewer boardings", (saved > 0 ? `${saved} fewer boarding${saved === 1 ? "" : "s"}; compromise values each avoided boarding at ${BOARDING_COMPROMISE.minutesPerBoarding} minutes, within 25% extra reference time overall.`
      : `No worthwhile reduction in boardings was found with ${BOARDING_COMPROMISE.minutesPerBoarding} minutes per avoided boarding and the 25% overall allowance.`) + window);
  }
  if (wantsObjective(o, "less-traffic")) {
    const eligible = frontier.filter(j => journeyTraffic(j).unknown === 0);
    const winner = eligible.sort((a, b) => journeyTraffic(a).exposure - journeyTraffic(b).exposure || extraTime(a) - extraTime(b) || a.id.localeCompare(b.id))[0];
    add(winner, "Less traffic exposure", "Lowest mapped road-traffic exposure among checked alternatives. Uses road class, speed tags and cycling infrastructure, not live traffic or a safety guarantee; less cycling can also reduce exposure.");
  }
  if (wantsObjective(o, "fewer-reservations")) {
    const r = (j: Journey) => reservationMetrics(j.transitLegs, o.takeBikeOnTransit !== false);
    const eligible = frontier.filter(j => !r(j).unknown && !r(j).prohibited);
    const winner = eligible.sort((a, b) => r(a).required - r(b).required || extraTime(a) - extraTime(b) || compare(["boardings", "active"])(a, b))[0];
    if (winner) add(winner, "Fewer mandatory bicycle reservations", o.takeBikeOnTransit === false
      ? "Your bicycle stays off public transport, so no bicycle reservation is needed."
      : `${r(winner).required} service${r(winner).required === 1 ? " requires" : "s require"} a bicycle reservation. Compared only where all reservation rules are known; this does not check remaining spaces or count separate bookings.`);
  }
  if (wantsObjective(o, "cheapest")) {
    const priced = mixed.map(journey => ({ journey, price: checkedJourneyPrice(journey, o, fares) })).filter(p => p.price !== null && Number.isFinite(p.price));
    const winner = priced.sort((a, b) => a.price! - b.price! || extraTime(a.journey) - extraTime(b.journey) || a.journey.id.localeCompare(b.journey.id))[0];
    if (winner) add(winner.journey, "Lowest checked price", `CHF ${winner.price!.toFixed(2)} additional cost, including passenger, bicycle and required reservations. Lowest complete checked total in the sampled alternatives; incomplete fares cannot win. Online quotes are test estimates.`);
  }
  if (o.climbOptimization) {
    const alternatives = frontier.flatMap(journey => {
      const tradeoff = climbingTradeoff(fastest, journey, o.extraTimeMinutes, !!o.arriveBy);
      return tradeoff ? [{ journey, ...tradeoff }] : [];
    }).sort((a, b) => a.score - b.score || extraTime(a.journey) - extraTime(b.journey)
      || compare(["time", "active", "boardings"])(a.journey, b.journey));
    const winner = alternatives[0];
    if (winner) {
      const existing = proposals.get(winner.journey.id);
      if (existing) { add(winner.journey, "Reduce climbing"); existing.climbingSaved = winner.savedMetres; }
      else proposals.set(winner.journey.id, { journey: winner.journey, categories: ["Reduce climbing"],
        extraMinutes: extraTime(winner.journey), climbingSaved: winner.savedMetres,
        cyclingSaved: measured(fastest).bike - measured(winner.journey).bike,
        activeSaved: measured(fastest).active - measured(winner.journey).active,
        explanations: [`Compared within ${o.extraTimeMinutes} minutes ${o.arriveBy ? "before the latest eligible departure" : "of the fastest eligible journey"}.`] });
    }
  }
  return [...proposals.values()];
}

type Label = {
  startedAt: number;
  stop: string; time: number; bike: number; walk: number; accessActive: number; egressWalk: number; boardings: number; middle: number;
  climb: Climb; needsTransit: boolean; access: Station; legs: TransitLeg[]; alive: boolean;
  vector?: number[];
};
export type Solution = { journeys: Journey[]; reachable: Label[]; explored: number; retained: number; limited: boolean };

/** Latest origin departure for each possible first timed edge. This retains the
 * existing forward, connection-specific boarding checks rather than reversing
 * directed paths or transferring platform rules to the wrong service. */
function accessDepartureTimes(edges: readonly Edge[], stop: Stop, cyclingMinutes: number, earliest: Date, o: Options): number[] {
  const deadline = Date.parse(o.arriveBy!);
  const lower = Math.max(+earliest, deadline - o.horizonMinutes * 60_000);
  return [...new Set(edges.flatMap(({ leg }) => {
    if (!leg.departure || !leg.arrival || +arrivalTime(leg)! > deadline) return [];
    const allowance = leg.mode === "transit" ? boardingCheck([], leg, +leg.departure, o.boardingMinutes, stop).minutes : 0;
    const time = +departureTime(leg)! - (cyclingMinutes + allowance) * 60_000;
    return Number.isFinite(time) && time >= lower && time <= deadline ? [time] : [];
  }))].sort((a, b) => b - a);
}

/** Ordered visits may precede the first boarding. Generate seeds for every
 * checked cycling prefix; all complete paths still undergo the usual solver. */
export function arrivalDepartureSeeds(network: Network, points: Place[], earliest: Date, o: Options): number[] {
  const times = new Set<number>();
  let prefix = 0, visits = 0;
  for (let stage = 0; stage < points.length - 1; stage++) {
    if (stage) {
      const minutes = endpointIsWalking(o, "access") ? cachedWalking(network.walking, points[stage - 1], points[stage])?.minutes ?? Infinity
        : cyclingLink(network, points[stage - 1], points[stage], o.cyclingPace).minutes;
      if (minutes > (endpointIsWalking(o, "access") ? o.maxWalkingMinutes ?? DEFAULT_WALKING_MINUTES : Math.max(o.maxAccessMinutes, o.maxEgressMinutes))) break;
      prefix += minutes; visits += points[stage].visit?.minutes ?? 0;
    }
    if (!Number.isFinite(prefix) || !endpointIsWalking(o, "access") && prefix > o.maxBikeMinutes) break;
    for (const stop of network.stops.values()) {
      const access = endpointMinutes(atEndpoint(stop, points[stage], network, "access", o));
      if (access > endpointTravelLimit(o, "access") || !endpointIsWalking(o, "access") && prefix + access > o.maxBikeMinutes) continue;
      const edges = [...network.edges.values()].filter(e => e.from === stop.id && e.leg.departure && e.leg.arrival
        && arrivalTime(e.leg)! >= departureTime(e.leg)! && ["transit", "walk"].includes(e.leg.mode)
        && journeyLegAllowed(e.leg, o));
      for (const time of accessDepartureTimes(edges, stop, prefix + visits + access, earliest, o)) times.add(time);
    }
  }
  return [...times].sort((a, b) => b - a);
}

// Multi-label time-dependent search over the supplied finite timetable graph.
// Each transit edge is one complete boarding-to-alighting ride, so onboard
// state is compressed out; pass-stop prefixes are alternative exits, not transfers.
export function solve(network: Network, origin: Place, destination: Place, start: Date,
  o: Options, mode: ModelMode, labelLimit = 50_000): Solution {
  validateOptions(o);
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid departure time.");
  const horizon = o.arriveBy ? Date.parse(o.arriveBy) : start.getTime() + o.horizonMinutes * 60_000;
  const transferLimit = cyclingTransferLimit(o, mode);
  const outgoing = new Map<string, Edge[]>();
  // A solve is synchronous: effective vehicle times cannot change mid-search.
  const vehicleTimes = new Map<TransitLeg, { departure: number; arrival: number }>();
  const transferSensitive = [...network.edges.values()].some(e => e.leg.transferRules?.length || e.leg.stationArrival?.id || e.leg.stationDeparture?.id);
  for (const edge of network.edges.values()) {
    const l = edge.leg;
    if (!l.departure || !l.arrival || !Number.isFinite(l.departure.getTime()) ||
      !Number.isFinite(l.arrival.getTime()) || arrivalTime(l)! < departureTime(l)! ||
      !["transit", "walk"].includes(l.mode) || !journeyLegAllowed(l, o)) continue;
    if (!network.stops.has(edge.from) || !network.stops.has(edge.to)) continue;
    if (l.mode === "transit") vehicleTimes.set(l, { departure: +departureTime(l)!, arrival: +arrivalTime(l)! });
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge); outgoing.set(edge.from, list);
  }
  const cycling = new Map<string, { stop: Stop; minutes: number; route?: CyclingRoute }[]>();
  const boardingStops = [...network.stops.values()].filter(s => outgoing.get(s.id)?.some(e => e.leg.mode === "transit"));
  const labels = new Map<string, Label[]>(), queue: Label[] = [];
  let limited = false;
  const computeVector = (l: Label) => [l.time, ...(o.arriveBy ? [-l.startedAt] : []), l.bike, l.bike + l.walk, l.boardings, l.accessActive, l.egressWalk,
      ...cyclingMinimumResource(l.bike, o),
      ...objectiveResources(l.legs, o, [{ route: l.access.cyclingRoute, minutes: l.access.bikeMinutes }]),
      ...(hillSearch(o) ? climbVector(l.climb, o.hills?.mode === "gentler") : [])];
  const add = (label: Label) => {
    if (label.time > horizon || label.bike > o.maxBikeMinutes || label.boardings > o.maxBoardings) return;
    const key = `${label.stop}|${label.middle}|${label.needsTransit}|${transferSensitive ? transferContextKey(label.legs) : ""}|${farePathKey(label.legs, o)}`;
    const bucket = labels.get(key) ?? [];
    // Keep cycling as a resource as well as total active travel as an objective.
    // A lower active total can use more cycling and leave less budget for later.
    // Endpoint attributes must also survive pruning for optional categories.

    // Derived labels spread their parent: always overwrite the inherited vector.
    // Only already-inserted bucket members may reuse their computed resources.
    const v = label.vector = computeVector(label);
    if (bucket.some(l => l.vector!.every((x, i) => x <= v[i]))) return;
    if (queue.length >= labelLimit) { limited = true; return; }
    let retained = 0;
    for (const l of bucket) {
      if (dominates(v, l.vector!)) l.alive = false;
      else bucket[retained++] = l;
    }
    bucket.length = retained; bucket.push(label);
    labels.set(key, bucket); queue.push(label);
  };
  for (const stop of network.stops.values()) {
    if (!outgoing.has(stop.id)) continue;
    const access = atEndpoint(stop, origin, network, "access", o), accessMinutes = endpointMinutes(access);
    if (accessMinutes <= endpointTravelLimit(o, "access")) for (const startedAt of o.arriveBy
      ? accessDepartureTimes(outgoing.get(stop.id)!, stop, accessMinutes, start, o) : [+start]) add({ stop: stop.id, startedAt,
      time: startedAt + accessMinutes * 60_000, bike: access.bikeMinutes,
      walk: access.walkMinutes ?? 0, accessActive: accessMinutes, egressWalk: 0,
      boardings: 0, middle: 0, climb: routeClimb(access.cyclingRoute, access.bikeMinutes, o.hills?.maxUphillPercent), needsTransit: true, access, legs: [], alive: true });
  }
  let explored = 0;
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (!current.alive) continue;
    explored++;
    for (const original of outgoing.get(current.stop) ?? []) {
      const vehicle = vehicleTimes.get(original.leg);
      if (vehicle && (vehicle.departure < current.time || vehicle.arrival > horizon || current.boardings >= o.maxBoardings)) continue;
      const edge = { ...original, leg: moveAfter(original.leg, current.time) };
      const departure = vehicle?.departure ?? +departureTime(edge.leg)!, arrival = vehicle?.arrival ?? +arrivalTime(edge.leg)!;
      if (departure < current.time || arrival > horizon) continue;
      if (wantsObjective(o, "cheapest") && current.legs.includes(edge.leg)) continue;
      const ride = edge.leg.mode === "transit";
      const boarding = ride ? boardingCheck(current.legs, edge.leg, current.time, o.boardingMinutes, network.stops.get(current.stop)) : null;
      const ready = boarding?.readyAt ?? current.time;
      if (departure < ready) continue;
      const walking = ride ? (boarding?.transferLeg ? (+boarding.transferLeg.arrival! - +boarding.transferLeg.departure!) / 60_000 : 0) : (+arrivalTime(edge.leg)! - +departureTime(edge.leg)!) / 60_000;
      add({ ...current, stop: edge.to, time: arrival,
        walk: current.walk + walking,
        accessActive: current.accessActive + (current.boardings === 0 ? walking : 0),
        egressWalk: ride ? 0 : current.egressWalk + walking,
        boardings: current.boardings + Number(ride), needsTransit: ride ? false : current.needsTransit,
        legs: [...current.legs, ...(boarding?.transferLeg ? [boarding.transferLeg] : []), edge.leg], alive: true });
    }
    if (current.middle >= transferLimit || current.needsTransit || !current.boardings || current.boardings >= o.maxBoardings) continue;
    const from = network.stops.get(current.stop)!;
    let neighbors = cycling.get(from.id);
    if (!neighbors) {
      neighbors = boardingStops.filter(s => s.id !== from.id).map(stop => ({ stop, ...cyclingLink(network, from, stop, o.cyclingPace) }))
        .filter(n => n.minutes > 0 && n.minutes <= o.maxIntermediateMinutes);
      cycling.set(from.id, neighbors);
    }
    for (const { stop, minutes, route } of neighbors) {
      const arrival = current.time + minutes * 60_000;
      const leg: TransitLeg = { mode: "bike", from: from.name, to: stop.name,
        departure: new Date(current.time), arrival: new Date(arrival), departurePlatform: null, arrivalPlatform: null,
        service: "Cycle between stops", serviceName: null, direction: null,
        fromId: from.id, toId: stop.id, fromPoint: from, toPoint: stop, cyclingRoute: route, geometry: route?.points };
      add({ ...current, stop: stop.id, time: arrival, bike: current.bike + minutes,
        climb: addClimb(current.climb, routeClimb(route, minutes, o.hills?.maxUphillPercent)),
        middle: current.middle + 1, needsTransit: true, legs: [...current.legs, leg], alive: true });
    }
  }
  const reachable = [...labels.values()].flat().filter(l => l.alive);
  const journeys: Journey[] = [];
  for (const label of reachable) {
    if (!label.boardings || label.needsTransit) continue;
    const egress = atEndpoint(network.stops.get(label.stop)!, destination, network, "egress", o), egressMinutes = endpointMinutes(egress);
    if (egressMinutes > endpointTravelLimit(o, "egress") || !cyclingDurationFits(label.bike + egress.bikeMinutes, o) ||
      label.time + egressMinutes * 60_000 > horizon) continue;
    const departure = departureTime(label.legs[0])!, arrival = new Date(label.time);
    const journey: Journey = { id: JSON.stringify([label.access.id, ...label.legs.map(l =>
      [l.mode, l.fromId, l.toId, l.serviceName, l.service, l.operator, l.category, l.departure!.getTime(), l.arrival!.getTime()]), egress.id]),
      startTime: new Date(label.startedAt), originStation: label.access, destinationStation: egress, departure, arrival,
      trainMinutes: (arrival.getTime() - departure.getTime()) / 60_000,
      waitMinutes: (departure.getTime() - label.startedAt) / 60_000 - endpointMinutes(label.access),
      totalMinutes: (label.time - label.startedAt) / 60_000 + egressMinutes,
      changes: label.boardings - 1, services: [...new Set(label.legs.filter(l => l.mode === "transit").map(l => l.service))],
      transitLegs: label.legs };
    // Explicit endpoint legs keep walking visible in metrics, fares, map,
    // editing and arrival timing, using the same representation as waypoints.
    if ((label.access.walkMinutes ?? 0) > 0 || (egress.walkMinutes ?? 0) > 0) {
      const endpointLeg = (station: Station, from: Place | Stop, to: Place | Stop, time: number): TransitLeg[] => {
        if (!endpointMinutes(station)) return [];
        if (station.walkingRoute) return [walkingLeg(station.walkingRoute, time, from, to)];
        return [{ mode: "bike", from: "label" in from ? from.label : from.name, to: "label" in to ? to.label : to.name,
          fromPoint: from, toPoint: to, departure: new Date(time), arrival: new Date(time + station.bikeMinutes * 60_000),
          departurePlatform: null, arrivalPlatform: null, service: "Cycle", serviceName: null, direction: null,
          cyclingRoute: station.cyclingRoute, geometry: station.cyclingRoute?.points }];
      };
      journey.transitLegs = [...endpointLeg(label.access, origin, label.access, label.startedAt), ...label.legs,
        ...endpointLeg(egress, egress, destination, label.time)];
      journey.originStation = { ...label.access, bikeMinutes: 0, walkMinutes: 0, distanceKm: 0, cyclingRoute: undefined, walkingRoute: undefined };
      journey.destinationStation = { ...egress, bikeMinutes: 0, walkMinutes: 0, distanceKm: 0, cyclingRoute: undefined, walkingRoute: undefined };
      journey.arrival = new Date(label.time + egressMinutes * 60_000);
      journey.legsIncludeEndpoints = true;
    }
    journeys.push(journey);
  }
  return { journeys, reachable, explored, retained: reachable.length, limited };
}

export function compareModels(network: Network, origin: Place, destination: Place, start: Date, o: Options, labelLimit = 50_000) {
  const baseline = solve(network, origin, destination, start, o, "baseline", labelLimit);
  const extended = solve(network, origin, destination, start, o, "extended", labelLimit);
  const one = cyclingTransferLimit(o, "extended") > 1
    ? solve(network, origin, destination, start, { ...o, maxCyclingTransfers: 1 }, "extended", labelLimit) : null;
  // Preserve 0/1-transfer alternatives if the larger search reaches its cap.
  extended.journeys = [...new Map([...baseline.journeys, ...one?.journeys ?? [], ...extended.journeys].map(j => [j.id, j])).values()];
  extended.limited ||= one?.limited ?? false;
  return { baseline, extended };
}
