import { plan, type Progress, type SearchSession, type SearchUpdate } from "./api.ts";
import type { ModelMode } from "./model.ts";
import type { Journey } from "./routing.ts";

export function firstBoarding(journey: Journey): Date | undefined {
  return journey.transitLegs.find(leg => leg.mode === "transit")?.departure ?? undefined;
}

export function laterDepartureStart(journey: Journey, boardingMinutes: number): Date {
  const index = journey.transitLegs.findIndex(leg => leg.mode === "transit");
  const departure = firstBoarding(journey);
  if (!departure || !Number.isFinite(+departure)) throw new Error("This journey has no usable departure time.");
  const prefix = journey.transitLegs.slice(0, index).reduce((sum, leg) => sum +
    (leg.departure && leg.arrival ? Math.max(0, (+leg.arrival - +leg.departure) / 60_000) : 0), 0);
  const access = journey.legsIncludeEndpoints ? 0 : journey.originStation.bikeMinutes;
  return new Date(Math.max(+journey.startTime + 60_000, +departure - (access + prefix + boardingMinutes) * 60_000 + 60_000));
}

/** Keep earlier results in the UI; this page has its own departure and budget. */
export async function laterDepartures(session: SearchSession, journey: Journey, mode: ModelMode,
  signal: AbortSignal, progress: Progress, publish: SearchUpdate = () => {}) {
  if (session.options.arriveBy) throw new Error("Choose a later arrival time to search for later journeys.");
  const after = +firstBoarding(journey)!;
  const filter = (next: SearchSession) => {
    for (const group of [next, next.confirmed, next.allTransit]) for (const solution of [group?.baseline, group?.extended])
      if (solution) solution.journeys = solution.journeys.filter(j => +(firstBoarding(j) ?? 0) > after);
    return next;
  };
  return filter(await plan(session.origin, session.destination, mode, session.options, signal, progress,
    next => publish(filter(next)), { start: laterDepartureStart(journey, session.options.boardingMinutes),
      waypoints: session.waypoints, previous: session }));
}
