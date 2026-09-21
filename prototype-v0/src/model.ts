import { cyclingMinutes, haversineKm, type Journey, type Place, type Point, type Station, type TransitLeg } from "./routing.ts";
import { cachedCycling, type CyclingRoute } from "./cycling.ts";
import { type BusPreference } from "./busCarriage.ts";
import { bicycleLegAllowed, type BicycleScope } from "./bicyclePermission.ts";

export type ModelMode = "baseline" | "extended";
export type EndpointPreference = "none" | "start" | "end";
export type Options = {
  maxBikeMinutes: number;
  maxAccessMinutes: number;
  maxEgressMinutes: number;
  maxIntermediateMinutes: number;
  maxBoardings: number;
  horizonMinutes: number;
  boardingMinutes: number;
  extraTimeMinutes: number;
  endpointPreference: EndpointPreference;
  busPreference: BusPreference;
  bicycleScope?: BicycleScope;
};
export const DEFAULT_OPTIONS: Options = {
  maxBikeMinutes: 90, maxAccessMinutes: 60, maxEgressMinutes: 60,
  maxIntermediateMinutes: 20, maxBoardings: 4, horizonMinutes: 1440,
  boardingMinutes: 3, extraTimeMinutes: 60, endpointPreference: "none", busPreference: "include-unknown",
};
export type Stop = { id: string; name: string; lat: number; lon: number; kind?: string };
export type Edge = { id: string; from: string; to: string; leg: TransitLeg };
export type Network = { stops: Map<string, Stop>; edges: Map<string, Edge>; cycling?: Map<string, CyclingRoute | null> };
export const emptyNetwork = (): Network => ({ stops: new Map(), edges: new Map() });
export function cyclingLink(network: Network, from: Point & { id?: string; stopId?: string }, to: Point & { id?: string; stopId?: string }) {
  if (network.cycling) {
    const route = cachedCycling(network.cycling, from, to);
    return { minutes: route?.minutes ?? Infinity, distanceKm: route?.distanceKm ?? Infinity, route: route ?? undefined };
  }
  const distanceKm = (from.stopId ?? from.id) && (from.stopId ?? from.id) === (to.stopId ?? to.id) ? 0 : haversineKm(from, to);
  return { minutes: cyclingMinutes(distanceKm), distanceKm, route: undefined };
}
export const atEndpoint = (stop: Stop, point: Place, network?: Network, direction: "access" | "egress" = "access"): Station => {
  if (network?.cycling) {
    const link = direction === "access" ? cyclingLink(network, point, stop) : cyclingLink(network, stop, point);
    return { ...stop, distanceKm: link.distanceKm, bikeMinutes: link.minutes, cyclingRoute: link.route };
  }
  const distanceKm = point.stopId === stop.id ? 0 : haversineKm(stop, point);
  return { ...stop, distanceKm, bikeMinutes: cyclingMinutes(distanceKm) };
};

export function validateOptions(o: Options) {
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
  if (!["none", "start", "end"].includes(o.endpointPreference)) throw new Error("Invalid endpoint preference.");
  if (!["known-rules", "include-unknown", "no-buses"].includes(o.busPreference)) throw new Error("Invalid bus preference.");
  if (o.bicycleScope !== undefined && !["confirmed", "allow-uncertain"].includes(o.bicycleScope)) throw new Error("Invalid bicycle permission scope.");
}

