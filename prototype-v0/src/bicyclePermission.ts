import { busCarriage, isBus, transitAllowed, type BusPreference } from "./busCarriage.ts";
import type { TransitLeg } from "./routing.ts";
import { operatorBicycleRule } from "./operatorBicycleRules.ts";

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
// The uncached evaluator is also used by equivalence tests and the offline
// benchmark. Permission remains distinct from tickets, reservations and space.
export function evaluateBicyclePermission(leg: TransitLeg): "confirmed" | "uncertain" | "prohibited" {
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

type Permission = ReturnType<typeof evaluateBicyclePermission>;
const permissionCache = new WeakMap<TransitLeg, { inputs: unknown[]; permission: Permission }>();
function permissionInputs(leg: TransitLeg): unknown[] {
  const e = leg.bicycleEvidence;
  // Snapshot every input used by the evaluator, bus policy and operator rules.
  // Store values, not nested object identities: Date.setTime(), edits to source
  // fields/conditions and point mutations must all invalidate a cached verdict.
  // Keep these dependencies aligned whenever a permission rule is extended.
  return [leg.mode, leg.category, leg.operator, leg.service, leg.serviceName, leg.from, leg.to,
    leg.fromId, leg.toId, leg.departure?.getTime(), leg.arrival?.getTime(),
    leg.fromPoint?.lat, leg.fromPoint?.lon, leg.toPoint?.lat, leg.toPoint?.lon,
    !!e, e?.permission, e?.fromId, e?.toId, e?.departure, e?.service, e?.operator,
    e?.source.title, e?.source.url, e?.source.checked, ...(e?.conditions ?? [])];
}
export function bicyclePermission(leg: TransitLeg): Permission {
  const inputs = permissionInputs(leg), cached = permissionCache.get(leg);
  if (cached && cached.inputs.length === inputs.length && inputs.every((value, i) => Object.is(value, cached.inputs[i]))) return cached.permission;
  const permission = evaluateBicyclePermission(leg);
  permissionCache.set(leg, { inputs, permission });
  return permission;
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
