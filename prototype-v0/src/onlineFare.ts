import type { TransitLeg } from "./routing.ts";
import type { FareProfile } from "./fares.ts";

export type FareSegment = { from: string; to: string; departure: string; arrival: string; journeyRef?: string;
  fromName?: string; toName?: string; fromPoint?: { lat: number; lon: number }; toPoint?: { lat: number; lon: number } };
export type FareQuery = { segments: FareSegment[]; passenger: FareProfile["passenger"]; bicycle: boolean };
export type FareOffer = { chf: number; product: string; productId: string };
export type OnlineFare = { status: "quoted" | "partial" | "unavailable"; checked: string;
  passenger: FareOffer | null; bicycle: FareOffer | null; reason?: string; environment: "test" };

export function fareQuery(legs: TransitLeg[], profile: FareProfile): FareQuery | null {
  const first = legs.findIndex(l => l.mode === "transit");
  const last = legs.reduce((n, l, i) => l.mode === "transit" ? i : n, -1);
  // A cycle between trains interrupts the fare journey. Do not silently quote
  // a different all-transit route or sum overlapping through tickets.
  if (first < 0 || legs.slice(first, last + 1).some(l => l.mode === "bike" || l.mode === "unknown")) return null;
  const transit = legs.filter(l => l.mode === "transit");
  if (transit.length > 8 || transit.some(l => !l.fromId || !l.toId || !l.departure || !l.arrival)) return null;
  return { segments: transit.map(l => ({ from: l.fromId!, to: l.toId!, departure: l.departure!.toISOString(),
    arrival: l.arrival!.toISOString(), fromName: l.from ?? undefined, toName: l.to ?? undefined,
    fromPoint: l.fromPoint, toPoint: l.toPoint, ...(l.ojp ? { journeyRef: l.ojp.journeyRef } : {}) })),
    passenger: profile.passenger, bicycle: !profile.annualBikePass };
}
