import assert from "node:assert/strict";
import { it } from "node:test";
import { fareSummary, DEFAULT_FARE_PROFILE, bikeDayPrice, readFareProfile } from "./fares.ts";
import { DEFAULT_BICYCLE, validProfileDate } from "./travelProfile.ts";
import { bicyclePermission } from "./bicyclePermission.ts";
import { carriageForLeg, interpretBicycleAttributes } from "./bicycleCarriage.ts";
import { knownPrice, sumPrices } from "./priced.ts";
import { fareQuery } from "./onlineFare.ts";
import { tariffHealth } from "./tariffSources.ts";
import { guestSettings, personalSettings, samePersonalSettings, validPersonalSettings } from "./travellerProfiles.ts";
import { DEFAULT_OPTIONS, validateOptions } from "./model.ts";
import type { TransitLeg } from "./routing.ts";
const train=(patch:Partial<TransitLeg>={}):TransitLeg=>({mode:"transit",from:"Zürich HB",to:"Baden",fromId:"8503000",toId:"8503504",departure:new Date("2026-10-11T08:00:00Z"),arrival:new Date("2026-10-11T08:30:00Z"),operator:"SBB",category:"IR",service:"IR35",serviceName:null,direction:null,departurePlatform:null,arrivalPlatform:null,...patch});
it("applies child passenger and bicycle entitlements separately and keeps age6+ reservations",()=>{
 const profile={...DEFAULT_FARE_PROFILE,age:12,accompaniedBy16Plus:true};
 assert.equal(fareSummary([train()],profile).passengerChf,7.1);assert.equal(fareSummary([train()],profile).bikeChf,0);
 assert.equal(carriageForLeg(train(),profile).bikeTicket,"not-required");
 const ic=train({category:"IC",service:"IC3",to:"Chur",toId:"8509000"});
 assert.equal(carriageForLeg(ic,profile).bikeReservation,"required");assert.equal(fareSummary([ic],profile).reservationChf,2);
 assert.equal(fareSummary([train()],{...profile,accompaniedBy16Plus:false}).bikeChf,7.1);
 assert.equal(fareSummary([train()],{...profile,organizedGroup:true}).passengerChf,null);
 assert.equal(fareSummary([train()],{...profile,childCard:"junior",qualifyingCompanion:true}).passengerChf,0);
 assert.equal(fareSummary([train()],{...profile,childCard:"junior",qualifyingCompanion:false}).passengerChf,7.1);
 assert.equal(fareSummary([train()],{...profile,passenger:"ga"}).passengerChf,0);
 assert.equal(fareSummary([train()],{...profile,age:16}).bikeChf,7.1);
 const same=train();assert.equal(carriageForLeg(same,{...profile,accompaniedBy16Plus:false}).bikeTicket,"required");
 assert.equal(carriageForLeg(same,{...profile,accompaniedBy16Plus:false,passenger:"ga"} as typeof profile).bikeTicket,"not-required");
});
it("does not discount expired travelcards or treat an unrelated pass as verified coverage",()=>{
 const p={...DEFAULT_FARE_PROFILE,passenger:"half-fare" as const,passValidThrough:"2026-01-01"};
 assert.equal(fareSummary([train()],p).passengerChf,null);
 assert.equal(fareSummary([train()],{...p,passValidThrough:"2026-10-11"}).passengerChf,7.1);
 assert.equal(fareSummary([train()],{...DEFAULT_FARE_PROFILE,travelClass:"first"}).passengerChf,null);
 const otherPass={name:"Regional pass",operator:"Example",coverage:"Zone 1",validThrough:""};
 assert.equal(fareSummary([train()],{...DEFAULT_FARE_PROFILE,otherPass}).passengerChf,null);
 assert.equal(fareSummary([train()],{...DEFAULT_FARE_PROFILE,passenger:"ga",otherPass}).passengerChf,0);
});
it("separates luggage, measured long bicycles, trailers and child bikes in prices and permission",()=>{
 const folded={...DEFAULT_FARE_PROFILE,bicycle:{...DEFAULT_BICYCLE,kind:"folding" as const,carriage:"folded" as const}};
 assert.equal(fareSummary([train()],folded).bikeChf,0);assert.equal(carriageForLeg(train(),folded).bikeReservation,"not-required");
 const long={...DEFAULT_FARE_PROFILE,age:4,bicycle:{...DEFAULT_BICYCLE,kind:"cargo" as const,lengthCm:300}};
 assert.equal(bicyclePermission(train(),long),"prohibited");assert.equal(fareSummary([train()],long).bikeChf,null);
 const small={...long,bicycle:{...DEFAULT_BICYCLE,kind:"child" as const,lengthCm:90}};
 assert.equal(fareSummary([train()],small).bikeChf,0);assert.equal(carriageForLeg(train(),small).bikeReservation,"not-required");
 assert.equal(bicyclePermission(train(),{...folded,bicycle:{...folded.bicycle,trailer:"attached"}}),"uncertain");
 assert.equal(bicyclePermission(train({operator:"PAG",category:"B",service:"B1"}),long),"prohibited");
 const invalid=readFareProfile({...DEFAULT_FARE_PROFILE,bicycle:{...DEFAULT_BICYCLE,lengthCm:700}});
 assert.equal(bicyclePermission(train(),invalid),"uncertain");
});
it("dates existing bicycle passes and never allows an ordinary quote to erase trailer uncertainty",()=>{
 assert.equal(fareSummary([train()],{...DEFAULT_FARE_PROFILE,existingBikePass:"day",bikePassDate:"2026-10-11"}).bikeChf,0);
 assert.equal(fareSummary([train()],{...DEFAULT_FARE_PROFILE,existingBikePass:"day",bikePassDate:"2026-10-10"}).bikeChf,7.1);
 const p={...DEFAULT_FARE_PROFILE,bicycle:{...DEFAULT_BICYCLE,trailer:"detached" as const}};
 const fare=fareSummary([train({to:"Bern",toId:"8507000"})],p,{status:"quoted",environment:"test",checked:"2026-10-11",passenger:{chf:42,product:"Standard",productId:"125"},bicycle:{chf:5,product:"Standard",productId:"125"}});
 assert.equal(fare.bikeChf,null);assert.equal(fare.totalChf,null);assert.equal(fareQuery([train()],p),null);
});
it("rejects malformed dates and dimensions in saved profiles and routing options",()=>{
 for(const d of ["2026-02-31","2026-13-01","garbage"])assert.equal(validProfileDate(d),false);
 const profile={...DEFAULT_FARE_PROFILE,bicycle:{...DEFAULT_BICYCLE,lengthCm:700}};
 assert.equal(validPersonalSettings({...guestSettings(),fare:profile}),false);
 assert.throws(()=>validateOptions({...DEFAULT_OPTIONS,fareProfile:profile}),/profile/);
 assert.equal(samePersonalSettings(guestSettings(),personalSettings(guestSettings())),true);
});
it("keeps prohibited bicycle components unknown even with an annual pass",()=>{
 const leg=train();leg.bicycleEvidence={permission:"prohibited",fromId:leg.fromId!,toId:leg.toId!,departure:leg.departure!.toISOString(),service:leg.service,operator:leg.operator!,conditions:[],source:{title:"Fixture",url:"https://example.test",checked:"2026-10-11"}};
 for(const annualBikePass of [false,true]){const fare=fareSummary([leg],{...DEFAULT_FARE_PROFILE,annualBikePass});assert.equal(fare.bikeChf,null);assert.equal(fare.reservationChf,null);assert.equal(fare.totalChf,null);}
});
it("recognizes text-only bicycle prohibitions and scopes the IC corridor rather than its number",()=>{
 for(const text of ["Bicycles: Carriage not possible.","Vélos: transport impossible.","Biciclette: trasporto non possibile."])assert.equal(interpretBicycleAttributes([{code:"",text,scope:"service"}]).permission,"prohibited");
 const winter={departure:new Date("2026-01-20T08:00:00Z"),arrival:new Date("2026-01-20T09:00:00Z"),category:"IC",service:"IC4"};
 assert.equal(carriageForLeg(train({...winter,toId:"8503400",to:"Schaffhausen"})).bikeReservation,"required");
 assert.equal(carriageForLeg(train(winter)).bikeReservation,"unknown");
});
it("keeps restricted offers out of flexible totals and expiry separate from a known future tariff amount",()=>{
 const source={title:"Fixture",url:"https://example.test",checked:"2026-10-11"};
 for(const flexibility of ["train-bound","time-bound","unknown"] as const)assert.equal(sumPrices([knownPrice(5,"Offer",source,{flexibility})],source).known,false);
 assert.equal(bikeDayPrice(new Date("2026-12-13T12:00:00Z")),16);
 const expired=train({departure:new Date("2028-01-01T08:00:00Z"),arrival:new Date("2028-01-01T09:00:00Z")});
 assert.equal(fareSummary([expired],{...DEFAULT_FARE_PROFILE,age:4,accompaniedBy16Plus:true,bicycle:{...DEFAULT_BICYCLE,kind:"child"}}).totalChf,null);
 assert.equal(tariffHealth(new Date("2026-10-14T12:00:00Z")).find(r=>r.source.id==="zvv")!.state,"review-due");
 assert.equal(tariffHealth(new Date("2026-12-13T00:00:00+01:00")).find(r=>r.source.id==="zvv")!.state,"expired");
});
