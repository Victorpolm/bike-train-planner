import { normalizeCode, operatorCode } from "./normalization.ts";
import { carriageForLeg } from "./bicycleCarriage.ts";
import { domesticSwissLeg, isSbb, sobMainlineRule } from "./operatorBicycleRules.ts";
import { swissDateTimeInput } from "./departure.ts";
import type { TransitLeg } from "./routing.ts";
import { publishedRouteFare } from "./fareCatalog.ts";
import type { OnlineFare } from "./onlineFare.ts";

export type FareProfile = { passenger: "full" | "half-fare" | "ga"; annualBikePass: boolean };
export const DEFAULT_FARE_PROFILE: FareProfile = { passenger: "full", annualBikePass: false };
export const BIKE_DAY_SOURCE = { title: "SBB Bike Day Pass", url: "https://www.sbb.ch/en/offers/bike-day-pass", checked: "2026-10-11" };
export const RESERVATION_PRICE_SOURCE = { title: "SBB bicycle reservation prices", url: "https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html", checked: "2026-10-11" };
export const POSTBUS_TICKET_SOURCE = { title: "PostBus bicycle tickets and through reservations", url: "https://www.postauto.ch/en/travel-and-services/travel-advice-and-reservations/travelling-with-a-bike", checked: "2026-10-11" };
export function readFareProfile(value: unknown): FareProfile {
  const p = value as Partial<FareProfile> | null;
  return { passenger: p && ["full", "half-fare", "ga"].includes(p.passenger ?? "") ? p.passenger! : "full",
    annualBikePass: p?.annualBikePass === true };
}
export function bikeDayPrice(date: Date): number | null {
  const day = swissDateTimeInput(date).slice(0, 10);
  return day >= "2026-01-01" && day <= "2026-12-12" ? 15 : day >= "2026-12-13" && day <= "2027-12-11" ? 16 : null;
}
export function nationalBikeTariff(leg: TransitLeg) {
  const operator = operatorCode(leg.operator), category = normalizeCode(leg.category);
  if (leg.mode !== "transit" || !domesticSwissLeg(leg)
    || /replacement|ersatz|remplacement/i.test(`${leg.service} ${leg.serviceName ?? ""}`)) return false;
  return (isSbb(leg) || sobMainlineRule(leg) || operator === "BLS")
    && ["IC", "IR", "RE", "S", "R", "EC", "ICE", "RJX", "PE"].includes(category)
    || operator === "RHB" && ["S", "R", "RE", "IR"].includes(category)
    || operator === "PAG" && ["B", "BUS", "NFB", "COACH"].includes(category);
}
export function chooseBikeTicket(reduced: number | null, dayPass: number | null, annualPass = false) {
  if (annualPass) return { chf: 0, product: "Existing annual bike pass", minimumVerified: true };
  if (dayPass !== null && (reduced === null || dayPass <= reduced)) return { chf: dayPass, product: "Bike Day Pass", minimumVerified: reduced !== null };
  if (reduced !== null) return { chf: reduced, product: "Reduced bicycle ticket", minimumVerified: dayPass !== null };
  return { chf: null, product: "Bicycle ticket to check", minimumVerified: false };
}
export function fareSummary(legs: TransitLeg[], profile: FareProfile, quote?: OnlineFare, takeBikeOnTransit = true) {
  const transit = legs.filter(l => l.mode === "transit"), rules = transit.map(carriageForLeg);
  const prohibited = takeBikeOnTransit && rules.some(r => r.permission === "prohibited");
  const covered = transit.length > 0 && transit.every(nationalBikeTariff);
  // Bike-pass acceptance does not establish passenger GA validity or the
  // reservation tariff of every participating operator/special train.
  const gaCovered = covered && transit.every(l => isSbb(l) || sobMainlineRule(l) || operatorCode(l.operator) === "BLS");
  const first = transit.find(l => l.departure)?.departure;
  const last = [...transit].reverse().find(l => l.arrival)?.arrival;
  const dayPrice = first ? bikeDayPrice(first) : null;
  const firstDay = first ? swissDateTimeInput(first).slice(0, 10) : "";
  const lastWall = last ? swissDateTimeInput(last) : "";
  const nextDate = firstDay ? new Date(Date.parse(firstDay + "T12:00:00Z") + 86400000).toISOString().slice(0, 10) : "";
  const singleDayPass = !!first && !!last && (lastWall.slice(0, 10) === firstDay || lastWall.slice(0, 10) === nextDate && lastWall.slice(11) < "05:00");
  const required = takeBikeOnTransit ? rules.filter(r => r.bikeReservation === "required").length : 0;
  const unknown = takeBikeOnTransit ? rules.filter(r => r.bikeReservation === "unknown").length : 0;
  const stationary = (l: TransitLeg) => !!l.departure && !!l.arrival && +l.departure === +l.arrival
    && l.cyclingRoute?.minutes === 0 && l.cyclingRoute.distanceKm === 0
    && (!!l.fromId && l.fromId === l.toId || !!l.fromPoint && !!l.toPoint
      && l.fromPoint.lat === l.toPoint.lat && l.fromPoint.lon === l.toPoint.lon);
  const hasCyclingBreak = legs.slice(legs.findIndex(l => l.mode === "transit") + 1,
    legs.reduce((n, l, i) => l.mode === "transit" ? i : n, -1)).some(l => l.mode === "unknown" || l.mode === "stop" || l.mode === "bike" && !stationary(l));
  const reservationCovered = covered && transit.every((l, i) => rules[i].bikeReservation !== "required" || ["SBB", "PAG"].includes(operatorCode(l.operator)));
  // SBB and PostBus explicitly charge once for a through booking, including
  // connecting modes. An interrupted journey needs a separate booking check.
  const reservationChf = !takeBikeOnTransit ? 0 : reservationCovered && dayPrice !== null && !unknown && !hasCyclingBreak ? required ? 2 : 0 : null;
  const published = publishedRouteFare(legs);
  const online = quote && (quote.passenger || quote.bicycle) ? quote : undefined;
  const passengerEstimated = profile.passenger !== "ga" && !published && !!online?.passenger;
  const bicycleEstimated = !published && !!online?.bicycle;
  const bike = !takeBikeOnTransit ? { chf: 0, product: "Bicycle stays off public transport", minimumVerified: true }
    : chooseBikeTicket(!prohibited ? published?.bicycle ?? online?.bicycle?.chf ?? null : null, covered && singleDayPass ? dayPrice : null, covered && profile.annualBikePass);
  const bikeChf = bike.chf;
  const passengerChf = profile.passenger === "ga" ? gaCovered ? 0 : null : published
    ? profile.passenger === "half-fare" ? published.passengerHalf : published.passengerFull : online?.passenger?.chf ?? null;
  const estimated = passengerEstimated || bicycleEstimated && bike.product === "Reduced bicycle ticket";
  const passenger = profile.passenger === "ga" ? gaCovered ? "Covered by your valid GA for this Swiss rail journey, in its travel class." : "GA coverage must be checked for every operator and route."
    : profile.passenger === "half-fare" ? "Request the Half Fare (Halbtax) passenger price. The exact fare depends on the route and offer."
      : "Request the full-fare passenger price. Supersaver offers may differ.";
  return { covered, gaCovered, prohibited, takeBikeOnTransit, passenger, passengerChf, published, online, estimated, passengerEstimated,
    bikeProduct: bike.product === "Reduced bicycle ticket" && bicycleEstimated ? online!.bicycle!.product + " · OJP test estimate" : bike.product,
    minimumVerified: !bicycleEstimated && bike.minimumVerified,
    bikeChf, reservationChf, required, unknown, singleDayPass,
    totalChf: !prohibited && passengerChf !== null && bikeChf !== null && reservationChf !== null ? Math.round((passengerChf + bikeChf + reservationChf) * 100) / 100 : null,
    knownBikeTotal: !prohibited && bikeChf !== null && reservationChf !== null ? bikeChf + reservationChf : null };
}

