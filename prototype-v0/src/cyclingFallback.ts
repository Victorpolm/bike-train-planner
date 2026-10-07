import type { CyclingPace } from "./cyclingPace.ts";
import { parseCyclingRoute, type CyclingRoute } from "./cycling.ts";
import { streetRoute } from "./streetRouting.ts";
import type { Point } from "./routing.ts";


export function parseFallbackRoute(data: unknown, from: Point, to: Point, pace?: CyclingPace): CyclingRoute {
  const reply = data as { code?: string; routes?: { distance?: number; duration?: number; geometry?: unknown;
    legs?: { steps?: { mode?: string }[] }[] }[] };
  const route = reply?.routes?.[0];
  const steps = route?.legs?.flatMap(leg => leg.steps ?? []) ?? [];
  // The bicycle profile can include ferries, trains or carrying the bike on
  // steps. Those cannot silently become a cycling leg in this app.
  if (reply?.code !== "Ok" || !steps.length || steps.some(step => step.mode !== "cycling")) {
    throw new Error("The backup cycling service did not return a bicycle-only path.");
  }
  const parsed = parseCyclingRoute({ features: [{ geometry: route!.geometry,
    properties: { "track-length": route!.distance, "total-time": route!.duration } }] }, from, to, Date.now(), pace);
  return { ...parsed, source: "OSRM" };
}

// Walking and backup cycling share the same provider-wide rate limit.
export async function fallbackCycling(from: Point, to: Point, signal: AbortSignal, timeoutMs: number, fetcher: typeof fetch = fetch, pace?: CyclingPace) {
  return parseFallbackRoute(await streetRoute("bike", from, to, signal, timeoutMs, fetcher), from, to, pace);
}
