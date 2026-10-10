import { visitHours } from "./facilityHours.ts";
import { haversineKm, type Place, type TransitLeg } from "./routing.ts";

const MAX_REQUIRED_FACILITIES = 5;
export function validateRequiredStops(stops: readonly (string | Place)[], ordinaryLimit = 4) {
  const facilities = stops.filter(p => typeof p !== "string" && p.visit);
  if (facilities.length > MAX_REQUIRED_FACILITIES || stops.length - facilities.length > ordinaryLimit)
    throw new Error(`Choose up to ${ordinaryLimit} intermediate places and ${MAX_REQUIRED_FACILITIES} facility visits.`);
  for (const p of facilities as Place[]) {
    const v = p.visit!;
    if (!v.id || typeof v.name !== "string" || !v.name.trim() || !Number.isInteger(v.minutes) || v.minutes < 0 || v.minutes > 180
      || !["water", "toilets", "repairs", "food", "parking"].includes(v.category)
      || !Number.isFinite(v.lat) || !Number.isFinite(v.lon) || Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180
      || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || haversineKm(p, v) > .001)
      throw new Error("A required facility visit is invalid. Reopen the original journey.");
  }
}
export function requiredVisitLeg(point: Place, arrival: number): TransitLeg | null {
  if (!point.visit) return null;
  const visit = point.visit, departure = new Date(arrival), end = new Date(arrival + visit.minutes * 60000);
  if (visitHours(visit.openingHours, visit.seasonal, departure, end).state === "closed")
    return null;
  return { mode: "stop", facilityVisit: visit, from: visit.name, to: visit.name, fromPoint: visit, toPoint: visit,
    departure, arrival: end, departurePlatform: null, arrivalPlatform: null, service: `Stop at ${visit.name}`, serviceName: null, direction: null };
}
