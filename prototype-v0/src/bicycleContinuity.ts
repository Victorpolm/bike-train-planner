import type { Options } from "./model.ts";
import type { NavigationInput } from "./navigation.ts";
import type { ParkedBicycle } from "./savedJourneys.ts";

export function withoutBicycle(options: Options): Options {
  return { ...options, walkingOnly: true, takeBikeOnTransit: false, bicycleScope: "all-transit", cyclingPosition: "start-only", minBikeMinutes: 0,
    maxBikeMinutes: 0, maxAccessMinutes: 0, maxEgressMinutes: 0, maxIntermediateMinutes: 0, maxCyclingTransfers: 0 };
}
function bicycleRequired(trip: NavigationInput): boolean {
  return !!trip.cycling || !!trip.journey && (trip.journey.originStation.bikeMinutes > 0 || trip.journey.destinationStation.bikeMinutes > 0
    || trip.journey.transitLegs.some(l => l.mode === "bike" && l.departure && l.arrival && +l.arrival > +l.departure)
    || trip.options.takeBikeOnTransit !== false && trip.journey.transitLegs.some(l => l.mode === "transit"));
}
export function canFollowWithBicycle(trip: NavigationInput, parked: ParkedBicycle | null) {
  return !parked || !bicycleRequired(trip);
}
