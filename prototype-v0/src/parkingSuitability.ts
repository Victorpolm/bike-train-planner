import { parkingAccess, type BikeParking } from "./bikeParking.ts";
import { haversineKm, type Point } from "./routing.ts";
import { visitHours } from "./facilityHours.ts";
import { safePublicLink } from "./amenityLocation.ts";
import type { DetourFacility } from "./cyclingDetour.ts";

export type ParkingPreferences = {
  radiusKm: number; arrival: Date; retrieval: Date;
  preferFrame: boolean; preferCovered: boolean; requireFree: boolean; requireOpen: boolean; allowConditional: boolean;
};
export function maxStayMinutes(raw?: string): number | null {
  const m = raw?.trim().match(/^(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)$/i);
  if (!m) return null;
  return Number(m[1]) * (/^(hour|hr)/i.test(m[2]) ? 60 : /^day/i.test(m[2]) ? 1440 : /^week/i.test(m[2]) ? 10080 : 1);
}
export function frameSupport(f: BikeParking) {
  const types = (f.parkingType ?? "").split(";").map(t => t.trim());
  return types.length > 0 && types.every(t => ["stands", "wide_stands", "safe_loops", "bollard"].includes(t));
}
export function parkingVisitAllowed(f: BikeParking, allowConditional = false) {
  if (["no", "private"].includes(f.access ?? "")) return false;
  const condition = f.publicAccess === false || f.tags?.locked === "yes" || !!f.tags?.["access:conditional"]
    || !!f.access && !["yes", "public", "permissive", "unknown"].includes(f.access);
  return !condition || allowConditional;
}
export function parkingAssessment(f: BikeParking, p: ParkingPreferences) {
  const reasons: string[] = [], warnings: string[] = [];
  if (!Number.isFinite(+p.arrival) || !Number.isFinite(+p.retrieval) || +p.retrieval < +p.arrival) reasons.push("Choose a collection time after arrival.");
  if (!parkingVisitAllowed(f, p.allowConditional)) reasons.push("Mapped access restrictions do not match your selection.");
  const arrival = visitHours(f.openingHours, f.tags?.seasonal, p.arrival), retrieval = visitHours(f.openingHours, f.tags?.seasonal, p.retrieval);
  if (arrival.state === "closed") reasons.push("Mapped closed at arrival.");
  if (retrieval.state === "closed") reasons.push("Mapped closed when you want to collect your bicycle.");
  if (p.requireOpen && (arrival.state !== "open" || retrieval.state !== "open")) reasons.push("Opening at both times is unconfirmed.");
  if (arrival.state === "unknown" || retrieval.state === "unknown") warnings.push("Arrival or retrieval access is unconfirmed.");
  const max = maxStayMinutes(f.tags?.maxstay);
  if (max !== null && (+p.retrieval - +p.arrival) / 60000 > max) reasons.push(`Your stay exceeds the mapped maximum of ${f.tags!.maxstay}.`);
  if (f.tags?.maxstay && max === null) warnings.push(`Maximum stay needs checking: ${f.tags.maxstay}.`);
  if (p.requireFree && (f.fee !== false || !!f.tags?.["fee:conditional"])) reasons.push("Free parking for this stay is not established.");
  if (f.traits.some(t => /differs between sources|disagree/i.test(t))) warnings.push("Sources disagree; inspect the details.");
  return { eligible: !reasons.length, reasons, warnings, arrival: arrival.state, retrieval: retrieval.state };
}
export function parkingShortlist(facilities: readonly BikeParking[], target: Point | null, preferences: ParkingPreferences) {
  if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lon) || Math.abs(target.lat) > 90 || Math.abs(target.lon) > 180 || !Number.isFinite(preferences.radiusKm) || preferences.radiusKm <= 0) return [];
  return facilities.flatMap(f => {
    if (Math.abs(f.lat) > 90 || Math.abs(f.lon) > 180) return [];
    const distanceKm = haversineKm(target, f);
    if (!Number.isFinite(distanceKm) || distanceKm > preferences.radiusKm) return [];
    const assessment = parkingAssessment(f, preferences);
    if (!assessment.eligible) return [];
    const matches = [preferences.preferFrame && frameSupport(f) ? "Mapped frame-support stand" : "",
      preferences.preferCovered && f.covered === true ? "Mapped cover" : ""].filter(Boolean);
    return [{ facility: f, distanceKm, assessment, matches }];
  }).sort((a, b) => b.matches.length - a.matches.length || a.distanceKm - b.distanceKm || a.facility.id.localeCompare(b.facility.id));
}
export function parkingInformation(f: BikeParking) {
  const t = f.tags ?? {};
  return [parkingAccess(f),
    f.locationRole === "entrance" ? "Entrance tagged at this OSM point; bicycle passage has not been verified on site."
      : f.locationRole === "area" ? "Area centre; the entrance is unverified." : "Mapped facility point; the entrance is unverified.",
    ...(t.indoor === "yes" ? ["Indoors"] : []), ...(t["level:ref"] || t.level ? [`Mapped floor: ${t["level:ref"] ?? t.level}`] : []),
    ...(t.locked ? [`Mapped lock: ${t.locked}`] : []), ...(t.authentication ? [`Entry method: ${t.authentication}`] : []),
    ...(t["access:conditional"] ? [`Entry conditions: ${t["access:conditional"]}`] : []),
    ...(t.maxstay ? [`Maximum stay: ${t.maxstay}`] : []),
    t.surveillance ? `Monitoring tag: ${t.surveillance}; camera coverage and operation are unverified.` : "Camera monitoring unknown.",
    t.supervised ? `Supervision mapped: ${t.supervised}.` : "Staff supervision unknown.",
    ...(t["description:en"] ?? t.description ?? t["description:de"] ? [t["description:en"] ?? t.description ?? t["description:de"]] : []),
    "Total capacity is not live availability. Cover, CCTV and a subscription do not guarantee theft protection or a space."];
}
export function parkingDetourTarget(f: BikeParking, allowConditional = false): DetourFacility {
  return { id: f.id, name: f.name, lat: f.lat, lon: f.lon, category: "parking", openingHours: f.openingHours,
    seasonal: f.tags?.seasonal, url: safePublicLink(f.url), unavailable: parkingVisitAllowed(f, allowConditional) ? undefined : "This parking has mapped access restrictions.",
    note: `${parkingInformation(f)[1]} This visit continues with your bicycle; leaving it here for an onward journey is not included.` };
}
