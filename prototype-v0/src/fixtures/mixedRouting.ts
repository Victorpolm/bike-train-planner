import { emptyNetwork, DEFAULT_OPTIONS, type Stop } from "../model.ts";
import { cyclingKey, parseCyclingRoute, zeroCycling } from "../cycling.ts";
import { haversineKm, type Place, type TransitLeg } from "../routing.ts";
import type { CyclingPace } from "../cyclingPace.ts";

// Deterministic, synthetic Swiss geometry and services; never live timetable evidence.
export function mixedRoutingFixture(pace: CyclingPace = { flatSpeedKmh: 25, electricAssist: false }, departures = 6) {
  const network = emptyNetwork(); network.cycling = new Map();
  const start = new Date("2026-10-01T08:00:00+02:00");
  const stops: Stop[] = [8.53, 8.56, 8.575, 8.60, 8.70, 8.78].map((lon, i) =>
    ({ id: `850000${i}`, name: `Fixture station ${i}`, lat: 47.38, lon }));
  stops.forEach(s => network.stops.set(s.id, s));
  const origin: Place = { label: "Fixture home", lat: 47.38, lon: 8.52 };
  const destination: Place = { label: "Fixture destination", lat: 47.38, lon: 8.79 };
  const points = [origin, ...stops, destination];
  for (const a of points) for (const b of points) {
    const distance = haversineKm(a, b) * 1000;
    const route = distance < 1 ? zeroCycling(a, b) : parseCyclingRoute({ features: [{
      geometry: { type: "LineString", coordinates: [[a.lon, a.lat, 400], [b.lon, b.lat, 400]] },
      properties: { "track-length": distance, "total-time": distance / (15 / 3.6) },
    }] }, a, b, start.getTime(), pace);
    network.cycling.set(cyclingKey(a, b), route);
  }
  const patterns: [number, number, number, number, string, string][] = [
    [0, 1, 10, 18, "SBB", "IR"], [2, 5, 25, 40, "VBZ", "B"],
    [0, 5, 12, 65, "SBB", "IC"], [0, 3, 20, 35, "Unknown operator", "B"],
    [3, 5, 42, 55, "BLS", "RE"], [1, 4, 22, 45, "ABF", "B"], [4, 5, 50, 58, "RHB", "RE"],
  ];
  for (let repetition = 0; repetition < departures; repetition++) {
    for (const [from, to, dep, arr, operator, category] of patterns) {
      const departure = new Date(start.getTime() + (dep + repetition * 30) * 60_000);
      const arrival = new Date(start.getTime() + (arr + repetition * 30) * 60_000);
      const id = `${from}-${to}-${repetition}`;
      const leg: TransitLeg = { mode: "transit", from: stops[from].name, to: stops[to].name,
        fromId: stops[from].id, toId: stops[to].id, fromPoint: stops[from], toPoint: stops[to],
        departure, arrival, category, operator, service: `${category} ${repetition + 1}`, serviceName: id,
        direction: null, departurePlatform: null, arrivalPlatform: null };
      network.edges.set(id, { id, from: stops[from].id, to: stops[to].id, leg });
    }
  }
  return { network, origin, destination, start, options: { ...DEFAULT_OPTIONS, maxAccessMinutes: 15,
    maxEgressMinutes: 15, maxIntermediateMinutes: 15, maxBikeMinutes: 45, horizonMinutes: 180, cyclingPace: pace } };
}
