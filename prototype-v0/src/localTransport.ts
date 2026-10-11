import { operatorCode, normalizeCode } from "./normalization.ts";
import { domesticSwissLeg, replacementService } from "./transitScope.ts";
import { swissDateTimeInput } from "./departure.ts";
import { tpgZone10Leg } from "./tpgZone10.ts";
import type { TransitLeg } from "./routing.ts";

export const LOCAL_REVIEW_FROM = "2026-10-11", LOCAL_REVIEW_THROUGH = "2026-12-12";
type Source = {title:string;url:string;checked:string};
type Policy = {id:string;name:string;operators:string[];modes:string[];source:Source;ticket:string;instructions:string[];
  nationalPass:boolean;childConcession?:boolean;foldedFree?:boolean;baggedFree?:boolean;detachedTrailerFree?:boolean;
  reservation:"not-required"|"unknown";ordinaryPermission:"allowed"|"unknown";
  specialProhibited?:boolean;fixedBikeDay?:number;};
const bus=["B","BUS","NFB","TROLLEYBUS","COACH"], urban=[...bus,"T","TRAM"], rail=["R","S","RE","IR"];
const source=(title:string,url:string):Source=>({title,url,checked:LOCAL_REVIEW_FROM});
/** Public operator documents inform ticket advice without requiring ticket sales.
 * No entry establishes available capacity; mode/date/line exceptions remain separate. */