export function metrics(j: Journey) {
  const duration = (l: TransitLeg) => l.departure && l.arrival
    ? Math.max(0, (l.arrival.getTime() - l.departure.getTime()) / 60_000) : 0;
  const boardings = j.transitLegs.filter(l => l.mode === "transit").length;
  const first = j.transitLegs.findIndex(l => l.mode === "transit");
  const last = j.transitLegs.reduce((found, l, i) => l.mode === "transit" ? i : found, -1);
  const walking = (legs: TransitLeg[]) => legs.filter(l => l.mode === "walk").reduce((sum, l) => sum + duration(l), 0);
  const biking = (legs: TransitLeg[]) => legs.filter(l => l.mode === "bike").reduce((sum, l) => sum + duration(l), 0);
  const middle = biking(j.transitLegs.slice(first + 1, last));
  const walk = walking(j.transitLegs), bike = j.originStation.bikeMinutes + biking(j.transitLegs) + j.destinationStation.bikeMinutes;
  return { time: j.totalMinutes, bike, walk, active: bike + walk,
    start: j.originStation.bikeMinutes, end: j.destinationStation.bikeMinutes, middle, boardings,
    activeStart: j.originStation.bikeMinutes + walking(j.transitLegs.slice(0, Math.max(0, first))) + biking(j.transitLegs.slice(0, Math.max(0, first))),
    activeEnd: j.destinationStation.bikeMinutes + walking(j.transitLegs.slice(last + 1)) + biking(j.transitLegs.slice(last + 1)) };
}
export const dominates = (a: number[], b: number[]) => a.every((v, i) => v <= b[i]) && a.some((v, i) => v < b[i]);
export function pareto(journeys: Journey[], endpoint: EndpointPreference = "none"): Journey[] {
  const vector = (j: Journey) => {
    const m = metrics(j);
    return [m.time, m.active, m.boardings, ...(endpoint === "none" ? [] : [endpoint === "start" ? m.activeStart : m.activeEnd])];
  };
  const unique = [...new Map(journeys.map(j => [j.id, j])).values()];
  const vectors = unique.map(vector);
  return unique.filter((_, i) => !vectors.some((v, k) => k !== i && dominates(v, vectors[i])));
}
export type Proposal = { journey: Journey; categories: string[]; extraMinutes: number; cyclingSaved: number; activeSaved: number };
export function categorize(journeys: Journey[], o: Options): Proposal[] {
  // Pure cycling never competes for the mixed-journey categories.
  const mixed = journeys.filter(j => metrics(j).boardings >= 1);
  if (!mixed.length) return [];
  const compare = (keys: (keyof ReturnType<typeof metrics>)[]) => (a: Journey, b: Journey) => {
    const am = metrics(a), bm = metrics(b);
    for (const key of keys) if (am[key] !== bm[key]) return am[key] - bm[key];
    return a.id.localeCompare(b.id);
  };
  const fastest = [...mixed].sort(compare(["time", "active", "boardings"]))[0];
  const frontier = pareto(mixed.filter(j => j.totalMinutes <= fastest.totalMinutes + o.extraTimeMinutes), o.endpointPreference);
  const definitions: [string, (keyof ReturnType<typeof metrics>)[]][] = [
    ["Fastest", ["time", "active", "boardings"]],
    ["Fewest boardings", ["boardings", "time", "active"]],
    ["Least cycling or walking", ["active", "time", "boardings"]],
  ];
  if (o.endpointPreference !== "none") definitions.push([
    o.endpointPreference === "start" ? "Least cycling or walking at start" : "Least cycling or walking at arrival",
    [o.endpointPreference === "start" ? "activeStart" : "activeEnd", "time", "active", "boardings"],
  ]);
  const proposals = new Map<string, Proposal>();
  for (const [category, keys] of definitions) {
    const winner = [...frontier].sort(compare(keys))[0];
    const existing = proposals.get(winner.id);
    if (existing) existing.categories.push(category);
    else proposals.set(winner.id, { journey: winner, categories: [category],
      extraMinutes: winner.totalMinutes - fastest.totalMinutes,
      cyclingSaved: metrics(fastest).bike - metrics(winner).bike,
      activeSaved: metrics(fastest).active - metrics(winner).active });
  }
  return [...proposals.values()];
}

export type Label = {
  stop: string; time: number; bike: number; walk: number; accessActive: number; egressWalk: number; boardings: number; middle: number;
  needsTransit: boolean; access: Station; legs: TransitLeg[]; alive: boolean;
};
export type Solution = { journeys: Journey[]; reachable: Label[]; explored: number; retained: number; limited: boolean };

