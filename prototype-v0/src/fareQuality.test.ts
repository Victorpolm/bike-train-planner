import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { DEFAULT_FARE_PROFILE, fareSummary, fareCardSummary } from "./fares.ts";
import { parseFare, fareRequest, fareTrips } from "../server/fareProtocol.ts";
import { interpretBicycleAttributes, carriageForLeg } from "./bicycleCarriage.ts";
import { transferEndpointKey, transferEndpointQuery } from "./staticTransfers.ts";
import { parseOjpConnections } from "./ojp.ts";
import { journeyDataReport } from "./journeyDataQuality.ts";
import { zeroCycling } from "./cycling.ts";
import { onlineFareRequest } from "./onlineFareClient.ts";
import type { TransitLeg, Journey } from "./routing.ts";
import type { OnlineFare } from "./onlineFare.ts";
const leg = (patch: Partial<TransitLeg> = {}): TransitLeg => ({ mode:"transit", from:"Zürich HB", to:"Chur", fromId:"8503000", toId:"8509000",
  departure:new Date("2026-10-11T08:00:00Z"), arrival:new Date("2026-10-11T09:00:00Z"), service:"IC3", operator:"SBB",category:"IC",
  serviceName:null,direction:null,departurePlatform:null,arrivalPlatform:null,...patch });
