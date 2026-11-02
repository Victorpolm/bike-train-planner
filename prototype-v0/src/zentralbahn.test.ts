import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import fixture from "./fixtures/zentralbahn-2026-11-02.json" with { type: "json" };
import { emptyNetwork } from "./model.ts";
import { addOjpConnections } from "./ojpClient.ts";
import { parseOjpConnections, type OjpLeg } from "./ojp.ts";
import { StationTransferClient } from "./stationTransferClient.ts";
import { handleStationTransfers } from "../server/stationTransferHandler.ts";
import { carriageForLeg, interpretBicycleAttributes, withTripInfoRule } from "./bicycleCarriage.ts";
import { bicycleStatus } from "./bicycleStatus.ts";
import { DEFAULT_FARE_PROFILE, fareSummary, fareCardSummary } from "./fares.ts";
import { DEFAULT_BICYCLE } from "./travelProfile.ts";
import type { TransitLeg } from "./routing.ts";
const signal=new AbortController().signal;
const api:typeof fetch=(input,init)=>handleStationTransfers(new Request(new URL(String(input),'https://app.test'),init));
const profile={...DEFAULT_FARE_PROFILE,bicycle:{...DEFAULT_BICYCLE,lengthCm:180}};
async function captured(){
 const n=emptyNetwork();for(const s of [fixture.query.from,fixture.query.to])n.stops.set(s.id,s);
 addOjpConnections(n,{...fixture.data,legs:fixture.data.legs as OjpLeg[]});await new StationTransferClient(api).hydrate(n,signal);
 return [...n.edges.values()].map(e=>e.leg);
}
it('uses published Zentralbahn rules for the captured services with no bicycle reservation fields',async()=>{
 const legs=await captured();assert.equal(legs.length,4);
 for(const leg of legs){
  assert.ok(leg.ojp!.attributes.every(a=>a.code!=='A__VR'));
  const rule=carriageForLeg(leg,profile);assert.equal(rule.permission,'confirmed');assert.equal(rule.bikeReservation,'not-required');
  assert.equal(rule.bikeTicket,'required');assert.equal(bicycleStatus(leg,profile).reservationBasis?.label,'Published rule');
  const fare=fareSummary([leg],profile);assert.equal(fare.bikeChf,15);assert.equal(fare.reservationChf,0);
  assert.equal(fare.minimumVerified,false,'A day pass is available but a cheaper single ticket is not verified');
  assert.equal(fare.passengerChf,null);assert.equal(fare.totalChf,null,'Unknown passenger fares must not become invented totals');
  const card=fareCardSummary([leg],profile);assert.match(card.price,/Bike ticket.*15.00/);assert.match(card.detail,/Passenger fare needs a quote/);assert.match(card.detail,/Complete journey total unavailable/);
  assert.equal(fareSummary([leg],{...profile,passenger:'ga'}).totalChf,15);
  assert.equal(fareSummary([leg],{...profile,passenger:'ga',annualBikePass:true}).totalChf,0);
 }
});
it('applies the rule to S44 independently of a coach symbol and retains stronger dated restrictions',async()=>{
 const base=(await captured())[0];
 for(const operator of ['ZB','Zentralbahn','ZB Zentralbahn AG','ojp:86','ch:1:sboid:100064']){
  const leg={...base,operator,category:'S',service:'S44',bicycleEvidence:undefined};
  assert.equal(carriageForLeg(leg).bikeReservation,'not-required');assert.equal(carriageForLeg(leg).permission,'confirmed');
 }
 for(const [code,permission,reservation] of [['A__VN','prohibited','not-required'],['A__VR','confirmed','required']] as const){
  const leg=structuredClone(base);leg.bicycleEvidence=withTripInfoRule(leg.bicycleEvidence!,interpretBicycleAttributes([{code,text:'',scope:'service'}]),fixture.data.checked);
  const rule=carriageForLeg(leg);assert.equal(rule.permission,permission);assert.equal(rule.bikeReservation,reservation);
 }
});
it('does not extend Zentralbahn rail and pass rules to replacement, foreign, unrelated or stale scope',async()=>{
 const base=(await captured())[0];
 for(const patch of [{operator:'ZBB'},{operator:'Example Zentralbahn partner'},{category:'B'},{category:'SEV'}, {serviceName:'Replacement bus'},
  {toId:'8000001'},{departure:new Date('2026-12-13T08:00:00Z'),arrival:new Date('2026-12-13T08:20:00Z')}]){
  const leg:TransitLeg={...base,...patch,bicycleEvidence:undefined};
  assert.equal(carriageForLeg(leg).bikeReservation,'unknown');assert.equal(fareSummary([leg],profile).bikeChf,null);
 }
});
it('prices the bike on a continuous SOB–Zentralbahn journey without inventing the passenger fare',async()=>{
 const last=(await captured())[0];
 const first:TransitLeg={...last,operator:'SOB',category:'IR',service:'IR VAE',fromId:'8506290',from:'Herisau',toId:'8505000',to:'Luzern',
  stationDeparture:undefined,stationArrival:undefined,bicycleEvidence:undefined,departure:new Date('2026-11-03T04:00:00Z'),arrival:new Date('2026-11-03T06:50:00Z')};
 const fare=fareSummary([first,last],profile);assert.equal(fare.bikeChf,15);assert.equal(fare.reservationChf,0);assert.equal(fare.passengerChf,null);
});
it('does not equate missing reservation symbols in recorded OJP data with an exemption',async()=>{
 const n=emptyNetwork();const legs=parseOjpConnections(readFileSync(new URL('./fixtures/ojp-live-2026-10-11/trip.xml',import.meta.url),'utf8'),false);
 addOjpConnections(n,{legs,checked:'2026-10-11T19:30:00Z',warnings:[]});await new StationTransferClient(api).hydrate(n,signal);
 const ic=[...n.edges.values()].find(e=>e.leg.service==='IC8')!.leg;
 assert.equal(ic.ojp!.attributes.some(a=>a.code==='A__VR'),false);
 assert.equal(carriageForLeg(ic).bikeReservation,'required','Sunday 11 October falls within the IC reservation calendar');
 assert.equal(bicycleStatus(ic).reservationBasis,null);
});
