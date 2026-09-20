import { haversineKm, type Point } from "./routing.ts";

export type CyclePoint = Point & { elevationM: number | null; distanceM: number };
export type Surface = "Paved" | "Compacted" | "Gravel" | "Other unpaved" | "Unknown";
export type Infrastructure = "Separated cycleway" | "Painted lane" | "Shared with traffic" | "Shared path" | "Unknown";
export type CycleSection = {
  startM: number; endM: number; surface: Surface; infrastructure: Infrastructure;
  speedLimit: string; tags: Record<string, string>;
};
export type SlopeSection = { startM: number; endM: number; gradePercent: number };
export type CyclingRoute = {
  id: string; from: Point; to: Point; points: CyclePoint[]; distanceKm: number;
  ridingSeconds: number; minutes: number; ascentM: number | null; descentM: number | null;
  elevation: CyclePoint[]; elevationCoverage: number; steep: SlopeSection[];
  sections: CycleSection[]; startGapM: number; endGapM: number; connectorMinutes: number;
  source: "BRouter" | "same place"; fetchedAt: number;
};
export const CYCLING_PROFILE = "trekking";
export const MAX_CYCLING_SPEED_KMH = 25;
// Match BRouter's bounded waypoint search. Building/stop centroids need not
// sit exactly on a way; the gap remains visible and consumes walking time.
export const MAX_ENDPOINT_GAP_METRES = 250;
export const CONNECTOR_WALKING_SPEED_KMH = 4;
export class EndpointSnapError extends Error {
  constructor() {
    super(`The routed path is more than ${MAX_ENDPOINT_GAP_METRES} m from a selected point. Move that point closer to a road or path.`);
    this.name = "EndpointSnapError";
  }
}
export const STEEP_PERCENT = 6;
export const FINAL_CLIMB_METRES = 2000;
type Located = Point & { id?: string; stopId?: string };
export const cyclingKey = (a: Point, b: Point) => `${a.lat.toFixed(6)},${a.lon.toFixed(6)}>${b.lat.toFixed(6)},${b.lon.toFixed(6)}`;
export function samePlace(a: Located, b: Located) {
  const aid = a.stopId ?? a.id, bid = b.stopId ?? b.id;
  return !!aid && aid === bid || haversineKm(a, b) < .0005;
}
export function zeroCycling(a: Point, b: Point): CyclingRoute {
  return { id: cyclingKey(a, b), from: a, to: b, points: [], distanceKm: 0, ridingSeconds: 0, minutes: 0,
    ascentM: 0, descentM: 0, elevation: [], elevationCoverage: 1, steep: [], sections: [],
    startGapM: 0, endGapM: 0, connectorMinutes: 0, source: "same place", fetchedAt: Date.now() };
}
export function cachedCycling(routes: ReadonlyMap<string, CyclingRoute | null>, a: Located, b: Located): CyclingRoute | null {
  return samePlace(a, b) ? zeroCycling(a, b) : routes.get(cyclingKey(a, b)) ?? null;
}
const validPoint = (p: Point) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
const number = (value: unknown): number | null => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;

export function classifySurface(tags: Record<string, string>): Surface {
  if (/^(asphalt|paved|concrete|paving_stones|sett|cobblestone)$/.test(tags.surface ?? "")) return "Paved";
  if (tags.surface === "compacted") return "Compacted";
  if (/^(gravel|fine_gravel|pebblestone)$/.test(tags.surface ?? "")) return "Gravel";
  if (/^(unpaved|ground|dirt|grass|sand|earth|mud|clay|rock|stone|grass_paver)$/.test(tags.surface ?? "")) return "Other unpaved";
  return "Unknown";
}
export function classifyInfrastructure(tags: Record<string, string>): Infrastructure {
  // Swiss right-hand traffic: side-specific facilities must match travel direction.
  const side = tags.reversedirection === "yes" ? "left" : "right";
  const facility = tags[`cycleway:${side}`] ?? tags["cycleway:both"] ?? tags.cycleway;
  if (tags.highway === "cycleway" || facility === "track") return "Separated cycleway";
  if (facility === "lane") return "Painted lane";
  if (/^(footway|path|pedestrian|track|bridleway)$/.test(tags.highway ?? "")) return "Shared path";
  // 'separate' refers to a different mapped way, not protection on this road.
  if (/^(residential|living_street|service|unclassified|tertiary|secondary|primary|trunk)(?:_link)?$/.test(tags.highway ?? "")) return "Shared with traffic";
  return "Unknown";
}
export function postedSpeedBand(tags: Record<string, string>): string {
  if (Object.keys(tags).some(key => key.startsWith("maxspeed") && key.includes("conditional"))) return "Unknown";
  const directional = tags.reversedirection === "yes" ? "maxspeed:backward" : "maxspeed:forward";
  const value = tags[directional] ?? tags.maxspeed;
  // BRouter's lookup table normalizes OSM limits into groups. Do not present the
  // representative value as an exact posted speed, or use modelled travel speed.
  const bands: Record<string, string> = { "10": "5–15", "20": "16–25", "30": "30–35", "40": "40–45", "50": "48–56",
    "60": "56–65", "70": "70–75", "80": "80–85", "90": "89–95", "100": "96–105", "110": "110–113", "120": "120–121", "130": "127–130" };
  return bands[value ?? ""] ? `${bands[value!]} km/h` : "Unknown";
}

