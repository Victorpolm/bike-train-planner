export const BIKE_SPEED_KMH = 15;
export const MAX_BIKE_MINUTES = 20;
export const MAX_BIKE_DISTANCE_KM =
  (BIKE_SPEED_KMH * MAX_BIKE_MINUTES) / 60;
export const STATION_BUFFER_MINUTES = 3;

export type Point = {
  lat: number;
  lon: number;
};

export type Place = Point & {
  label: string;
  stopId?: string;
  kind?: string;
};

export type Station = Point & {
  id: string;
  name: string;
  distanceKm: number;
  bikeMinutes: number;
  kind?: string;
};

export type Journey = {
  id: string;
  startTime: Date;
  originStation: Station;
  destinationStation: Station;
  departure: Date;
  arrival: Date;
  trainMinutes: number;
  waitMinutes: number;
  totalMinutes: number;
  changes: number;
  services: string[];
  transitLegs: TransitLeg[];
  legsIncludeEndpoints?: boolean;
  waypoints?: { place: Place; arrival: Date }[];
};

export type TransitLeg = {
  mode: "transit" | "walk" | "unknown" | "bike";
  from: string | null;
  to: string | null;
  departure: Date | null;
  arrival: Date | null;
  departurePlatform: string | null;
  arrivalPlatform: string | null;
  service: string;
  serviceName: string | null;
  direction: string | null;
  fromId?: string;
  toId?: string;
  fromPoint?: Point;
  toPoint?: Point;
  geometry?: Point[];
};

export function haversineKm(a: Point, b: Point): number {
  const radiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.sqrt(h));
}

export function cyclingMinutes(distanceKm: number): number {
  return distanceKm <= 0.001 ? 0 : Math.ceil((distanceKm / BIKE_SPEED_KMH) * 60);
}

export type CyclingComparison = {
  distanceKm: number;
  minutes: number;
  arrival: Date;
};

// A reference estimate, independent of transit budgets and category selection.
// This is deliberately not represented as a public-transport Journey.
export function cyclingOnly(origin: Place, destination: Place, start: Date, waypoints: Place[] = []): CyclingComparison {
  const points = [origin, ...waypoints, destination];
  const distances = points.slice(1).map((point, i) => points[i].stopId && points[i].stopId === point.stopId
    ? 0 : haversineKm(points[i], point));
  const distanceKm = distances.reduce((sum, distance) => sum + distance, 0);
  const minutes = distances.reduce((sum, distance) => sum + cyclingMinutes(distance), 0);
  return { distanceKm, minutes, arrival: new Date(start.getTime() + minutes * 60_000) };
}

export function samplePoints(point: Point): Point[] {
  const radiusKm = 2.5;
  const latDelta = radiusKm / 111.32;
  const lonDelta = radiusKm / (111.32 * Math.cos((point.lat * Math.PI) / 180));

  return [
    point,
    { lat: point.lat + latDelta, lon: point.lon },
    { lat: point.lat - latDelta, lon: point.lon },
    { lat: point.lat, lon: point.lon + lonDelta },
    { lat: point.lat, lon: point.lon - lonDelta },
  ];
}

export function formatMinutes(minutes: number): string {
  minutes = Math.ceil(minutes);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`;
}

export function parseDurationMinutes(duration: string): number {
  const match = duration.match(/(?:(\d+)d)?(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return 0;
  return (
    Number(match[1] ?? 0) * 24 * 60 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Math.round(Number(match[4]) / 60)
  );
}
