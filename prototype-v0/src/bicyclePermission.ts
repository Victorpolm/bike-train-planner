import { busCarriage, isBus, transitAllowed, type BusPreference } from "./busCarriage.ts";
import type { TransitLeg } from "./routing.ts";

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
  if (!e || e.permission === "unknown") return "uncertain";
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
  return permission === "confirmed" ? "Bicycle permission confirmed for this service"
    : permission === "prohibited" ? "Bicycles not permitted" : "Bicycle permission uncertain for this service";
};
