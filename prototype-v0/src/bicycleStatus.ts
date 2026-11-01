import { carriageForLeg } from "./bicycleCarriage.ts";
import { operatorBicycleRule } from "./operatorBicycleRules.ts";
import type { TransitLeg } from "./routing.ts";
import type { TravelProfile } from "./travelProfile.ts";

/** A missing reservation is different from missing permission or bike fit. */
export function bicycleStatus(leg: TransitLeg, profile?: TravelProfile) {
  const rule = carriageForLeg(leg, profile);
  const conflict = !!rule.evidence?.conditions.some(n => /conflicting reservation/i.test(n));
  const international = !!rule.evidence?.conditions.some(n => /restricted to international travel/i.test(n));
  const profileUnverified = rule.profileRule.permission === "uncertain";
  const reservation = conflict ? "Reservation rules conflict for this service"
    : rule.bikeReservation === "required" ? "Reservation required"
    : rule.bikeReservation === "not-required" ? "No reservation required"
    : "Reservation requirement not verified";
  const permission = rule.permission === "prohibited" ? "Bikes not allowed on this section"
    : profileUnverified ? "Bicycle configuration needs checking"
    : international ? "Bikes restricted to international travel"
    : rule.permission === "confirmed" ? rule.profileRule.handLuggage ? "Bike accepted as hand luggage" : "Bikes allowed"
    : "Bicycle information missing for this service";
  const title = rule.permission === "confirmed" ? `${permission} · ${reservation}` : permission;
  const explanation = rule.permission === "prohibited" ? "A restriction applies to this section or your bicycle configuration. Choose a permitted service."
    : profileUnverified ? rule.profileRule.guidance.join(" ")
    : international ? "The service only accepts bicycles on qualifying international journeys; eligibility for your section is not established."
    : conflict ? "The service supplies both a reservation requirement and an exemption. Do not board without resolving this conflict."
    : rule.permission === "confirmed" ? rule.bikeReservation === "unknown"
      ? "Bicycle carriage is established. The service details and applicable operator rules do not establish whether you need a reservation."
      : "Use the marked bicycle area. Permission does not confirm a free space or book a reservation."
    : operatorBicycleRule(leg)?.instructions.join(" ") || "No explicit bicycle-carriage information or applicable reviewed operator rule covers this dated service. Absence of a symbol does not mean bicycles are prohibited.";
  return { title, permission, reservation, explanation, conflict,
    icon: rule.permission === "prohibited" ? "prohibited" as const
      : rule.permission !== "confirmed" || conflict ? "unverified" as const
      : rule.bikeReservation === "required" ? "reservation" as const : "allowed" as const };
}
