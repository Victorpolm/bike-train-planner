import type { Point } from "./routing.ts";

// Group symbols in screen space only. Source identities and closest calculations
// always use the original records, independently of grouping and draw limits.
export function clusterAmenities<T extends Point>(facilities: readonly T[], project: (p: T) => { x: number; y: number }, cellSize = 52) {
  const cells = new Map<string, { lat: number; lon: number; facilities: T[] }>();
  for (const facility of facilities) {
    const point = project(facility), key = `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`;
    const group = cells.get(key) ?? { lat: 0, lon: 0, facilities: [] };
    group.facilities.push(facility); group.lat += facility.lat; group.lon += facility.lon; cells.set(key, group);
  }
  return [...cells.values()].map(group => ({ ...group, lat: group.lat / group.facilities.length, lon: group.lon / group.facilities.length }));
}
