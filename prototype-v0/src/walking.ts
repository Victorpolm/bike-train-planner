import { cyclingKey, parseCyclingRoute, samePlace, type CyclePoint } from "./cycling.ts";
import { streetRoute } from "./streetRouting.ts";
import { beginTiming } from "./searchTiming.ts";
import type { Place, Point, TransitLeg } from "./routing.ts";

export const WALKING_SPEED_KMH = 4.5;
export const DEFAULT_WALKING_MINUTES = 30;
type Located = Point & { id?: string; stopId?: string; name?: string; label?: string };
export type WalkingRoute = { from: Located; to: Located; minutes: number; distanceKm: number; points: CyclePoint[];
  startGapM: number; endGapM: number; source: "OSRM foot" | "same place"; fetchedAt: number };
export const zeroWalking = (from: Located, to: Located): WalkingRoute => ({ from, to, minutes: 0, distanceKm: 0,
  points: [], startGapM: 0, endGapM: 0, source: "same place", fetchedAt: Date.now() });
export function cachedWalking(routes: ReadonlyMap<string, WalkingRoute | null> | undefined, from: Located, to: Located) {
  if (samePlace(from, to)) return zeroWalking(from, to);
  return routes?.get(cyclingKey(from, to)) ?? [...routes?.values() ?? []].find(r => r && samePlace(r.from, from) && samePlace(r.to, to)) ?? undefined;
}
export function parseWalkingRoute(data: unknown, from: Located, to: Located): WalkingRoute {
  const reply = data as { code?: string; routes?: { distance?: number; duration?: number; geometry?: unknown;
    legs?: { steps?: { mode?: string }[] }[] }[] };
  const route = reply?.routes?.[0], steps = route?.legs?.flatMap(leg => leg.steps ?? []) ?? [];
  if (reply?.code !== "Ok" || !steps.length || steps.some(s => s.mode !== "walking"))
    throw new Error("No walking-only street path was returned.");
  // Reuse strict geometry/distance/snap validation, not the bicycle timing or
  // terrain classification. A walking link never consumes the cycling budget.
  const checked = parseCyclingRoute({ features: [{ geometry: route!.geometry,
    properties: { "track-length": route!.distance, "total-time": route!.duration } }] }, from, to);
  const minutes = Math.ceil(Math.max(route!.duration! / 60, checked.distanceKm / WALKING_SPEED_KMH * 60) + checked.connectorMinutes);
  return { from, to, minutes, distanceKm: checked.distanceKm, points: checked.points,
    startGapM: checked.startGapM, endGapM: checked.endGapM, source: "OSRM foot", fetchedAt: Date.now() };
}
export function walkingLeg(route: WalkingRoute, departure: number, from: Located | Place = route.from, to: Located | Place = route.to): TransitLeg {
  return { mode: "walk", from: from.label ?? ("name" in from ? from.name : undefined) ?? "Starting point",
    to: to.label ?? ("name" in to ? to.name : undefined) ?? "Destination", fromPoint: from, toPoint: to,
    fromId: from.stopId ?? ("id" in from ? from.id : undefined), toId: to.stopId ?? ("id" in to ? to.id : undefined),
    departure: new Date(departure), arrival: new Date(departure + route.minutes * 60_000), service: "Walk",
    serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null,
    geometry: route.points, geometryKind: "path", walkingRoute: route };
}
export class WalkingClient {
  readonly routes = new Map<string, WalkingRoute | null>();
  readonly warnings = new Set<string>();
  requests = 0;
  private pending = new Map<string, Promise<WalkingRoute | null>>();
  readonly signal: AbortSignal;
  private fetcher: typeof fetch;
  constructor(signal: AbortSignal, fetcher: typeof fetch = fetch) { this.signal = signal; this.fetcher = fetcher; }
  fork(signal: AbortSignal) {
    const client = new WalkingClient(signal, this.fetcher);
    for (const [key, route] of this.routes) if (route) client.routes.set(key, route);
    return client;
  }
  route(from: Located, to: Located): Promise<WalkingRoute | null> {
    this.signal.throwIfAborted();
    const cached = cachedWalking(this.routes, from, to);
    if (cached) return Promise.resolve(cached);
    const key = cyclingKey(from, to);
    if (this.routes.has(key)) return Promise.resolve(null);
    if (this.pending.has(key)) return this.pending.get(key)!;
    if (this.requests >= 20) {
      this.warnings.add("Some walking paths could not be checked within the search limit.");
      return Promise.resolve(null);
    }
    this.requests++;
    const endTiming = beginTiming(this.signal, "walking");
    const task = (async () => {
      try {
        const route = parseWalkingRoute(await streetRoute("foot", from, to, this.signal, 15000, this.fetcher), from, to);
        this.routes.set(key, route); return route;
      } catch {
        this.signal.throwIfAborted(); this.routes.set(key, null);
        this.warnings.add("A walking path could not be checked. Only returned pedestrian routes are used.");
        return null;
      } finally { this.pending.delete(key); endTiming(); }
    })();
    this.pending.set(key, task); return task;
  }
}
