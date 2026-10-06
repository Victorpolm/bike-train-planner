import { boardingCheck } from "./transferTimes.ts";
import { haversineKm, STATION_BUFFER_MINUTES, type CyclingComparison, type Journey, type Place, type Point, type TransitLeg } from "./routing.ts";
import { journeySteps, type JourneyStep } from "./itinerary.ts";
import type { CyclingRoute } from "./cycling.ts";
import { amenityRestricted, amenityStyle, AMENITY_STYLES, type Amenity, type AmenityCategory } from "./osmAmenities.ts";

export type DetourFacility = Point & { id: string; name: string; category: AmenityCategory | "parking"; note?: string; unavailable?: string };
export type DetourStage = {
  preceding?: JourneyStep[];
  id: string; label: string; from: Place; to: Place; route: CyclingRoute;
  departure: Date; originalMinutes: number; following: JourneyStep[]; originalArrival: Date;
};
export type DetourRoutes = readonly [CyclingRoute, CyclingRoute];

export function amenityDetourTarget(f: Amenity, category: AmenityCategory): DetourFacility {
  const unavailable = category === "water" && f.potable !== "yes" ? "Only mapped drinking water can be suggested as a refill stop."
    : amenityRestricted(f, category) || amenityStyle(f, category) === AMENITY_STYLES.restricted
      ? "This facility is mapped as restricted or unavailable." : undefined;
  return { id: f.id, name: f.name, lat: f.lat, lon: f.lon, category, unavailable,
    note: f.tags.indoor === "yes" || f.tags.level || f.location?.floorLabel || f.location?.precision === "building"
      ? "This is a building location. Indoor access, floor changes and the entrance are not routed. Allow time to reach the facility."
      : "The route reaches the mapped location. The entrance and opening hours still need checking." };
}

const minutesBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 60_000;
const at = (route: CyclingRoute, end: "from" | "to", label: string | null): Place => ({ ...route[end], label: label ?? (end === "from" ? "Cycling start" : "Cycling finish") });

export function detourStages(journey: Journey | null, cycling: CyclingComparison | null,
  origin: Place | null, destination: Place | null, start: Date | null): DetourStage[] {
  if (!origin || !destination || !start) return [];
  if (journey) {
    const steps = journeySteps(journey, origin, destination);
    const originalArrival = steps.at(-1)?.arrival;
    if (!originalArrival) return [];
    return steps.flatMap((step, index) => {
      if (step.mode !== "bike" || !step.cyclingRoute || !step.departure || !step.arrival) return [];
      const originalMinutes = minutesBetween(step.departure, step.arrival);
      if (!Number.isFinite(originalMinutes) || originalMinutes < 0) return [];
      return [{ id: `${index}:${step.cyclingRoute.id}`, label: `${step.from ?? "Cycling start"} → ${step.to ?? "Cycling finish"}`,
        from: at(step.cyclingRoute, "from", step.from), to: at(step.cyclingRoute, "to", step.to), route: step.cyclingRoute,
        preceding: steps.slice(0, index), departure: step.departure, originalMinutes, following: steps.slice(index + 1), originalArrival }];
    });
  }
  let departure = start;
  return (cycling?.routes ?? []).map((route, index) => {
    const from = at(route, "from", index === 0 ? origin.label : `Intermediate stop ${index}`);
    const to = at(route, "to", index === cycling!.routes!.length - 1 ? destination.label : `Intermediate stop ${index + 1}`);
    const stage: DetourStage = { id: `${index}:${route.id}`, label: `${from.label} → ${to.label}`, from, to, route,
      departure, originalMinutes: route.minutes, following: [], originalArrival: cycling!.arrival };
    departure = new Date(departure.getTime() + route.minutes * 60_000);
    return stage;
  });
}

// Compare with the complete cycling geometry, not just the station endpoints.
export function nearestDetourStage(stages: readonly DetourStage[], point: Point): DetourStage | undefined {
  const distance = (stage: DetourStage) => {
    const path: readonly Point[] = [stage.from, ...stage.route.points, stage.to];
    let closest = Infinity;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], scale = Math.cos(point.lat * Math.PI / 180);
      const x = (b.lon - a.lon) * scale, y = b.lat - a.lat;
      const t = x || y ? Math.max(0, Math.min(1, (((point.lon - a.lon) * scale * x) + (point.lat - a.lat) * y) / (x * x + y * y))) : 0;
      closest = Math.min(closest, haversineKm(point, { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) }));
    }
    return closest;
  };
  return stages.reduce<DetourStage | undefined>((best, stage) => !best || distance(stage) < distance(best) ? stage : best, undefined);
}

