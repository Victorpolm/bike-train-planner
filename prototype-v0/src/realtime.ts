import type { TransitLeg } from "./routing.ts";

export type TransitRealtime = {
  checkedAt: string;
  /** False when only the local retrieval clock was available. */
  providerTimestampVerified?: boolean;
  /** Client-side failed refresh; never changes the original provider timestamp. */
  refreshFailedAt?: string;
  estimatedDeparture: string | null; estimatedArrival: string | null;
  departurePlatform: string | null; arrivalPlatform: string | null;
  cancelled: boolean; departureCancelled: boolean; arrivalCancelled: boolean;
  undefinedDelay: boolean;
};
export const realtimeUnavailable = (leg: TransitLeg) => !!(leg.realtime?.cancelled || leg.realtime?.departureCancelled || leg.realtime?.arrivalCancelled);
export const realtimeStale = (value: TransitRealtime, now = Date.now()) => !!value.refreshFailedAt || value.providerTimestampVerified === false || !Number.isFinite(Date.parse(value.checkedAt))
  || now - Date.parse(value.checkedAt) > 120_000 || Date.parse(value.checkedAt) - now > 60_000;
function effectiveTime(leg: TransitLeg, end: "departure" | "arrival"): Date | null {
  const estimate = end === "departure" ? leg.realtime?.estimatedDeparture : leg.realtime?.estimatedArrival;
  if (estimate && Number.isFinite(Date.parse(estimate))) return new Date(estimate);
  const date = leg[end];
  return date && leg.movementOffsetMs ? new Date(+date + leg.movementOffsetMs) : date;
}
export const departureTime = (leg: TransitLeg) => effectiveTime(leg, "departure");
export const arrivalTime = (leg: TransitLeg) => effectiveTime(leg, "arrival");
export type Timing = { at: Date | null; scheduled: Date | null; basis: "scheduled" | "estimated" | "planned";
  freshness: "fresh" | "stale" | "unknown"; checkedAt?: string; delayMinutes?: number; delaySeconds?: number; cancelled: boolean; undefinedDelay: boolean; refreshFailed?: boolean };
export type JourneyFeasibility = "scheduled" | "estimated" | "late" | "at-risk" | "broken" | "unknown";
function legTiming(leg: TransitLeg, end: "departure" | "arrival", now=Date.now()): Timing {
  const scheduled=leg[end], cancelled=realtimeUnavailable(leg), undefinedDelay=!!leg.realtime?.undefinedDelay;
  // A cancelled/indefinitely delayed service has no usable predicted time.
  // Retain its scheduled identity for explanation, without labelling an old
  // estimate as the original time or implying the traveller can catch it.
  const at=cancelled||undefinedDelay?scheduled:effectiveTime(leg,end);
  const supplied=end==="departure"?leg.realtime?.estimatedDeparture:leg.realtime?.estimatedArrival;
  const estimated=!cancelled&&!undefinedDelay&&!!supplied && Number.isFinite(Date.parse(supplied));
  return {at,scheduled,basis:leg.mode!=="transit"?"planned":estimated?"estimated":"scheduled",
    freshness:!leg.realtime?"unknown":realtimeStale(leg.realtime,now)?"stale":"fresh",checkedAt:leg.realtime?.checkedAt,
    ...(estimated&&at&&scheduled?{delayMinutes:Math.round((+at-+scheduled)/60000),delaySeconds:(+at-+scheduled)/1000}:{}),cancelled,undefinedDelay,refreshFailed:!!leg.realtime?.refreshFailedAt};
}
/** Presentation only: absence of delay information never means on time. */
export function timingStatus(timing: Timing): string {
  if (timing.cancelled) return "Cancelled · original time";
  if (timing.undefinedDelay) return "Delay duration unknown · scheduled time only";
  if (timing.basis === "planned") return "Planned movement";
  if (timing.basis !== "estimated") return "Scheduled · Live status unavailable";
  const seconds = timing.delaySeconds ?? (timing.delayMinutes === undefined ? NaN : timing.delayMinutes * 60);
  if (!Number.isFinite(seconds)) return "Live status unavailable";
  const minutes = Math.abs(timing.delayMinutes ?? Math.round(seconds / 60));
  const amount = minutes ? `${minutes} min` : "less than 1 min";
  const current = timing.freshness === "fresh" && !timing.refreshFailed;
  if (!current) return seconds > 0 ? `Last reported delay: ${amount} · Update unavailable`
    : seconds < 0 ? `Last reported: ${amount} early · Update unavailable`
    : "Last estimate matched schedule · Update unavailable";
  return seconds > 0 ? `Delayed by ${amount}` : seconds < 0 ? `${amount} early` : "On time";
}
export function failedRealtimeRefresh(value: TransitRealtime | undefined, checkedAt = new Date().toISOString()): TransitRealtime {
  return { checkedAt:"",providerTimestampVerified:false,estimatedDeparture:null,estimatedArrival:null,
    departurePlatform:null,arrivalPlatform:null,cancelled:false,departureCancelled:false,arrivalCancelled:false,undefinedDelay:false,
    ...value,refreshFailedAt:checkedAt };
}
export const departureTiming = (leg: TransitLeg, now=Date.now()) => legTiming(leg,"departure",now);
export const arrivalTiming = (leg: TransitLeg, now=Date.now()) => legTiming(leg,"arrival",now);
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
