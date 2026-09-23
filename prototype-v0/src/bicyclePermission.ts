import { busCarriage, isBus, transitAllowed, type BusPreference } from "./busCarriage.ts";
import type { TransitLeg } from "./routing.ts";

export const BICYCLE_SCOPES = ["confirmed", "allow-uncertain", "all-transit"] as const;
export type BicycleScope = typeof BICYCLE_SCOPES[number];
// Only a trusted timetable adapter may attach this evidence. It must cover the
// exact dated service and boarded segment, not just an operator or route family.
export type BicycleEvidence = {
  permission: "allowed" | "prohibited";
  fromId: string; toId: string; departure: string; service: string; operator: string | null;
  source: { title: string; url: string; checked: string };
  conditions: string[];
};
export function bicyclePermission(leg: TransitLeg): "confirmed" | "uncertain" | "prohibited" {
  const policy = busCarriage(leg);
  if (policy?.permission === "not-allowed") return "prohibited";
  const e = leg.bicycleEvidence;
  const applicable = e && e.fromId === leg.fromId && e.toId === leg.toId
    && Number.isFinite(leg.departure?.getTime()) && Date.parse(e.departure) === leg.departure?.getTime()
    && e.service === leg.service && e.operator === (leg.operator ?? null)
    && !!e.source.title && /^https:\/\//.test(e.source.url) && Number.isFinite(Date.parse(e.source.checked));
  if (!applicable) return "uncertain";
  return e.permission === "allowed" ? "confirmed" : "prohibited";
}
export function bicycleLegAllowed(leg: TransitLeg, preference: BusPreference, scope: BicycleScope = "allow-uncertain") {
  if (leg.mode !== "transit") return true;
  // The unrestricted comparison ignores bicycle rules, never the selected modes.
  // Preserve the leg's evidence so prohibited journeys remain clearly labelled.
  if (scope === "all-transit") return preference !== "no-buses" || !isBus(leg);
  const permission = bicyclePermission(leg);
  if (permission === "prohibited") return false;
  if (!transitAllowed(leg, preference)) return false;
  return scope === "allow-uncertain" || permission === "confirmed";
}
export const bicyclePermissionLabel = (leg: TransitLeg) => {
  const permission = bicyclePermission(leg);
  return permission === "confirmed" ? "Bicycle permission confirmed for this service"
    : permission === "prohibited" ? "Bicycles not permitted" : "Bicycle permission uncertain for this service";
};