export async function requestCyclingDetour(stage: DetourStage, facility: DetourFacility,
  client: { route: (a: Place, b: Place) => Promise<CyclingRoute | null> }, signal: AbortSignal): Promise<DetourRoutes> {
  signal.throwIfAborted();
  if (facility.unavailable) throw new Error(facility.unavailable);
  const via: Place = { lat: facility.lat, lon: facility.lon, label: facility.name };
  const first = await client.route(stage.from, via);
  signal.throwIfAborted();
  if (!first || first.blocked) throw new Error("No usable cycling path to this facility was returned. Your selected journey is unchanged.");
  const second = await client.route(via, stage.to);
  signal.throwIfAborted();
  if (!second || second.blocked) throw new Error("No usable cycling path back to this section’s endpoint was returned. Your selected journey is unchanged.");
  return [first, second];
}

export function detourTiming(stage: DetourStage, routes: DetourRoutes, visitMinutes: number) {
  if (!Number.isFinite(visitMinutes) || visitMinutes < 0 || visitMinutes > 180) throw new Error("Choose a stop duration from 0 to 180 minutes.");
  const ridingMinutes = routes.reduce((sum, route) => sum + route.minutes, 0);
  const addedTravelMinutes = ridingMinutes - stage.originalMinutes;
  const addedMinutes = addedTravelMinutes + visitMinutes;
  const addedKm = routes.reduce((sum, route) => sum + route.distanceKm, 0) - stage.route.distanceKm;
  const base = { ridingMinutes, addedTravelMinutes, addedMinutes, addedKm,
    facilityArrival: new Date(stage.departure.getTime() + routes[0].minutes * 60_000),
    facilityGapM: Math.max(routes[0].endGapM, routes[1].startGapM) };
  let cursor = stage.departure.getTime() + (ridingMinutes + visitMinutes) * 60_000;
  const prefix: TransitLeg[] = (stage.preceding ?? []).flatMap(s => s.leg ? [s.leg] : []);
  prefix.push({ mode: "bike", from: stage.from.label, to: stage.to.label, fromPoint: stage.from, toPoint: stage.to,
    departure: stage.departure, arrival: new Date(cursor), departurePlatform: null, arrivalPlatform: null,
    service: "Edited cycling section", serviceName: null, direction: null });
  for (const step of stage.following) {
    if (step.mode === "wait") continue;
    if (step.mode === "unknown" || !step.departure || !step.arrival) return { ...base, status: "unknown" as const };
    if (step.mode === "transit") {
      const boarding = boardingCheck(prefix, step.leg ?? { mode: "transit", from: step.from, to: step.to, departure: step.departure,
        arrival: step.arrival, departurePlatform: null, arrivalPlatform: null, service: step.title, serviceName: null, direction: null }, cursor, STATION_BUFFER_MINUTES);
      if (!Number.isFinite(boarding.readyAt)) return { ...base, status: "unknown" as const };
      const marginMinutes = (step.departure.getTime() - boarding.readyAt) / 60_000;
      return { ...base, status: marginMinutes >= 0 ? "kept" as const : "missed" as const, marginMinutes,
        nextService: step.title, nextDeparture: step.departure, boardingNote: boarding.note,
        arrival: marginMinutes >= 0 ? stage.originalArrival : undefined };
    }
    const duration = minutesBetween(step.departure, step.arrival);
    if (!Number.isFinite(duration) || duration < 0) return { ...base, status: "unknown" as const };
    if (step.leg) prefix.push({ ...step.leg, departure: new Date(cursor), arrival: new Date(cursor + duration * 60_000) });
    cursor += duration * 60_000;
  }
  return { ...base, status: "no-connection" as const, arrival: new Date(stage.originalArrival.getTime() + addedMinutes * 60_000) };
}
