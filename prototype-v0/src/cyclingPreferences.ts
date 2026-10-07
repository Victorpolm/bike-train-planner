import { DEFAULT_HILLS, routeClimb, type HillPreferences } from "./hills.ts";
import type { CyclingRoute } from "./cycling.ts";
export const ROUTE_PREFERENCES = ["fastest", "simplest", "lower-stress"] as const;
export type RoutePreference = typeof ROUTE_PREFERENCES[number];
export const routePreferenceLabels: Record<RoutePreference, string> = {
  fastest: "Fastest", simplest: "Simplest · fewer turns", "lower-stress": "Lower traffic stress",
};
function routeStress(route: CyclingRoute) {
  let score = 0;
  for (const section of route.sections) {
    const length = section.endM - section.startM;
    const infrastructure = section.infrastructure;
    let exposure = infrastructure === "Separated cycleway" ? .2 : infrastructure === "Shared path" ? .6
      : infrastructure === "Painted lane" ? 1.5 : infrastructure === "Unknown" ? 3 : 2;
    if (/^(primary|secondary|trunk)/.test(section.tags.highway ?? "")) exposure += 3;
    if (Number(section.tags.maxspeed) >= 60) exposure += 2;
    if (section.mode === "push") exposure += 2;
    if (section.mode === "carry") exposure += 5;
    if (["Rock", "Other unpaved", "Unknown"].includes(section.surface)) exposure += 1;
    score += length * exposure;
  }
  return score;
}
const allowedDetourMinutes = (fastestMinutes: number) => Math.min(15, Math.max(5, fastestMinutes * .2));
export function chooseCyclingRoute(candidates: CyclingRoute[], preference: RoutePreference, hills: HillPreferences = DEFAULT_HILLS): CyclingRoute | null {
  const usable = candidates.filter(r => !r.blocked && Number.isFinite(r.minutes)).sort((a, b) => a.minutes - b.minutes);
  if (!usable.length) return null;
  const fastest = usable[0], limit = fastest.minutes + (hills.mode === "none" ? allowedDetourMinutes(fastest.minutes) : hills.extraMinutes);
  // Stairs are a soft preference: a reasonable riding detour wins for every objective.
  const stairsFree = usable.filter(r => r.minutes <= limit && !r.sections.some(s => s.tags.highway === "steps"
    || ["900", "1200"].includes(s.tags["swisstopo:kunstbaute"])));
  const pool = (stairsFree.length ? stairsFree : usable).filter(r => (hills.mode === "none" && preference === "fastest") || r.minutes <= limit);
  const rank = (r: CyclingRoute) => preference === "lower-stress" ? routeStress(r)
    : preference === "simplest" ? r.turnCount ?? Infinity : r.minutes;
  const compareHills = (a: CyclingRoute, b: CyclingRoute) => {
    if (hills.mode === "none") return 0;
    const aa = routeClimb(a, a.minutes, hills.maxUphillPercent), bb = routeClimb(b, b.minutes, hills.maxUphillPercent);
    return aa.unknown - bb.unknown || (aa.excessM - bb.excessM || aa.steepM - bb.steepM)
      || aa.ascent - bb.ascent;
  };
  const selected = [...pool].sort((a, b) => compareHills(a, b) || rank(a) - rank(b) || a.minutes - b.minutes)[0];
  const unique = new Set(usable.map(r => r.points.map(p => p.lon.toFixed(5) + "," + p.lat.toFixed(5)).join(";"))).size;
  return { ...selected, preference, alternativesChecked: unique,
    preferenceNote: (hills.mode !== "none" ? `Prefer uphill slopes below ${hills.maxUphillPercent}%. ` + "This is a preference, not a guaranteed gradient limit. " : "") + (unique < 2 ? "Only one usable path was returned; alternatives could not be compared."
      : preference === "simplest" && selected.turnCount === undefined ? "Turn instructions were unavailable; the quickest checked path is shown."
        : "Selected from " + unique + " checked paths; extra time " + Math.max(0, selected.minutes - fastest.minutes) + " min compared with the quickest candidate.")
      + (preference === "simplest" ? " Fewer turns can mean busier roads." : "") };
}
