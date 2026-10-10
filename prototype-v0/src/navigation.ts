import { withoutBicycle } from "./bicycleContinuity.ts";
import { cyclingSteps, journeySteps } from "./itinerary.ts";
import { arrivalTime, departureTime, realtimeKey, realtimeStale, realtimeUnavailable, effectivePlatform } from "./realtime.ts";
import { boardingCheck } from "./transferTimes.ts";
import { haversineKm, type CyclingComparison, type Journey, type Place, type Point, type TransitLeg } from "./routing.ts";
import { usableFix, type LocationFix } from "./locationTracking.ts";
import type { ModelMode, Options } from "./model.ts";

export type NavigationInput = {
  key: string; journey: Journey | null; cycling: CyclingComparison | null;
  origin: Place; destination: Place; waypoints: Place[]; options: Options; mode: ModelMode; start: Date;
};
export type NavigationStage = {
  mode: TransitLeg["mode"]; title: string; from: string; to: string;
  minutes: number; path: Point[]; distances: number[]; lengthM: number;
  endGapM: number; endPoint?: Point;
  leg?: TransitLeg; completedVisits: number;
};
export type NavigationTrip = NavigationInput & { stages: NavigationStage[] };
export type RouteProgress = {
  distanceM: number; highWaterM: number; segment: number; timestamp: number;
  snapped: Point; distanceFromRouteM: number; offSince: number | null; offRoute: boolean;
};
const minute = 60_000;
const distance = (a: Point, b: Point) => haversineKm(a, b) * 1000;
const legKey = (leg: TransitLeg) => realtimeKey(leg) || JSON.stringify([leg.mode, leg.service, leg.fromId, leg.toId, leg.departure, leg.arrival]);

export function navigationTrip(input: NavigationInput): NavigationTrip {
  let visits = 0;
  const steps = input.journey ? journeySteps(input.journey, input.origin, input.destination).filter(s => s.mode !== "wait")
    : input.cycling ? cyclingSteps(input.cycling, input.origin, input.destination, input.start) : [];
  const stages = steps.map((step, index): NavigationStage => {
    const route = step.cyclingRoute ?? step.leg?.walkingRoute;
    // Never use schematic transit/stop geometry for street progress or warnings.
    const path = route?.points.length ? [...route.points]
      : step.leg?.geometryKind === "path" && step.mode !== "transit" ? [...step.leg.geometry ?? []] : [];
    const distances = path.map((_, i) => i ? distance(path[i - 1], path[i]) : 0);
    for (let i = 1; i < distances.length; i++) distances[i] += distances[i - 1];
    if (!input.journey) {
      const end = route?.to, next = input.waypoints[visits];
      if (next?.visit ? step.leg?.facilityVisit?.id === next.visit.id : step.mode === "bike" && end && next && distance(end, next) < 100) visits++;
    }
    else {
      const end = route?.to ?? step.leg?.toPoint;
      const visit = input.journey.waypoints?.[visits];
      if (visit && step.arrival && +step.arrival >= +visit.arrival && end && distance(end, visit.place) < 100
        && (!visit.place.visit || step.leg?.facilityVisit?.id === visit.place.visit.id)) visits++;
    }
    return { mode: step.mode as TransitLeg["mode"], title: step.title, from: step.from ?? "Starting point", to: step.to ?? "Destination",
      minutes: route?.minutes ?? (step.arrival && step.departure ? Math.max(0, (+step.arrival - +step.departure) / minute) : 0),
      path, distances, lengthM: distances.at(-1) ?? 0, endGapM: route?.endGapM ?? 0, endPoint: route?.to ?? step.leg?.toPoint, leg: step.leg, completedVisits: visits };
  });
  return { ...input, stages };
}

function projection(fix: Point, a: Point, b: Point) {
  const scale = Math.cos(fix.lat * Math.PI / 180), x = (b.lon - a.lon) * scale, y = b.lat - a.lat;
  const t = Math.max(0, Math.min(1, ((fix.lon - a.lon) * scale * x + (fix.lat - a.lat) * y) / (x * x + y * y || 1)));
  const point = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
  return { point, t, gap: distance(fix, point) };
}
function lowerBound(values: number[], value: number) {
  let low = 0, high = values.length;
  while (low < high) { const middle = (low + high) >>> 1; if (values[middle] < value) low = middle + 1; else high = middle; }
  return low;
}

