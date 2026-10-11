import { tariffSource } from "./tariffSources.ts";
import { swissDateTimeInput } from "./departure.ts";
import { operatorCode, normalizeCode } from "./normalization.ts";
import { domesticSwissLeg } from "./operatorBicycleRules.ts";
import { readBicycle, type TravelProfile } from "./travelProfile.ts";
import type { TransitLeg } from "./routing.ts";
import type { BicycleEvidence } from "./bicyclePermission.ts";
export const BIKE_PROFILE_SOURCE = { title:"SBB bicycle types, child tickets and reservations",url:"https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html",checked:"2026-10-11" };
export const CHILD_TARIFF_SOURCE = { title:"Alliance SwissPass T600, sections 7.7 and 7.10",url:"https://www.allianceswisspass.ch/de/asp/Downloads?download=2666",checked:"2026-10-11" };
export function profileBikeRule(leg: TransitLeg, profile?: TravelProfile, evidence?: BicycleEvidence) {
  const bike=readBicycle(profile?.bicycle), op=operatorCode(leg.operator), category=normalizeCode(leg.category);
  const guidance:string[]=[];
  let permission:"confirmed"|"uncertain"|"prohibited"|undefined;
  const childSmall=profile?.age!=null && profile.age<6 && ["child","balance"].includes(bike.kind) && (bike.lengthCm===null || bike.lengthCm<=150);
  const luggage=(bike.carriage==="folded" && bike.kind==="folding") || bike.carriage==="bagged" || childSmall;
  const special=(bike.lengthCm!==null && bike.lengthCm>200);
  const unmeasured=["cargo","tandem","recumbent","adaptive","other"].includes(bike.kind) && bike.lengthCm===null;
  const swiss=domesticSwissLeg(leg);
  const ordinaryRail=["SBB","BLS","RHB","SOB"].includes(op) && ["IC","IR","EC","ICE","RJX","RE","S","R","PE"].includes(category);
  if(leg.mode!=="transit") return {permission,handLuggage:false,reservationExempt:false,pricingUncertain:false,guidance,source:BIKE_PROFILE_SOURCE};
  if(bike.carriage==="folded" && bike.kind!=="folding") {permission="uncertain";guidance.push("Only a bicycle with a folding frame qualifies as folded hand luggage. Select a correct configuration.");}
  if(bike.drive==="other" || !bike.selfLoading) {permission="uncertain";guidance.push("This motor type or assisted loading requires operator confirmation; ordinary self-loading rules do not establish permission.");}
  if(unmeasured) {permission="uncertain";guidance.push("Enter bicycle length. Its name alone does not establish whether it fits the operator's ordinary-bicycle rules.");}
  if(luggage){
    guidance.push(bike.carriage==="bagged" ? "Remove the front wheel and fully pack the bike and wheel in a purpose-made transport bag. Keep doors and passageways clear."
      : childSmall ? "A child's bicycle belonging to a child under 6 is hand luggage; no bicycle ticket or reservation is required on reviewed services."
      : "Fold before boarding and keep folded until after alighting. Store as hand luggage, away from paid bicycle spaces; carriage still depends on room.");
    if(swiss && (ordinaryRail || ["VBZ","VBG","VZO","STBW","TPG","PAG"].includes(op)) && permission===undefined) permission="confirmed";
    if(op==="BLS" && bike.carriage==="folded") {permission="uncertain";guidance.push("BLS describes bagged folding bikes; confirm its packing requirement before boarding.");}
    if(bike.carriage==="bagged" && evidence?.conditions.some(s=>/packaged bicycles are not accepted|verpack.*nicht|emball.*interdit/i.test(s))) permission="prohibited";
    if(op==="SZU" && [leg.from,leg.to].some(s=>/^(Uetliberg|Ringlikon)$/.test(s??""))) permission="prohibited";
    if(evidence?.permission==="prohibited" && permission!=="prohibited") {permission="uncertain";guidance.push("This departure bans ordinary bicycles. Its luggage exception has not been verified; confirm before boarding.");}
  } else if(special || unmeasured || ["cargo","tandem","recumbent","adaptive","other"].includes(bike.kind)) {
    if(special && swiss && op==="SBB" && ["IC","IR","EC","ICE","RJX"].includes(category)) permission="prohibited";
    else if(swiss && ordinaryRail && ["RE","S","R",...(["BLS","RHB","SOB"].includes(op)?["IR","PE"]:[])].includes(category) && permission===undefined) permission="confirmed";
    else if(permission===undefined) permission="uncertain";
    if(op==="PAG" && (special || ["tandem","recumbent","adaptive"].includes(bike.kind))) permission="prohibited";
    if(op==="TPG" && (special || ["tandem","recumbent"].includes(bike.kind))) permission="prohibited";
    guidance.push("Special bicycles need compatible vehicle space. SBB accepts bicycles over 2 m on RE/S/R, not IC/IR/EC/ICE/RJX; BLS/RhB/SOB publish additional regional/IR acceptance. A ticket is not proof of fit.");
  }
  if(bike.trailer!=="none"){
    guidance.push("Trailer access, door width and stowage must be checked separately. No verified combined bicycle/trailer fare is available here.");
    if(op==="TPG" && bike.trailer==="attached" || op==="PAG" && (bike.trailerWidthCm??0)>60) permission="prohibited";
    else if(permission!=="prohibited") permission="uncertain";
  }
  if(!swiss && profile?.bicycle) permission=permission==="prohibited"?permission:"uncertain";
  if((luggage || permission==="confirmed") && (!leg.departure || swissDateTimeInput(leg.arrival??leg.departure).slice(0,10)>tariffSource("t600").validThrough)) {permission="uncertain";guidance.push("The reviewed bicycle-type rules have reached their renewal boundary. Confirm current conditions with the operator.");}
  return {permission,handLuggage:luggage,reservationExempt:luggage && permission==="confirmed",pricingUncertain:unmeasured || bike.trailer!=="none" || bike.drive==="other" || !bike.selfLoading,
    guidance,source:BIKE_PROFILE_SOURCE};
}