export function pointAlong(points: CyclePoint[], distanceM: number): CyclePoint | null {
  if (!points.length) return null;
  const d = Math.max(0, Math.min(distanceM, points.at(-1)!.distanceM));
  let low = 0, high = points.length - 1;
  while (low < high) { const mid = Math.floor((low + high) / 2); if (points[mid].distanceM < d) low = mid + 1; else high = mid; }
  if (low === 0) return { ...points[0], distanceM: d };
  const a = points[low - 1], b = points[low], fraction = (d - a.distanceM) / (b.distanceM - a.distanceM || 1);
  const elevationM = a.elevationM !== null && b.elevationM !== null && b.distanceM - a.distanceM <= 250
    ? a.elevationM + fraction * (b.elevationM - a.elevationM) : null;
  return { distanceM: d, lat: a.lat + fraction * (b.lat - a.lat), lon: a.lon + fraction * (b.lon - a.lon), elevationM };
}
function elevationProfile(points: CyclePoint[]) {
  const length = points.at(-1)!.distanceM;
  const distances = Array.from({ length: Math.floor(length / 100) + 1 }, (_, i) => i * 100);
  if (distances.at(-1) !== length) distances.push(length);
  const elevation = distances.map(distance => {
    const point = pointAlong(points, distance)!;
    // Short symmetric smoothing limits elevation noise; never fill a missing sample.
    const before = pointAlong(points, Math.max(0, distance - 25))!, after = pointAlong(points, Math.min(length, distance + 25))!;
    return { ...point, elevationM: [before, point, after].every(p => p.elevationM !== null)
      ? (before.elevationM! + 2 * point.elevationM! + after.elevationM!) / 4 : null };
  });
  let ascent = 0, descent = 0, knownM = 0;
  const steep: SlopeSection[] = [];
  for (let i = 1; i < elevation.length; i++) {
    const a = elevation[i - 1], b = elevation[i], distance = b.distanceM - a.distanceM;
    if (a.elevationM === null || b.elevationM === null || distance <= 0) continue;
    const change = b.elevationM - a.elevationM, gradePercent = 100 * change / distance;
    knownM += distance; ascent += Math.max(0, change); descent += Math.max(0, -change);
    if (distance >= 75 && Math.abs(gradePercent) >= STEEP_PERCENT) {
      const previous = steep.at(-1);
      if (previous?.endM === a.distanceM && Math.sign(previous.gradePercent) === Math.sign(gradePercent)) {
        const previousLength = previous.endM - previous.startM;
        previous.gradePercent = (previous.gradePercent * previousLength + gradePercent * distance) / (previousLength + distance);
        previous.endM = b.distanceM;
      } else steep.push({ startM: a.distanceM, endM: b.distanceM, gradePercent });
    }
  }
  const coverage = length ? knownM / length : 1;
  return { elevation, elevationCoverage: coverage, ascentM: coverage > .999 ? Math.round(ascent) : null,
    descentM: coverage > .999 ? Math.round(descent) : null, steep };
}
export function finalClimb(route: CyclingRoute) {
  const end = route.distanceKm * 1000, start = Math.max(0, end - FINAL_CLIMB_METRES);
  const points = [pointAlong(route.elevation, start), ...route.elevation.filter(p => p.distanceM > start)].filter((p): p is CyclePoint => !!p);
  if (points.some(p => p.elevationM === null)) return { distanceM: end - start, ascentM: null, maxGrade: null };
  let ascentM = 0, maxGrade = 0;
  for (let i = 1; i < points.length; i++) {
    const rise = points[i].elevationM! - points[i - 1].elevationM!;
    ascentM += Math.max(0, rise); maxGrade = Math.max(maxGrade, 100 * rise / (points[i].distanceM - points[i - 1].distanceM || 1));
  }
  return { distanceM: end - start, ascentM: Math.round(ascentM), maxGrade };
}