export const LOCAL_TRANSPORT_POLICIES: Policy[] = [
  {id:"bernmobil",name:"BERNMOBIL",operators:["BERNMOBIL"],modes:urban,
    source:source("BERNMOBIL bicycle FAQ","https://www.bernmobil.ch/de/unternehmen/faq"),
    ticket:"Reduced 2nd-class bicycle ticket, or an existing national Bike Day Pass / annual bike pass.",
    instructions:["Bicycles are prohibited Monday–Friday 07:00–09:00 and 16:00–19:00, including bagged bicycles.","Tandems, recumbents and cargo bicycles are excluded. Detached trailers are free.","The operator explicitly accepts national bicycle passes on all its lines; this corrects the conflicting general SBB overview."],
    nationalPass:true,childConcession:true,baggedFree:true,detachedTrailerFree:true,specialProhibited:true,reservation:"unknown",ordinaryPermission:"allowed"},
  {id:"vbl",name:"VBL · Passepartout",operators:["VBL"],modes:urban,
    source:source("VBL bicycle tickets and conditions","https://www.vbl.ch/billette-abos/die-preisinformationen/"),
    ticket:"Reduced 2nd-class bicycle ticket, or a national Bike Day Pass / annual bike pass.",
    instructions:["Load the bicycle yourself. Wheelchairs and pushchairs have priority; carriage depends on space.","Folded folding bicycles and properly dismantled, fully bagged bicycles are free."],
    nationalPass:true,childConcession:true,foldedFree:true,baggedFree:true,reservation:"unknown",ordinaryPermission:"allowed"},
  {id:"engadin-bus",name:"Engadin Bus",operators:["ENGADINBUS"],modes:bus,
    source:source("Engadin Bus bicycle transport","https://engadinbus.ch/velo-bike-transport"),
    ticket:"Reduced 2nd-class bicycle ticket, or a national Bike Day Pass / annual bike pass on the Engadin Bus network.",
    instructions:["No bicycle reservations are accepted, for individuals or groups. Carriage depends on space.","Dismantled bicycles in transport bags are free. Guest public-transport and mountain-railway cards do not cover bicycles."],
    nationalPass:true,baggedFree:true,reservation:"not-required",ordinaryPermission:"allowed"},
  {id:"tpf",name:"TPF · Frimobil",operators:["TPF"],modes:[...urban,...rail,"FUN","FUNICULAR"],
    source:source("TPF bicycle types, tickets and restrictions","https://www.tpf.ch/fr/abos-et-billets/mobilite-combinee/velos"),
    ticket:"Ordinary bicycles: reduced 2nd-class ticket/day ticket or a national bicycle pass. Special-bike fares require a configuration check.",
    instructions:["Carriage is conditional on space and outside peak hours. The page does not define the peak-hour window; dated permission or operator confirmation is needed.","Special bicycles over 2 m and several multi-seat configurations are prohibited. Folded bikes and properly bagged bikes are listed as free. The page gives conflicting trailer prices; confirm that configuration.","Groups of five or more on buses require advance arrangements at least 48 working hours before travel; ten or more cannot self-load bicycles on trains."],
    nationalPass:true,childConcession:true,foldedFree:true,baggedFree:true,reservation:"unknown",ordinaryPermission:"unknown"},
  {id:"aags",name:"AUTO AG SCHWYZ",operators:["AAGS"],modes:bus,
    source:source("AUTO AG SCHWYZ bicycle restrictions","https://www.aags.ch/service/reise-informationszentrum/nuetzliche-reisetipps/"),
    ticket:"Reduced zone ticket, or a national Bike Day Pass / annual bike pass.",
    instructions:["Ordinary bicycles are prohibited on lines 505, 506, 535 and 541.","Line 504 has seasonal rack/loading restrictions: no e-bikes on the rack; use Brunnen Bahnhof instead of Brunnen Kantonalbank. Confirm the chosen stop and loading method.","Elsewhere carriage depends on room; wheelchairs and pushchairs have priority."],
    nationalPass:true,reservation:"unknown",ordinaryPermission:"allowed"},
  {id:"thurbo",name:"Thurbo",operators:["THURBO"],modes:["R","S","RE"],
    source:source("Thurbo bicycle carriage and tickets","https://www.thurbo.ch/reisen/velo/"),
    ticket:"Reduced bicycle ticket or a national Bike Day Pass / annual bike pass on reviewed domestic services.",
    instructions:["No bicycle reservation is available. Special bicycles over 2 m can travel when suitable space is available.","Zürich S-Bahn peak restrictions must be checked for the dated departure. Folded/bagged bicycles and detached trailers are treated as luggage."],
    nationalPass:true,foldedFree:true,baggedFree:true,detachedTrailerFree:true,reservation:"not-required",ordinaryPermission:"unknown"},
  {id:"transn",name:"transN · Onde Verte",operators:["TRANSN"],modes:[...urban,...rail,"FUN","FUNICULAR"],
    source:source("transN bicycle travel conditions","https://www.transn.ch/serviceclients/mon-voyage/"),
    ticket:"Reduced 2nd-class Onde Verte bicycle ticket; a passenger ticket alone does not cover an unfolded bicycle.",
    instructions:["Tandems, recumbents, attached trailers and bulky bicycles are excluded.","Bicycle carriage is unavailable on line 591, MobiCité and reservation-only journeys on line 590. Confirm which line-590 journey is running.","Peak restrictions are published without exact hours; confirm the dated service before boarding."],
    nationalPass:false,specialProhibited:true,reservation:"unknown",ordinaryPermission:"unknown"},
  {id:"zug-bus",name:"ZVB / Zugerberg Bahn",operators:["ZVB","ZBB"],modes:[...urban,"FUN","FUNICULAR"],
    source:source("Tarifverbund Zug bicycle tickets","https://www.tarifverbund-zug.ch/abos-tickets/einzelbillete-1/"),
    ticket:"Reduced local bicycle ticket or national bicycle pass; detached trailers are free on ZVB/ZBB.",
    instructions:["On lines 601, 602 and 612, confirm the loading stop. E-bikes must travel inside the bus rather than on its rear hooks.","The two official loading-stop lists differ for Allenwinden. Confirm that stop before travel; do not infer permission from the line number alone."],
    nationalPass:true,detachedTrailerFree:true,reservation:"unknown",ordinaryPermission:"allowed"},
  {id:"zug-lakes",name:"Zugersee / Ägerisee boats",operators:["SGZ","AES"],modes:["BAT","SHIP","BOAT","WATER","FERRY"],
    source:source("Zugersee and Ägerisee bicycle day ticket","https://www.tarifverbund-zug.ch/services/reisehilfe/"),
    ticket:"CHF 5 per bicycle or bicycle trailer, valid all day on the chosen lake. National bicycle passes are not accepted.",
    instructions:["The bicycle and its trailer require separate tickets. A second lake needs its own ticket. Carriage depends on room.","Groups with more than five bicycles must announce themselves the day before."],
    nationalPass:false,fixedBikeDay:5,reservation:"unknown",ordinaryPermission:"allowed"},
  {id:"tpg",name:"tpg · unireso",operators:["TPG"],modes:urban,
    source:source("unireso T651.11 bicycle tickets","https://www.unireso.com/wp-content/uploads/2026/06/CGV-unireso-Juin-2026-1.pdf"),
    ticket:"In verified Zone 10: reduced bicycle ticket or a national bike pass/day pass. Border journeys require their own fare scope.",
    instructions:["Bicycles can travel when room permits. Keep the bicycle stable and remain beside it.","Tandems, recumbents, attached trailers and bulky bicycles are excluded. A ticket never overrides a vehicle restriction."],
    nationalPass:true,childConcession:true,baggedFree:true,specialProhibited:true,reservation:"not-required",ordinaryPermission:"allowed"},
];

