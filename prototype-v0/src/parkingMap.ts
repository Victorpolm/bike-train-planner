import type { BikeParking } from "./bikeParking.ts";
import type { CyclingRoute } from "./cycling.ts";
import { journeyStops } from "./mapData.ts";
import { haversineKm, type CyclingComparison, type Journey, type Point } from "./routing.ts";

export const PARKING_STYLES = {
  wheel: { color: "#b64432", label: "Wheel-only · wall loops / racks", detail: "Wheel-only equipment mapped: less preferred than frame-support stands." },
  frame: { color: "#19715c", label: "Frame support · stands", detail: "Frame-support stands mapped: preferable to wheel-only support." },
  other: { color: "#376f9e", label: "Other mapped type", detail: "Other parking type mapped; check the equipment details." },
  unknown: { color: "#747982", label: "Rack type unknown", detail: "Rack support is unknown; cover or capacity does not establish the rack type." },
} as const;
export function parkingStyle(facility: Pick<BikeParking, "parkingType">) {
  const types = (facility.parkingType ?? "").toLowerCase().split(";").map(t => t.trim()).filter(Boolean);
  // Mixed facilities containing wheel-only racks retain the warning colour.
  if (types.some(t => ["wall_loops", "rack", "ground_slots"].includes(t))) return PARKING_STYLES.wheel;
  if (types.length && types.every(t => ["stands", "wide_stands", "safe_loops"].includes(t))) return PARKING_STYLES.frame;
  const other = ["bollard", "anchors", "lockers", "shed", "building", "handlebar_holder", "two-tier", "floor", "informal", "tree", "streetpod", "crossbar"];
  if (types.length && types.every(t => [...other, "stands", "wide_stands", "safe_loops"].includes(t))) return PARKING_STYLES.other;
  return PARKING_STYLES.unknown;
}

export const PARKING_CORRIDOR_METRES = 100;
type Segment = readonly [Point, Point];
export type ParkingRouteScope = { key: string; segments: Segment[]; incomplete: boolean };
const valid = (p: Point | null | undefined): p is Point => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon)
  && Math.abs(p.lat) < 90 && Math.abs(p.lon) <= 180;

export function parkingRouteScope(input: {
  journey: Journey | null; cycling: CyclingComparison | null; bikeOnlySelected: boolean;
  origin: Point | null; destination: Point | null; waypoints: readonly Point[];
}): ParkingRouteScope | null {
  const { journey, cycling, bikeOnlySelected, origin, destination, waypoints } = input;
  if (!journey && !(bikeOnlySelected && cycling)) return null;
  const segments: Segment[] = [];
  let incomplete = false;
  const anchor = (p: Point | null | undefined) => { if (valid(p)) segments.push([p, p]); };
  const path = (points: readonly Point[]) => {
    let previous: Point | undefined, usable = false;
    for (const p of points) {
      if (!valid(p)) { previous = undefined; incomplete = true; continue; }
      if (previous) { segments.push([previous, p]); usable = true; }
      else anchor(p);
      previous = p;
    }
    return usable;
  };
  const cycle = (route: CyclingRoute | undefined, from?: Point | null, to?: Point | null) => {
    anchor(from); anchor(to);
    if (!route) { if (!valid(from) || !valid(to) || haversineKm(from, to) > .001) incomplete = true; return; }
    anchor(route.from); anchor(route.to);
    if (!path(route.points) && route.distanceKm > .001) incomplete = true;
    // Snapped endpoint connectors are estimated, not confirmed street paths.
    if (route.startGapM > 1 || route.endGapM > 1) incomplete = true;
  };
  anchor(origin); anchor(destination); waypoints.forEach(anchor);
  if (journey) {
    anchor(journey.originStation); anchor(journey.destinationStation);
    journeyStops(journey).forEach(anchor);
    if (!journey.legsIncludeEndpoints) {
      cycle(journey.originStation.cyclingRoute, origin, journey.originStation);
      cycle(journey.destinationStation.cyclingRoute, journey.destinationStation, destination);
    }
    for (const leg of journey.transitLegs) {
      if (leg.mode === "bike") cycle(leg.cyclingRoute, leg.fromPoint, leg.toPoint);
      if (leg.mode === "walk") {
        anchor(leg.fromPoint); anchor(leg.toPoint);
        if (leg.cyclingRoute) cycle(leg.cyclingRoute, leg.fromPoint, leg.toPoint);
        else if (leg.geometryKind !== "path" || !path(leg.geometry ?? [])) incomplete = true;
      }
      // No corridor along rail/bus lines or between disconnected journey legs.
    }
  } else {
    if (!cycling?.routes?.length) incomplete = true;
    cycling?.routes?.forEach(route => cycle(route));
  }
  const coordinates = (p: Point | null) => p ? [p.lat, p.lon] : null;
  return { key: JSON.stringify([journey?.id ?? "cycling-only", coordinates(origin), coordinates(destination),
    waypoints.map(coordinates), journey ? [] : cycling?.routes?.map(r => r.id)]), segments, incomplete };
}

