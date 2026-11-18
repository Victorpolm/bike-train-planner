import type { CycleSection, CyclingRoute } from "./cycling.ts";
import { postedSpeedBand } from "./cycling.ts";

type Tags = Record<string, string>;
const allowed = (value?: string) => ["yes", "designated", "permissive", "official"].includes(value ?? "");
const pathWay = (tags: Tags) => /^(cycleway|path|footway|pedestrian|bridleway|track)$/.test(tags.highway ?? "");
const gradeSeparated = (tags: Tags) => [tags.bridge, tags.tunnel].some(v => !!v && v !== "no");
const crossingWay = (tags: Tags) => !gradeSeparated(tags) && (tags.cycleway === "crossing" || tags.footway === "crossing");
const natureContext = (tags: Tags) => [tags.estimated_forest_class, tags.estimated_river_class].some(v => /^[4-6]$/.test(v ?? ""));

function motorExcluded(tags: Tags) {
  const motorClasses = ["motorcar", "hgv", "motorcycle", "agricultural", "forestry", "bus", "psv", "taxi", "goods", "mofa", "moped"];
  const accessClasses = ["access", "vehicle", "motor_vehicle", "foot", "bicycle", ...motorClasses];
  if (Object.keys(tags).some(k => k.endsWith(":conditional") && accessClasses.includes(k.split(":")[0]))) return false;
  if (motorClasses.some(k => tags[k] && tags[k] !== "no")) return false;
  for (const key of ["motor_vehicle", "vehicle", "access"]) {
    if (tags[key]) return tags[key] === "no";
  }
  return ["cycleway", "footway", "pedestrian"].includes(tags.highway);
}

function possibleOpposingLaneTurn(before: CycleSection, after: CycleSection) {
  const a = before.tags, b = after.tags;
  const mixed = (s: CycleSection) => ["Shared with traffic", "Painted lane"].includes(s.infrastructure);
  const twoWay = (a.oneway === "no" || Number(a["lanes:forward"]) >= 1 && Number(a["lanes:backward"]) >= 1)
    && !["yes", "-1", "1"].includes(a.oneway);
  const distinctRoads = a.highway !== b.highway || !!a.name && !!b.name && a.name !== b.name
    || !!a.ref && !!b.ref && a.ref !== b.ref;
  return twoWay && distinctRoads && mixed(before) && mixed(after)
    && ![a.junction, b.junction].some(j => j === "roundabout" || j === "circular");
}

// Count traversals, independent of how BRouter or terrain enrichment splits a way.
export function roadCrossings(route: CyclingRoute): number {
  const crossingRuns: { startM: number; endM: number }[] = [];
  for (const s of route.sections) {
    if (!crossingWay(s.tags)) continue;
    const last = crossingRuns.at(-1);
    if (last && Math.abs(last.endM - s.startM) < .01) last.endM = s.endM;
    else crossingRuns.push({ startM: s.startM, endM: s.endM });
  }
  let count = crossingRuns.length, segment = 0, run = 0;
  for (const n of route.crossingNodes ?? []) {
    const d = n.distanceM;
    while (run < crossingRuns.length && crossingRuns[run].endM < d - .01) run++;
    if (run < crossingRuns.length && crossingRuns[run].startM <= d + .01) continue;
    while (segment < route.sections.length && route.sections[segment].endM < d - .01) segment++;
    const before = route.sections[segment];
    if (!before || d <= 0 || d >= route.distanceKm * 1000 || n.tags.railway || gradeSeparated(n.tags)) continue;
    const after = Math.abs(before.endM - d) < .01 ? route.sections[segment + 1] : before;
    if (!after || gradeSeparated(before.tags) || gradeSeparated(after.tags)) continue;
    if (n.tags.highway === "crossing" && pathWay(before.tags) && pathWay(after.tags)
      || /^[1-6]$/.test(n.tags.estimated_crossing_class ?? "") && [before, after].every(s => pathWay(s.tags) || /^(residential|living_street|service|unclassified)$/.test(s.tags.highway))
      || n.leftTurn && possibleOpposingLaneTurn(before, after)) count++;
  }
  return count;
}

function exposurePerMetre(section: CycleSection) {
  const { tags, infrastructure } = section;
  const path = pathWay(tags);
  const excluded = path && motorExcluded(tags);
  const protectedPath = infrastructure === "Separated cycleway" && (!path || excluded);
  let exposure: number;
  if (protectedPath || excluded) {
    exposure = protectedPath ? .35 : .45;
    const rideable = section.mode === "cycle" && (tags.highway === "cycleway" || allowed(tags.bicycle))
      && (["Asphalt", "Paved", "Compacted", "Gravel"].includes(section.surface)
        || section.surface === "Earth" && /^(excellent|good|intermediate)$/.test(tags.smoothness ?? ""))
      && !/^(bad|very_bad|horrible|very_horrible|impassable)$/.test(tags.smoothness ?? "");
    if (excluded && rideable && natureContext(tags)) exposure = .15;
  } else {
    const band = parseInt(section.speedLimit && section.speedLimit !== "Unknown" ? section.speedLimit : postedSpeedBand(tags), 10);
    const speedCost = Number.isFinite(band) ? band <= 35 ? .3 : band <= 45 ? .8 : band <= 55 ? 1.4 : band <= 75 ? 2.2 : 3.2 : 1.6;
    exposure = (infrastructure === "Painted lane" ? 1 : infrastructure === "Unknown" ? 2.5 : 1.5) + speedCost;
    if (/^(primary|secondary|trunk)/.test(tags.highway ?? "")) exposure += 2;
    if (tags.hgv === "designated") exposure += 2;
    if (/^[4-7]$/.test(tags.estimated_traffic_class ?? "")) exposure += (Number(tags.estimated_traffic_class) - 3) * .4;
  }
  if (section.mode === "push") exposure += 2;
  if (section.mode === "carry") exposure += 5;
  if (["Rock", "Other unpaved", "Unknown"].includes(section.surface)) exposure += 1;
  return exposure;
}

// Relative comfort weights in equivalent metres, with one discrete cost per crossing.
export function routeStress(route: CyclingRoute): number {
  if (route.distanceKm > 0 && !route.sections.some(s => s.infrastructure !== "Unknown" || s.tags.highway || s.speedLimit !== "Unknown")) return Infinity;
  return route.sections.reduce((sum, s) => sum + (s.endM - s.startM) * exposurePerMetre(s), 120 * roadCrossings(route));
}
