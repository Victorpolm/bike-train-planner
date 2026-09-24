import { busCarriage, isBus, transitAllowed, type BusPreference } from "./busCarriage.ts";
import type { TransitLeg } from "./routing.ts";
import { sobMainlineRule, sbbInterRegioRule } from "./operatorBicycleRules.ts";

export const BICYCLE_SCOPES = ["confirmed", "allow-uncertain", "all-transit"] as const;
export type BicycleScope = typeof BICYCLE_SCOPES[number];
// Only a trusted timetable adapter may attach this evidence. It must cover the
// exact dated service and boarded segment, not just an operator or route family.
export type BicycleEvidence = {
  permission: "allowed" | "prohibited" | "unknown";
  fromId: string; toId: string; departure: string; service: string; operator: string | null;
  source: { title: string; url: string; checked: string };
  conditions: string[];
  basis?: "ojp-filter" | "service-rule" | "unassessed";
  prerequisites?: {
    bikeTicket: "required" | "not-required" | "unknown";
    bikeReservation: "required" | "not-required" | "unknown";
    ticketSource?: { title: string; url: string; checked: string };
    bookingUrl?: string;
  };
};
export function applicableBicycleEvidence(leg: TransitLeg): BicycleEvidence | undefined {
  const e = leg.bicycleEvidence;
  return e && e.fromId === leg.fromId && e.toId === leg.toId
    && Number.isFinite(leg.departure?.getTime()) && Date.parse(e.departure) === leg.departure?.getTime()
    && e.service === leg.service && e.operator === (leg.operator ?? null)
    && !!e.source.title && /^https:\/\//.test(e.source.url) && Number.isFinite(Date.parse(e.source.checked)) ? e : undefined;
}
export function bicyclePermission(leg: TransitLeg): "confirmed" | "uncertain" | "prohibited" {
  const policy = busCarriage(leg);
  if (policy?.permission === "not-allowed") return "prohibited";
  const e = applicableBicycleEvidence(leg);
  if (!e || e.permission === "unknown") return sobMainlineRule(leg) || sbbInterRegioRule(leg) || policy?.verifiesPermission ? "confirmed" : "uncertain";
  return e.permission === "allowed" ? "confirmed" : "prohibited";
}
export function bicycleLegAllowed(leg: TransitLeg, preference: BusPreference, scope: BicycleScope = "allow-uncertain") {
  if (leg.mode !== "transit") return true;
  if (scope === "all-transit") return preference !== "no-buses" || !isBus(leg);
  const permission = bicyclePermission(leg);
  if (permission === "prohibited") return false;
  if (permission === "confirmed") return preference !== "no-buses" || !isBus(leg);
  if (!transitAllowed(leg, preference)) return false;
  return scope === "allow-uncertain";
}
export const bicyclePermissionLabel = (leg: TransitLeg) => {
  const permission = bicyclePermission(leg);
  return permission === "confirmed" ? "Bicycle access verified for this service"
    : permission === "prohibited" ? "Bicycles not permitted" : "Bicycle permission uncertain for this service";
};

export const bicycleScopeOptions: Record<BicycleScope, string> = {
  confirmed: "Only public transport with verified bicycle access",
  "allow-uncertain": "Allow public transport with unverified bicycle access",
  "all-transit": "Also allow public transport that prohibits bicycles",
};
export const bicycleScopeHelp: Record<BicycleScope, string> = {
  confirmed: "Every transit leg must have applicable evidence that your bicycle is allowed. Ticket and reservation conditions still apply.",
  "allow-uncertain": "Include verified and unverified access. Exclude services that prohibit bicycles.",
  "all-transit": "Ignore bicycle-access restrictions when calculating routes. Services that prohibit bicycles are clearly marked; you cannot take your bicycle on those legs.",
};
export function bicycleExclusions(legs: Iterable<TransitLeg>, scope: BicycleScope) {
  const result = { prohibited: 0, uncertain: 0 }, seen = new Set<string>();
  for (const leg of legs) {
    if (leg.mode !== "transit" || scope === "all-transit") continue;
    const permission = bicyclePermission(leg);
    if (permission === "confirmed" || permission === "uncertain" && scope !== "confirmed") continue;
    const key = JSON.stringify([leg.departure, leg.serviceName, leg.service, leg.operator]);
    if (seen.has(key)) continue;
    seen.add(key); result[permission]++;
  }
  return result;
}