// A small geographic grid avoids scanning the national dataset for every path
// segment. Selection is independent of viewport, zoom and the marker display cap.
const CELL_DEGREES = .01, METRES_PER_DEGREE = Math.PI * 6371000 / 180;
export function parkingIndex(facilities: readonly BikeParking[]) {
  const cells = new Map<string, BikeParking[]>();
  for (const facility of facilities) {
    if (!valid(facility)) continue;
    const key = `${Math.floor(facility.lat / CELL_DEGREES)},${Math.floor(facility.lon / CELL_DEGREES)}`;
    const cell = cells.get(key) ?? []; cell.push(facility); cells.set(key, cell);
  }
  return { facilities, cells };
}

export function parkingAlongRoute(index: ReturnType<typeof parkingIndex>, scope: ParkingRouteScope, radiusM = PARKING_CORRIDOR_METRES): BikeParking[] {
  if (!Number.isFinite(radiusM) || radiusM < 0) return [];
  const matched = new Set<BikeParking>(), latPad = radiusM / METRES_PER_DEGREE;
  for (const [a, b] of scope.segments) {
    if (!valid(a) || !valid(b)) continue;
    const lonScale = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180);
    const lonPad = latPad / Math.max(.001, Math.cos(Math.min(89.9, Math.max(Math.abs(a.lat), Math.abs(b.lat)) + latPad) * Math.PI / 180));
    const minY = Math.floor((Math.min(a.lat, b.lat) - latPad) / CELL_DEGREES), maxY = Math.floor((Math.max(a.lat, b.lat) + latPad) / CELL_DEGREES);
    const minX = Math.floor((Math.min(a.lon, b.lon) - lonPad) / CELL_DEGREES), maxX = Math.floor((Math.max(a.lon, b.lon) + lonPad) / CELL_DEGREES);
    const dx = (b.lon - a.lon) * lonScale * METRES_PER_DEGREE, dy = (b.lat - a.lat) * METRES_PER_DEGREE;
    const check = (facility: BikeParking) => {
      if (matched.has(facility) || !valid(facility)) return;
      const x = (facility.lon - a.lon) * lonScale * METRES_PER_DEGREE, y = (facility.lat - a.lat) * METRES_PER_DEGREE;
      const t = dx || dy ? Math.max(0, Math.min(1, (x * dx + y * dy) / (dx * dx + dy * dy))) : 0;
      if (Math.hypot(x - t * dx, y - t * dy) <= radiusM) matched.add(facility);
    };
    // Bound grid traversal if a future provider supplies an unusually long leg.
    if ((maxY - minY + 1) * (maxX - minX + 1) > 20000) index.facilities.forEach(check);
    else for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) index.cells.get(`${y},${x}`)?.forEach(check);
  }
  return index.facilities.filter(facility => matched.has(facility));
}
