import type { CyclingRoute } from "./cycling.ts";
import type { Journey } from "./routing.ts";

export type HillPreferences = { mode: "none" | "gentler"; maxUphillPercent: number; extraMinutes: number };
export const DEFAULT_HILLS: HillPreferences = { mode: "none", maxUphillPercent: 6, extraMinutes: 15 };
export function validateHills(hills: HillPreferences) {
  if (!["none", "gentler"].includes(hills.mode)
    || !Number.isFinite(hills.maxUphillPercent) || hills.maxUphillPercent < 1 || hills.maxUphillPercent > 20
    || !Number.isInteger(hills.extraMinutes) || hills.extraMinutes < 0 || hills.extraMinutes > 60)
    throw new Error("Choose an uphill preference, a slope from 1% to 20%, and 0–60 extra cycling minutes per section.");
}
export type Climb = { ascent: number; steepM: number; excessM: number; unknown: number; maxGrade: number };
export const emptyClimb = (): Climb => ({ ascent: 0, steepM: 0, excessM: 0, unknown: 0, maxGrade: 0 });
export function addClimb(a: Climb, b: Climb): Climb {
  return { ascent: a.ascent + b.ascent, steepM: a.steepM + b.steepM, excessM: a.excessM + b.excessM,
    unknown: a.unknown + b.unknown, maxGrade: Math.max(a.maxGrade, b.maxGrade) };
}
// Grades describe the smoothed elevation samples, never a guaranteed road maximum.
// Unknown links have their own resource so they cannot masquerade as flat paths.
export function routeClimb(route?: CyclingRoute, minutes = route?.minutes ?? 0, threshold = 6): Climb {
  if (!route) return { ...emptyClimb(), unknown: minutes > 0 ? 1 : 0 };
  if (!route.distanceKm) return emptyClimb();
  let steepM = 0, excessM = 0, maxGrade = 0, knownAscent = 0;
  for (let i = 1; i < route.elevation.length; i++) {
    const a = route.elevation[i - 1], b = route.elevation[i], metres = b.distanceM - a.distanceM;
    if (a.elevationM === null || b.elevationM === null || metres <= 0) continue;
    const rise = b.elevationM - a.elevationM, grade = 100 * rise / metres;
    knownAscent += Math.max(0, rise); maxGrade = Math.max(maxGrade, grade);
    if (grade > threshold) { steepM += metres; excessM += rise - threshold / 100 * metres; }
  }
  const unknown = route.ascentM === null || route.elevationCoverage < .999 || route.elevation.length < 2 ? 1 : 0;
  return { ascent: route.ascentM ?? knownAscent, steepM, excessM, maxGrade, unknown };
}
export function journeyClimb(journey: Journey, threshold = 6): Climb {
  const legs = journey.transitLegs.filter(leg => leg.mode === "bike").map(leg => routeClimb(leg.cyclingRoute,
    leg.departure && leg.arrival ? (+leg.arrival - +leg.departure) / 60_000 : 1, threshold));
  if (!journey.legsIncludeEndpoints) legs.push(routeClimb(journey.originStation.cyclingRoute, journey.originStation.bikeMinutes, threshold),
    routeClimb(journey.destinationStation.cyclingRoute, journey.destinationStation.bikeMinutes, threshold));
  return legs.reduce(addClimb, emptyClimb());
}
export const hillSearch = (options: { hills?: HillPreferences; climbOptimization?: boolean }) =>
  !!options.climbOptimization || !!options.hills && options.hills.mode !== "none";
export const climbVector = (climb: Climb, gentler = false) =>
  [climb.unknown, climb.ascent, ...(gentler ? [climb.steepM, climb.excessM] : [])];

/** These profile parameters penalize climbs; they do not prohibit a gradient. */
export function uphillParameters(params: URLSearchParams, hills: HillPreferences) {
  if (hills.mode === "none") return;
  params.set("profile:uphillcost", "160");
  params.set("profile:uphillcutoff", String(hills.maxUphillPercent));
}

export function climbSummary(climb: Climb, threshold?: number): string {
  const ascent = climb.unknown ? "Cycling ascent unknown (incomplete elevation)" : `≈ ${Math.round(climb.ascent)} m cycling ascent`;
  return ascent + (threshold === undefined ? "" : climb.unknown ? ` · uphill sections above ${threshold}% cannot be fully checked`
    : ` · ≈ ${(climb.steepM / 1000).toFixed(1)} km above ${threshold}% uphill`);
}