// The card and expanded details share the same components; unknown prices never
// disappear into an apparently complete total.
export function fareRows(legs: TransitLeg[], profile: FareProfile, quote?: OnlineFare, takeBikeOnTransit = true) {
  const fare = fareSummary(legs, profile, quote, takeBikeOnTransit);
  const chf = (amount: number | null) => amount === null ? "Quote needed" : `CHF ${amount.toFixed(2)}`;
  return { fare, rows: [
    { label: "Passenger", value: chf(fare.passengerChf), detail: (profile.passenger === "ga" ? fare.gaCovered ? "Covered by your valid GA" : "Check GA coverage" : profile.passenger === "half-fare" ? "Half Fare / Halbtax" : "Full fare · 2nd class") + (fare.passengerEstimated ? " · " + fare.online!.passenger!.product + " · OJP test estimate" : fare.published ? " · published tariff" : "") },
    ...(takeBikeOnTransit ? [
    { label: "Bicycle ticket", value: fare.prohibited ? "Not permitted" : chf(fare.bikeChf), detail: fare.prohibited ? "A ticket does not override a bicycle ban" : fare.bikeProduct + (fare.minimumVerified ? "" : " · cheapest option not verified") },
    { label: "Bicycle reservation", value: fare.prohibited ? "Not applicable" : chf(fare.reservationChf), detail: fare.reservationChf === 0 ? "Not required" : fare.reservationChf === 2 ? "Required · connecting services booked together" : "Requirements or booking price to check" },
    ] : []),
  ] };
}
export function fareCardSummary(legs: TransitLeg[], profile: FareProfile, quote?: OnlineFare, takeBikeOnTransit = true): { price: string; detail: string } {
  const fare = fareSummary(legs, profile, quote, takeBikeOnTransit);
  if (fare.passengerChf !== null && fare.totalChf === null) return { price: `Passenger · CHF ${fare.passengerChf.toFixed(2)}${fare.passengerEstimated ? " estimated" : ""}`,
    detail: fare.prohibited ? "Bicycles are not permitted on this comparison." : "Bicycle ticket or reservation cost is still incomplete." };
  if (fare.prohibited) return { price: "Bicycle travel not permitted", detail: "Passenger fare requested separately; no valid bicycle fare for this comparison." };
  return { price: fare.totalChf === null ? "Total needs a fare quote" : `CHF ${fare.totalChf.toFixed(2)} ${fare.estimated ? "estimated additional cost" : "additional cost"}`,
    detail: fare.estimated ? "OJP test fare estimate; confirm price and offer conditions before purchase." : fare.published ? "Published standard fares; discounted offers may differ."
      : "Passenger and bicycle route fares are not available for every connection." };
}
