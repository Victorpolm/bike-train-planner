import { carriageForLeg } from "./bicycleCarriage.ts";
import { domesticSwissLeg, isSbb, sobMainlineRule } from "./operatorBicycleRules.ts";
import { swissDateTimeInput } from "./departure.ts";
import type { TransitLeg } from "./routing.ts";
import { publishedRouteFare } from "./fareCatalog.ts";

export type FareProfile = { passenger: "full" | "half-fare" | "ga"; annualBikePass: boolean };
export const DEFAULT_FARE_PROFILE: FareProfile = { passenger: "full", annualBikePass: false };
export const BIKE_DAY_SOURCE = { title: "SBB Bike Day Pass", url: "https://www.sbb.ch/en/offers/bike-day-pass", checked: "2026-09-27" };
export const RESERVATION_PRICE_SOURCE = { title: "SBB bicycle reservation prices", url: "https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html", checked: "2026-09-27" };
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
  return domesticSwissLeg(leg) && (isSbb(leg) || sobMainlineRule(leg) || ["BLS", "BLS-BLS", "BLS AG", "OJP:33"].includes(leg.operator?.toUpperCase() ?? ""))
    && ["IC", "IR", "RE", "S", "R", "EC", "ICE", "RJX", "PE"].includes(leg.category?.toUpperCase() ?? "");
}
export function chooseBikeTicket(reduced: number | null, dayPass: number | null, annualPass = false) {
  if (annualPass) return { chf: 0, product: "Existing annual bike pass", minimumVerified: true };
  if (dayPass !== null && (reduced === null || dayPass <= reduced)) return { chf: dayPass, product: "Bike Day Pass", minimumVerified: reduced !== null };
  if (reduced !== null) return { chf: reduced, product: "Reduced bicycle ticket", minimumVerified: dayPass !== null };
  return { chf: null, product: "Bicycle ticket to check", minimumVerified: false };
}
export function fareSummary(legs: TransitLeg[], profile: FareProfile) {
  const transit = legs.filter(l => l.mode === "transit"), rules = transit.map(carriageForLeg);
  const prohibited = rules.some(r => r.permission === "prohibited");
  const covered = transit.length > 0 && transit.every(nationalBikeTariff);
  const first = transit.find(l => l.departure)?.departure;
  const last = [...transit].reverse().find(l => l.arrival)?.arrival;
  const dayPrice = first ? bikeDayPrice(first) : null;
  const firstDay = first ? swissDateTimeInput(first).slice(0, 10) : "";
  const lastWall = last ? swissDateTimeInput(last) : "";
  const nextDate = firstDay ? new Date(Date.parse(firstDay + "T12:00:00Z") + 86400000).toISOString().slice(0, 10) : "";
  const singleDayPass = !!first && !!last && (lastWall.slice(0, 10) === firstDay || lastWall.slice(0, 10) === nextDate && lastWall.slice(11) < "05:00");
  const required = rules.filter(r => r.bikeReservation === "required").length;
  const unknown = rules.filter(r => r.bikeReservation === "unknown").length;
  const hasCyclingBreak = legs.slice(legs.findIndex(l => l.mode === "transit") + 1,
    legs.reduce((n, l, i) => l.mode === "transit" ? i : n, -1)).some(l => l.mode === "bike");
  // The published Swiss rail charge covers connecting trains in one booking.
  const reservationChf = covered && dayPrice !== null && !unknown && !hasCyclingBreak ? required ? 2 : 0 : null;
  const published = publishedRouteFare(legs);
  const bike = chooseBikeTicket(published?.bicycle ?? null, covered && singleDayPass ? dayPrice : null, covered && profile.annualBikePass);
  const bikeChf = bike.chf;
  const passengerChf = profile.passenger === "ga" ? covered ? 0 : null : published
    ? profile.passenger === "half-fare" ? published.passengerHalf : published.passengerFull : null;
  const passenger = profile.passenger === "ga" ? covered ? "Covered by your valid GA for this Swiss rail journey, in its travel class." : "GA coverage must be checked for every operator and route."
    : profile.passenger === "half-fare" ? "Request the Half Fare (Halbtax) passenger price. The exact fare depends on the route and offer."
      : "Request the full-fare passenger price. Supersaver offers may differ.";
  return { covered, prohibited, passenger, passengerChf, published, bikeProduct: bike.product, minimumVerified: bike.minimumVerified,
    bikeChf, reservationChf, required, unknown, singleDayPass,
    totalChf: !prohibited && passengerChf !== null && bikeChf !== null && reservationChf !== null ? Math.round((passengerChf + bikeChf + reservationChf) * 100) / 100 : null,
    knownBikeTotal: !prohibited && bikeChf !== null && reservationChf !== null ? bikeChf + reservationChf : null };
}

// The card and expanded details share the same components; unknown prices never
// disappear into an apparently complete total.
export function fareRows(legs: TransitLeg[], profile: FareProfile) {
  const fare = fareSummary(legs, profile);
  const chf = (amount: number | null) => amount === null ? "Quote needed" : `CHF ${amount.toFixed(2)}`;
  return { fare, rows: [
    { label: "Passenger", value: chf(fare.passengerChf), detail: profile.passenger === "ga" ? fare.covered ? "Covered by your valid GA" : "Check GA coverage" : profile.passenger === "half-fare" ? "Half Fare / Halbtax" : "Full fare · 2nd class" },
    { label: "Bicycle ticket", value: chf(fare.bikeChf), detail: fare.bikeProduct + (fare.minimumVerified ? "" : " · cheapest option not verified") },
    { label: "Bicycle reservation", value: chf(fare.reservationChf), detail: fare.reservationChf === 0 ? "Not required" : fare.reservationChf === 2 ? "Required · connecting trains booked together" : "Requirements or booking price to check" },
  ] };
}
export function fareCardSummary(legs: TransitLeg[], profile: FareProfile): { price: string; detail: string } {
  const fare = fareSummary(legs, profile);
  if (fare.prohibited) return { price: "Bicycle travel not permitted", detail: "No valid bicycle fare for this comparison." };
  return { price: fare.totalChf === null ? "Total needs a fare quote" : `CHF ${fare.totalChf.toFixed(2)} additional cost`,
    detail: fare.published ? "Published standard fares; discounted offers may differ."
      : "Passenger and bicycle route fares are not available for every connection." };
}
