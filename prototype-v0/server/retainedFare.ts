import { fareTrips, fareTripWalks, matchesFareSegment, type FareTrip } from "./fareProtocol.ts";
import { parseOjpConnections } from "../src/ojp.ts";
import type { RetainedFareSource } from "../src/onlineFare.ts";

export const MAX_FARE_SOURCE_BYTES = 256_000;
export const MAX_FARE_REQUEST_BYTES = 2_100_000;
const encode = (s: string) => new TextEncoder().encode(s);
const message = (payload: string) => encode("bike-train-planner/retained-ojp-trip/v1\n" + payload);
const hmacKey = (secret: string) => crypto.subtle.importKey("raw", encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

// Stateless authenticated timetable data survives Worker restarts. The browser
// receives the provider trip and signature, never the signing/API key.
export async function signFareTrip(trip: FareTrip, secret: string): Promise<RetainedFareSource> {
  const payload = JSON.stringify(trip);
  if (encode(payload).length > MAX_FARE_SOURCE_BYTES) throw new Error("Provider trip too large to retain");
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), message(payload)));
  return { payload, id: [...bytes].map(b => b.toString(16).padStart(2, "0")).join("") };
}

export async function verifyFareSources(sources: unknown, secret: string): Promise<FareTrip[]> {
  if (!secret || !Array.isArray(sources) || !sources.length || sources.length > 8) throw new Error("Invalid retained trips");
  const key = await hmacKey(secret), ids = new Set<string>(), trips: FareTrip[] = [];
  for (const source of sources) {
    if (!source || typeof source.id !== "string" || !/^[a-f0-9]{64}$/.test(source.id) || ids.has(source.id)
      || typeof source.payload !== "string" || encode(source.payload).length > MAX_FARE_SOURCE_BYTES) throw new Error("Invalid retained trip");
    ids.add(source.id);
    const signature = Uint8Array.from(source.id.match(/../g)!, (hex: string) => parseInt(hex, 16));
    if (!await crypto.subtle.verify("HMAC", key, signature, message(source.payload))) throw new Error("Retained trip integrity check failed");
    trips.push(JSON.parse(source.payload));
  }
  return trips;
}

export async function retainedConnections(xml: string, filtered: boolean, secret: string) {
  const legs = parseOjpConnections(xml, filtered), sources: RetainedFareSource[] = [];
  for (const trip of fareTrips(xml)) {
    // Do not lose a usable timetable if an unusually large source cannot be
    // retained; those legs continue through the explicitly marked lookup path.
    if (encode(JSON.stringify(trip)).length > MAX_FARE_SOURCE_BYTES) continue;
    const source = await signFareTrip(trip, secret);
    const walks = fareTripWalks(trip);
    let used = false;
    for (const leg of legs) {
      const candidates = leg.reference ? trip.segments : walks;
      if (candidates.some(segment => matchesFareSegment(segment, { from: leg.from.id, to: leg.to.id,
        fromName: leg.from.name, toName: leg.to.name, fromPoint: leg.from, toPoint: leg.to,
        departure: leg.departure, arrival: leg.arrival, journeyRef: leg.reference?.journeyRef }))) {
        (leg.fareSourceIds ??= []).push(source.id); used = true;
      }
    }
    if (used) sources.push(source);
  }
  return { legs, sources };
}
