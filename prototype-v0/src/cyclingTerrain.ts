import type { CycleSection, CyclingRoute, CyclePoint } from "./cycling.ts";
import { slopeSpeedKmh } from "./cyclingPace.ts";

export type TravelMode = "cycle" | "push" | "carry" | "blocked";
export type TerrainSection = { mode: TravelMode; reasons: string[]; pathType: string; seconds: number };
const yes = (value?: string) => ["yes", "designated", "permissive", "official"].includes(value ?? "");
const forbidden = (value?: string) => ["no", "private"].includes(value ?? "");
export function pathType(tags: Record<string, string>) {
  if (yes(tags.route_mtb) || tags.route === "mtb") return "Mapped MTB route";
  if (tags.highway === "steps") return "Stairs";
  if (tags.highway === "cycleway") return "Cycleway";
  if (tags.highway === "track") return "Forest / farm track";
  if (["path", "bridleway"].includes(tags.highway)) return "Narrow trail";
  if (["footway", "pedestrian"].includes(tags.highway)) return "Footpath";
  if (tags.highway) return "Road";
  const type = Number(tags["swisstopo:objektart"]);
  return type === 22 ? "Climbing route" : [16, 17, 19].includes(type) ? "Narrow trail"
    : [15, 18].includes(type) ? "Track" : [8, 9, 10, 11, 20].includes(type) ? "Road" : "Unknown";
}

export function terrainRule(tags: Record<string, string>): Omit<TerrainSection, "seconds"> {
  let mode: TravelMode = "cycle";
  const reasons: string[] = [];
  const set = (next: TravelMode, reason: string) => {
    if (["cycle", "push", "carry", "blocked"].indexOf(next) > ["cycle", "push", "carry", "blocked"].indexOf(mode)) mode = next;
    reasons.push(reason);
  };
  const bike = tags.bicycle, foot = tags.foot;
  if ((forbidden(tags.access) && !yes(bike) && !yes(foot)) || (forbidden(bike) && forbidden(foot)))
    set("blocked", "Mapped access restriction excludes passage with the bicycle.");
  if (forbidden(tags.access) && yes(foot) && !yes(bike)) set("push", "Access is restricted to pedestrians: dismount.");
  if (["motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed"].includes(tags.highway) && !yes(bike))
    set("blocked", "This road is not an established bicycle connection.");
  if (tags.highway === "via_ferrata" || Number(tags.via_ferrata_scale) > 0
    || Number(tags["mtb:scale"]) >= 5 || ["alpine_hiking", "demanding_alpine_hiking", "difficult_alpine_hiking"].includes(tags.sac_scale))
    set("blocked", "Climbing / alpine walking passage: suitability for carrying a bicycle is not established.");
  if (tags.highway === "steps") set(yes(tags["ramp:bicycle"]) ? "push" : "carry",
    yes(tags["ramp:bicycle"]) ? "Stairs with a mapped bicycle ramp: dismount and push." : "Stairs: walking while carrying the bicycle may be necessary.");
  if (tags.sac_scale === "demanding_mountain_hiking" || Number(tags["mtb:scale"]) >= 3)
    set("carry", "Technical hiking / MTB section: walk; carrying the bicycle may be necessary.");
  else if (tags.sac_scale === "mountain_hiking" || Number(tags["mtb:scale"]) >= 2)
    set("push", "Rough mountain trail: estimated as walking with the bicycle.");
  if (bike === "dismount" || forbidden(bike) || (forbidden(tags.vehicle) && !yes(bike)))
    set("push", "Mapped bicycle restriction: dismount; pedestrian access must remain permitted.");
  if (["footway", "pedestrian"].includes(tags.highway) && !yes(bike))
    set("push", "Footpath without mapped riding permission: estimated as walking.");
  if (Object.keys(tags).some(key => /^(access|bicycle|vehicle|foot):conditional$/.test(key)))
    reasons.push("Conditional access is mapped; check the signs and applicable times.");
  const object = Number(tags["swisstopo:objektart"]), restriction = Number(tags["swisstopo:verkehrsbeschraenkung"]);
  const structure = Number(tags["swisstopo:kunstbaute"]);
  if (object === 22 || restriction === 600)
    set("blocked", "Swisstopo maps a climbing passage; this bicycle route is excluded.");
  if (restriction === 2000) set("blocked", "Swisstopo maps a closed passage.");
  if ([900, 1200].includes(structure)) set("carry", "Swisstopo maps stairs: walk and be prepared to carry the bicycle.");
  if (["Alpinwanderweg", "2"].includes(tags["swisstopo:hikingtype"]))
    set("blocked", "Swisstopo maps an alpine hiking route; bicycle passage is not established.");
  if (["Bergwanderweg", "1"].includes(tags["swisstopo:hikingtype"]) && ["path", "footway", "steps", undefined].includes(tags.highway))
    set("push", "Swisstopo maps a mountain hiking path: estimated as walking.");
  if ([200, 300, 400].includes(restriction)) {
    if (yes(bike)) reasons.push("Swisstopo pedestrian/access designation differs from mapped bicycle permission; check signs.");
    else set("push", "Swisstopo maps a pedestrian designation or driving restriction: dismount.");
  }
  if ([800, 1100, 1200, 1300, 1400, 1600, 1700, 1800, 1900].includes(restriction))
    reasons.push("Swisstopo records an access restriction; its applicability to this bicycle journey is unverified.");
  // BEFAHRBARKEIT concerns cars on 2 m tracks / 3 m roads, not bicycle permission.
  if (foot === "no" && mode !== "cycle") set("blocked", "Walking is prohibited; pushing is not a valid workaround.");
  return { mode, reasons: [...new Set(reasons)], pathType: pathType(tags) };
}