/** A local window prevents jumping to a later crossing or the end of a loop.
 * First acquisition chooses the earliest equally close segment; stage changes
 * are explicit, never inferred from station proximity or a GPS outage. */
export function advanceProgress(stage: NavigationStage, fix: LocationFix, previous: RouteProgress | null, now: number): RouteProgress | null {
  if (!usableFix(fix, now) || stage.path.length < 2 || !["bike", "walk"].includes(stage.mode)
    || previous && fix.timestamp <= previous.timestamp) return previous;
  const windowM = previous ? 100 + fix.accuracy * 2 + Math.max(0, fix.timestamp - previous.timestamp) / 1000 * (stage.mode === "walk" ? 3 : 18) : Infinity;
  const low = previous ? Math.max(0, previous.distanceM - windowM) : 0;
  const high = previous ? Math.min(stage.lengthM, previous.distanceM + windowM) : stage.lengthM;
  const start = Math.max(0, lowerBound(stage.distances, low) - 1);
  const end = Math.min(stage.path.length - 1, lowerBound(stage.distances, high) + 1);
  let best: { segment: number; at: number; point: Point; gap: number } | null = null;
  for (let i = start; i < end; i++) {
    if (stage.distances[i + 1] < low || stage.distances[i] > high) continue;
    const p = projection(fix, stage.path[i], stage.path[i + 1]);
    const at = Math.max(low, Math.min(high, stage.distances[i] + p.t * (stage.distances[i + 1] - stage.distances[i])));
    const t = (at - stage.distances[i]) / (stage.distances[i + 1] - stage.distances[i] || 1);
    const point = { lat: stage.path[i].lat + t * (stage.path[i + 1].lat - stage.path[i].lat),
      lon: stage.path[i].lon + t * (stage.path[i + 1].lon - stage.path[i].lon) };
    const gap = distance(fix, point);
    if (!best || gap < best.gap - 5) best = { segment: i, at, point, gap };
  }
  if (!best) return previous;
  // A provider's short endpoint gap is not a verified street path. Do not
  // accuse a traveller of deviating while crossing that unmapped access area.
  const connector = stage.endGapM > 25 && stage.endPoint && previous
    && previous.distanceM >= stage.lengthM * .95
    && distance(fix, stage.endPoint) <= stage.endGapM + fix.accuracy + 25;
  const outside = !connector && best.gap > Math.max(50, fix.accuracy * 2);
  const offSince = outside ? previous?.offSince ?? fix.timestamp : null;
  const at = outside ? previous?.distanceM ?? 0 : best.at;
  return { distanceM: at, highWaterM: Math.max(previous?.highWaterM ?? 0, at), segment: outside ? previous?.segment ?? 0 : best.segment,
    timestamp: fix.timestamp, snapped: outside ? previous?.snapped ?? stage.path[0] : best.point,
    distanceFromRouteM: best.gap, offSince, offRoute: offSince !== null && fix.timestamp - offSince >= 8000 };
}
export function remainingPath(stage: NavigationStage | undefined, progress: RouteProgress | null): Point[] {
  if (!stage?.path.length) return [];
  return progress ? [progress.snapped, ...stage.path.slice(progress.segment + 1)] : stage.path;
}
export function remainingMinutes(stage: NavigationStage, progress: RouteProgress | null) {
  const endAllowance = Math.min(stage.minutes, stage.endGapM / 4000 * 60);
  return endAllowance + (stage.minutes - endAllowance) * (stage.lengthM && progress ? Math.max(0, 1 - progress.distanceM / stage.lengthM) : 1);
}

export function navigationRide(stage: NavigationStage, live: Journey | null) {
  return stage.leg ? live?.transitLegs.find(leg => legKey(leg) === legKey(stage.leg!)) ?? stage.leg : null;
}

