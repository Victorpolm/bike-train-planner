import { carriageForLeg } from "./bicycleCarriage.ts";
import { fareSummary, type FareProfile } from "./fares.ts";
import type { OnlineFare } from "./onlineFare.ts";
import type { Journey } from "./routing.ts";

/** Deliberately allowlisted: no retained XML, full geometry, GPS, or saved places. */
export function journeyDataReport(journey: Journey, profile: FareProfile, quote?: OnlineFare, takeBikeOnTransit = true,
  observation = "", actualCyclingMinutes?: number) {
  const fare = fareSummary(journey.transitLegs, profile, quote, takeBikeOnTransit);
  const services = journey.transitLegs.filter(l => l.mode === "transit").map(leg => {
    const rule = carriageForLeg(leg);
    return { service: leg.service, operator: leg.operator, from: leg.from, to: leg.to, fromId: leg.fromId, toId: leg.toId,
      departure: leg.departure?.toISOString(), arrival: leg.arrival?.toISOString(), journeyRef: leg.ojp?.journeyRef,
      operatingDay: leg.ojp?.operatingDay, permission: takeBikeOnTransit ? rule.permission : "bicycle-off-transit",
      reservation: takeBikeOnTransit ? rule.bikeReservation : "not-applicable", datedEvidence: rule.evidence ? { permission: rule.evidence.permission, basis: rule.evidence.basis,
        source: rule.evidence.source, conditions: [...rule.evidence.conditions],
        bikeTicket: rule.evidence.prerequisites?.bikeTicket, bikeReservation: rule.evidence.prerequisites?.bikeReservation } : null,
      operatorSource: rule.permissionSource, reservationSource: rule.reservationSource,
      arrivalTransfer: leg.stationArrival ? { status: leg.stationArrival.status, feed: leg.stationArrival.feed, reason: leg.stationArrival.reason } : null,
      departureTransfer: leg.stationDeparture ? { status: leg.stationDeparture.status, feed: leg.stationDeparture.feed, reason: leg.stationDeparture.reason } : null,
      realtime: leg.realtime };
  });
  return { format: "re.route-data-report-v1", created: new Date().toISOString(), profile: { ...profile }, takeBikeOnTransit,
    fare: { passengerChf: fare.passengerChf, bikeChf: fare.bikeChf, reservationChf: fare.reservationChf, totalChf: fare.totalChf,
      bikeProduct: fare.bikeProduct, estimated: fare.estimated, published: fare.published, online: quote ?? null }, services,
    cycling: journey.transitLegs.filter(l => l.cyclingRoute).map(l => ({ from: l.from, to: l.to, estimatedMinutes: l.cyclingRoute!.minutes,
      distanceKm: l.cyclingRoute!.distanceKm })),
    observation: observation.slice(0,2000),
    ...(Number.isFinite(actualCyclingMinutes) && actualCyclingMinutes! > 0 && actualCyclingMinutes! <= 1440 ? { actualCyclingMinutes } : {}),
  };
}
