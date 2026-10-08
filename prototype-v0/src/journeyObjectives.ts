import { carriageForLeg } from "./bicycleCarriage.ts";
import { fareSummary, type FareProfile } from "./fares.ts";
import { fareQuery, type OnlineFare } from "./onlineFare.ts";
import type { CyclingRoute } from "./cycling.ts";
import type { Journey, TransitLeg } from "./routing.ts";

export const JOURNEY_OBJECTIVES = ["fastest", "fewer-boardings", "least-cycling", "less-traffic", "fewer-reservations", "cheapest"] as const;
export type JourneyObjective = typeof JOURNEY_OBJECTIVES[number];
export const DEFAULT_OBJECTIVES: readonly JourneyObjective[] = ["fastest", "fewer-boardings", "least-cycling"];
export const objectiveLabels: Record<JourneyObjective, string> = {
  fastest: "Earliest arrival / latest departure", "fewer-boardings": "Fewer boardings",
  "least-cycling": "Least cycling", "less-traffic": "Less traffic exposure",
  "fewer-reservations": "Fewer mandatory bicycle reservations", cheapest: "Lowest checked price",
};
export const BOARDING_COMPROMISE = { minutesPerBoarding: 30, maxTimeFactor: 1.25 } as const;
export type ObjectiveOptions = { objectives?: readonly JourneyObjective[]; takeBikeOnTransit?: boolean };
export const requestedObjectives = (options: ObjectiveOptions) => options.objectives ?? DEFAULT_OBJECTIVES;
export const wantsObjective = (options: ObjectiveOptions, objective: JourneyObjective) => requestedObjectives(options).includes(objective);
export function boardingAllowance(referenceMinutes: number) {
  return Math.max(0, referenceMinutes * (BOARDING_COMPROMISE.maxTimeFactor - 1));
}

export function reservationMetrics(legs: TransitLeg[], takeBikeOnTransit = true) {
  if (!takeBikeOnTransit) return { required: 0, unknown: 0, prohibited: 0 };
  const rules = legs.filter(l => l.mode === "transit").map(carriageForLeg);
  return { required: rules.filter(r => r.bikeReservation === "required").length,
    unknown: rules.filter(r => r.bikeReservation === "unknown").length,
    prohibited: rules.filter(r => r.permission === "prohibited").length };
}

// An infrastructure/road-class proxy, not measured traffic or a safety score.
// Minimize total exposure: riding less can also reduce exposure. Unknown mapped
// length is separate and cannot create a winning low-exposure alternative.
export type TrafficMetric = { exposure: number; metres: number; unknown: number };
export function routeTraffic(route: CyclingRoute | undefined, minutes = 0): TrafficMetric {
  if (!route) return { exposure: 0, metres: 0, unknown: minutes > 0 ? 1 : 0 };
  const result = { exposure: 0, metres: 0, unknown: 0 };
  for (const section of route.sections) {
    const metres = Math.max(0, section.endM - section.startM), highway = section.tags.highway ?? "";
    const infrastructure = section.infrastructure;
    const mapped = ["Separated cycleway", "Shared path"].includes(infrastructure) || /^(cycleway|path|footway|pedestrian|living_street|residential|service|track|unclassified|tertiary|secondary|primary|trunk)(?:_link)?$/.test(highway);
    const speed = section.speedLimit === "Unknown" ? NaN : Number.parseFloat(section.speedLimit.split("–").at(-1)!);
    const exposure = infrastructure === "Separated cycleway" ? .2 : infrastructure === "Shared path" ? .6
      : /^(cycleway|path|footway|pedestrian|living_street)$/.test(highway) ? .6
        : (infrastructure === "Painted lane" ? 1.5 : 2) + (/^(primary|secondary|trunk)/.test(highway) ? 3 : 0) + (!Number.isFinite(speed) || speed >= 60 ? 2 : 0);
    result.metres += metres;
    if (mapped) result.exposure += metres * exposure;
    else result.unknown += metres || 1;
  }
  result.unknown += Math.max(0, route.distanceKm * 1000 - result.metres - 1);
  if (minutes > 0 && !result.metres) result.unknown = Math.max(1, result.unknown);
  return result;
}
function trafficMetrics(legs: TransitLeg[], endpoints: { route?: CyclingRoute; minutes: number }[] = []): TrafficMetric {
  const parts = [...endpoints, ...legs.filter(l => l.mode === "bike").map(l => ({ route: l.cyclingRoute,
    minutes: l.departure && l.arrival ? Math.max(0, (+l.arrival - +l.departure) / 60_000) : 1 }))];
  return parts.reduce((total, part) => {
    const m = routeTraffic(part.route, part.minutes);
    return { exposure: total.exposure + m.exposure, metres: total.metres + m.metres, unknown: total.unknown + m.unknown };
  }, { exposure: 0, metres: 0, unknown: 0 });
}
export function journeyTraffic(journey: Journey) {
  return trafficMetrics(journey.transitLegs, [
    { route: journey.originStation.cyclingRoute, minutes: journey.originStation.bikeMinutes },
    { route: journey.destinationStation.cyclingRoute, minutes: journey.destinationStation.bikeMinutes },
  ]);
}

// Reservation/traffic resources must survive dominance before result selection.
export function objectiveResources(legs: TransitLeg[], options: ObjectiveOptions,
  endpoints: { route?: CyclingRoute; minutes: number }[] = []) {
  const values: number[] = [];
  if (wantsObjective(options, "fewer-reservations")) {
    const r = reservationMetrics(legs, options.takeBikeOnTransit !== false);
    values.push(r.required, r.unknown, r.prohibited);
  }
  if (wantsObjective(options, "less-traffic")) {
    const t = trafficMetrics(legs, endpoints); values.push(t.exposure, t.unknown);
  }
  return values;
}
export function farePathKey(legs: TransitLeg[], options: ObjectiveOptions) {
  if (!wantsObjective(options, "cheapest")) return "";
  // Fares are non-additive and fetched later. Do not let an unpriced service
  // sequence erase a slower sequence which could have a lower complete fare.
  const first = legs.findIndex(l => l.mode === "transit");
  return first < 0 ? "" : JSON.stringify(legs.slice(first).map(l => [l.mode, l.fromId, l.toId,
    l.serviceName, l.service, l.operator, l.category, l.departure?.toISOString(), l.arrival?.toISOString()]));
}

export type ObjectiveFareContext = { profile: FareProfile; quotes: ReadonlyMap<string, OnlineFare> };
export function objectiveFareKey(journey: Journey, profile: FareProfile, takeBikeOnTransit = true) {
  const query = fareQuery(journey.transitLegs, profile, takeBikeOnTransit);
  return query ? JSON.stringify(query) : "";
}
export function checkedJourneyPrice(journey: Journey, options: ObjectiveOptions, context?: ObjectiveFareContext) {
  if (!context) return null;
  const key = objectiveFareKey(journey, context.profile, options.takeBikeOnTransit !== false);
  return fareSummary(journey.transitLegs, context.profile, context.quotes.get(key), options.takeBikeOnTransit !== false).totalChf;
}
