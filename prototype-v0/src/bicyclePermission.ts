import { freshFormation, type FormationEvidence } from "./formation.ts";
import { profileBikeRule } from "./bikeEligibility.ts";
import { travelProfileKey, type TravelProfile } from "./travelProfile.ts";
import { busCarriage, isBus, transitAllowed, type BusPreference } from "./busCarriage.ts";
import type { TransitLeg } from "./routing.ts";
import { operatorBicycleRule } from "./operatorBicycleRules.ts";

export const BICYCLE_SCOPES = ["confirmed", "allow-uncertain", "all-transit"] as const;
export type BicycleScope = typeof BICYCLE_SCOPES[number];
// Only a trusted timetable adapter may attach this evidence. It must cover the
// exact dated service and boarded segment, not just an operator or route family.
export type BicycleEvidence = {
  permission: "allowed" | "prohibited" | "unknown";
  formation?: FormationEvidence;
  fromId: string; toId: string; departure: string; service: string; operator: string | null;
  source: { title: string; url: string; checked: string };
  conditions: string[];
  basis?: "ojp-filter" | "service-rule" | "unassessed";
  prerequisites?: {
    bikeTicket: "required" | "not-required" | "unknown";
    bikeReservation: "required" | "not-required" | "unknown";
    /** True only when the adapter found no reservation condition at all. */
    reservationUnspecified?: boolean;
    ticketSource?: { title: string; url: string; checked: string };
    bookingUrl?: string;
  };
};
export function applicableBicycleEvidence(leg: TransitLeg): BicycleEvidence | undefined {
  const e = leg.bicycleEvidence;
  return e && e.fromId === leg.fromId && e.toId === leg.toId
    && Number.isFinite(leg.departure?.getTime()) && Date.parse(e.departure) === leg.departure?.getTime()
    && e.service === leg.service && e.operator === (leg.operator ?? null)
    && !!e.source.title && /^https:\/\//.test(e.source.url) && Number.isFinite(Date.parse(e.source.checked)) ? formationBicycleEvidence(e) : undefined;
}
/** Formation evidence is refreshed independently; never make a stale coach
 * permission or reservation sticky in the underlying timetable evidence. */
function formationBicycleEvidence(e: BicycleEvidence): BicycleEvidence {
  const f = e.formation, rule = f?.rule;
  if (!freshFormation(f) || f?.status !== "matched" || !rule) return e;
  const prior = e.prerequisites?.bikeReservation ?? "unknown";
  const conflict = rule.bikeReservation === "required" && prior === "not-required";
  return { ...e, permission: e.permission === "prohibited" ? "prohibited" : rule.permission === "allowed" ? "allowed" : e.permission,
    conditions: [...e.conditions, ...rule.notes, ...(conflict ? ["The provider gives conflicting reservation conditions. Confirm with the operator before boarding."] : [])],
    prerequisites: { bikeTicket: "unknown", ...e.prerequisites,
      bikeReservation: conflict ? "unknown" : rule.bikeReservation === "required" ? "required" : prior,
      reservationUnspecified: conflict ? false : rule.bikeReservation === "required" ? false : e.prerequisites?.reservationUnspecified ?? true } };
}
// The uncached evaluator is also used by equivalence tests and the offline
// benchmark. Permission remains distinct from tickets, reservations and space.
function baseBicyclePermission(leg: TransitLeg): "confirmed" | "uncertain" | "prohibited" {
  const policy = busCarriage(leg);
  if (policy?.permission === "not-allowed") return "prohibited";
  const operatorRule = operatorBicycleRule(leg);
  if (operatorRule?.permission === "prohibited") return "prohibited";
  const e = applicableBicycleEvidence(leg);
  if (e?.permission === "prohibited") return "prohibited";
  if (e?.conditions.some(note => note.includes("restricted to international travel"))) return "uncertain";
  if (!e || e.permission === "unknown") return operatorRule?.permission === "allowed" || policy?.verifiesPermission ? "confirmed" : "uncertain";
  return e.permission === "allowed" ? "confirmed" : "prohibited";
}

export function evaluateBicyclePermission(leg: TransitLeg, profile?: TravelProfile): "confirmed" | "uncertain" | "prohibited" {
  const base = baseBicyclePermission(leg), specific = profileBikeRule(leg, profile, applicableBicycleEvidence(leg));
  if (base === "prohibited" && !specific.handLuggage) return base;
  return specific.permission ?? base;
}