export function navigationConnection(trip: NavigationTrip, index: number, onboard: boolean, progress: RouteProgress | null,
  live: Journey | null, fix: LocationFix | null, now: number) {
  const stage = trip.stages[index];
  if (!stage) return null;
  const nextIndex = trip.stages.findIndex((s, i) => i >= index + (onboard ? 1 : 0) && s.mode === "transit");
  const original = trip.stages[nextIndex]?.leg;
  if (!original) return null;
  const legs = live?.transitLegs ?? trip.journey?.transitLegs ?? [];
  const leg = legs.find(l => legKey(l) === legKey(original)) ?? original;
  const platform = effectivePlatform(leg, "departure");
  const departure = departureTime(leg);
  const stale = !leg.realtime || realtimeStale(leg.realtime, now);
  const unavailable = realtimeUnavailable(leg);
  const legIndex = legs.indexOf(leg);
  const previousLiveRide = legs.slice(0, legIndex).reduce((last, l, i) => l.mode === "transit" ? i : last, -1);
  const previousStageRide = trip.stages.slice(0, nextIndex).reduce((last, s, i) => s.mode === "transit" ? i : last, -1);
  const liveMovement = legs.slice(previousLiveRide + 1, legIndex).reduce((sum, l) => sum
    + (arrivalTime(l) && departureTime(l) ? Math.max(0, (+arrivalTime(l)! - +departureTime(l)!) / minute) : 0), 0)
    + (previousLiveRide < 0 && trip.journey && !trip.journey.legsIncludeEndpoints ? trip.journey.originStation.bikeMinutes : 0);
  const plannedMovement = trip.stages.slice(previousStageRide + 1, nextIndex).reduce((sum, s) => sum + s.minutes, 0);
  // A changed platform may introduce another timed transfer after Start. Keep
  // its extra allowance even though the current geometry/progress stays pinned.
  const extraMovement = Math.max(0, liveMovement - plannedMovement);
  const minutes = trip.stages.slice(index, nextIndex).reduce((sum, s, offset) => sum + (offset ? s.minutes : remainingMinutes(s, progress)), 0);
  // A boarded service's arrival is a timetable estimate, never street projection.
  const boardedLeg = onboard && stage.leg ? legs.find(l => legKey(l) === legKey(stage.leg!)) ?? stage.leg : null;
  const estimateKnown = onboard ? !!boardedLeg && !!arrivalTime(boardedLeg)
    : usableFix(fix, now) && (!stage.path.length || !!progress && progress.offSince === null);
  const ready = onboard ? Math.max(now, +(boardedLeg && arrivalTime(boardedLeg) || new Date(now)))
    + trip.stages.slice(index + 1, nextIndex).reduce((sum, s) => sum + s.minutes * minute, extraMovement * minute)
    : now + (minutes + extraMovement) * minute;
  const check = boardingCheck(legs.slice(0, Math.max(0, legIndex)), leg, ready, trip.options.boardingMinutes, trip.origin);
  return { service: leg.service, station: leg.from, platform, departure,
    delayMinutes: leg.realtime?.estimatedDeparture && departure && leg.departure ? Math.round((+departure - +leg.departure) / minute) : null,
    stationArrival: estimateKnown && !onboard ? new Date(ready) : null,
    slackMinutes: estimateKnown && departure && Number.isFinite(check.readyAt) ? (+departure - check.readyAt) / minute : null,
    unavailable, stale, unknownDelay: !!leg.realtime?.undefinedDelay, allowance: check.note };
}

/** Merge ordinary waypoints and added facilities in their actual itinerary order.
 * A stop is completed only after its stage has been explicitly confirmed. */
export function remainingNavigationStops(trip: NavigationTrip, index: number): Place[] {
  const result: Place[] = [];
  let completed = trip.stages[index - 1]?.completedVisits ?? 0;
  for (const stage of trip.stages.slice(index)) {
    for (let i = completed; i < stage.completedVisits; i++) {
      const point = trip.waypoints[i];
      if (point && !point.visit) result.push(point);
    }
    const visit = stage.leg?.facilityVisit;
    if (visit) result.push({ lat: visit.lat, lon: visit.lon, label: visit.name, visit: { ...visit } });
    completed = stage.completedVisits;
  }
  return result;
}

/** Replanning keeps hard limits for the whole trip, not a new full budget.
 * Unsupported custody transitions are blocked instead of conjuring a bicycle. */
