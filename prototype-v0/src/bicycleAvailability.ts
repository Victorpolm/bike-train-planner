import type { Place, TransitLeg } from "./routing.ts";

type BicycleAvailability = { walkingOnly?: boolean; bicycleAtOrigin?: boolean };

/** Possession is independent of riding placement and carriage preferences. */
export const hasOriginBicycle = (options: BicycleAvailability) => !options.walkingOnly && options.bicycleAtOrigin !== false;
export const bicycleStopAction = (point: Place) => point.bicycleAction;
export const hasBicycleStopActions = (points: readonly Place[]) => points.some(point => bicycleStopAction(point) !== undefined);

/** An action belongs to its coordinates, not every entrance with the same stop ID. */
export function bicycleRoutingPoint(point: Place): Place {
  if (!bicycleStopAction(point)) return point;
  const { stopId: _stopId, id: _id, ...fixed } = point as Place & { id?: string };
  return fixed;
}

/** Possession after each ordered point. No action is inferred from a service,
 * riding preference, or a willingness to take a bicycle on public transport. */
export function bicyclePossessionAtStages(points: readonly Place[], options: BicycleAvailability): boolean[] {
  let hasBicycle = hasOriginBicycle(options);
  return points.map((point, index) => {
    const action = bicycleStopAction(point);
    if (action !== undefined && action !== "park" && action !== "collect")
      throw new Error("Choose a valid bicycle action at the intermediate stop.");
    if (action) {
      if (index === 0 || index === points.length - 1)
        throw new Error("Bicycle pickup and leave actions belong to intermediate stops, not the start or destination.");
      if (!point.label?.trim() || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180)
        throw new Error("Choose a valid location for the bicycle action.");
      if (options.walkingOnly)
        throw new Error("For a journey with bicycle actions, choose your starting bicycle status instead of a walking-only journey.");
      if (action === "collect" && hasBicycle)
        throw new Error("You already have a bicycle before this pickup. Add a Leave a bike stop first, or start without a bicycle.");
      if (action === "park" && !hasBicycle)
        throw new Error("You do not have a bicycle to leave at this stop. Add a Pick up a bike stop first, or start with a bicycle.");
      hasBicycle = action === "collect";
    }
    return hasBicycle;
  });
}

/** Old snapshots have only a trip-wide choice; new journeys record every ride. */
export const bicycleOnTransitLeg = (leg: TransitLeg, takeBikeOnTransit = true) =>
  leg.mode === "transit" && (leg.bicycleOnBoard ?? takeBikeOnTransit);

/** Handling is explicit; no uncalibrated parking/collection duration is invented. */
export function bicycleActionLeg(action: "park" | "collect", point: Place, time: number): TransitLeg {
  return { mode: "stop", bicycleAction: action, bicycleWithTraveller: action === "collect", from: point.label, to: point.label,
    fromPoint: point, toPoint: point, departure: new Date(time), arrival: new Date(time), departurePlatform: null, arrivalPlatform: null,
    service: action === "park" ? "Leave your bicycle at this stop" : "Pick up a bicycle at this stop", serviceName: null, direction: null };
}