export function parseCyclingRoute(data: unknown, from: Point, to: Point, fetchedAt = Date.now()): CyclingRoute {
  const collection = data as { features?: { geometry?: { type?: string; coordinates?: unknown[][] }; properties?: Record<string, unknown> }[] };
  const feature = collection?.features?.find(f => f.geometry?.type === "LineString"), properties = feature?.properties ?? {};
  const coordinates = feature?.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 100_000) throw new Error("No usable cycling path was returned.");
  const distanceM = number(properties["track-length"]), seconds = number(properties["total-time"]);
  if (distanceM === null || distanceM <= 0 || seconds === null || seconds <= 0) throw new Error("Cycling distance or duration is unavailable.");
  let length = 0;
  const points: CyclePoint[] = coordinates.map((c, i) => {
    if (typeof c[0] !== "number" || typeof c[1] !== "number" || !validPoint({ lon: c[0], lat: c[1] })) throw new Error("Invalid cycling geometry.");
    if (i) length += haversineKm({ lon: coordinates[i - 1][0] as number, lat: coordinates[i - 1][1] as number }, { lon: c[0], lat: c[1] }) * 1000;
    const altitude = number(c[2]);
    return { lon: c[0], lat: c[1], elevationM: altitude !== null && altitude > -500 && altitude < 9000 ? altitude : null, distanceM: length };
  });
  if (!length || distanceM < length * .8 || distanceM > length * 1.5 + 50) throw new Error("Cycling distance and geometry disagree.");
  points.forEach(p => { p.distanceM *= distanceM / length; });
  const startGapM = haversineKm(from, points[0]) * 1000, endGapM = haversineKm(to, points.at(-1)!) * 1000;
  if (startGapM > MAX_ENDPOINT_GAP_METRES || endGapM > MAX_ENDPOINT_GAP_METRES) throw new EndpointSnapError();
  const connectorMinutes = (startGapM + endGapM) / 1000 / CONNECTOR_WALKING_SPEED_KMH * 60;
  const unknown = (startM: number, endM: number): CycleSection => ({ startM, endM, surface: "Unknown", infrastructure: "Unknown", speedLimit: "Unknown", tags: {} });
  const sections: CycleSection[] = [];
  const messages = properties.messages;
  if (Array.isArray(messages) && Array.isArray(messages[0])) {
    const header = messages[0] as string[], lonIndex = header.indexOf("Longitude"), latIndex = header.indexOf("Latitude"), tagsIndex = header.indexOf("WayTags");
    let cursor = 0, uncertainInterval = false;
    for (const row of messages.slice(1)) {
      if (!Array.isArray(row) || lonIndex < 0 || latIndex < 0 || tagsIndex < 0) { uncertainInterval = true; continue; }
      const lon = number(row[lonIndex]), lat = number(row[latIndex]);
      if (lon === null || lat === null || typeof row[tagsIndex] !== "string") { uncertainInterval = true; continue; }
      const endpoint = { lon: lon / 1e6, lat: lat / 1e6 };
      // Messages describe the interval ending at their coordinate. Match in
      // sequence: the same junction can occur more than once in a loop.
      let end = -1;
      for (let i = cursor; i < points.length; i++) if (haversineKm(points[i], endpoint) < .002) { end = i; break; }
      if (end < cursor) { uncertainInterval = true; continue; }
      const tags = Object.fromEntries((row[tagsIndex] as string).split(/\s+/).filter(s => s.includes("=")).map(s => {
        const index = s.indexOf("="); return [s.slice(0, index), s.slice(index + 1)];
      }));
      if (end > cursor) sections.push(uncertainInterval ? unknown(points[cursor].distanceM, points[end].distanceM)
        : { startM: points[cursor].distanceM, endM: points[end].distanceM, tags,
          surface: classifySurface(tags), infrastructure: classifyInfrastructure(tags), speedLimit: postedSpeedBand(tags) });
      cursor = end; uncertainInterval = false;
    }
    if (points[cursor].distanceM < distanceM) sections.push(unknown(points[cursor].distanceM, distanceM));
  }
  if (!sections.length) sections.push(unknown(0, distanceM));
  const ridingSeconds = Math.max(seconds, distanceM / 1000 / MAX_CYCLING_SPEED_KMH * 3600);
  return { id: cyclingKey(from, to), from, to, points, distanceKm: distanceM / 1000, ridingSeconds,
    minutes: Math.ceil(ridingSeconds / 60 + connectorMinutes), startGapM, endGapM, connectorMinutes,
    source: "BRouter", fetchedAt, sections, ...elevationProfile(points) };
}

export function breakdown(route: CyclingRoute, property: "surface" | "infrastructure" | "speedLimit") {
  const totals = new Map<string, number>();
  for (const section of route.sections) totals.set(section[property], (totals.get(section[property]) ?? 0) + section.endM - section.startM);
  return [...totals].map(([label, metres]) => ({ label, metres, percent: route.distanceKm ? metres / (route.distanceKm * 10) : 0 })).sort((a, b) => b.metres - a.metres);
}
