import { carriageForLeg } from "./bicycleCarriage.ts";
import { domesticSwissLeg, isSbb, sobMainlineRule } from "./operatorBicycleRules.ts";
import { swissDateTimeInput } from "./departure.ts";
import type { TransitLeg } from "./routing.ts";

export type FareProfile = { passenger: "full" | "half-fare" | "ga"; annualBikePass: boolean };
export const DEFAULT_FARE_PROFILE: FareProfile = { passenger: "full", annualBikePass: false };
export const BIKE_DAY_SOURCE = { title: "SBB Bike Day Pass", url: "https://www.sbb.ch/en/offers/bike-day-pass", checked: "2026-09-25" };
export const RESERVATION_PRICE_SOURCE = { title: "SBB bicycle reservation prices", url: "https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html", checked: "2026-09-25" };
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
  const bikeChf = covered && profile.annualBikePass ? 0 : covered && singleDayPass ? dayPrice : null;
  const passenger = profile.passenger === "ga" ? covered ? "Covered by your valid GA for this Swiss rail journey, in its travel class." : "GA coverage must be checked for every operator and route."
    : profile.passenger === "half-fare" ? "Request the Half Fare (Halbtax) passenger price. The exact fare depends on the route and offer."
      : "Request the full-fare passenger price. Supersaver offers may differ.";
  return { covered, prohibited, passenger, bikeChf, reservationChf, required, unknown, singleDayPass,
    knownBikeTotal: !prohibited && bikeChf !== null && reservationChf !== null ? bikeChf + reservationChf : null };
}
