import assert from "node:assert/strict";
import { it } from "node:test";
import { fareSummary, DEFAULT_FARE_PROFILE } from "./fares.ts";
import { publishedRouteFare } from "./fareCatalog.ts";
import { bicyclePermission } from "./bicyclePermission.ts";
import { carriageForLeg } from "./bicycleCarriage.ts";
import { localTicketGuidance } from "./localTransport.ts";
import { DEFAULT_BICYCLE } from "./travelProfile.ts";
import { operatorCode } from "./normalization.ts";
import { transferEndpointKey, transferEndpointQuery } from "./staticTransfers.ts";
import type { TransitLeg } from "./routing.ts";

// Independent official TPG stop IDs: Plainpalais -> Rive, reviewed line 12.
const tram=(patch:Partial<TransitLeg>={}):TransitLeg=>({mode:"transit",from:"Genève, Plainpalais",to:"Genève, Rive",fromId:"8587907",toId:"8587061",
 departure:new Date("2026-10-12T10:00:00+02:00"),arrival:new Date("2026-10-12T10:15:00+02:00"),operator:"OJP:881",category:"T",service:"12",serviceName:null,direction:null,departurePlatform:null,arrivalPlatform:null,...patch});
const profile={...DEFAULT_FARE_PROFILE,age:35};
it("quotes the Zone 10 hour ticket for the complete verified journey and keeps cheaper short trips unclaimed",()=>{
 const leg=tram(),fare=fareSummary([leg],profile);
 assert.equal(fare.passengerChf,3);assert.equal(fare.bikeChf,2);assert.equal(fare.reservationChf,0);assert.equal(fare.totalChf,5);
 assert.equal(fare.minimumVerified,false);assert.match(fare.published!.conditions!.join(" "),/Saut de puce/);
 assert.equal(fareSummary([leg],{...profile,passenger:"half-fare"}).totalChf,4);
 assert.equal(fareSummary([leg],{...profile,passenger:"ga"}).totalChf,2);
 assert.equal(fareSummary([leg],{...profile,annualBikePass:true}).totalChf,3);
 assert.equal(fareSummary([leg],profile,undefined,false).totalChf,3);
});
it("prices one Zone 10 ticket across transfers, never one per vehicle",()=>{
 const a=tram({toId:"8592885",arrival:new Date("2026-10-12T10:04:00+02:00")});
 const b=tram({fromId:"8592885",departure:new Date("2026-10-12T10:08:00+02:00")});
 assert.equal(fareSummary([a,b],profile).totalChf,5);
 assert.equal(publishedRouteFare([tram({arrival:new Date("2026-10-12T11:00:01+02:00")})]),null);
});
it("requires the reviewed operator, line, modes, exact stops and local date window",()=>{
 for(const patch of [{service:"17"},{operator:"Example TPG partner"},{toId:"8595829"},{toId:"8503000"},{category:"EV"},{serviceName:"Replacement bus"},
  {departure:new Date("2026-12-13T10:00:00+01:00"),arrival:new Date("2026-12-13T10:15:00+01:00")}])assert.equal(publishedRouteFare([tram(patch)]),null);
 assert.equal(fareSummary([tram()],{...profile,travelClass:"first"}).passengerChf,null);
 const invalidPass={...profile,passenger:"ga" as const,passValidThrough:"2026-10-11"};assert.equal(fareSummary([tram()],invalidPass).passengerChf,null);
});
it("resolves SLOIDs only through an exact maintained DIDOK join",()=>{
 const leg=tram({fromId:"ch:1:sloid:plainpalais:0:1"});assert.equal(publishedRouteFare([leg]),null);
 leg.stationDeparture={key:transferEndpointKey(transferEndpointQuery(leg,"departure")),status:"matched",stationId:"8587907",endpointId:"8500000",source:"fixture",checked:"2026-10-11"} as TransitLeg["stationDeparture"];
 assert.equal(publishedRouteFare([leg])?.passengerFull,3);
 leg.stationDeparture!.key="wrong-platform-key";assert.equal(publishedRouteFare([leg]),null);
});
it("applies local child and luggage entitlements without treating every local concession as known",()=>{
 assert.equal(fareSummary([tram()],{...profile,age:12,accompaniedBy16Plus:true}).totalChf,2);
 assert.equal(fareSummary([tram()],{...profile,age:12,accompaniedBy16Plus:true,childCard:"junior",qualifyingCompanion:true}).totalChf,0);
 const folded={...profile,bicycle:{...DEFAULT_BICYCLE,kind:"folding" as const,carriage:"folded" as const}};
 assert.equal(bicyclePermission(tram(),folded),"uncertain");
 assert.equal(fareSummary([tram()],{...folded,bicycle:{...folded.bicycle,carriage:"bagged"}}).bikeChf,0);
 assert.equal(fareSummary([tram({operator:"Engadin Bus",category:"B",service:"1"})],{...profile,age:12,accompaniedBy16Plus:true}).bikeChf,null);
});
it("uses BERNMOBIL's own pass acceptance and enforces peak boundaries even for bagged bicycles",()=>{
 const leg=tram({operator:"OJP:827",service:"9"});
 assert.equal(fareSummary([leg],{...profile,annualBikePass:true}).bikeChf,0);
 const peak=tram({operator:"BERNMOBIL",service:"9",departure:new Date("2026-10-12T06:59:30+02:00"),arrival:new Date("2026-10-12T07:00:15+02:00")});
 for(const carriage of ["unfolded","bagged"] as const)assert.equal(bicyclePermission(peak,{bicycle:{...DEFAULT_BICYCLE,carriage}}),"prohibited");
 assert.equal(bicyclePermission(leg,{bicycle:{...DEFAULT_BICYCLE,kind:"cargo",lengthCm:180}}),"prohibited");
 assert.equal(bicyclePermission(tram({...peak,departure:new Date("2026-10-17T07:00:00+02:00"),arrival:new Date("2026-10-17T07:15:00+02:00")})),"confirmed");
});
it("keeps operator-specific line, peak and trailer uncertainty separate from ticket acceptance",()=>{
 for(const line of ["505","506","535","541"])assert.equal(bicyclePermission(tram({operator:"AAGS",category:"B",service:line})),"prohibited");
 assert.equal(bicyclePermission(tram({operator:"AAGS",category:"B",service:"504"})),"uncertain");
 assert.equal(bicyclePermission(tram({operator:"TPF",category:"B",service:"1"})),"uncertain");
 assert.equal(bicyclePermission(tram({operator:"transN",category:"B",service:"101"})),"uncertain");
 assert.equal(bicyclePermission(tram({operator:"transN",category:"B",service:"591"})),"prohibited");
 assert.equal(fareSummary([tram({operator:"TPF",category:"B",service:"1"})],{...profile,bicycle:{...DEFAULT_BICYCLE,trailer:"detached"}}).bikeChf,null);
});
it("does not infer GA or reservation prices merely from national bicycle-pass coverage",()=>{
 const leg=tram({operator:"OJP:815",category:"B",service:"1"});
 assert.equal(carriageForLeg(leg).bikeReservation,"not-required");
 const fare=fareSummary([leg],{...profile,passenger:"ga",annualBikePass:true});
 assert.equal(fare.bikeChf,0);assert.equal(fare.reservationChf,0);assert.equal(fare.passengerChf,null);
});
it("quotes the lake-specific CHF 5 product without honoring national bicycle passes there",()=>{
 const leg=tram({operator:"OJP:186",category:"BAT",service:"Boat"});
 assert.equal(fareSummary([leg],{...profile,annualBikePass:true}).bikeChf,5);
 const second=tram({operator:"OJP:179",category:"BAT",service:"Boat",departure:new Date("2026-10-12T11:00:00+02:00"),arrival:new Date("2026-10-12T11:30:00+02:00")});
 assert.equal(fareSummary([leg,second],profile).bikeChf,10);
 assert.equal(fareSummary([leg],{...profile,bicycle:{...DEFAULT_BICYCLE,trailer:"attached"}}).totalChf,null);
});
it("retains service prohibitions over general local policy and expires a mixed-date advice group",()=>{
 const leg=tram();leg.bicycleEvidence={permission:"prohibited",fromId:leg.fromId!,toId:leg.toId!,departure:leg.departure!.toISOString(),service:leg.service,operator:leg.operator!,conditions:[],source:{title:"Dated operator restriction",url:"https://example.test",checked:"2026-10-12"}};
 assert.equal(fareSummary([leg],profile).totalChf,null);
 const expired=tram({departure:new Date("2026-12-13T10:00:00+01:00"),arrival:new Date("2026-12-13T10:15:00+01:00")});
 assert.equal(localTicketGuidance([expired,tram()])[0].current,false);
 assert.equal(operatorCode("OJP:881"),"TPG");assert.notEqual(operatorCode("OJP:100680"),"TPG");
 assert.notEqual(operatorCode("OJP:80"),"BERNMOBIL");
});
