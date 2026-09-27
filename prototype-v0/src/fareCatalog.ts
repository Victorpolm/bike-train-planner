import { swissDateTimeInput } from "./departure.ts";
import { isSbb, sobMainlineRule } from "./operatorBicycleRules.ts";
import type { TransitLeg } from "./routing.ts";

export const ZVV_FARES = { title: "ZVV published single tickets", url: "https://www.zvv.ch/de/abos-und-tickets/tickets/einzelbillette.html", checked: "2026-09-27" };
export const ZPASS_FARES = { title: "Z-Pass A-Welle–ZVV published single tickets", url: "https://www.zvv.ch/de/abos-und-tickets/weitere-angebote/tarifverbund-z-pass/abo-und-billette.html", checked: "2026-09-27" };
export const FARE_VALID_FROM = "2025-12-14", FARE_VALID_TO = "2026-12-12";
export type PublishedFare = { passengerFull: number; passengerHalf: number; bicycle: number; zones: string[];
  paidZones: number; validMinutes: number; source: typeof ZVV_FARES; from: string; to: string; validFrom: string; validTo: string };
// Audited rail corridors, not a nationwide fare engine. Each edge includes the
// zones traversed, even where the service does not stop. Boundary stop Dietikon
// can use 154 eastwards; continuing to Killwangen requires 184 and 570 too.
const main = ["8503003", "8503000", "8503020", "8503001", "8503509", "8503512", "8503508", "8503506", "8503511", "8503505", "8503504"];
const mainZones = [["110"], ["110"], ["110"], ["110", "154"], ["154"], ["154"], ["154", "184", "570"], ["570"], ["570"], ["570"]];
const branch = ["8503003", "8503000", "8503020", "8503001", "8502220", "8502229", "8502221"];
const branchZones = [["110"], ["110"], ["110"], ["110", "154"], ["154"], ["154"]];
const zvv: Record<number, [number, number]> = { 2: [4.7, 3.3], 3: [7.2, 3.6], 4: [9.4, 4.7], 5: [11.4, 5.7], 6: [13.6, 6.8], 7: [15.8, 7.9], 8: [18, 9] };
const zpass: Record<number, [number, number]> = { 2: [7, 3.5], 3: [8.6, 4.3], 4: [11.2, 5.6], 5: [14.2, 7.1], 6: [17, 8.5], 7: [20.4, 10.2], 8: [23.8, 11.9], 9: [27, 13.5], 10: [29.8, 14.9], 11: [31.6, 15.8] };
function zonesForLeg(leg: TransitLeg): string[] | null {
  if (!isSbb(leg) && !sobMainlineRule(leg)) return null;
  const service = leg.service.replace(/\s/g, "").toUpperCase();
  const corridor = /^(IR35|IC5|S11|S12)$/.test(service) ? [main, mainZones] as const
    : /^(S5|S14)$/.test(service) ? [branch, branchZones] as const : null;
  if (!corridor) return null;
  const [stops, edges] = corridor, a = stops.indexOf(leg.fromId ?? ""), b = stops.indexOf(leg.toId ?? "");
  return a < 0 || b < 0 || a === b ? null : edges.slice(Math.min(a, b), Math.max(a, b)).flat();
}
export function publishedRouteFare(legs: TransitLeg[]): PublishedFare | null {
  const transit = legs.filter(l => l.mode === "transit");
  if (!transit.length || legs.some(l => l.mode === "unknown")) return null;
  const departure = transit[0].departure, arrival = transit.at(-1)!.arrival;
  if (!departure || !arrival || !Number.isFinite(departure.getTime()) || !Number.isFinite(arrival.getTime())) return null;
  const date = swissDateTimeInput(departure).slice(0, 10), endDate = swissDateTimeInput(arrival).slice(0, 10);
  if (date < FARE_VALID_FROM || date > FARE_VALID_TO || endDate !== date) return null;
  const covered = transit.map(zonesForLeg);
  if (covered.some(z => z === null) || transit.some((l, i) => i > 0 && transit[i - 1].toId !== l.fromId)) return null;
  const zones = [...new Set(covered.flat() as string[])].sort();
  const paidZones = Math.max(2, zones.reduce((sum, z) => sum + (z === "110" || z === "120" ? 2 : 1), 0));
  const isZpass = zones.includes("570"), price = (isZpass ? zpass : zvv)[paidZones];
  const validMinutes = paidZones <= 3 ? 60 : paidZones <= 10 ? 120 : 180;
  const duration = (arrival.getTime() - departure.getTime()) / 60_000;
  if (!price || duration < 0 || duration > validMinutes) return null;
  return { passengerFull: price[0], passengerHalf: price[1], bicycle: price[1], zones, paidZones, validMinutes,
    source: isZpass ? ZPASS_FARES : ZVV_FARES, from: transit[0].from ?? transit[0].fromId!, to: transit.at(-1)!.to ?? transit.at(-1)!.toId!,
    validFrom: FARE_VALID_FROM, validTo: FARE_VALID_TO };
}