function elevationAt(points: CyclePoint[], distanceM: number): number | null {
  let low = 0, high = points.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (points[mid].distanceM < distanceM) low = mid + 1; else high = mid; }
  const b = points[low], a = points[Math.max(0, low - 1)];
  if (!a || !b || a.elevationM === null || b.elevationM === null) return null;
  return a.elevationM + (b.elevationM - a.elevationM) * Math.min(1, Math.max(0, (distanceM - a.distanceM) / (b.distanceM - a.distanceM || 1)));
}
export function analyseCyclingTerrain(route: CyclingRoute): CyclingRoute {
  let ridingSeconds = 0, pushingSeconds = 0, carryingSeconds = 0;
  const terrainBaseSeconds = route.terrainBaseSeconds ?? route.ridingSeconds;
  const sections: CycleSection[] = route.sections.map(section => {
    const rule = terrainRule(section.tags), distance = section.endM - section.startM;
    let seconds = 0;
    for (let d = section.startM; d < section.endM; d += 100) {
      const end = Math.min(d + 100, section.endM), a = elevationAt(route.elevation, d), b = elevationAt(route.elevation, end);
      const grade = a === null || b === null ? 0 : (b - a) / (end - d);
      if (rule.mode === "blocked") continue;
      let speed = rule.mode === "carry" ? 2 : rule.mode === "push" ? 4 : route.pace
        ? slopeSpeedKmh(grade, route.pace) : distance ? route.distanceKm * 3600 / Math.max(1, terrainBaseSeconds) : 15;
      if (rule.mode === "cycle") {
        const surfaceCap = /rock|stone|sand|mud/.test(section.tags.surface ?? "") ? 8
          : /gravel|ground|dirt|earth|grass/.test(section.tags.surface ?? "") || section.surface === "Other unpaved" ? 18 : Infinity;
        speed = Math.min(speed, surfaceCap);
      } else speed = Math.max(.8, speed * Math.exp(-3 * Math.max(0, Math.abs(grade) - .05)));
      seconds += (end - d) / (speed / 3.6);
    }
    if (rule.mode === "cycle") ridingSeconds += seconds;
    if (rule.mode === "push") pushingSeconds += seconds;
    if (rule.mode === "carry") carryingSeconds += seconds;
    return { ...section, ...rule, seconds };
  });
  const blocked = sections.some(s => s.mode === "blocked");
  if (!route.pace && sections.every(s => s.mode === "cycle")) ridingSeconds = terrainBaseSeconds;
  return { ...route, terrainBaseSeconds, sections, ridingSeconds, pushingSeconds, carryingSeconds, blocked,
    minutes: blocked ? Infinity : Math.ceil((ridingSeconds + pushingSeconds + carryingSeconds) / 60 + route.connectorMinutes - 1e-9) };
}
export function modeTotals(route: CyclingRoute) {
  return (["cycle", "push", "carry"] as const).map(mode => ({
    mode, metres: route.sections.filter(s => (s.mode ?? "cycle") === mode).reduce((sum, s) => sum + s.endM - s.startM, 0),
    seconds: mode === "cycle" ? route.ridingSeconds : mode === "push" ? route.pushingSeconds ?? 0 : route.carryingSeconds ?? 0,
  }));
}
export const travelModeLabel: Record<TravelMode, string> = { cycle: "Cycling", push: "Walking · push bicycle", carry: "Walking · carry bicycle", blocked: "Not suitable with a bicycle" };