function condition(l: TransitLeg, reservation: "required" | "not-required" | "unknown", missing?: boolean) {
  l.bicycleEvidence={permission:"allowed",fromId:l.fromId!,toId:l.toId!,departure:l.departure!.toISOString(),service:l.service,operator:l.operator!,
    conditions:[],source:{title:"Dated fixture",url:"https://example.test",checked:"2026-10-11"},prerequisites:{bikeTicket:"required",bikeReservation:reservation,reservationUnspecified:missing}};
  return l;
}
const bus = () => condition(leg({from:"Chur",to:"Laax",fromId:"8509000",toId:"8509292",departure:new Date("2026-10-11T09:10:00Z"),arrival:new Date("2026-10-11T10:00:00Z"),operator:"PAG",category:"B",service:"B81"}),"required");
const quote: OnlineFare={status:"quoted",environment:"test",checked:"2026-10-11",passenger:{chf:45.8,product:"Standard",productId:"125"},bicycle:{chf:29,product:"Single ticket",productId:"125"}};
it("caps Zürich–Laax's CHF29 online bicycle quote at the reviewed15 pass plus one2 through reservation",()=>{
  const result=fareSummary([leg(),bus()],DEFAULT_FARE_PROFILE,quote);
  assert.equal(result.bikeChf,15);assert.equal(result.bikeProduct,"Bike Day Pass");assert.equal(result.reservationChf,2);assert.equal(result.knownBikeTotal,17);
  assert.equal(result.minimumVerified,false);assert.equal(result.totalChf,62.8);
});
it("retains a lower route quote and annual-bike-pass entitlement without extending passengerGA coverage",()=>{
  assert.equal(fareSummary([leg(),bus()],DEFAULT_FARE_PROFILE,{...quote,bicycle:{...quote.bicycle!,chf:9}}).bikeChf,9);
  const result=fareSummary([leg(),bus()],{passenger:"ga",annualBikePass:true},quote);
  assert.equal(result.bikeChf,0);assert.equal(result.reservationChf,2);assert.equal(result.passengerChf,null);
});
it("keeps unknown reservation requirements, prohibited bicycles and interrupted bookings explicit",()=>{
  const b=bus();b.bicycleEvidence!.prerequisites!.bikeReservation="unknown";
  assert.equal(fareSummary([leg(),b],DEFAULT_FARE_PROFILE,quote).knownBikeTotal,null);
  b.bicycleEvidence!.permission="prohibited";assert.equal(fareSummary([leg(),b],DEFAULT_FARE_PROFILE,quote).totalChf,null);
  const stop={...leg(),mode:"stop" as const,departure:new Date("2026-10-11T09:00:00Z"),arrival:new Date("2026-10-11T09:05:00Z")};
  assert.equal(fareSummary([leg(),stop,bus()],DEFAULT_FARE_PROFILE,quote).reservationChf,null);
  for (const mode of ["bike", "unknown"] as const) {
    const incomplete={...stop,mode,departure:null,arrival:null};
    assert.equal(fareSummary([leg(),incomplete,bus()],DEFAULT_FARE_PROFILE,quote).reservationChf,null);
  }
  const point={lat:46.85,lon:9.53};
  const stationary={...stop,mode:"bike" as const,fromId:"8509000",toId:"8509000",arrival:stop.departure,cyclingRoute:zeroCycling(point,point)};
  assert.equal(fareSummary([leg(),stationary,bus()],DEFAULT_FARE_PROFILE,quote).reservationChf,2);
  stationary.toId="8509001";assert.equal(fareSummary([leg(),stationary,bus()],DEFAULT_FARE_PROFILE,quote).reservationChf,null);
});
it("supports ordinaryRhB pass coverage without claiming an unreviewed reservation price or replacement permission",()=>{
  const rhb=condition(leg({operator:"RhB",category:"RE",service:"RE13"}),"not-required");
  assert.equal(fareSummary([rhb],DEFAULT_FARE_PROFILE,quote).bikeChf,15);
  rhb.bicycleEvidence!.prerequisites!.bikeReservation="required";assert.equal(fareSummary([rhb],DEFAULT_FARE_PROFILE,quote).reservationChf,null);
  assert.equal(fareSummary([{...bus(),category:"EV"}],DEFAULT_FARE_PROFILE,quote).covered,false);
});
it("uses the dated15/16 pass change and refuses a single pass after05:00 the following day",()=>{
  for(const [day,amount] of [["2026-12-12",15],["2026-12-13",16]] as const){
    const l=condition(leg({departure:new Date(day+"T08:00:00Z"),arrival:new Date(day+"T09:00:00Z")}),"required");
    assert.equal(fareSummary([l],DEFAULT_FARE_PROFILE,quote).knownBikeTotal,day<="2026-12-12"?amount+2:null);
  }
  const l=leg({departure:new Date("2026-10-11T20:00:00Z"),arrival:new Date("2026-10-12T02:59:00Z")});
  assert.equal(fareSummary([l],DEFAULT_FARE_PROFILE,quote).bikeChf,15);
  l.arrival=new Date("2026-10-12T03:00:00Z");assert.equal(fareSummary([l],DEFAULT_FARE_PROFILE,quote).bikeChf,29);
});
it("prefers reviewed published standard fares to conflicting integration quotes and avoids the redundant API call",()=>{
  const l=leg({to:"Baden",toId:"8503504",category:"IR",service:"IR35"});
  const result=fareSummary([l],DEFAULT_FARE_PROFILE,quote);
  assert.equal(result.passengerChf,14.2);assert.equal(result.bikeChf,7.1);assert.equal(result.estimated,false);
  assert.doesNotMatch(fareCardSummary([l],DEFAULT_FARE_PROFILE,quote).price,/estimated/);
  assert.equal(onlineFareRequest([l],DEFAULT_FARE_PROFILE,true,0).key,"");
});
it("rejects provider product2361 and emits the exactsecondClass enum",()=>{
  const t=fareTrips(readFileSync(new URL("./fixtures/fares-2026-09-27/01-trip.xml",import.meta.url),"utf8"))[0];
  const xml=`<OJPFareDelivery><Status>true</Status><FareResult><Id>farequote</Id><TripFareResult><FromLegIdRef>${t.firstLeg}</FromLegIdRef><ToLegIdRef>${t.lastLeg}</ToLegIdRef><FareProduct><FareProductId>2361</FareProductId><Price>14</Price><Currency>CHF</Currency><FareClass>secondClass</FareClass></FareProduct></TripFareResult></FareResult></OJPFareDelivery>`;
  assert.equal(parseFare(xml,t,"full"),null);assert.equal(parseFare(xml,t,"half-fare"),null);
  assert.match(fareRequest(t,"full"),/<FareClass>secondClass<\/FareClass>/);
});
it("uses operator reservation defaults only for explicitly absent notes; conflict and unclassifiedunknown remain unknown",()=>{
  const l=condition(leg({category:"IR",service:"IR35"}),"unknown",true);
  assert.equal(interpretBicycleAttributes([]).reservationUnspecified,true);
  assert.equal(carriageForLeg(l).bikeReservation,"not-required");
  l.bicycleEvidence!.conditions.push("The provider gives conflicting reservation conditions.");
  assert.equal(carriageForLeg(l).bikeReservation,"unknown");
  l.bicycleEvidence!.conditions=[];delete l.bicycleEvidence!.prerequisites!.reservationUnspecified;
  assert.equal(carriageForLeg(l).bikeReservation,"unknown");
});
it("uses exact imported SLOID/DIDOK mappings and invalidates carriage caches when mapping changes",()=>{
  const l=leg({fromId:"ch:1:sloid:3000",toId:"ch:1:sloid:9000",category:"IR",service:"IR35"});
  assert.equal(carriageForLeg(l).permission,"uncertain");
  l.stationDeparture={key:transferEndpointKey(transferEndpointQuery(l,"departure")),status:"station",stationId:"8503000"};
  l.stationArrival={key:transferEndpointKey(transferEndpointQuery(l,"arrival")),status:"station",stationId:"8509000"};
  assert.equal(carriageForLeg(l).permission,"confirmed");assert.equal(fareSummary([l],DEFAULT_FARE_PROFILE,quote).bikeChf,15);
  l.stationArrival.stationId="8014295";assert.equal(carriageForLeg(l).permission,"uncertain");
  l.stationArrival.stationId="8509000";l.stationArrival.key="other-stop";assert.equal(carriageForLeg(l).permission,"uncertain");
});
it("normalizes known numericOJP operator identifiers at the adapter, preserving unknown opaque identifiers",()=>{
  const xml=readFileSync(new URL("./fixtures/fares-2026-09-27/01-trip.xml",import.meta.url),"utf8");
  for(const [ref,expected] of [["11","ojp:11"],["801","ojp:801"],["72","ojp:72"],["999999","999999"]]){
    const changed=xml.replace(/(<[^<>]*OperatorRef>)[^<]*(<\/[^<>]*OperatorRef>)/g,`$1${ref}$2`);
    const parsed=parseOjpConnections(changed,false).filter(l=>l.mode==="transit");
    assert.ok(parsed.length);assert.ok(parsed.every(l=>l.operator===expected));
  }
});
it("exports useful journey evidence without raw fareXML, coordinates or unrelated saved/GPS data",()=>{
  const l=leg();l.fareSources=[{id:"sensitive-test",payload:"raw-provider-XML"}];l.fromPoint={lat:47,lon:8};
  const report=journeyDataReport({transitLegs:[l]} as Journey,DEFAULT_FARE_PROFILE,quote,true,"Fare differs",45);
  const raw=JSON.stringify(report);assert.ok(raw.includes("IC3"));assert.ok(raw.includes("Fare differs"));assert.ok(raw.includes('"actualCyclingMinutes":45'));
  assert.doesNotMatch(raw,/raw-provider-XML|sensitive-test|"lat"|"lon"/);
  assert.equal(journeyDataReport({transitLegs:[l]} as Journey,DEFAULT_FARE_PROFILE,undefined,true,"x",-1).actualCyclingMinutes,undefined);
});
