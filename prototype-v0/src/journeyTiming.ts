import { arrivalTime, departureTime } from "./realtime.ts";
import { metrics } from "./model.ts";
import { boardingCheck } from "./transferTimes.ts";
import type { Journey, TransitLeg } from "./routing.ts";

const minute = 60_000;
const validTimes = (leg: TransitLeg) => leg.departure && leg.arrival
  && Number.isFinite(+leg.departure) && Number.isFinite(+leg.arrival) && +leg.arrival >= +leg.departure;
// Timetabled walks and fare-bearing provider legs stay fixed. Only our own
// untimed street/access movements can move with the origin departure.
const flexible = (leg: TransitLeg) => !leg.ojp && !leg.fareSources?.length
  && (leg.mode === "bike" || leg.mode === "walk" && (!!leg.walkingRoute || !!leg.stationAccess));
function prefixLength(journey: Journey) {
  const index = journey.transitLegs.findIndex(leg => !flexible(leg));
  return index < 0 ? journey.transitLegs.length : index;
}

/** Move only the flexible origin prefix. All fixed services keep object identity,
 * dated evidence and fares. Raw search journeys are never mutated. */
function shiftPrefix(journey: Journey, count: number, shift: number): Journey {
  if (!shift) return journey;
  const boundary = journey.transitLegs[count]?.departure;
  const legs = journey.transitLegs.map((leg, i) => i < count
    ? { ...leg, departure: new Date(+leg.departure! + shift), arrival: new Date(+leg.arrival! + shift) } : leg);
  return { ...journey, startTime: new Date(+journey.startTime + shift),
    totalMinutes: journey.totalMinutes - shift / minute,
    waitMinutes: Math.max(0, journey.waitMinutes - shift / minute),
    departure: count ? legs[0].departure! : journey.departure,
    transitLegs: legs,
    waypoints: journey.waypoints?.map(visit => boundary && +visit.arrival < +boundary
      ? { ...visit, arrival: new Date(+visit.arrival + shift) } : visit) };
}

/** Restore available origin time for an edit to a flexible access section. */
export function earlierJourneyStart(journey: Journey, earliest: Date): Journey {
  if (!Number.isFinite(+earliest) || +earliest >= +journey.startTime) return journey;
  const count = prefixLength(journey);
  if (journey.transitLegs.slice(0, count).some(leg => !validTimes(leg))) return journey;
  return shiftPrefix(journey, count, +earliest - +journey.startTime);
}

export function journeyTiming(raw: Journey, boardingMinutes = 3, requestedStart = raw.startTime) {
  let journey = raw;
  const count = prefixLength(raw), prefix = raw.transitLegs.slice(0, count), anchor = raw.transitLegs[count];
  const ready = +((prefix.length ? arrivalTime(prefix.at(-1)!) : null) ?? new Date(+raw.startTime + raw.originStation.bikeMinutes * minute));
  if (anchor && validTimes(anchor) && ["transit", "walk"].includes(anchor.mode)
    && prefix.every(validTimes) && Number.isFinite(ready)) {
    const check = anchor.mode === "transit" ? boardingCheck(prefix, anchor, ready, boardingMinutes,
      raw.originStation.cyclingRoute?.to ?? raw.originStation) : { readyAt: ready };
    // Minute-aligned departures are rounded earlier, never later than readiness.
    const latest = Math.floor((+raw.startTime + +departureTime(anchor)! - check.readyAt) / minute) * minute;
    const shift = Math.max(0, latest - +raw.startTime);
    if (Number.isFinite(shift) && shift > 0) {
      const candidate = shiftPrefix(raw, count, shift), moved = candidate.transitLegs.slice(0, count);
      const movedReady = +((moved.length ? arrivalTime(moved.at(-1)!) : null) ?? new Date(+candidate.startTime + candidate.originStation.bikeMinutes * minute));
      const checked = anchor.mode === "transit" ? boardingCheck(moved, anchor, movedReady, boardingMinutes,
        candidate.originStation.cyclingRoute?.to ?? candidate.originStation).readyAt : movedReady;
      if (checked <= +departureTime(anchor)!) journey = candidate;
    }
  }
  const arrival = new Date(+raw.startTime + raw.totalMinutes * minute);
  const m = metrics(journey);
  const transitMinutes = journey.transitLegs.filter(l => l.mode === "transit").reduce((sum, l) => sum
    + (validTimes(l) ? (+arrivalTime(l)! - +departureTime(l)!) / minute : 0), 0);
  return { journey, departure: journey.startTime, arrival, journeyMinutes: journey.totalMinutes,
    beforeDepartureMinutes: Math.max(0, (+journey.startTime - +requestedStart) / minute),
    elapsedMinutes: (+arrival - +requestedStart) / minute, cyclingMinutes: m.bike, walkingMinutes: m.walk,
    transitMinutes, connectionMinutes: Math.max(0, journey.totalMinutes - m.active - transitMinutes) };
}

export type JourneyTiming = ReturnType<typeof journeyTiming>;
