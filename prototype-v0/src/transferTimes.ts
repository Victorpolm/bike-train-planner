import { arrivalTime, effectivePlatform, platformChanged } from "./realtime.ts";
import { staticTransfer } from "./staticTransfers.ts";
import { haversineKm, type Point, type TransitLeg } from "./routing.ts";

const TRANSFER_SOURCE = "https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/";
const SWISS_TRANSFER_SOURCE = "https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/";
export type StationAccessRule = { point: Point; toRef: string; departure: string; operatingDay: string; seconds: number | null; checked?: string };
export function mergeAccessRules(...sets: (readonly StationAccessRule[] | undefined)[]): StationAccessRule[] {
  return [...new Map(sets.flatMap(s => s ?? []).map(r => [JSON.stringify(r), r])).values()];
}
/** Planned allowance from one dated OJP connection, not a station-wide or bike-access guarantee. */
export type StationTransferRule = {
  incomingJourneyRef: string; incomingOperatingDay: string; operatingDay: string; fromRef: string; toRef: string;
  arrival: string; departure: string; seconds: number | null;
  kind: "walk" | "guaranteedConnection" | "unknown"; checked?: string;
};
export function mergeTransferRules(...sets: (readonly StationTransferRule[] | undefined)[]): StationTransferRule[] {
  return [...new Map(sets.flatMap(s => s ?? []).map(r => [JSON.stringify(r), r])).values()];
}
function previousRide(legs: readonly TransitLeg[]) {
  for (let index = legs.length - 1; index >= 0; index--) {
    const leg = legs[index];
    if (leg.mode === "unknown" || leg.mode === "bike" && (!leg.departure || !leg.arrival || +leg.arrival > +leg.departure || (leg.cyclingRoute?.distanceKm ?? 0) > 0)) return null;
    if (leg.mode === "transit") return { leg, index };
  }
  return null;
}
/** Arrival platform/service changes onward feasibility, so it must survive dominance pruning. */
export function transferContextKey(legs: readonly TransitLeg[]): string {
  const previous = previousRide(legs)?.leg;
  if (!previous) return "access";
  return JSON.stringify([previous.ojp?.journeyRef, previous.ojp?.operatingDay, previous.ojp?.toRef,
    arrivalTime(previous), previous.toId, effectivePlatform(previous, "arrival"), previous.service, previous.operator]);
}
export type BoardingCheck = {
  readyAt: number; minutes: number; source: "ojp" | "ojp-access" | "gtfs" | "swiss-default" | "estimate" | "unknown";
  note: string; url?: string; checked?: string; transferLeg?: TransitLeg;
};
export function boardingCheck(legs: readonly TransitLeg[], next: TransitLeg, readyAt: number, fallbackMinutes: number, accessPoint?: Point): BoardingCheck {
  if (!Number.isFinite(readyAt) || !next.departure || !Number.isFinite(+next.departure))
    return { readyAt: Infinity, minutes: Infinity, source: "unknown", note: "Boarding time is unknown; this connection cannot be checked." };
  const previous = previousRide(legs), incoming = previous?.leg;
  const arrivedAt = legs.at(-1)?.cyclingRoute?.to ?? legs.at(-1)?.toPoint ?? accessPoint;
  const accesses = !platformChanged(next, "departure") && !incoming && !legs.at(-1)?.stationAccess && arrivedAt && next.ojp ? (next.accessRules ?? []).filter(rule =>
    rule.toRef === next.ojp!.fromRef && rule.operatingDay === next.ojp!.operatingDay
    && Date.parse(rule.departure) === +next.departure! && haversineKm(rule.point, arrivedAt) < .01) : [];
  if (accesses.length) {
    if (accesses.some(r => r.seconds === null || !Number.isFinite(r.seconds) || r.seconds < 0))
      return { readyAt: Infinity, minutes: Infinity, source: "unknown", note: "OJP station-access time is unknown for this boarding point.", url: TRANSFER_SOURCE };
    const seconds = Math.max(...accesses.map(r => r.seconds!));
    return { readyAt: readyAt + seconds * 1000, minutes: seconds / 60, source: "ojp-access", url: TRANSFER_SOURCE,
      checked: accesses.find(r => r.checked)?.checked,
      note: `OJP station access: ${seconds / 60} min from the queried station point to this platform, including any provider buffer. Lifts, steps and access with a bicycle remain unverified.`,
      transferLeg: seconds > 0 ? { mode: "walk", from: next.from, to: next.from, fromId: next.fromId, toId: next.fromId,
        fromPoint: arrivedAt, toPoint: next.fromPoint, departure: new Date(readyAt), arrival: new Date(readyAt + seconds * 1000),
        departurePlatform: null, arrivalPlatform: effectivePlatform(next, "departure"), service: "Access to boarding platform", serviceName: null,
        direction: null, stationAccess: true } : undefined };
  }
  const rules = incoming?.ojp && next.ojp && !platformChanged(incoming, "arrival") && !platformChanged(next, "departure") ? (next.transferRules ?? []).filter(rule =>
    rule.incomingJourneyRef === incoming.ojp!.journeyRef && rule.incomingOperatingDay === incoming.ojp!.operatingDay
    && rule.operatingDay === next.ojp!.operatingDay && rule.fromRef === incoming.ojp!.toRef && rule.toRef === next.ojp!.fromRef
    && Date.parse(rule.arrival) === +incoming.arrival! && Date.parse(rule.departure) === +next.departure!) : [];
  if (rules.length && incoming?.arrival && previous) {
    if (rules.some(r => r.seconds === null || !Number.isFinite(r.seconds) || r.seconds < 0 || r.kind === "unknown"))
      return { readyAt: Infinity, minutes: Infinity, source: "unknown", note: "OJP could not establish the time or movement needed for this connection.", url: TRANSFER_SOURCE };
    const seconds = Math.max(...rules.map(r => r.seconds!));
    const covered = legs.slice(previous.index + 1).filter(l => l.mode === "walk").reduce((sum, l) =>
      sum + (l.arrival && l.departure ? Math.max(0, (+l.arrival - +l.departure) / 1000) : 0), 0);
    const remaining = Math.max(0, seconds - covered);
    // OJP transfers inside a collapsed station become explicit timed walking,
    // not optional self-loop edges that a shortest-path search can skip.
    const transferLeg: TransitLeg | undefined = remaining > 0 ? { mode: "walk", from: next.from, to: next.from,
      fromId: next.fromId, toId: next.fromId, fromPoint: next.fromPoint, toPoint: next.fromPoint,
      departure: new Date(readyAt), arrival: new Date(readyAt + remaining * 1000),
      departurePlatform: effectivePlatform(incoming, "arrival"), arrivalPlatform: effectivePlatform(next, "departure"),
      service: "Station transfer", serviceName: null, direction: null, stationTransfer: true } : undefined;
    return { readyAt: Math.max(readyAt + remaining * 1000, +arrivalTime(incoming)! + seconds * 1000), minutes: seconds / 60,
      source: "ojp", transferLeg, url: TRANSFER_SOURCE, checked: rules.find(r => r.checked)?.checked,
      note: `OJP transfer time: ${seconds / 60} min for this dated connection (including any provider buffer)${rules.some(r => r.kind === "guaranteedConnection") ? "; the provider marks a coordinated connection, but waiting is not guaranteed" : ""}. This passenger transfer does not verify lifts, steps or bicycle access.` };
  }
  if (!platformChanged(next, "departure") && !incoming && legs.at(-1)?.stationAccess && next.ojp) {
    const access = legs.at(-1)!;
    const matched = (next.accessRules ?? []).filter(rule => rule.toRef === next.ojp!.fromRef && rule.operatingDay === next.ojp!.operatingDay
      && Date.parse(rule.departure) === +next.departure! && access.fromPoint && haversineKm(rule.point, access.fromPoint) < .01);
    if (matched.length && matched.every(r => r.seconds !== null && Number.isFinite(r.seconds) && r.seconds >= 0) && access.departure) {
      const seconds = Math.max(...matched.map(r => r.seconds!));
      return { readyAt: Math.max(readyAt, +access.departure + seconds * 1000), minutes: seconds / 60, source: "ojp-access", url: TRANSFER_SOURCE,
        checked: matched.find(r => r.checked)?.checked, note: `OJP station access: ${seconds / 60} min, already included in the platform-access step. Bicycle accessibility remains unverified.` };
    }
  }
  const imported = incoming ? staticTransfer(incoming, next) : undefined;
  if (imported?.seconds !== undefined && incoming?.arrival && previous) {
    const seconds = imported.seconds;
    const covered = legs.slice(previous.index + 1).filter(l => l.mode === "walk").reduce((sum, l) =>
      sum + (l.arrival && l.departure ? Math.max(0, (+l.arrival - +l.departure) / 1000) : 0), 0);
    const remaining = Math.max(0, seconds - covered);
    const transferLeg: TransitLeg | undefined = remaining > 0 ? { mode: "walk", from: next.from, to: next.from,
      fromId: next.fromId, toId: next.fromId, fromPoint: next.fromPoint, toPoint: next.fromPoint,
      departure: new Date(readyAt), arrival: new Date(readyAt + remaining * 1000),
      departurePlatform: effectivePlatform(incoming, "arrival"), arrivalPlatform: effectivePlatform(next, "departure"),
      service: "Station transfer", serviceName: null, direction: null, stationTransfer: true } : undefined;
    return { readyAt: Math.max(readyAt + remaining * 1000, +arrivalTime(incoming)! + seconds * 1000), minutes: seconds / 60,
      source: "gtfs", transferLeg, url: imported.feed!.source,
      note: `SBB GTFS station transfer: ${seconds / 60} min${imported.basis === "station-maximum" ? " estimated because a platform is missing, using the largest published general transfer at this station" : " for these mapped stops/platforms"}. Feed ${imported.feed!.version}, valid ${imported.feed!.validFrom} to ${imported.feed!.validThrough}. ${imported.basis === "station-maximum" ? "This station estimate does not verify the actual platform pair" : "This is a general passenger minimum"}; service-specific exceptions, lifts, steps and bicycle accessibility remain unverified.` };
  }
  const coverage = imported ? ` ${imported.reason}` : "";
  const swiss = [incoming?.ojp?.toRef, next.ojp?.fromRef, incoming?.toId, next.fromId].some(id => id && (/^ch:/.test(id) || /^85\d{5}$/.test(id)));
  if (incoming?.arrival && incoming.toId && incoming.toId === next.fromId && swiss) {
    return { readyAt: Math.max(readyAt, +arrivalTime(incoming)! + 120_000), minutes: 2, source: "swiss-default", url: SWISS_TRANSFER_SOURCE,
      note: "Swiss timetable default: 2 min within a stop. No matching transfer time was supplied; this does not verify platform access with a bicycle." + coverage };
  }
  return { readyAt: readyAt + fallbackMinutes * 60_000, minutes: fallbackMinutes, source: "estimate",
    note: `${fallbackMinutes} min boarding allowance is an app estimate. Entrance-to-platform time and bicycle access are unverified.${coverage}` };
}
