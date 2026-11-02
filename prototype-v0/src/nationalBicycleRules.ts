import { ZVV_BIKE_REVIEW } from "./busCarriage.ts";
import membership from "./bike-membership.json" with { type: "json" };
import { operatorIdentity } from "./operatorIdentity.ts";
import { operatorCode, normalizeCode } from "./normalization.ts";
import { domesticSwissLeg, replacementService } from "./transitScope.ts";
import { swissDateTimeInput } from "./departure.ts";
import type { BicycleEvidence } from "./bicyclePermission.ts";
import type { TransitLeg } from "./routing.ts";

const members = new Set(membership.businessNumbers);
const ZVV = new Set(["VBZ", "VBG", "VZO", "STBW"]);
const T600_RESERVATIONS = { title: "T600 §7.10.1: reservations indicated in the timetable",
  url: "https://www.allianceswisspass.ch/fr/asp/Telechargements?download=2666", checked: "2026-11-02" };
const ZVV_T600 = { title: "ZVV §5.2.1: T600 bicycle conditions",
  url: "https://www.zvv.ch/de/allgemeine-seiten/tarif/verbundtarif-und-richtlinien/gepaeck-velo.html", checked: "2026-11-02" };

/** This is a sourced reservation inference, never permission or space evidence.
 * Start with ordinary domestic buses/trams. Mountain feeder-line and foreign
 * scope cannot be inferred from the membership table; retain their uncertainty.
 */
export function nationalBicycleReservation(leg: TransitLeg, evidence: BicycleEvidence | undefined, permission: string) {
  const requirements = evidence?.prerequisites;
  if (permission !== "confirmed" || leg.mode !== "transit" || !domesticSwissLeg(leg) || replacementService(leg)
    || !["B", "BUS", "NFB", "TROLLEYBUS", "T", "TRAM"].includes(normalizeCode(leg.category))
    || requirements?.conditionsChecked !== true || requirements.reservationUnspecified !== true
    || requirements.bikeReservation !== "unknown" || evidence?.conditions.some(n => /conflict|international travel/i.test(n))
    || !leg.departure || !leg.arrival || !Number.isFinite(+leg.departure) || !Number.isFinite(+leg.arrival) || +leg.arrival < +leg.departure) return null;
  const start = swissDateTimeInput(leg.departure).slice(0, 10), end = swissDateTimeInput(leg.arrival).slice(0, 10);
  if (start < membership.validFrom || end > membership.validThrough || end < start) return null;
  const identity = operatorIdentity(leg.operator, start);
  // Never resolve membership through the canonical company abbreviation.
  const participating = identity && end <= identity.validThrough && members.has(identity.businessNumber);
  const identifiedCode = /^(OJP:|CH:1:SBOID:)/i.test(leg.operator ?? "");
  const zvv = start >= ZVV_BIKE_REVIEW.validFrom && end <= ZVV_BIKE_REVIEW.validThrough && ZVV.has(operatorCode(leg.operator)) && (!identifiedCode || !!identity && end <= identity.validThrough);
  if (!participating && !zvv) return null;
  return { reservation: "not-required" as const, source: T600_RESERVATIONS,
    membershipSource: zvv ? ZVV_T600 : membership.source,
    explanation: "No bicycle reservation is required under the applicable T600 timetable rule: the dated service conditions were checked and contain no bicycle-reservation requirement. Carriage remains subject to space." };
}
