import { DEFAULT_HILLS, routeClimb, type HillPreferences } from "./hills.ts";
import type { CyclingRoute } from "./cycling.ts";
import { signedCyclingStretch } from "./signedCycling.ts";
import { routeStress } from "./cyclingStress.ts";
export const ROUTE_PREFERENCES = ["fastest", "simplest", "lower-stress"] as const;
export type RoutePreference = typeof ROUTE_PREFERENCES[number];
export const routePreferenceLabels: Record<RoutePreference, string> = {
  fastest: "Fastest", simplest: "Easy to follow · fewest turns", "lower-stress": "Lower traffic stress",
};
export const cyclingDetourMinutes = (fastestMinutes: number) => Math.min(15, fastestMinutes * .15);

function elapsedMinutes(route: CyclingRoute) {
  const elapsed = (route.ridingSeconds + (route.pushingSeconds ?? 0) + (route.carryingSeconds ?? 0)) / 60 + route.connectorMinutes;
  // Some older routes only retain the rounded total or include additional walking.
  return Math.ceil(elapsed - 1e-9) === route.minutes ? elapsed : route.minutes;
}
export function chooseCyclingRoute(candidates: CyclingRoute[], preference: RoutePreference, hills: HillPreferences = DEFAULT_HILLS, followSignedRoutes = false): CyclingRoute | null {
  const usable = candidates.filter(r => !r.blocked && Number.isFinite(r.minutes)).sort((a, b) => elapsedMinutes(a) - elapsedMinutes(b));
  if (!usable.length) return null;
  const fastest = usable[0], baseline = elapsedMinutes(fastest);
  const allowance = Math.min(cyclingDetourMinutes(baseline), hills.mode === "none" ? Infinity : hills.extraMinutes);
  const eligible = usable.filter(r => elapsedMinutes(r) <= baseline + allowance + 1e-9);
  // Preserve the established stairs preference inside the same time budget.
  const stairsFree = eligible.filter(r => !r.sections.some(s => s.tags.highway === "steps"
    || ["900", "1200"].includes(s.tags["swisstopo:kunstbaute"])));
  const pool = stairsFree.length ? stairsFree : eligible;
  const rank = (r: CyclingRoute) => preference === "lower-stress" ? routeStress(r)
    : preference === "simplest" ? r.turnCount ?? Infinity : elapsedMinutes(r);
  const compareHills = (a: CyclingRoute, b: CyclingRoute) => {
    if (hills.mode === "none") return 0;
    const aa = routeClimb(a, a.minutes, hills.maxUphillPercent), bb = routeClimb(b, b.minutes, hills.maxUphillPercent);
    return aa.unknown - bb.unknown || (aa.excessM - bb.excessM || aa.steepM - bb.steepM)
      || aa.ascent - bb.ascent;
  };
  const reference = [...pool].sort((a, b) => compareHills(a, b) || rank(a) - rank(b) || elapsedMinutes(a) - elapsedMinutes(b))[0];
  let selected = reference, signedNote = "";
  let signedNetworkStretchM: number | undefined;
  if (followSignedRoutes) {
    const base = signedCyclingStretch(reference);
    let best = base;
    // The quickest goal can spend the shared time budget. Preserve the other
    // primary goals and the selected hill preference before comparing signage.
    for (const path of pool) {
      if (compareHills(path, reference) > 0 || preference !== "fastest"
        && (!Number.isFinite(rank(path)) || rank(path) > rank(reference))) continue;
      const stretch = signedCyclingStretch(path);
      // Extra signed kilometres alone must never pay for a gratuitous loop.
      if (stretch.longestM <= base.longestM || stretch.outsideM >= base.outsideM - 1) continue;
      if (stretch.outsideM < best.outsideM - 1 || Math.abs(stretch.outsideM - best.outsideM) <= 1
        && elapsedMinutes(path) < elapsedMinutes(selected)) {
        selected = path;
        best = stretch;
      }
    }
    signedNetworkStretchM = best.longestM;
    if (best.longestM > 0) {
      const distance = best.longestM < 1000 ? Math.round(best.longestM) + " m" : (best.longestM / 1000).toFixed(1) + " km";
      signedNote = " Longest continuous stretch on a mapped cycling network: " + distance + ". Route numbers may change.";
    } else signedNote = " No signed-network stretch was identified on this path.";
  }
  const unique = new Set(usable.map(r => r.points.map(p => p.lon.toFixed(5) + "," + p.lat.toFixed(5)).join(";"))).size;
  return { ...selected, preference, signedNetworkStretchM, alternativesChecked: unique,
    preferenceNote: (hills.mode !== "none" ? `Prefer uphill slopes below ${hills.maxUphillPercent}%. ` + "This is a preference, not a guaranteed gradient limit. " : "") + (unique < 2 ? "Only one usable path was returned; alternatives could not be compared."
      : preference === "simplest" && selected.turnCount === undefined ? "Turn instructions were unavailable for the eligible paths."
        : "Selected from " + unique + " checked paths; extra time " + Math.max(0, selected.minutes - fastest.minutes) + " min compared with the quickest candidate.")
      + (preference === "lower-stress" && !Number.isFinite(routeStress(selected)) ? " Traffic evidence was unavailable for this path." : "")
      + (preference === "simplest" ? " Fewer turns can mean busier roads." : "") + signedNote };
}
