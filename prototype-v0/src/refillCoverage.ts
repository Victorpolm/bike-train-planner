import { haversineKm, type Point } from "./routing.ts";
import { amenityRestricted, type Amenity } from "./osmAmenities.ts";
import type { DetourStage } from "./cyclingDetour.ts";
import { parkingAlongRoute, parkingIndex } from "./parkingMap.ts";
import { visitHours } from "./facilityHours.ts";

function project(point: Point, path: readonly Point[]) {
  let travelled = 0, closest = Infinity, alongKm = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], length = haversineKm(a, b);
    if (!Number.isFinite(length)) return null;
    const scale = Math.cos(point.lat * Math.PI / 180), x = (b.lon - a.lon) * scale, y = b.lat - a.lat;
    const t = Math.max(0, Math.min(1, (((point.lon - a.lon) * scale) * x + (point.lat - a.lat) * y) / (x * x + y * y || 1)));
    const gapKm = haversineKm(point, { lat: a.lat + t * (b.lat - a.lat), lon: a.lon + t * (b.lon - a.lon) });
    if (gapKm < closest) { closest = gapKm; alongKm = travelled + t * length; }
    travelled += length;
  }
  return travelled ? { alongKm, gapKm: closest, totalKm: travelled } : null;
}
export function refillCoverage(stages: readonly DetourStage[], facilities: readonly Amenity[], radiusM: number) {
  if (!Number.isFinite(radiusM) || radiusM <= 0) return [];
  const eligible = facilities.filter(f => f.categories.includes("water") && f.potable === "yes" && !amenityRestricted(f, "water"));
  const index = parkingIndex(eligible);
  return stages.flatMap(stage => {
    const path = stage.route.points;
    if (path.length < 2 || stage.route.distanceKm < .01) return [];
    const nearby = parkingAlongRoute(index, { key: stage.id, incomplete: false, segments: path.slice(1).map((p, i) => [path[i], p]) }, radiusM);
    const candidates = nearby.flatMap(facility => {
      const p = project(facility, path); if (!p || p.gapKm * 1000 > radiusM) return [];
      const fraction = p.alongKm / p.totalKm, at = new Date(+stage.departure + fraction * stage.originalMinutes * 60000);
      const hours = visitHours(facility.tags.opening_hours, facility.tags["drinking_water:seasonal"] ?? facility.tags.seasonal, at);
      if (hours.state === "closed") return [];
      return [{ facility, alongKm: fraction * stage.route.distanceKm, gapM: p.gapKm * 1000, hours, at }];
    }).sort((a, b) => a.alongKm - b.alongKm || a.facility.id.localeCompare(b.facility.id));
    const points = [0, ...candidates.map(c => c.alongKm), stage.route.distanceKm];
    let gap = { fromKm: 0, toKm: 0, km: 0 };
    for (let i = 1; i < points.length; i++) if (points[i] - points[i - 1] > gap.km) gap = { fromKm: points[i - 1], toKm: points[i], km: points[i] - points[i - 1] };
    return [{ stage, candidates, gap }];
  });
}