// Multi-label time-dependent search over the supplied finite timetable graph.
// Each transit edge is one complete boarding-to-alighting ride, so onboard
// state is compressed out; pass-stop prefixes are alternative exits, not transfers.
export function solve(network: Network, origin: Place, destination: Place, start: Date,
  o: Options, mode: ModelMode, labelLimit = 50_000): Solution {
  validateOptions(o);
  if (!Number.isFinite(start.getTime())) throw new Error("Invalid departure time.");
  const horizon = start.getTime() + o.horizonMinutes * 60_000;
  const outgoing = new Map<string, Edge[]>();
  for (const edge of network.edges.values()) {
    const l = edge.leg;
    if (!l.departure || !l.arrival || !Number.isFinite(l.departure.getTime()) ||
      !Number.isFinite(l.arrival.getTime()) || l.arrival < l.departure ||
      !["transit", "walk"].includes(l.mode) || !bicycleLegAllowed(l, o.busPreference, o.bicycleScope)) continue;
    if (!network.stops.has(edge.from) || !network.stops.has(edge.to)) continue;
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge); outgoing.set(edge.from, list);
  }
  const cycling = new Map<string, { stop: Stop; minutes: number; route?: CyclingRoute }[]>();
  const boardingStops = [...network.stops.values()].filter(s => outgoing.get(s.id)?.some(e => e.leg.mode === "transit"));
  const labels = new Map<string, Label[]>(), queue: Label[] = [];
  let limited = false;
  const add = (label: Label) => {
    if (label.time > horizon || label.bike > o.maxBikeMinutes || label.boardings > o.maxBoardings) return;
    const key = `${label.stop}|${label.middle}|${label.needsTransit}`;
    const bucket = labels.get(key) ?? [];
    // Keep cycling as a resource as well as total active travel as an objective.
    // A lower active total can use more cycling and leave less budget for later.
    // Endpoint attributes must also survive pruning for optional categories.
    const vector = (l: Label) => [l.time, l.bike, l.bike + l.walk, l.boardings, l.accessActive, l.egressWalk];
    const v = vector(label);
    if (bucket.some(l => vector(l).every((x, i) => x <= v[i]))) return;
    if (queue.length >= labelLimit) { limited = true; return; }
    for (const l of bucket) if (dominates(v, vector(l))) l.alive = false;
    labels.set(key, [...bucket.filter(l => l.alive), label]); queue.push(label);
  };
  for (const stop of boardingStops) {
    const access = atEndpoint(stop, origin, network);
    if (access.bikeMinutes <= o.maxAccessMinutes) add({ stop: stop.id,
      time: start.getTime() + access.bikeMinutes * 60_000, bike: access.bikeMinutes,
      walk: 0, accessActive: access.bikeMinutes, egressWalk: 0,
      boardings: 0, middle: 0, needsTransit: true, access, legs: [], alive: true });
  }
  let explored = 0;
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (!current.alive) continue;
    explored++;
    for (const edge of outgoing.get(current.stop) ?? []) {
      const ride = edge.leg.mode === "transit";
      const ready = current.time + (ride ? o.boardingMinutes * 60_000 : 0);
      if (edge.leg.departure!.getTime() < ready || edge.leg.arrival!.getTime() > horizon) continue;
      const walking = ride ? 0 : (edge.leg.arrival!.getTime() - edge.leg.departure!.getTime()) / 60_000;
      add({ ...current, stop: edge.to, time: edge.leg.arrival!.getTime(),
        walk: current.walk + walking,
        accessActive: current.accessActive + (current.boardings === 0 ? walking : 0),
        egressWalk: ride ? 0 : current.egressWalk + walking,
        boardings: current.boardings + Number(ride), needsTransit: ride ? false : current.needsTransit,
        legs: [...current.legs, edge.leg], alive: true });
    }
    if (mode !== "extended" || current.middle !== 0 || current.needsTransit || !current.boardings || current.boardings >= o.maxBoardings) continue;
    const from = network.stops.get(current.stop)!;
    let neighbors = cycling.get(from.id);
    if (!neighbors) {
      neighbors = boardingStops.filter(s => s.id !== from.id).map(stop => ({ stop, ...cyclingLink(network, from, stop) }))
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
        middle: 1, needsTransit: true, legs: [...current.legs, leg], alive: true });
    }
  }
  const reachable = [...labels.values()].flat().filter(l => l.alive);
  const journeys: Journey[] = [];
  for (const label of reachable) {
    if (!label.boardings || label.needsTransit) continue;
    const egress = atEndpoint(network.stops.get(label.stop)!, destination, network, "egress");
    if (egress.bikeMinutes > o.maxEgressMinutes || label.bike + egress.bikeMinutes > o.maxBikeMinutes ||
      label.time + egress.bikeMinutes * 60_000 > horizon) continue;
    const departure = label.legs[0].departure!, arrival = new Date(label.time);
    journeys.push({ id: JSON.stringify([label.access.id, ...label.legs.map(l =>
      [l.mode, l.fromId, l.toId, l.serviceName, l.service, l.operator, l.category, l.departure!.getTime(), l.arrival!.getTime()]), egress.id]),
      startTime: start, originStation: label.access, destinationStation: egress, departure, arrival,
      trainMinutes: (arrival.getTime() - departure.getTime()) / 60_000,
      waitMinutes: (departure.getTime() - start.getTime()) / 60_000 - label.access.bikeMinutes,
      totalMinutes: (label.time - start.getTime()) / 60_000 + egress.bikeMinutes,
      changes: label.boardings - 1, services: [...new Set(label.legs.filter(l => l.mode === "transit").map(l => l.service))],
      transitLegs: label.legs });
  }
  return { journeys, reachable, explored, retained: reachable.length, limited };
}

export function compareModels(network: Network, origin: Place, destination: Place, start: Date, o: Options, labelLimit = 50_000) {
  const baseline = solve(network, origin, destination, start, o, "baseline", labelLimit);
  const extended = solve(network, origin, destination, start, o, "extended", labelLimit);
  // Preserve the baseline even if the extended search reaches its resource cap.
  extended.journeys = [...new Map([...baseline.journeys, ...extended.journeys].map(j => [j.id, j])).values()];
  return { baseline, extended };
}
