import { realtimeStale, type JourneyFeasibility } from "./realtime.ts";
import { arrivalTime, departureTime, moveAfter, realtimeKey, realtimeUnavailable, platformChanged, type TransitRealtime } from "./realtime.ts";
import { boardingCheck } from "./transferTimes.ts";
import type { Journey, TransitLeg } from "./routing.ts";
import { visitHours } from "./facilityHours.ts";
import { bicyclePermission } from "./bicyclePermission.ts";
import type { TravelProfile } from "./travelProfile.ts";

/** Re-evaluate the selected path without changing its scheduled service/fare IDs
 * or silently replacing it when a cancellation makes it impossible. */
export type RealtimePlatforms = ReadonlyMap<string, Pick<TransitLeg, "stationArrival" | "stationDeparture" | "bicycleEvidence" | "bicycleAttributes">>;
export function realtimeJourney(raw: Journey, updates: ReadonlyMap<string, TransitRealtime>, boardingMinutes = 3, arriveBy?: string, platforms?: RealtimePlatforms, now=Date.now(), profile?: TravelProfile, takeBikeOnTransit = true) {
  const legs: TransitLeg[] = [], issues: string[] = [];
  let ready = +raw.startTime + (raw.legsIncludeEndpoints ? 0 : raw.originStation.bikeMinutes * 60_000);
  for (const original of raw.transitLegs) {
    const update = updates.get(realtimeKey(original));
    const leg = moveAfter({ ...original, ...(update ? { realtime: update } : {}), ...platforms?.get(realtimeKey(original)) }, ready);
    if (leg.mode === "transit") {
      if (takeBikeOnTransit && bicyclePermission(leg, profile) === "prohibited") issues.push(`${leg.service}: bicycle carriage is prohibited for your configuration. Choose another journey or leave the bicycle off public transport.`);
      if (realtimeUnavailable(leg)) issues.push(`${leg.service}: ${leg.realtime?.cancelled ? "service cancelled" : "your boarding or arrival stop is not served"}. Choose another journey.`);
      const check = boardingCheck(legs, leg, ready, boardingMinutes, raw.originStation.cyclingRoute?.to ?? raw.originStation);
      const incoming = [...legs].reverse().find(l => l.mode === "transit");
      if ((platformChanged(leg, "departure") || incoming && platformChanged(incoming, "arrival")) && !["gtfs", "ojp", "ojp-access"].includes(check.source))
        issues.push(`${leg.service}: platform changed; the connection allowance could not be verified for the new platform. Check the station information.`);
      if (!departureTime(leg) || check.readyAt > +departureTime(leg)!) issues.push(`${leg.service}: ${legs.some(l => l.mode === "transit") ? "connection" : "boarding"} is no longer feasible with the latest times and transfer allowance. Search again.`);
      if (check.transferLeg) legs.push(check.transferLeg);
      if (leg.realtime?.undefinedDelay) issues.push(`${leg.service}: the provider reports a delay of unknown duration.`);
    }
    legs.push(leg);
    if (leg.facilityVisit && departureTime(leg) && arrivalTime(leg)
      && visitHours(leg.facilityVisit.openingHours, leg.facilityVisit.seasonal, departureTime(leg)!, arrivalTime(leg)!).state === "closed")
      issues.push(`${leg.facilityVisit.name}: the updated arrival no longer fits the mapped opening hours. Review this stop.`);
    ready = +(arrivalTime(leg) ?? new Date(ready));
  }
  const arrival = new Date(ready), end = ready + (raw.legsIncludeEndpoints ? 0 : raw.destinationStation.bikeMinutes * 60_000);
  if (arriveBy && end > Date.parse(arriveBy)) issues.push("The latest estimated arrival is after your requested arrival time.");
  const transit=legs.filter(l=>l.mode==="transit");
  const broken=issues.some(s=>/no longer feasible|service cancelled|stop is not served|bicycle carriage is prohibited/.test(s));
  const risk=issues.some(s=>/platform changed|unknown duration|after your requested|opening hours/.test(s));
  const known=transit.length>0 && transit.every(l=>l.realtime && !realtimeStale(l.realtime,now) && l.realtime.estimatedDeparture && l.realtime.estimatedArrival);
  const late=transit.some(l=>l.realtime && (l.realtime.estimatedArrival && l.arrival && Date.parse(l.realtime.estimatedArrival)>+l.arrival || l.realtime.estimatedDeparture&&l.departure&&Date.parse(l.realtime.estimatedDeparture)>+l.departure));
  const feasibility: JourneyFeasibility=broken?"broken":risk?"at-risk":!transit.some(l=>l.realtime)?"scheduled":!known?"unknown":late?"late":"estimated";
  return { feasibility, journey: { ...raw, realtimeStatus:{state:feasibility,checkedAt:new Date(now).toISOString(),issues:[...new Set(issues)]}, transitLegs: legs, departure: legs.length ? departureTime(legs[0])! : raw.departure,
    arrival, totalMinutes: (end - +raw.startTime) / 60_000,
    trainMinutes: (ready - +(legs.length ? departureTime(legs[0])! : raw.departure)) / 60_000 } as Journey,
    issues: [...new Set(issues)] };
}
