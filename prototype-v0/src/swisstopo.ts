import type { CyclePoint, CycleSection, CyclingRoute } from "./cycling.ts";
import { analyseCyclingTerrain } from "./cyclingTerrain.ts";
import { haversineKm, type Point } from "./routing.ts";

export const SWISSTOPO_SOURCE = { title: "swisstopo · swissTLM3D", url: "https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d", reviewed: "2026-09-27" };
export const TLM_ROADS = "ch.swisstopo.swisstlm3d-strassen", TLM_HIKING = "ch.swisstopo.swisstlm3d-wanderwege";
export type TopoFeature = { id: string; layer: string; lines: number[][][]; attributes: Record<string, string> };
export type TopoReply = { features: TopoFeature[]; complete: boolean; checkedAt: string; note?: string };
export type TopoCheck = { status: "checked" | "partial" | "unavailable"; matchedMetres: number; checkedAt: string; note: string };
const fields = ["objektart", "verkehrsbeschraenkung", "belagsart", "kunstbaute", "hikingtype", "stufe"];
export function parseTopoReply(data: unknown): TopoFeature[] {
  const reply = data as { results?: { featureId?: string | number; layerBodId?: string; properties?: Record<string, unknown>;
    geometry?: { type?: string; coordinates?: unknown } }[] };
  if (!Array.isArray(reply?.results)) throw new Error("Invalid swisstopo response");
  return reply.results.flatMap(feature => {
    if (![TLM_ROADS, TLM_HIKING].includes(feature.layerBodId ?? "")) return [];
    const geometry = feature.geometry;
    const raw = geometry?.type === "LineString" ? [geometry.coordinates] : geometry?.type === "MultiLineString" ? geometry.coordinates : null;
    if (!Array.isArray(raw)) return [];
    const lines = raw.filter((line): line is number[][] => Array.isArray(line) && line.length >= 2 && line.length <= 20000
      && line.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])));
    if (!lines.length) return [];
    const attributes = Object.fromEntries(fields.flatMap(name => {
      const value = feature.properties?.[name];
      return typeof value === "string" || typeof value === "number" ? [[name, String(value)]] : [];
    }));
    return [{ id: String(feature.featureId ?? ""), layer: feature.layerBodId!, lines, attributes }];
  });
}
// Local metric projection for short-distance matching, not for routing.
function xy(point: Point, origin: Point) {
  return [(point.lon - origin.lon) * 111320 * Math.cos(origin.lat * Math.PI / 180), (point.lat - origin.lat) * 111320];
}
function featureDistance(a: Point, b: Point, line: number[][]) {
  const end = xy(b, a), length = Math.hypot(...end);
  if (length < .1) return Infinity;
  const samples = [.2, .5, .8].map(f => [end[0] * f, end[1] * f]);
  const distances = samples.map(() => Infinity);
  const minLon = Math.min(a.lon, b.lon) - .0001, maxLon = Math.max(a.lon, b.lon) + .0001;
  const minLat = Math.min(a.lat, b.lat) - .00006, maxLat = Math.max(a.lat, b.lat) + .00006;
  for (let i = 1; i < line.length; i++) {
    const v = line[i - 1], w = line[i];
    if (Math.max(v[0], w[0]) < minLon || Math.min(v[0], w[0]) > maxLon || Math.max(v[1], w[1]) < minLat || Math.min(v[1], w[1]) > maxLat) continue;
    const p = xy({ lon: v[0], lat: v[1] }, a), q = xy({ lon: w[0], lat: w[1] }, a);
    const dx = q[0] - p[0], dy = q[1] - p[1], size = Math.hypot(dx, dy);
    if (size < .1 || Math.abs((dx * end[0] + dy * end[1]) / (size * length)) < .9) continue;
    samples.forEach(([x, y], index) => {
      const t = Math.max(0, Math.min(1, ((x - p[0]) * dx + (y - p[1]) * dy) / (size * size)));
      distances[index] = Math.min(distances[index], Math.hypot(x - p[0] - t * dx, y - p[1] - t * dy));
    });
  }
  return Math.max(...distances);
}
export function applySwisstopo(route: CyclingRoute, reply: TopoReply): CyclingRoute {
  let matchedMetres = 0;
  const sections: CycleSection[] = [];
  let sectionIndex = 0;
  const indexed = reply.features.map(f => {
    const points = f.lines.flat();
    return { f, minLon: Math.min(...points.map(p => p[0])), maxLon: Math.max(...points.map(p => p[0])),
      minLat: Math.min(...points.map(p => p[1])), maxLat: Math.max(...points.map(p => p[1])) };
  });
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1], b = route.points[i], mid = (a.distanceM + b.distanceM) / 2;
    while (sectionIndex < route.sections.length - 1 && route.sections[sectionIndex].endM <= mid) sectionIndex++;
    const original = route.sections[sectionIndex];
    if (!original) continue;
    const tags = { ...original.tags };
    let matched = false;
    for (const layer of [TLM_ROADS, TLM_HIKING]) {
      const candidates = indexed.filter(x => x.f.layer === layer
        && x.maxLon >= Math.min(a.lon, b.lon) - .0001 && x.minLon <= Math.max(a.lon, b.lon) + .0001
        && x.maxLat >= Math.min(a.lat, b.lat) - .00006 && x.minLat <= Math.max(a.lat, b.lat) + .00006)
        .map(({ f }) => ({ f, distance: Math.min(...f.lines.map(line => featureDistance(a, b, line))) }))
        .filter(x => x.distance <= 6).sort((x, y) => x.distance - y.distance);
      // Ambiguous parallel ways stay unknown rather than borrowing a restriction.
      if (!candidates[0] || candidates[1] && candidates[1].distance - candidates[0].distance < 2) continue;
      const match = candidates[0].f;
      for (const [key, value] of Object.entries(match.attributes)) tags["swisstopo:" + key] = value;
      tags["swisstopo:" + (layer === TLM_ROADS ? "road_id" : "hiking_id")] = match.id;
      matched = true;
    }
    if (matched) matchedMetres += b.distanceM - a.distanceM;
    const surface = original.surface === "Unknown" ? tags["swisstopo:belagsart"] === "100" ? "Paved"
      : tags["swisstopo:belagsart"] === "200" ? "Other unpaved" : "Unknown" : original.surface;
    sections.push({ ...original, startM: a.distanceM, endM: b.distanceM, surface, tags });
  }
  // Coalesce equal attributes so the itinerary remains readable.
  const merged = sections.reduce<typeof sections>((result, s) => {
    const previous = result.at(-1);
    if (previous && JSON.stringify(previous.tags) === JSON.stringify(s.tags)) previous.endM = s.endM;
    else result.push({ ...s });
    return result;
  }, []);
  return analyseCyclingTerrain({ ...route, sections: merged.length ? merged : route.sections,
    topoCheck: { status: reply.complete ? "checked" : "partial", matchedMetres, checkedAt: reply.checkedAt,
      note: reply.note ?? "Matched mapped roads and hiking paths; this is not a certification of bicycle access." } });
}
// Douglas–Peucker preserves bends. Uniform subsampling could skip a short hazard.
export function simplifyTopoLine(points: Point[], toleranceM = 3): Point[] {
  if (points.length <= 2) return points;
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop()!, a = points[first], b = xy(points[last], a), length2 = b[0] ** 2 + b[1] ** 2;
    let distance = -1, index = first;
    for (let i = first + 1; i < last; i++) {
      const p = xy(points[i], a), t = Math.max(0, Math.min(1, (p[0] * b[0] + p[1] * b[1]) / (length2 || 1)));
      const d = Math.hypot(p[0] - b[0] * t, p[1] - b[1] * t);
      if (d > distance) { distance = d; index = i; }
    }
    if (distance > toleranceM) { keep.add(index); pending.push([first, index], [index, last]); }
  }
  return [...keep].sort((a, b) => a - b).map(i => points[i]);
}
function topoPolyline(points: Point[]) { return JSON.stringify({ paths: [points.map(p => [Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))])] }); }
export function topoQuery(points: Point[]) {
  const lat = points[0].lat, lon = points[0].lon;
  // A fixed local display extent makes 10 screen pixels approximately 10 m.
  const dx = 500 / (111320 * Math.cos(lat * Math.PI / 180)), dy = 500 / 111320;
  return new URLSearchParams({ geometry: topoPolyline(points), geometryType: "esriGeometryPolyline", sr: "4326",
    layers: "all:" + TLM_ROADS + "," + TLM_HIKING, imageDisplay: "1000,1000,96",
    mapExtent: [lon - dx, lat - dy, lon + dx, lat + dy].join(","), tolerance: "10",
    returnGeometry: "true", geometryFormat: "geojson", lang: "de", limit: "200" });
}
export function routeWithinSwitzerland(points: Point[]) {
  return points.length >= 2 && points.every(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat >= 45.7 && p.lat <= 47.95 && p.lon >= 5.9 && p.lon <= 10.6)
    && points.slice(1).reduce((sum, p, i) => sum + haversineKm(points[i], p), 0) < 350;
}
export function sectionGeometry(route: CyclingRoute, startM: number, endM: number): CyclePoint[] {
  return route.points.filter(p => p.distanceM >= startM - .1 && p.distanceM <= endM + .1);
}