export function localPolicy(leg: TransitLeg): Policy | undefined {
  if (leg.mode !== "transit" || replacementService(leg) || !domesticSwissLeg(leg)) return undefined;
  const op=operatorCode(leg.operator),mode=normalizeCode(leg.category);
  return LOCAL_TRANSPORT_POLICIES.find(p=>p.operators.includes(op)&&p.modes.includes(mode));
}
export function localPolicyCurrent(leg: TransitLeg): boolean {
  if (!leg.departure || !leg.arrival || !Number.isFinite(+leg.departure) || !Number.isFinite(+leg.arrival) || +leg.arrival <= +leg.departure) return false;
  return swissDateTimeInput(leg.departure).slice(0,10)>=LOCAL_REVIEW_FROM && swissDateTimeInput(leg.arrival).slice(0,10)<=LOCAL_REVIEW_THROUGH;
}
const wall=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Zurich",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function weekdayPeak(leg: TransitLeg, morningStart=7): boolean {
  if(!leg.departure||!leg.arrival||+leg.arrival<+leg.departure||+leg.arrival-+leg.departure>2*86400000)return true;
  for(let t=+leg.departure;t<+leg.arrival;t=Math.floor(t/60000)*60000+60000){
    const parts=wall.formatToParts(new Date(t)),v=(key:string)=>Number(parts.find(p=>p.type===key)?.value);
    const day=new Date(Date.UTC(v("year"),v("month")-1,v("day"))).getUTCDay(),minute=v("hour")*60+v("minute");
    if(day>=1&&day<=5&&(minute>=morningStart*60&&minute<9*60||minute>=16*60&&minute<19*60))return true;
  }
  return false;
}
export function localOperatorBicycleRule(leg: TransitLeg) {
  const p=localPolicy(leg);if(!p)return null;
  const line=normalizeCode(leg.service).replace(/^(?:B|BUS|TRAM|T)\s*/,""),op=operatorCode(leg.operator);
  let permission:"allowed"|"unknown"|"prohibited"=p.ordinaryPermission;
  if(!localPolicyCurrent(leg))permission="unknown";
  else if(op==="BERNMOBIL"&&weekdayPeak(leg))permission="prohibited";
  else if(op==="AAGS"&&["505","506","535","541"].includes(line))permission="prohibited";
  else if(op==="AAGS"&&line==="504"||op==="ZVB"&&["601","602","612"].includes(line))permission="unknown";
  else if(op==="TRANSN"&&(line==="591"||/MOBICIT[EÉ]/.test(normalizeCode(leg.service+" "+leg.serviceName))))permission="prohibited";
  else if(op==="TRANSN"&&line==="590")permission="unknown";
  return {permission,reservation:localPolicyCurrent(leg)?p.reservation:"unknown" as const,ticket:"required" as const,source:p.source,
    instructions:[p.ticket,...p.instructions,...(!localPolicyCurrent(leg)?["Outside the reviewed local-rule dates; consult the current operator source."]:[])]};
}
export const localNationalBikePass = (leg:TransitLeg) => !!localPolicy(leg)?.nationalPass && localPolicyCurrent(leg)
  && (operatorCode(leg.operator)!=="TPG"||tpgZone10Leg(leg));
export const localChildBikeConcession = (leg:TransitLeg) => !!localPolicy(leg)?.childConcession && localNationalBikePass(leg);
export function localTicketGuidance(legs:TransitLeg[]) {
  const policies=new Map<string,Policy & {current:boolean}>();
  for(const leg of legs){const p=localPolicy(leg);if(p)policies.set(p.id,{...p,current:(policies.get(p.id)?.current??true)&&localPolicyCurrent(leg)});}
  return [...policies.values()];
}
