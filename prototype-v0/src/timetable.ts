import { stopTime, transitLegsFromSections, type TransportSection, type TransportStop } from "./itinerary.ts";
import type { Edge, Network, Stop } from "./model.ts";

export function readStop(value?: TransportStop["station"]): Stop | null {
  const lat = value?.coordinate?.x, lon = value?.coordinate?.y;
  if (!value?.id || !value.name || typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lon !== "number" || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { id: value.id, name: value.name, lat, lon };
}

// Only known, timed boarding-to-alighting sections enter the search graph.
// Missing pass-stop times often denote non-stop passage, so they are never exits.
export function addSections(network: Network, sections?: TransportSection[]): number {
  let rejected = 0;
  for (const section of sections ?? []) {
    const from = readStop(section.departure?.station), to = readStop(section.arrival?.station);
    const departure = stopTime(section.departure, "departure"), arrival = stopTime(section.arrival, "arrival");
    if (!from || !to || !departure || !arrival || arrival < departure || (!section.journey && section.walk == null)) {
      rejected++; continue;
    }
    const checkpoints = section.journey?.passList ?? [];
    const exits = [...checkpoints.filter(stop => {
      const time = stopTime(stop, "arrival");
      return time && time > departure && time <= arrival;
    }), section.arrival!];
    for (const exit of exits) {
      const end = readStop(exit.station), endTime = stopTime(exit, "arrival");
      if (!end || end.id === from.id || !endTime || endTime < departure) continue;
      const [leg] = transitLegsFromSections([{ ...section, arrival: exit }]);
      leg.fromPoint = from; leg.toPoint = end;
      leg.geometry = [from, ...checkpoints.filter(p => {
        const t = stopTime(p, "arrival") ?? stopTime(p, "departure");
        return t && t > departure && t < endTime;
      }).map(p => readStop(p.station)).filter((p): p is Stop => !!p), end];
      const edge: Edge = { id: JSON.stringify([leg.mode, from.id, end.id, departure.getTime(), endTime.getTime(), leg.serviceName, leg.service, leg.operator, leg.category]),
        from: from.id, to: end.id, leg };
      network.stops.set(from.id, from); network.stops.set(end.id, end); network.edges.set(edge.id, edge);
    }
  }
  return rejected;
}

export type BoardJourney = NonNullable<TransportSection["journey"]> & { stop?: TransportStop };
export function addStationboard(network: Network, journeys: BoardJourney[]): number {
  let rejected = 0;
  for (const journey of journeys) {
    const departure = journey.stop ?? journey.passList?.[0];
    const time = stopTime(departure, "departure");
    if (!departure || !time) { rejected++; continue; }
    const arrival = [...(journey.passList ?? [])].reverse().find(s => {
      const t = stopTime(s, "arrival"); return t && t > time;
    });
    if (arrival) rejected += addSections(network, [{ departure, arrival, journey }]);
    else rejected++;
  }
  return rejected;
}
