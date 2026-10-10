import { cachedWalking, walkingLeg } from "./walking.ts";
import { requiredVisitLeg } from "./requiredVisits.ts";
import type { Network, Options } from "./model.ts";
import type { Journey, Place, TransitLeg } from "./routing.ts";

/** A checked all-walking option while the bicycle is parked; never a bike estimate. */
export function walkingJourney(network: Network, points: Place[], start: Date, options: Options): Journey | null {
  if (!options.walkingOnly || points.length < 2) return null;
  const routes = points.slice(1).map((p, i) => cachedWalking(network.walking, points[i], p));
  if (routes.some(r => !r || r.minutes > (options.maxWalkingMinutes ?? 30))) return null;
  const minutes = routes.reduce((n, r) => n + r!.minutes, 0) + points.slice(1, -1).reduce((n, p) => n + (p.visit?.minutes ?? 0), 0);
  const departure = options.arriveBy ? Date.parse(options.arriveBy) - minutes * 60000 : +start;
  if (departure < +start || minutes > options.horizonMinutes) return null;
  let cursor = departure; const legs: TransitLeg[] = [], visits: NonNullable<Journey["waypoints"]> = [];
  for (const [i, r] of routes.entries()) {
    const leg = walkingLeg(r!, cursor, points[i], points[i + 1]); legs.push(leg); cursor = +leg.arrival!;
    if (points[i + 1].visit) {
      const visit = requiredVisitLeg(points[i + 1], cursor);
      if (!visit) return null;
      legs.push(visit); cursor = +visit.arrival!;
    }
    if (i + 1 < points.length - 1) visits.push({ place: points[i + 1], arrival: new Date(cursor) });
  }
  if (!Number.isFinite(cursor)) return null;
  const station = (p: Place, id: string) => ({ id, name: p.label, lat: p.lat, lon: p.lon, distanceKm: 0, bikeMinutes: 0 });
  return { id: `walking:${JSON.stringify([points, departure])}`, startTime: new Date(departure), departure: new Date(departure), arrival: new Date(cursor),
    originStation: station(points[0], "walking:origin"), destinationStation: station(points.at(-1)!, "walking:destination"),
    totalMinutes: minutes, trainMinutes: 0, waitMinutes: 0, changes: 0, services: [], transitLegs: legs, legsIncludeEndpoints: true, waypoints: visits };
}
