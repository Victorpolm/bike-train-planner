import { readTravelProfile, childBikeFree, validPassOn, type TravelProfile } from "./travelProfile.ts";
import { tariffSource } from "./tariffSources.ts";
import { BIKE_PROFILE_SOURCE, CHILD_TARIFF_SOURCE } from "./bikeEligibility.ts";
import { knownPrice, unknownPrice, priceAmount, priceLabel, priceConditions, sumPrices, type Priced } from "./priced.ts";
import { normalizeCode, operatorCode } from "./normalization.ts";
import { carriageForLeg } from "./bicycleCarriage.ts";
import { domesticSwissLeg, isSbb, sobMainlineRule } from "./operatorBicycleRules.ts";
import { swissDateTimeInput } from "./departure.ts";
import type { TransitLeg } from "./routing.ts";
import { publishedRouteFare, routeTariffProblem } from "./fareCatalog.ts";
import type { OnlineFare } from "./onlineFare.ts";

export type FareProfile = TravelProfile & { passenger: "full" | "half-fare" | "ga"; annualBikePass: boolean };
export const DEFAULT_FARE_PROFILE: FareProfile = { passenger: "full", annualBikePass: false };
const BIKE_DAY_SOURCE = { title: "SBB Bike Day Pass", url: "https://www.sbb.ch/en/offers/bike-day-pass", checked: "2026-10-11" };
const RESERVATION_PRICE_SOURCE = { title: "SBB bicycle reservation prices", url: "https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html", checked: "2026-10-11" };
export function readFareProfile(value: unknown): FareProfile {
  const p = value as Partial<FareProfile> | null;
  return { passenger: p && ["full", "half-fare", "ga"].includes(p.passenger ?? "") ? p.passenger! : "full",
    annualBikePass: p?.annualBikePass === true, ...readTravelProfile(value) };
}
export function bikeDayPrice(date: Date): number | null {
  const day = swissDateTimeInput(date).slice(0, 10);
  return day >= "2026-01-01" && day <= "2026-12-12" ? 15 : day >= "2026-12-13" && day <= "2027-12-11" ? 16 : null;
}
export function nationalBikeTariff(leg: TransitLeg) {
  const operator = operatorCode(leg.operator), category = normalizeCode(leg.category);
  if (leg.mode !== "transit" || !domesticSwissLeg(leg)
    || /replacement|ersatz|remplacement/i.test(`${leg.service} ${leg.serviceName ?? ""}`)) return false;
  return (isSbb(leg) || sobMainlineRule(leg))
    && ["IC", "IR", "RE", "S", "R", "EC", "ICE", "RJX", "PE"].includes(category)
    || operator === "BLS" && ["S", "R", "RE", "IR"].includes(category)
    || operator === "RHB" && ["S", "R", "RE", "IR"].includes(category)
    || operator === "PAG" && ["B", "BUS", "NFB", "COACH"].includes(category)
    || ["VBZ", "VBG", "VZO", "STBW"].includes(operator) && ["T", "TRAM", "B", "BUS", "NFB", "TROLLEYBUS"].includes(category);
}
export function chooseBikeTicket(reduced: number | null, dayPass: number | null, annualPass = false) {
  if (annualPass) return { chf: 0, product: "Existing annual bike pass", minimumVerified: true };
  if (dayPass !== null && (reduced === null || dayPass <= reduced)) return { chf: dayPass, product: "Bike Day Pass", minimumVerified: reduced !== null };
  if (reduced !== null) return { chf: reduced, product: "Reduced bicycle ticket", minimumVerified: dayPass !== null };
  return { chf: null, product: "Bicycle ticket to check", minimumVerified: false };
}
export function fareSummary(legs: TransitLeg[], profile: FareProfile, quote?: OnlineFare, takeBikeOnTransit = true) {
  const transit = legs.filter(l => l.mode === "transit"), rules = transit.map(leg => carriageForLeg(leg, profile));
  const prohibited = takeBikeOnTransit && rules.some(r => r.permission === "prohibited");
  const coverageReviewed = transit.every(l => !!l.departure && !!l.arrival && swissDateTimeInput(l.arrival).slice(0,10) <= tariffSource("bike-coverage").validThrough);
  const covered = transit.length > 0 && coverageReviewed && transit.every(nationalBikeTariff);
  // Bike-pass acceptance does not establish passenger GA validity or the
  // reservation tariff of every participating operator/special train.
  const gaCovered = covered && transit.every(l => isSbb(l) || sobMainlineRule(l) || ["BLS", "VBZ", "VBG", "VZO", "STBW"].includes(operatorCode(l.operator)));
  const first = transit.find(l => l.departure)?.departure;
  const last = [...transit].reverse().find(l => l.arrival)?.arrival;
  const dayPrice = first ? bikeDayPrice(first) : null;
  const firstDay = first ? swissDateTimeInput(first).slice(0, 10) : "";
  const lastWall = last ? swissDateTimeInput(last) : "";
  const nextDate = firstDay ? new Date(Date.parse(firstDay + "T12:00:00Z") + 86400000).toISOString().slice(0, 10) : "";
  const singleDayPass = !!first && !!last && (lastWall.slice(0, 10) === firstDay || lastWall.slice(0, 10) === nextDate && lastWall.slice(11) < "05:00");
  const luggage = transit.length > 0 && rules.every(r => r.profileRule.reservationExempt);
  const freeChild = childBikeFree(profile) && covered && validPassOn(profile, firstDay) && firstDay >= tariffSource("t600").validFrom && firstDay <= tariffSource("t600").validThrough;
  const ageReservationFree = profile.age != null && profile.age < 6 && freeChild;
  const required = takeBikeOnTransit && !luggage && !ageReservationFree ? rules.filter(r => r.bikeReservation === "required").length : 0;
  const unknown = takeBikeOnTransit && !luggage && !ageReservationFree ? rules.filter(r => r.bikeReservation === "unknown").length : 0;
  const stationary = (l: TransitLeg) => !!l.departure && !!l.arrival && +l.departure === +l.arrival
    && l.cyclingRoute?.minutes === 0 && l.cyclingRoute.distanceKm === 0
    && (!!l.fromId && l.fromId === l.toId || !!l.fromPoint && !!l.toPoint
      && l.fromPoint.lat === l.toPoint.lat && l.fromPoint.lon === l.toPoint.lon);
  const hasCyclingBreak = legs.slice(legs.findIndex(l => l.mode === "transit") + 1,
    legs.reduce((n, l, i) => l.mode === "transit" ? i : n, -1)).some(l => l.mode === "unknown" || l.mode === "stop" || l.mode === "bike" && !stationary(l));
  const reservationCovered = covered && transit.every((l, i) => rules[i].bikeReservation !== "required" || ["SBB", "PAG"].includes(operatorCode(l.operator)));
  // SBB and PostBus explicitly charge once for a through booking, including
  // connecting modes. An interrupted journey needs a separate booking check.
  const reservationChf = prohibited ? null : !takeBikeOnTransit || luggage || ageReservationFree ? 0 : reservationCovered && dayPrice !== null && !unknown && !hasCyclingBreak ? required ? 2 : 0 : null;
  const published = publishedRouteFare(legs);
  const online = quote && (quote.passenger || quote.bicycle) ? quote : undefined;
  const passengerEstimated = profile.passenger !== "ga" && !published && !!online?.passenger;
  const bicycleEstimated = !published && !!online?.bicycle;
  const existingDay = covered && singleDayPass && ["day","multi-day"].includes(profile.existingBikePass ?? "") && profile.bikePassDate === firstDay;
  const annualValid = covered && profile.bikePassValidThrough !== "invalid" && (profile.annualBikePass || profile.existingBikePass === "mobility") && (!profile.bikePassValidThrough || profile.bikePassValidThrough >= lastWall.slice(0,10));
  const bike = prohibited ? { chf:null, product:"Bicycle carriage prohibited", minimumVerified:false }
    : !takeBikeOnTransit ? { chf: 0, product: "Bicycle stays off public transport", minimumVerified: true }
    : luggage ? {chf:0,product:"Hand luggage · no bicycle ticket",minimumVerified:true}
    : freeChild ? {chf:0,product:"Eligible child bicycle · free carriage",minimumVerified:true}
    : existingDay ? {chf:0,product:profile.existingBikePass === "day" ? "Existing dated Bike Day Pass" : "Validated multi-day bike pass field",minimumVerified:true}
    : chooseBikeTicket(published?.bicycle ?? online?.bicycle?.chf ?? null, covered && singleDayPass ? dayPrice : null, annualValid);
  const bikeChf = bike.chf;
  let passengerChf = profile.passenger === "ga" ? gaCovered ? 0 : null : published
    ? profile.passenger === "half-fare" ? published.passengerHalf : published.passengerFull : online?.passenger?.chf ?? null;
  const estimated = passengerEstimated || bicycleEstimated && bike.product === "Reduced bicycle ticket";
  const passenger = profile.passenger === "ga" ? gaCovered ? "Covered by your valid GA for this Swiss rail journey, in its travel class." : "GA coverage must be checked for every operator and route."
    : profile.passenger === "half-fare" ? "Request the Half Fare (Halbtax) passenger price. The exact fare depends on the route and offer."
      : "Request the full-fare passenger price. Supersaver offers may differ.";
  const links = [...new Map(transit.map((leg,i)=>[operatorCode(leg.operator), {operator:leg.operator ?? "Transport operator",url:rules[i].ticketSource?.url ?? BIKE_DAY_SOURCE.url}])).values()];
  const localProblem = routeTariffProblem(legs);
  const classMismatch = profile.travelClass === "first" && !(profile.passenger === "ga" && profile.gaClass === "first");
  const passInvalid = !validPassOn(profile, firstDay) || !validPassOn(profile, lastWall.slice(0,10));
  const child = profile.age != null && profile.age < 16;
  const childPassengerFree = child && !profile.organizedGroup && !passInvalid && gaCovered &&
    (profile.childCard === "child-ga" || profile.accompaniedBy16Plus && (profile.age! < 6 || profile.qualifyingCompanion && ["junior","co-travel"].includes(profile.childCard ?? "")));
  if (classMismatch || profile.organizedGroup || (profile.otherPass?.name && !(profile.passenger === "ga" && gaCovered)) || (profile.passenger !== "full" || profile.childCard && profile.childCard !== "none") && passInvalid) passengerChf=null;
  else if (childPassengerFree || profile.passenger === "ga" && gaCovered) passengerChf=0;
  else if (child) passengerChf=profile.age! >= 6 ? published?.passengerHalf ?? null : null;
  const source = published ? {...published.source,validThrough:published.validTo} : BIKE_DAY_SOURCE;
  const onlinePrice = (offer: NonNullable<OnlineFare["passenger"]>): Priced => knownPrice(offer.chf,offer.product,{title:"OJP integration fare",url:"https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/",checked:online!.checked},
    {id:offer.productId,environment:"test",basis:"quoted",checkedAt:online!.checked,flexibility:offer.flexibility ?? (offer.productId === "125" ? "flexible" : offer.productId === "84004" || /sparbillett|supersaver/i.test(offer.product) ? "train-bound" : "unknown"),availability:offer.productId === "125" ? "unknown" : "capacity-limited"});
  const passengerPrice: Priced = passengerChf===null ? unknownPrice(localProblem ?? (classMismatch ? "First-class fare or class upgrade is not in the reviewed tariff. Request an operator quote." : passInvalid ? "The passenger travelcard is outside its entered validity dates." : profile.otherPass?.name ? `Coverage of ${profile.otherPass.name} has not been verified for this route; confirm its zones, class and date.` : profile.organizedGroup ? "Organized group concessions require a separate operator quote." : profile.passenger === "ga" ? "Check GA coverage for every operator, route, class and travel date." : "No reviewed fare for this passenger, class and complete route."),localProblem?"expired":"unreviewed",links)
    : passengerEstimated && !child && online?.passenger ? onlinePrice(online.passenger) : knownPrice(passengerChf,childPassengerFree ? "Eligible child passenger entitlement" : child ? "Child fare · no additional Half Fare discount" : profile.passenger === "ga" ? "Existing GA Travelcard" : "Published passenger ticket",source,{basis:passengerChf===0?"entitlement":"published",conditions:profile.age==null?["Adult fare assumed; enter age on the travel date for child concessions"]:[]});
  let bicyclePrice: Priced = prohibited ? unknownPrice("This bicycle cannot be carried on at least one selected service. A ticket or pass does not override the restriction.","prohibited")
    : bikeChf===null ? unknownPrice(covered && dayPrice===null ? `The reviewed bicycle day-pass price covers 2026-01-01 through ${tariffSource("bike-day").validThrough}; obtain a current quote.` : "Bicycle ticket coverage or reduced route fare has not been verified for every service.",covered&&dayPrice===null?"expired":"unreviewed",links)
    : knownPrice(bikeChf,bike.product,luggage?BIKE_PROFILE_SOURCE:freeChild?CHILD_TARIFF_SOURCE:bike.product==="Reduced bicycle ticket" && published ? source : tariffSource("bike-day"),{basis:bikeChf===0?"entitlement":"published",conditions:freeChild?["Child concession depends on the saved accompaniment/travelcard and private-journey conditions"]:!bike.minimumVerified?["cheapest option not verified; a reduced route ticket may cost less"]:[]});
  if (!prohibited && bike.product === "Reduced bicycle ticket" && bicycleEstimated && online?.bicycle) bicyclePrice=onlinePrice(online.bicycle);
  if (!prohibited && takeBikeOnTransit && rules.some(r=>r.profileRule.pricingUncertain)) bicyclePrice=unknownPrice("Bicycle dimensions, trailer or loading requirements need operator confirmation before a complete bicycle price can be quoted.","unreviewed",links);
  const reservationPrice: Priced = prohibited ? unknownPrice("Reservation cannot make a prohibited bicycle journey valid.","prohibited") : reservationChf===null ? unknownPrice("Reservation conditions or a through-booking price remain unverified.","incomplete",links) : knownPrice(reservationChf,reservationChf===0?"No bicycle reservation required":"Through bicycle reservation",RESERVATION_PRICE_SOURCE,{conditions:reservationChf>0?["Connecting services must be booked together; no space is reserved by this app"]:[]});
  const totalPrice = takeBikeOnTransit && rules.some(r=>r.profileRule.permission === "uncertain") ? unknownPrice("Confirm that this bicycle configuration is accepted before treating these components as a complete journey price.","incomplete",links) : sumPrices([passengerPrice,bicyclePrice,reservationPrice],source);
  return { covered, gaCovered, prohibited, takeBikeOnTransit, passenger, passengerChf:priceAmount(passengerPrice), published, online, estimated, passengerEstimated,
    passengerPrice,bicyclePrice,reservationPrice,totalPrice, tariffProblem:localProblem,
    multipleDayPrice:dayPrice===null?unknownPrice("Current six-day pack price requires a publisher quote."):knownPrice(dayPrice*6,"Multiple-day bike pass · six travel days",tariffSource("bike-day"),{conditions:["Validate one field for each travel day; reservations are separate. This pack is not added to the journey total."]}),
    bikeProduct: bike.product === "Reduced bicycle ticket" && bicycleEstimated ? online!.bicycle!.product + " · OJP test estimate" : bike.product,
    minimumVerified: !bicycleEstimated && bike.minimumVerified,
    bikeChf:priceAmount(bicyclePrice), reservationChf:priceAmount(reservationPrice), required, unknown, singleDayPass,
    totalChf: priceAmount(totalPrice),
    knownBikeTotal: priceAmount(sumPrices([bicyclePrice,reservationPrice],source)) };
}

