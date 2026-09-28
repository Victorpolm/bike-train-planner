import type { TransitLeg } from "./routing.ts";
import type { FareProfile } from "./fares.ts";

export type FareSegment = { from: string; to: string; departure: string; arrival: string; journeyRef?: string;
  fromName?: string; toName?: string; fromPoint?: { lat: number; lon: number }; toPoint?: { lat: number; lon: number } };
// Public timetable data, signed by our server. Contains no API credentials.
export type RetainedFareSource = { id: string; payload: string };
export type FareQuery = { segments: FareSegment[]; passenger: FareProfile["passenger"]; bicycle: boolean;
  sources?: RetainedFareSource[] };
export type FareOffer = { chf: number; product: string; productId: string };
export type OnlineFare = { status: "quoted" | "partial" | "unavailable"; checked: string;
  passenger: FareOffer | null; bicycle: FareOffer | null; reason?: string; environment: "test";
  itinerarySource?: "retained" | "assembled" | "lookup" };

function selectedSources(transit: TransitLeg[], walks: TransitLeg[]): RetainedFareSource[] | undefined {
  if (transit.some(l => !l.fareSources?.length)) return undefined;
  // A walking connection can come from a third provider response, independent
  // of either selected service. Keep its evidence when combining graph edges.
  const legs = [...transit, ...walks.filter(l => l.fareSources?.length)];
  const candidates = [...new Map(legs.flatMap(l => l.fareSources!).map(s => [s.id, s])).values()];
  const uncovered = new Set(legs), selected: RetainedFareSource[] = [];
  // Prefer a source containing the whole selected itinerary. Otherwise send
  // each source once, even if several selected legs share its original trip.
  while (uncovered.size) {
    const coverage = (s: RetainedFareSource) => [...uncovered].filter(l => l.fareSources!.some(x => x.id === s.id));
    candidates.sort((a, b) => coverage(b).length - coverage(a).length);
    const source = candidates.shift();
    if (!source || !coverage(source).length) return undefined;
    coverage(source).forEach(l => uncovered.delete(l)); selected.push(source);
  }
  return selected.length <= 8 ? selected : undefined;
}

export function fareQuery(legs: TransitLeg[], profile: FareProfile): FareQuery | null {
  const first = legs.findIndex(l => l.mode === "transit");
  const last = legs.reduce((n, l, i) => l.mode === "transit" ? i : n, -1);
  // A cycle between trains interrupts the fare journey. Do not silently quote
  // a different all-transit route or sum overlapping through tickets.
  if (first < 0 || legs.slice(first, last + 1).some(l => l.mode === "bike" || l.mode === "unknown")) return null;
  const transit = legs.filter(l => l.mode === "transit");
  if (transit.length > 8 || transit.some(l => !l.fromId || !l.toId || !l.departure || !l.arrival)) return null;
  // Graph stops may also contain complete cycling routes and cache timestamps.
  // Send only coordinates: the extra data exceeded the server's request limit
  // and changed quote cache keys whenever station access was refined.
  const point = (p: TransitLeg["fromPoint"]) => p ? { lat: p.lat, lon: p.lon } : undefined;
  const sources = selectedSources(transit, legs.slice(first, last + 1).filter(l => l.mode === "walk"));
  return { segments: transit.map(l => ({ from: l.fromId!, to: l.toId!, departure: l.departure!.toISOString(),
    arrival: l.arrival!.toISOString(), fromName: l.from ?? undefined, toName: l.to ?? undefined,
    fromPoint: point(l.fromPoint), toPoint: point(l.toPoint), ...(l.ojp ? { journeyRef: l.ojp.journeyRef } : {}) })),
    passenger: profile.passenger, bicycle: !profile.annualBikePass, ...(sources ? { sources } : {}) };
}