export function navigationReplan(trip: NavigationTrip, index: number, onboard: boolean, progress: RouteProgress | null,
  fix: LocationFix | null, now: number) {
  if (!usableFix(fix, now)) throw new Error("Wait for a fresh, accurate location before recalculating.");
  if (onboard || trip.stages[index]?.mode === "unknown") throw new Error("Confirm that you have alighted before recalculating from here.");
  const previous = trip.stages.slice(0, index);
  const boardings = previous.filter(s => s.mode === "transit").length;
  const firstTransit = trip.stages.findIndex(s => s.mode === "transit");
  const lastTransit = trip.stages.reduce((last, s, i) => s.mode === "transit" ? i : last, -1);
  if (trip.options.takeBikeOnTransit === false && trip.options.cyclingPosition === "end-only" && lastTransit >= 0)
    throw new Error("Your bicycle’s location has changed. Stop following and choose a new journey in Plan so its bicycle placement is explicit.");
  if (boardings >= trip.options.maxBoardings) throw new Error("Your original boarding limit has been used. Choose a new journey in Plan to change that limit.");
  if (trip.options.arriveBy && Date.parse(trip.options.arriveBy) <= now) throw new Error("Your arrival deadline has passed. Choose a new time in Plan.");
  const current = trip.stages[index];
  const fraction = current?.lengthM && progress ? Math.min(1, progress.highWaterM / current.lengthM) : 0;
  const usedBike = previous.filter(s => s.mode === "bike").reduce((sum, s) => sum + s.minutes, 0)
    + (current?.mode === "bike" ? current.minutes * fraction : 0);
  const usedAccess = previous.filter((s, i) => s.mode === "bike" && (firstTransit < 0 || i < firstTransit)).reduce((sum, s) => sum + s.minutes, 0)
    + (current?.mode === "bike" && (firstTransit < 0 || index < firstTransit) ? current.minutes * fraction : 0);
  const usedTransfers = new Set(previous.flatMap((s, i) => s.mode === "bike" && i > firstTransit && i < lastTransit
    ? [s.leg?.cyclingSectionId ?? `stage:${i}`] : [])).size;
  const usedEgress = current?.mode === "bike" && lastTransit >= 0 && index > lastTransit ? current.minutes * fraction : 0;
  const usedIntermediate = current?.mode === "bike" && firstTransit >= 0 && index > firstTransit && index < lastTransit ? current.minutes * fraction : 0;
  let options = { ...trip.options, maxBikeMinutes: Math.max(0, Math.floor(trip.options.maxBikeMinutes - usedBike)),
    minBikeMinutes: Math.max(0, Math.ceil((trip.options.minBikeMinutes ?? 0) - usedBike - 1e-9)),
    maxEgressMinutes: Math.max(0, Math.floor(trip.options.maxEgressMinutes - usedEgress)),
    maxIntermediateMinutes: Math.max(0, Math.floor(trip.options.maxIntermediateMinutes - usedIntermediate)),
    maxCyclingTransfers: Math.max(0, (trip.options.maxCyclingTransfers ?? 2) - usedTransfers),
    maxWalkingMinutes: current?.mode === "walk" ? Math.max(0, Math.floor((trip.options.maxWalkingMinutes ?? 30) - current.minutes * fraction))
      : trip.options.maxWalkingMinutes,
    maxBoardings: trip.options.maxBoardings - boardings,
    maxAccessMinutes: boardings ? Math.max(0, Math.floor(Math.min(trip.options.maxAccessMinutes,
      trip.options.maxIntermediateMinutes - usedIntermediate, trip.options.maxEgressMinutes - usedEgress)))
      : Math.max(0, Math.floor(trip.options.maxAccessMinutes - usedAccess)) };
  if (trip.options.walkingOnly || trip.options.takeBikeOnTransit === false && trip.options.cyclingPosition === "start-only" && firstTransit >= 0 && index >= firstTransit) {
    if ((options.minBikeMinutes ?? 0) > 0) throw new Error("Your remaining cycling minimum requires collecting your bicycle first.");
    options = { ...options, ...withoutBicycle(options) };
  }
  return { origin: { lat: fix.lat, lon: fix.lon, label: "Current location" } as Place, destination: trip.destination,
    waypoints: remainingNavigationStops(trip, index), options, start: new Date(now), mode: trip.mode, bikeOnly: !trip.journey };
}
