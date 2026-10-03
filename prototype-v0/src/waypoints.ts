import { boardingCheck, transferContextKey } from "./transferTimes.ts";
import { addClimb, climbVector, emptyClimb, hillSearch, routeClimb, type Climb } from "./hills.ts";
import { atEndpoint, cyclingLink, cyclingTransferLimit, dominates, validateOptions, type Edge, type ModelMode, type Network, type Options, type Solution, type Stop } from "./model.ts";
import { type Journey, type Place, type TransitLeg } from "./routing.ts";
import { bicycleLegAllowed } from "./bicyclePermission.ts";
import { samePlace } from "./cycling.ts";

type State = {
  climb: Climb;
  stop: string; stage: number; time: number; bike: number; walk: number; boardings: number;
  extraTransfers: number; stageHasTransit: boolean; needsTransit: boolean; endCycling: boolean;
  accessActive: number; egressActive: number; legs: TransitLeg[];
  visits: { place: Place; arrival: Date }[]; alive: boolean;
};
export type WaypointSolution = Solution & { stageArrivals: number[]; transferExits: { stop: string; stage: number; time: number; bike: number; boardings: number; middle: number }[] };
const pointId = (index: number) => `requested-point:${index}`;

// Ordered stopovers are separate stages, but time, cycling and boarding budgets
// belong to the whole journey. Keep all nondominated states across stage changes;
// choosing only the fastest first stage can hide a viable onward connection.
export function solveWaypoints(network: Network, points: Place[], start: Date, options: Options,
  mode: ModelMode, labelLimit = 50_000): WaypointSolution {
  validateOptions(options);
  if (points.length < 2 || !Number.isFinite(start.getTime())) throw new Error("A route needs a start, finish and valid departure time.");
  const horizon = start.getTime() + options.horizonMinutes * 60_000;
  const transferLimit = cyclingTransferLimit(options, mode);
  const outgoing = new Map<string, Edge[]>();
  const transferSensitive = [...network.edges.values()].some(e => e.leg.transferRules?.length);
  for (const edge of network.edges.values()) {
    const leg = edge.leg;
    if (!leg.departure || !leg.arrival || !Number.isFinite(leg.departure.getTime()) || !Number.isFinite(leg.arrival.getTime())
      || leg.arrival < leg.departure || !["transit", "walk"].includes(leg.mode) || !bicycleLegAllowed(leg, options.busPreference, options.bicycleScope)
      || !network.stops.has(edge.from) || !network.stops.has(edge.to)) continue;
    outgoing.set(edge.from, [...outgoing.get(edge.from) ?? [], edge]);
  }
  const boardingStops = [...network.stops.values()].filter(stop => outgoing.get(stop.id)?.some(edge => edge.leg.mode === "transit"));
  const accessStops = [...network.stops.values()].filter(stop => outgoing.has(stop.id));
  const buckets = new Map<string, State[]>(), queue: State[] = [];
  const stageArrivals = points.map(() => Infinity);
  let limited = false, explored = 0;
  const add = (state: State) => {
    if (state.time > horizon || state.bike > options.maxBikeMinutes || state.boardings > options.maxBoardings) return;
    const key = `${state.stop}|${state.stage}|${state.extraTransfers}|${state.stageHasTransit}|${state.needsTransit}|${state.boardings > 0}|${state.endCycling}|${transferSensitive ? transferContextKey(state.legs) : ""}`;
    const bucket = buckets.get(key) ?? [];
    const vector = (s: State) => [s.time, s.bike, s.bike + s.walk, s.boardings, s.accessActive, s.egressActive, ...(hillSearch(options) ? climbVector(s.climb, options.hills?.mode === "gentler") : [])];
    const values = vector(state);
    if (bucket.some(s => vector(s).every((v, i) => v <= values[i]))) return;
    if (queue.length >= labelLimit) { limited = true; return; }
    for (const previous of bucket) if (dominates(values, vector(previous))) previous.alive = false;
    buckets.set(key, [...bucket.filter(s => s.alive), state]); queue.push(state);
    if (state.stop === pointId(state.stage)) stageArrivals[state.stage] = Math.min(stageArrivals[state.stage], state.time);
  };
  const cycle = (state: State, from: Place | Stop, to: Place | Stop, id: string, minutes: number, service: string): State | null => {
    if (!Number.isFinite(minutes) || minutes > 0 && (options.cyclingPosition === "start-only" && state.boardings > 0
      || options.cyclingPosition === "end-only" && state.boardings === 0)) return null;
    const arrival = state.time + minutes * 60_000;
    const name = (place: Place | Stop) => "label" in place ? place.label : place.name;
    const leg: TransitLeg = { mode: "bike", from: name(from), to: name(to), fromId: state.stop, toId: id,
      fromPoint: from, toPoint: to, departure: new Date(state.time), arrival: new Date(arrival),
      departurePlatform: null, arrivalPlatform: null, service, serviceName: null, direction: null,
      cyclingRoute: cyclingLink(network, from, to).route, geometry: cyclingLink(network, from, to).route?.points };
    return { ...state, stop: id, time: arrival, bike: state.bike + minutes,
      climb: addClimb(state.climb, routeClimb(leg.cyclingRoute, minutes, options.hills?.maxUphillPercent)),
      endCycling: state.endCycling || options.cyclingPosition === "end-only" && minutes > 0,
      accessActive: state.accessActive + (state.boardings === 0 ? minutes : 0), egressActive: state.egressActive + minutes,
      legs: [...state.legs, leg], alive: true };
  };
  const visitNext = (state: State, from: Place | Stop, maxMinutes: number) => {
    const next = points[state.stage + 1];
    const minutes = cyclingLink(network, from, next).minutes;
    if (minutes > maxMinutes) return;
    const stage = state.stage + 1;
    const advanced = cycle(state, from, next, pointId(stage), minutes,
      stage === points.length - 1 ? "Cycle to your destination" : `Cycle to intermediate stop ${stage}`);
    if (!advanced) return;
    add({ ...advanced, stage, stageHasTransit: false, needsTransit: false,
      visits: stage === points.length - 1 ? state.visits : [...state.visits, { place: next, arrival: new Date(advanced.time) }] });
  };
  add({ climb: emptyClimb(), stop: pointId(0), stage: 0, time: start.getTime(), bike: 0, walk: 0, boardings: 0,
    extraTransfers: 0, stageHasTransit: false, needsTransit: false, endCycling: false, accessActive: 0, egressActive: 0,
    legs: [], visits: [], alive: true });
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (!current.alive || current.stage === points.length - 1) continue;
    explored++;
    if (current.stop === pointId(current.stage)) {
      const from = points[current.stage];
      visitNext(current, from, Math.max(options.maxAccessMinutes, options.maxEgressMinutes));
      for (const stop of accessStops) {
        const access = atEndpoint(stop, from, network);
        if (access.bikeMinutes <= options.maxAccessMinutes) {
          const next = cycle(current, from, stop, stop.id, access.bikeMinutes, "Cycle to the station");
          if (next) add({ ...next,
            needsTransit: current.needsTransit || !next.endCycling && (access.bikeMinutes > 0 || current.boardings === 0) });
        } else if (current.boardings > 0 && !current.needsTransit && current.extraTransfers < transferLimit
          && current.boardings < options.maxBoardings && access.bikeMinutes > 0 && access.bikeMinutes <= options.maxIntermediateMinutes
          && outgoing.get(stop.id)?.some(edge => edge.leg.mode === "transit")) {
          const next = cycle(current, from, stop, stop.id, access.bikeMinutes, "Cycle between stops");
          if (next) add({ ...next, extraTransfers: current.extraTransfers + 1, needsTransit: true });
        }
      }
      continue;
    }
    const from = network.stops.get(current.stop)!;
    for (const edge of outgoing.get(current.stop) ?? []) {
      const ride = edge.leg.mode === "transit";
      if (ride && current.endCycling) continue;
      const boarding = ride ? boardingCheck(current.legs, edge.leg, current.time, options.boardingMinutes, from) : null;
      if (edge.leg.departure!.getTime() < (boarding?.readyAt ?? current.time)) continue;
      const walk = ride ? (boarding?.transferLeg ? (+boarding.transferLeg.arrival! - +boarding.transferLeg.departure!) / 60_000 : 0) : (edge.leg.arrival!.getTime() - edge.leg.departure!.getTime()) / 60_000;
      add({ ...current, stop: edge.to, time: edge.leg.arrival!.getTime(), boardings: current.boardings + Number(ride),
        walk: current.walk + walk, accessActive: current.accessActive + (current.boardings === 0 ? walk : 0),
        egressActive: ride ? 0 : current.egressActive + walk, stageHasTransit: ride || current.stageHasTransit,
        needsTransit: ride ? false : current.needsTransit, legs: [...current.legs, ...(boarding?.transferLeg ? [boarding.transferLeg] : []), edge.leg], alive: true });
    }
    if (!current.boardings || current.needsTransit) continue;
    visitNext(current, from, options.maxEgressMinutes);
    if (current.extraTransfers >= transferLimit || current.boardings >= options.maxBoardings) continue;
    for (const to of boardingStops) {
      const minutes = cyclingLink(network, from, to).minutes;
      if (to.id === from.id || minutes <= 0 || minutes > options.maxIntermediateMinutes) continue;
      const next = cycle(current, from, to, to.id, minutes, "Cycle between stops");
      if (next) add({ ...next, extraTransfers: current.extraTransfers + 1, needsTransit: true });
    }
  }
  const alive = [...buckets.values()].flat().filter(s => s.alive);
  const journeys: Journey[] = alive.filter(s => s.stage === points.length - 1 && s.boardings > 0).map(state => {
    const rides = state.legs.filter(leg => leg.mode === "transit"), first = rides[0], last = rides.at(-1)!;
    const originStation = { ...atEndpoint(network.stops.get(first.fromId!)!, points[0]), bikeMinutes: 0, distanceKm: 0 };
    const destinationStation = { ...atEndpoint(network.stops.get(last.toId!)!, points.at(-1)!), bikeMinutes: 0, distanceKm: 0 };
    return { id: JSON.stringify([points.map(p => [p.lat, p.lon]), state.legs.map(l => [l.mode, l.fromId, l.toId, l.departure, l.arrival, l.service, l.operator, l.category])]),
      startTime: start, originStation, destinationStation, departure: state.legs[0].departure!, arrival: new Date(state.time),
      trainMinutes: (last.arrival!.getTime() - first.departure!.getTime()) / 60_000,
      waitMinutes: state.legs.reduce((sum, leg, index) => sum + Math.max(0,
        (leg.departure!.getTime() - (state.legs[index - 1]?.arrival?.getTime() ?? start.getTime())) / 60_000), 0),
      totalMinutes: (state.time - start.getTime()) / 60_000, changes: state.boardings - 1,
      services: [...new Set(rides.map(leg => leg.service))], transitLegs: state.legs,
      legsIncludeEndpoints: true, waypoints: state.visits };
  });
  const transferExits = alive.filter(s => s.stage < points.length - 1 && s.boardings > 0 && !s.needsTransit && !s.endCycling)
    .flatMap(s => {
      const stop = network.stops.get(s.stop) ?? (s.stop === pointId(s.stage)
        ? [...network.stops.values()].find(stop => samePlace(stop, points[s.stage])) : undefined);
      return stop ? [{ stop: stop.id, stage: s.stage, time: s.time, bike: s.bike, boardings: s.boardings, middle: s.extraTransfers }] : [];
    });
  return { journeys, reachable: [], stageArrivals, transferExits, explored, retained: alive.length, limited };
}
