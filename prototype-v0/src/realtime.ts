import type { TransitLeg } from "./routing.ts";

export type TransitRealtime = {
  checkedAt: string;
  estimatedDeparture: string | null; estimatedArrival: string | null;
  departurePlatform: string | null; arrivalPlatform: string | null;
  cancelled: boolean; departureCancelled: boolean; arrivalCancelled: boolean;
  undefinedDelay: boolean;
};
export const realtimeUnavailable = (leg: TransitLeg) => !!(leg.realtime?.cancelled || leg.realtime?.departureCancelled || leg.realtime?.arrivalCancelled);
export const realtimeStale = (value: TransitRealtime, now = Date.now()) => !Number.isFinite(Date.parse(value.checkedAt))
  || now - Date.parse(value.checkedAt) > 120_000 || Date.parse(value.checkedAt) - now > 60_000;
function effectiveTime(leg: TransitLeg, end: "departure" | "arrival"): Date | null {
  const estimate = end === "departure" ? leg.realtime?.estimatedDeparture : leg.realtime?.estimatedArrival;
  if (estimate && Number.isFinite(Date.parse(estimate))) return new Date(estimate);
  const date = leg[end];
  return date && leg.movementOffsetMs ? new Date(+date + leg.movementOffsetMs) : date;
}
export const departureTime = (leg: TransitLeg) => effectiveTime(leg, "departure");
export const arrivalTime = (leg: TransitLeg) => effectiveTime(leg, "arrival");
export const effectivePlatform = (leg: TransitLeg, end: "departure" | "arrival") =>
  (end === "departure" ? leg.realtime?.departurePlatform : leg.realtime?.arrivalPlatform) ?? leg[`${end}Platform`];
export const platformChanged = (leg: TransitLeg, end: "departure" | "arrival") => effectivePlatform(leg, end) !== leg[`${end}Platform`];
/** Timetable walks are movements, not vehicles that leave without the traveller.
 * Preserve their published identity while accounting for a delayed arrival. */
export function moveAfter(leg: TransitLeg, readyAt: number): TransitLeg {
  if (leg.mode === "transit" || !leg.departure || !leg.arrival) return leg;
  const shift = Math.max(0, readyAt - +leg.departure);
  return shift === (leg.movementOffsetMs ?? 0) ? leg : { ...leg, movementOffsetMs: shift };
}
export function realtimeKey(leg: TransitLeg): string {
  const r = leg.ojp;
  return r ? JSON.stringify([r.journeyRef, r.operatingDay, r.fromRef, r.toRef, r.departure, r.arrival]) : "";
}
