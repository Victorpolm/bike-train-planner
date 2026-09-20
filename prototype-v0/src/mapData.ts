import type { Stop } from "./model.ts";
import type { Journey, Point, Station } from "./routing.ts";
import { busCarriage, busCarriageLabel } from "./busCarriage.ts";

export type ExploredStop = Stop & { notes: string[] };
export type StopEvent = {
  action: "Board" | "Alight";
  boarding: number;
  service: string;
  time: Date | null;
  platform: string | null;
  bicycle?: string;
};
export type JourneyStop = Point & { id: string; name: string; number: number; events: StopEvent[] };

// Candidate roles can overlap. Timetable stops are observed search points,
// not a claim that every service at every station was explored.
export function exploredStops(stops: Iterable<Stop>, origins: Station[], destinations: Station[]): ExploredStop[] {
  const result = new Map<string, ExploredStop>();
  const add = (stop: Stop, note: string) => {
    const entry = result.get(stop.id) ?? { ...stop, notes: [] };
    entry.kind ??= stop.kind;
    if (!entry.notes.includes(note)) entry.notes.push(note);
    result.set(stop.id, entry);
  };
  for (const stop of stops) add(stop, "Observed in the search network");
  for (const stop of origins) add(stop, `Departure candidate · ≈ ${stop.bikeMinutes} min cycling from origin`);
  for (const stop of destinations) add(stop, `Arrival candidate · ≈ ${stop.bikeMinutes} min cycling to destination`);
  return [...result.values()];
}

// Only boarding/alighting events get numbered pins. Passing intermediate
// stations while staying aboard must not look like additional transfers.
export function journeyStops(journey: Journey): JourneyStop[] {
  const result = new Map<string, JourneyStop>();
  let boarding = 0;
  const add = (point: Point | undefined, id: string | undefined, name: string | null, event: StopEvent) => {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
    const key = id ?? `${point.lat},${point.lon}:${name ?? ""}`;
    const entry = result.get(key) ?? { ...point, id: key, name: name ?? "Unnamed stop", number: result.size + 1, events: [] };
    entry.events.push(event);
    result.set(key, entry);
  };
  for (const leg of journey.transitLegs) {
    if (leg.mode !== "transit") continue;
    boarding++;
    const rule = busCarriage(leg);
    const event = { boarding, service: leg.service, ...(rule ? { bicycle: `${rule.operator}: ${busCarriageLabel(rule)}` } : {}) };
    add(leg.fromPoint ?? (leg.fromId === journey.originStation.id ? journey.originStation : undefined),
      leg.fromId, leg.from, { ...event, action: "Board", time: leg.departure, platform: leg.departurePlatform });
    add(leg.toPoint ?? (leg.toId === journey.destinationStation.id ? journey.destinationStation : undefined),
      leg.toId, leg.to, { ...event, action: "Alight", time: leg.arrival, platform: leg.arrivalPlatform });
  }
  return [...result.values()];
}