type Permission = ReturnType<typeof evaluateBicyclePermission>;
const permissionCache = new WeakMap<TransitLeg, { inputs: unknown[]; permission: Permission }>();
export function permissionInputs(leg: TransitLeg): unknown[] {
  const e = leg.bicycleEvidence;
  // Snapshot every input used by the evaluator, bus policy and operator rules.
  // Store values, not nested object identities: Date.setTime(), edits to source
  // fields/conditions and point mutations must all invalidate a cached verdict.
  // Keep these dependencies aligned whenever a permission rule is extended.
  return [leg.mode, leg.category, leg.operator, leg.service, leg.serviceName, leg.from, leg.to,
    leg.stationArrival?.status, leg.stationArrival?.key, leg.stationArrival?.stationId,
    leg.stationDeparture?.status, leg.stationDeparture?.key, leg.stationDeparture?.stationId,
    leg.ojp?.fromRef, leg.ojp?.toRef, leg.ojp?.operatingDay, leg.departurePlatform, leg.arrivalPlatform,
    leg.realtime?.departurePlatform, leg.realtime?.arrivalPlatform,
    leg.fromId, leg.toId, leg.departure?.getTime(), leg.arrival?.getTime(),
    leg.fromPoint?.lat, leg.fromPoint?.lon, leg.toPoint?.lat, leg.toPoint?.lon,
    freshFormation(e?.formation), JSON.stringify(e?.formation), !!e, e?.permission, e?.fromId, e?.toId, e?.departure, e?.service, e?.operator,
    e?.source.title, e?.source.url, e?.source.checked, ...(e?.conditions ?? [])];
}
export function bicyclePermission(leg: TransitLeg, profile?: TravelProfile): Permission {
  const inputs = [...permissionInputs(leg), travelProfileKey(profile)], cached = permissionCache.get(leg);
  if (cached && cached.inputs.length === inputs.length && inputs.every((value, i) => Object.is(value, cached.inputs[i]))) return cached.permission;
  const permission = evaluateBicyclePermission(leg, profile);
  permissionCache.set(leg, { inputs, permission });
  return permission;
}
export function bicycleLegAllowed(leg: TransitLeg, preference: BusPreference, scope: BicycleScope = "allow-uncertain", profile?: TravelProfile) {
  if (leg.mode !== "transit") return true;
  if (scope === "all-transit") return preference !== "no-buses" || !isBus(leg);
  const permission = bicyclePermission(leg, profile);
  if (permission === "prohibited") return false;
  if (permission === "confirmed") return preference !== "no-buses" || !isBus(leg);
  if (!transitAllowed(leg, preference)) return false;
  return scope === "allow-uncertain";
}
export const bicyclePermissionLabel = (leg: TransitLeg, profile?: TravelProfile) => {
  const permission = bicyclePermission(leg, profile);
  return permission === "confirmed" ? "Bikes allowed · conditions apply"
    : permission === "prohibited" ? "Bikes not allowed on this section" : "Bicycle information incomplete for this service";
};

export const bicycleScopeOptions: Record<BicycleScope, string> = {
  confirmed: "Only public transport with verified bicycle access",
  "allow-uncertain": "Allow public transport with unverified bicycle access",
  "all-transit": "Also allow public transport that prohibits bicycles",
};
export const bicycleScopeHelp: Record<BicycleScope, string> = {
  confirmed: "Every transit leg must have dated service evidence or an applicable published operator policy allowing bicycle carriage. This does not confirm available space. Ticket and reservation conditions still apply.",
  "allow-uncertain": "Include verified and unverified access. Exclude services that prohibit bicycles.",
  "all-transit": "Ignore bicycle-access restrictions when calculating routes. Services that prohibit bicycles are clearly marked; you cannot take your bicycle on those legs.",
};
export function bicycleExclusions(legs: Iterable<TransitLeg>, scope: BicycleScope, profile?: TravelProfile) {
  const result = { prohibited: 0, uncertain: 0 }, seen = new Set<string>();
  for (const leg of legs) {
    if (leg.mode !== "transit" || scope === "all-transit") continue;
    const permission = bicyclePermission(leg, profile);
    if (permission === "confirmed" || permission === "uncertain" && scope !== "confirmed") continue;
    const key = JSON.stringify([leg.departure, leg.serviceName, leg.service, leg.operator]);
    if (seen.has(key)) continue;
    seen.add(key); result[permission]++;
  }
  return result;
}
