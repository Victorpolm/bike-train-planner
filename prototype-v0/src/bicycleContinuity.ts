import { bicycleOnTransitLeg, hasOriginBicycle, hasBicycleStopActions } from "./bicycleAvailability.ts";
import { haversineKm } from "./routing.ts";
import type { Options } from "./model.ts";
import { navigationTrip, remainingNavigationStops, type NavigationInput } from "./navigation.ts";
import type { ParkedBicycle } from "./savedJourneys.ts";

export function withoutBicycle(options: Options): Options {
  return { ...options, walkingOnly: true, bicycleAtOrigin: false, bicycleCollectedAt: undefined, takeBikeOnTransit: false, bicycleScope: "all-transit", cyclingPosition: "start-only", minBikeMinutes: 0,
    maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0, maxIntermediateMinutes: 0, maxCyclingTransfers: 0 };
}
function bicycleRequired(trip: NavigationInput): boolean {
  return !!trip.cycling || !!trip.journey && (trip.journey.originStation.bikeMinutes > 0 || trip.journey.destinationStation.bikeMinutes > 0
    || trip.journey.transitLegs.some(l => l.bicycleWithTraveller === true || l.bicycleAction === "park")
    || trip.journey.transitLegs.some(l => l.mode === "bike" && l.departure && l.arrival && +l.arrival > +l.departure)
    || trip.journey.transitLegs.some(l => bicycleOnTransitLeg(l, trip.options.takeBikeOnTransit !== false)));
}
export function bicycleContinuityIssue(trip: NavigationInput): string | null {
  if (trip.options.bicycleAtOrigin === undefined && trip.options.takeBikeOnTransit === false
    && !trip.options.walkingOnly && !hasBicycleStopActions(trip.waypoints)
    && !trip.options.bicycleCollectedAt
    && (trip.journey?.transitLegs.some(leg => leg.mode === "transit")
      || trip.options.cyclingPosition === "end-only" && bicycleRequired(trip)))
    return "Choose explicit bicycle pickup or leave stops in Plan before following this older journey.";
  let withBicycle = hasOriginBicycle(trip.options);
  if (trip.cycling) return !withBicycle || hasBicycleStopActions(trip.waypoints) || trip.options.cyclingFinished
    ? "A bicycle at the starting point and an available cycling phase are required to follow this bike-only reference." : null;
  if (!trip.journey) return null;
  const requested = trip.waypoints.filter(point => point.bicycleAction);
  let actionIndex = 0;
  const needsBicycle = (minutes: number) => minutes > 0 && (!withBicycle || trip.options.cyclingFinished);
  if (!trip.journey.legsIncludeEndpoints && needsBicycle(trip.journey.originStation.bikeMinutes))
    return "Choose where the bicycle is waiting before the cycling section.";
  for (const leg of trip.journey.transitLegs) {
    if (leg.bicycleAction) {
      const point = requested[actionIndex++];
      if (!point || point.bicycleAction !== leg.bicycleAction || !leg.toPoint
        || haversineKm(point, leg.toPoint) >= .02 || (leg.bicycleAction === "park") !== withBicycle)
        return "Review the bicycle pickup and leaving stops in Plan before following this journey.";
      withBicycle = leg.bicycleAction === "collect";
    }
    if (leg.mode === "bike" && needsBicycle(Math.max(leg.cyclingRoute?.distanceKm ?? 0,
      leg.departure && leg.arrival ? +leg.arrival - +leg.departure : 0)))
      return "Choose where the bicycle is waiting before the cycling section.";
    if (leg.mode === "transit" && leg.bicycleOnBoard !== undefined && leg.bicycleOnBoard !== withBicycle
      || leg.bicycleWithTraveller !== undefined && leg.bicycleWithTraveller !== withBicycle)
      return "Choose where the bicycle is waiting or left; the saved status needs an explicit stop in Plan.";
  }
  if (actionIndex !== requested.length || !trip.journey.legsIncludeEndpoints && needsBicycle(trip.journey.destinationStation.bikeMinutes))
    return "Choose where the bicycle is waiting and check all bicycle stops in Plan.";
  return null;
}
export function canFollowWithBicycle(trip: NavigationInput, parked: ParkedBicycle | null, confirmedStage = 0) {
  if (bicycleContinuityIssue(trip)) return false;
  if (confirmedStage > 0 && trip.journey) {
    const navigation = navigationTrip(trip), previous = navigation.stages.slice(0, confirmedStage);
    let withBicycle = hasOriginBicycle(trip.options), collectedAt = trip.options.bicycleCollectedAt;
    for (const stage of previous) {
      if (stage.leg?.bicycleAction === "park") { withBicycle = false; collectedAt = undefined; }
      if (stage.leg?.bicycleAction === "collect") { withBicycle = true; collectedAt = stage.leg.toPoint as import("./routing.ts").Place | undefined; }
    }
    return canFollowWithBicycle({ ...trip,
      options: { ...trip.options, bicycleAtOrigin: withBicycle, bicycleCollectedAt: collectedAt },
      waypoints: remainingNavigationStops(navigation, confirmedStage),
      journey: { ...trip.journey, legsIncludeEndpoints: true, originStation: { ...trip.journey.originStation, bikeMinutes: 0 },
        transitLegs: navigation.stages.slice(confirmedStage).flatMap(stage => stage.leg ? [stage.leg] : []) },
    }, parked);
  }
  if (trip.cycling && (!hasOriginBicycle(trip.options) || hasBicycleStopActions(trip.waypoints))) return false;
  if (!parked || !bicycleRequired(trip)) return true;
  if (trip.options.bicycleCollectedAt && hasOriginBicycle(trip.options)) return true;
  if (hasOriginBicycle(trip.options) || !trip.journey?.legsIncludeEndpoints) return false;
  const pickups = trip.waypoints.filter(point => point.bicycleAction === "collect");
  const legs = trip.journey.transitLegs;
  const collect = legs.findIndex(leg => leg.bicycleAction === "collect" && leg.toPoint
    && pickups.some(point => haversineKm(leg.toPoint!, point) < .02));
  return collect >= 0 && trip.journey.originStation.bikeMinutes === 0
    && legs.slice(0, collect).every(leg => leg.mode !== "bike" || !!leg.departure && !!leg.arrival && +leg.arrival === +leg.departure && !(leg.cyclingRoute?.distanceKm ?? 0))
    && legs.slice(0, collect).every(leg => leg.mode !== "transit" || leg.bicycleOnBoard === false);
}
