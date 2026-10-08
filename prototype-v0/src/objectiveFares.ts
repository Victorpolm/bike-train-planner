import { objectiveCandidatePool, type Options } from "./model.ts";
import { onlineFareRequest } from "./onlineFareClient.ts";
import { wantsObjective } from "./journeyObjectives.ts";
import type { FareProfile } from "./fares.ts";
import type { Journey } from "./routing.ts";

export const MAX_OBJECTIVE_FARE_REQUESTS = 8;
export type ObjectiveJourneyPool = { journeys: Journey[]; options: Options };
export function objectiveFareRequests(pools: ObjectiveJourneyPool[], profile: FareProfile, now = Date.now()) {
  const requests = new Set<string>();
  let eligible = 0;
  for (const pool of pools) {
    if (!wantsObjective(pool.options, "cheapest")) continue;
    const candidates = objectiveCandidatePool(pool.journeys, pool.options).sort((a, b) =>
      (pool.options.arriveBy ? +b.startTime - +a.startTime : a.totalMinutes - b.totalMinutes) || a.id.localeCompare(b.id));
    const keys = [...new Set(candidates.map(j => onlineFareRequest(j.transitLegs, profile,
      pool.options.takeBikeOnTransit !== false, now).key).filter(Boolean))];
    eligible += keys.length;
    keys.slice(0, MAX_OBJECTIVE_FARE_REQUESTS).forEach(key => requests.add(key));
  }
  return { keys: [...requests], eligible };
}
