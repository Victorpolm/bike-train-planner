import { localPolicy, localPolicyCurrent } from "./localTransport.ts";
import { busCarriage } from "./busCarriage.ts";
import { swissStopId } from "./transitScope.ts";
import { carriageForLeg } from "./bicycleCarriage.ts";
import { operatorBicycleRule } from "./operatorBicycleRules.ts";
import type { TransitLeg } from "./routing.ts";
import type { TravelProfile } from "./travelProfile.ts";

/** A missing reservation is different from missing permission or bike fit. */
export function bicycleStatus(leg: TransitLeg, profile?: TravelProfile) {
  const rule = carriageForLeg(leg, profile);
  const conflict = !!rule.evidence?.conditions.some(n => /conflicting reservation/i.test(n));
  const international = !!rule.evidence?.conditions.some(n => /restricted to international travel/i.test(n));
  const handling = rule.evidence?.handling;
  const local = localPolicy(leg), bus = busCarriage(leg);
  const expired = rule.permission === "uncertain" && (!!local && !localPolicyCurrent(leg) || bus?.reason === "rule-expired");
  const unidentified = (["departure", "arrival"] as const).some(end => {
    const id = end === "departure" ? leg.fromId : leg.toId;
    const endpoint = end === "departure" ? leg.stationDeparture : leg.stationArrival;
    return id?.startsWith("ch:1:sloid:") && !swissStopId(leg, end) && !endpoint?.stationId;
  });
  const profileUnverified = rule.profileRule.permission === "uncertain";
  const reservation = conflict ? "Reservation rules conflict for this service"
    : rule.bikeReservation === "required" ? "Reservation required"
    : rule.bikeReservation === "not-required" ? "No reservation required"
    : "Reservation requirement not verified";
  const permission = rule.permission === "prohibited" ? handling?.foldingOnly ? "Bikes not allowed · Folding bikes only" : "Bikes not allowed on this section"
    : expired ? "Bicycle rule needs updating"
    : profileUnverified ? "Bicycle configuration needs checking"
    : international ? "Bikes restricted to international travel"
    : rule.permission === "confirmed" ? handling?.bagRequired ? "Bikes allowed · Bag required" : rule.profileRule.handLuggage ? "Bike accepted as hand luggage" : "Bikes allowed"
    : unidentified ? "Station identity needs checking" : "Bicycle information missing for this service";
  const title = rule.permission === "confirmed" ? `${permission} · ${reservation}` : permission;
  const explanation = rule.permission === "prohibited" ? handling?.foldingOnly ? "This service only accepts folding bicycles. Re.route currently plans for ordinary bicycles, so it is excluded from bike-compatible routes." : "A restriction applies to this section or your bicycle configuration. Choose a permitted service."
    : expired ? (bus?.reason === "rule-expired" ? bus.instructions.join(" ") : operatorBicycleRule(leg)?.instructions.at(-1)) || "The applicable bicycle rule is outside its reviewed dates and needs updating."
    : profileUnverified ? rule.profileRule.guidance.join(" ")
    : international ? "The service only accepts bicycles on qualifying international journeys; eligibility for your section is not established."
    : handling?.bagRequired ? "Put the bicycle in a transport bag before boarding. " + handling.instructions.join(" ") + " Ticket, reservation and available-space conditions remain separate." + (conflict ? " The provider supplies conflicting reservation conditions; resolve these before boarding." : "")
    : conflict ? "The service supplies both a reservation requirement and an exemption. Do not board without resolving this conflict."
    : rule.permission === "confirmed" ? rule.bikeReservation === "unknown"
      ? "Bicycle carriage is established. The service details and applicable operator rules do not establish whether you need a reservation."
      : "Use the marked bicycle area. Permission does not confirm a free space or book a reservation."
    : unidentified ? "The provider’s stop reference could not be matched to the official station register. Applicable local rules cannot be selected until this identity is resolved."
    : operatorBicycleRule(leg)?.instructions.join(" ") || (rule.evidence?.source.url.includes("ojptripinforequest")
      ? "The exact service and boarded section were checked. The provider still supplies no usable bicycle permission, and no reviewed operator rule resolves it. A missing symbol is not a ban."
      : !leg.ojp ? "This timetable result has no exact service reference for a detailed bicycle check. No applicable operator rule establishes permission for this departure."
      : "No explicit bicycle-carriage information or applicable reviewed operator rule covers this dated service. Absence of a symbol does not mean bicycles are prohibited.");
  const reason = handling?.foldingOnly ? "folding-only" : conflict || handling?.bagRequired && handling.bagProhibited ? "conflicting-evidence"
    : handling?.unresolved ? "packing-unverified" : expired ? "rule-expired"
    : profileUnverified ? "profile-unverified" : international ? "international-only"
    : rule.permission === "confirmed" || rule.permission === "prohibited" ? null
    : unidentified ? "identifier-unrecognised" : "no-applicable-rule";
  return { title, permission, reservation, explanation, conflict, reason,
    icon: rule.permission === "prohibited" ? "prohibited" as const
      : rule.permission !== "confirmed" || conflict ? "unverified" as const
      : rule.bikeReservation === "required" ? "reservation" as const : "allowed" as const };
}
