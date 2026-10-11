import { haversineKm, type Point } from "./routing.ts";

export const OFFICIAL_CYCLING_ATTRIBUTION = "Bundesamt für Strassen, Kanton, Stiftung SchweizMobil";
export const OFFICIAL_CYCLING_MAP = "https://map.geo.admin.ch/?layers=ch.astra.veloland,ch.astra.veloland-sperrungen_umleitungen";
export const OFFICIAL_ROUTE_LAYER = "ch.astra.veloland";
export const OFFICIAL_CLOSURE_LAYER = "ch.astra.veloland-sperrungen_umleitungen";
export type OfficialRoute = { id: string; number: number; title: string; url: string; parts: Point[][] };
export type OfficialClosure = { id: string; kind: "closed_way" | "detour"; parts: Point[][]; duration: string; url: string };
export type OfficialRouteReply = { routes: OfficialRoute[]; checkedAt: string; incomplete: boolean };
export type OfficialClosureReply = { closures: OfficialClosure[]; checkedAt: string; incomplete: boolean };
export type OfficialSection = { id: string; route: OfficialRoute; points: Point[]; distanceKm: number; connectorKm: number };
export type OfficialRouteEvidence = { number: number; title: string; url: string; sectionKm: number; matchedPercent: number; checkedAt: string; closuresCheckedAt: string };
export function validOfficialEvidence(value: unknown): value is OfficialRouteEvidence {
  const e = value as OfficialRouteEvidence;
  return !!e && Number.isInteger(e.number) && e.number > 0 && e.number < 10000
    && typeof e.title === "string" && e.title.length <= 240 && typeof e.url === "string"
    && new RegExp(`^https://schweizmobil\\.ch/en/cycling-in-switzerland/route-${e.number}(?:/stage-[1-9]\\d{0,2})?$`).test(e.url)
    && Number.isFinite(e.sectionKm) && e.sectionKm >= .5 && e.sectionKm <= 80
    && Number.isFinite(e.matchedPercent) && e.matchedPercent >= 95 && e.matchedPercent <= 100
    && typeof e.checkedAt === "string" && Number.isFinite(Date.parse(e.checkedAt))
    && typeof e.closuresCheckedAt === "string" && Number.isFinite(Date.parse(e.closuresCheckedAt));
}
export type Bounds = [number, number, number, number];
const swissPoint = (p: Point) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat >= 45.7 && p.lat <= 47.95 && p.lon >= 5.9 && p.lon <= 10.6;
export function lineKm(points: readonly Point[]) { return points.slice(1).reduce((sum, p, i) => sum + haversineKm(points[i], p), 0); }
export function officialBounds(points: readonly Point[], margin = .025): Bounds {
  if (!points.length || points.some(p => !swissPoint(p))) throw new Error("Official cycling suggestions currently cover Switzerland only.");
  const bounds: Bounds = [Math.max(5.9, Math.floor((Math.min(...points.map(p => p.lon)) - margin) * 50) / 50),
    Math.max(45.7, Math.floor((Math.min(...points.map(p => p.lat)) - margin) * 50) / 50),
    Math.min(10.6, Math.ceil((Math.max(...points.map(p => p.lon)) + margin) * 50) / 50),
    Math.min(47.95, Math.ceil((Math.max(...points.map(p => p.lat)) + margin) * 50) / 50)];
  if (!validOfficialBounds(bounds)) throw new Error("Choose a shorter cycling section for official-route suggestions (up to a 120 km search area).");
  return bounds;
}
export function validOfficialBounds(v: unknown): v is Bounds {
  if (!Array.isArray(v) || v.length !== 4 || !v.every(n => typeof n === "number" && Number.isFinite(n))) return false;
  const [w, s, e, n] = v;
  return w < e && s < n && swissPoint({ lon: w, lat: s }) && swissPoint({ lon: e, lat: n }) && haversineKm({ lon: w, lat: s }, { lon: e, lat: n }) <= 120;
}
function parts(geometry: any): Point[][] {
  const raw = geometry?.type === "LineString" ? [geometry.coordinates] : geometry?.type === "MultiLineString" ? geometry.coordinates : [];
  if (!Array.isArray(raw) || raw.length > 100) throw new Error("Unsupported official geometry");
  let count = 0;
  return raw.map((line: unknown) => {
    if (!Array.isArray(line) || line.length < 2 || (count += line.length) > 50000) throw new Error("Invalid official geometry");
    return line.map(c => {
      if (!Array.isArray(c) || c.length < 2 || typeof c[0] !== "number" || typeof c[1] !== "number") throw new Error("Invalid official coordinate");
      const p = { lon: c[0], lat: c[1] }; if (!swissPoint(p)) throw new Error("Official coordinate outside coverage"); return p;
    });
  });
}
const short = (s: unknown) => typeof s === "string" ? s.replace(/<[^>]*>/g, "").slice(0, 240) : "";
export function parseOfficialRoutes(data: any, checkedAt: string, limit = 30): OfficialRouteReply {
  if (!Array.isArray(data?.results) || data.results.length > 100) throw new Error("Invalid official-route response");
  let rejected = false, vertices = 0;
  const routes = data.results.flatMap((f: any): OfficialRoute[] => {
    try {
      const p = f.properties, id = String(f.featureId ?? f.id ?? ""), number = p?.chmobil_route_number;
      if (f.layerBodId !== OFFICIAL_ROUTE_LAYER || !/^\d{1,4}(?:\.\d{1,3})?$/.test(id) || !Number.isInteger(number) || number < 1 || number > 9999 || !short(p.chmobil_title)) throw new Error("Invalid route identity");
      const geometry = parts(f.geometry); if (!geometry.length) throw new Error("Missing geometry");
      const count = geometry.reduce((sum, line) => sum + line.length, 0);
      if (vertices + count > 30000) throw new Error("Bounded geometry budget reached"); vertices += count;
      const stage = id.includes(".") ? Number(id.split(".")[1]) : 0;
      return [{ id, number, title: short(p.chmobil_title), url: `https://schweizmobil.ch/en/cycling-in-switzerland/route-${number}` + (p.chmobil_has_segment === true && stage > 0 ? `/stage-${stage}` : ""), parts: geometry }];
    } catch { rejected = true; return []; }
  });
  return { routes, checkedAt, incomplete: rejected || data.results.length >= limit };
}
export function parseOfficialClosures(data: any, checkedAt: string, limit = 100): OfficialClosureReply {
  if (!Array.isArray(data?.results) || data.results.length > 200) throw new Error("Invalid closure response");
  let rejected = false, vertices = 0;
  const closures = data.results.flatMap((f: any): OfficialClosure[] => {
    try {
      const p = f.properties, id = String(f.featureId ?? f.id ?? ""), kind = p?.sperrungen_type;
      if (f.layerBodId !== OFFICIAL_CLOSURE_LAYER || !/^[\w.-]{1,150}$/.test(id) || !["closed_way", "detour"].includes(kind)) throw new Error("Unknown closure role");
      const geometry = parts(f.geometry); if (!geometry.length) throw new Error("Missing closure geometry");
      const count = geometry.reduce((sum, line) => sum + line.length, 0);
      if (vertices + count > 30000) throw new Error("Bounded closure geometry budget reached"); vertices += count;
      return [{ id, kind, parts: geometry, duration: short(p.duration_en ?? p.duration_de),
        url: `https://api3.geo.admin.ch/rest/services/ech/MapServer/${OFFICIAL_CLOSURE_LAYER}/${encodeURIComponent(id)}/htmlPopup?lang=en` }];
    } catch { rejected = true; return []; }
  });
  return { closures, checkedAt, incomplete: rejected || data.results.length >= limit };
}
function projectPoint(p: Point, a: Point, b: Point) {
  const scale = Math.cos(p.lat * Math.PI / 180), x = (b.lon - a.lon) * scale, y = b.lat - a.lat;
  const t = x || y ? Math.max(0, Math.min(1, ((p.lon - a.lon) * scale * x + (p.lat - a.lat) * y) / (x * x + y * y))) : 0;
  const point = { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) };
  return { point, t, km: haversineKm(p, point) };
}
function nearest(p: Point, line: readonly Point[]) {
  let best = { point: line[0], position: 0, km: Infinity };
  for (let i = 1; i < line.length; i++) { const hit = projectPoint(p, line[i - 1], line[i]); if (hit.km < best.km) best = { point: hit.point, position: i - 1 + hit.t, km: hit.km }; }
  return best;
}
export function officialSections(routes: readonly OfficialRoute[], from: Point, to: Point): OfficialSection[] {
  const direct = haversineKm(from, to), maxConnector = Math.min(6, Math.max(1, direct * .3));
  const candidates = routes.flatMap(route => route.parts.flatMap((line, part): OfficialSection[] => {
    const a = nearest(from, line), b = nearest(to, line);
    if (a.km > maxConnector || b.km > maxConnector || Math.abs(a.position - b.position) < .001) return [];
    const lo = Math.min(a.position, b.position), hi = Math.max(a.position, b.position);
    const between = line.filter((_, i) => i > lo && i < hi);
    const points = a.position < b.position ? [a.point, ...between, b.point] : [a.point, ...between.reverse(), b.point];
    const km = lineKm(points), progress = direct - a.km - b.km;
    if (km < .5 || km > 80 || progress < .3 || km > Math.max(5, direct * 2.5)) return [];
    // Never connect separate MultiLineString components or infer a allowed direction.
    // The later road-route check must validate this orientation and close geometric fit.
    return [{ id: `${route.id}:${part}:${a.position < b.position ? "f" : "r"}`, route, points, distanceKm: km, connectorKm: a.km + b.km }];
  })).sort((a, b) => a.connectorKm - b.connectorKm || a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
  const seen = new Set<number>();
  return candidates.filter(c => { if (seen.has(c.route.number)) return false; seen.add(c.route.number); return true; }).slice(0, 3);
}
function sampledLine(points: readonly Point[], spacingKm = .1): Point[] {
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const steps = Math.max(1, Math.ceil(haversineKm(points[i - 1], points[i]) / spacingKm));
    for (let n = 1; n <= steps; n++) result.push({ lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * n / steps,
      lon: points[i - 1].lon + (points[i].lon - points[i - 1].lon) * n / steps });
  }
  return result;
}
function nearLine(line: readonly Point[], toleranceKm: number) {
  const grid = new Map<string, [Point, Point][]>(), cell = .002;
  const fine = sampledLine(line, .2);
  for (let i = 1; i < fine.length; i++) {
    const a = fine[i - 1], b = fine[i];
    for (let x = Math.floor(Math.min(a.lon, b.lon) / cell); x <= Math.floor(Math.max(a.lon, b.lon) / cell); x++)
      for (let y = Math.floor(Math.min(a.lat, b.lat) / cell); y <= Math.floor(Math.max(a.lat, b.lat) / cell); y++) {
        const key = `${x}:${y}`, entries = grid.get(key) ?? []; entries.push([a, b]); grid.set(key, entries);
      }
  }
  return (p: Point) => {
    const x = Math.floor(p.lon / cell), y = Math.floor(p.lat / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      if (grid.get(`${x + dx}:${y + dy}`)?.some(([a, b]) => projectPoint(p, a, b).km <= toleranceKm)) return true;
    return false;
  };
}
/** Distance-weighted, bidirectional corridor check rejects major shortcuts and diversions. */
export function lineMatch(a: readonly Point[], b: readonly Point[], toleranceKm = .06) {
  if (a.length < 2 || b.length < 2) return 0;
  const samples = sampledLine(a), nearby = nearLine(b, toleranceKm); let total = 0, matched = 0;
  for (let i = 1; i < samples.length; i++) { const km = haversineKm(samples[i - 1], samples[i]); total += km;
    const middle = { lat: (samples[i - 1].lat + samples[i].lat) / 2, lon: (samples[i - 1].lon + samples[i].lon) / 2 };
    if (nearby(middle)) matched += km; }
  return total ? matched / total : 0;
}
export function overlapsClosure(lines: readonly (readonly Point[])[], closures: readonly OfficialClosure[]) {
  // Crossing a short closure matters too; sample the shorter line in both directions.
  const indexes = lines.map(line => nearLine(line, .025));
  return closures.find(c => c.kind === "closed_way" && c.parts.some(part => {
    const samples = sampledLine(part, .025); return indexes.some(nearby => samples.some(nearby));
  }));
}
/** Keep bends where possible; final corridor verification, not these guides, proves the fit. */
export function officialGuides(points: readonly Point[]): Point[] {
  if (points.length <= 50) return [...points];
  const indices = new Set([0, points.length - 1]);
  while (indices.size < 50) {
    const sorted = [...indices].sort((a, b) => a - b); let best = -1, error = 0;
    for (let s = 1; s < sorted.length; s++) for (let i = sorted[s - 1] + 1; i < sorted[s]; i++) {
      const km = projectPoint(points[i], points[sorted[s - 1]], points[sorted[s]]).km;
      if (km > error) { error = km; best = i; }
    }
    if (best < 0 || error < .03) break; indices.add(best);
  }
  return [...indices].sort((a, b) => a - b).map(i => points[i]);
}