// The card and expanded details share the same components; unknown prices never
// disappear into an apparently complete total.
export function fareRows(legs: TransitLeg[], profile: FareProfile, quote?: OnlineFare, takeBikeOnTransit = true) {
  const fare = fareSummary(legs, profile, quote, takeBikeOnTransit);
  return {fare,rows:[{label:"Passenger",value:priceLabel(fare.passengerPrice),detail:priceConditions(fare.passengerPrice)},
    ...(takeBikeOnTransit?[{label:"Bicycle ticket",value:priceLabel(fare.bicyclePrice),detail:priceConditions(fare.bicyclePrice)},
      {label:"Bicycle reservation",value:priceLabel(fare.reservationPrice),detail:priceConditions(fare.reservationPrice)}]:[])]};
}
export function fareCardSummary(legs: TransitLeg[], profile: FareProfile, quote?: OnlineFare, takeBikeOnTransit = true): {price:string;detail:string} {
  const fare=fareSummary(legs,profile,quote,takeBikeOnTransit);
  if(fare.prohibited) return {price:fare.passengerPrice.known?`Passenger · ${priceLabel(fare.passengerPrice)}`:"Bicycle travel not permitted",detail:"Bicycle travel not permitted. "+priceConditions(fare.bicyclePrice)};
  if(fare.totalPrice.known) return {price:`${priceLabel(fare.totalPrice)} ${fare.estimated?"estimated additional cost":"additional cost"}`,detail:fare.estimated?"OJP test fare estimate; confirm price and conditions.":"Reviewed fare and entitlement conditions apply."};
  if(fare.passengerPrice.known) return {price:`Passenger · ${priceLabel(fare.passengerPrice)}${fare.passengerEstimated?" estimated":""}`,detail:priceConditions(fare.passengerPrice)+" · Complete journey total unavailable."};
  return {price:"Total needs a fare quote",detail:priceConditions(fare.totalPrice)};
}
