import assert from "node:assert/strict";
import { it } from "node:test";
import { runLiveCanary } from "../server/liveCanary.ts";
import { canaryAlert, type CanaryResult } from "../server/maintenanceHandler.ts";

// Synthetic protocol fixtures exercise the same exact-segment path as real
// captured responses; they are never described as live provider evidence.
const stamp="2026-10-13T08:30:00.000Z",now=new Date(stamp),time=(m:number)=>new Date(+now+m*60000).toISOString();
const query={from:{id:"A",name:"A",lat:47,lon:8},to:{id:"B",name:"B",lat:47.1,lon:8.1},departure:stamp};
function call(end:"departure"|"arrival",estimates:boolean,offset=0){
 const tag=end==="departure"?"ServiceDeparture":"ServiceArrival",planned=time((end==="departure"?10:30)+offset);
 return `<Order>${end==="departure"?1:2}</Order><StopPointRef>${end==="departure"?"A":"B"}</StopPointRef><${tag}><TimetabledTime>${planned}</TimetabledTime>${estimates?`<EstimatedTime>${time((end==="departure"?12:32)+offset)}</EstimatedTime>`:""}</${tag}>`;
}
const service=(id="train-1")=>`<Service><JourneyRef>${id}</JourneyRef><OperatingDayRef>2026-10-13</OperatingDayRef><Mode><PtMode>rail</PtMode></Mode><ProductCategory><ShortName>IR</ShortName></ProductCategory><PublicCode>35</PublicCode><OperatorRef>11</OperatorRef></Service>`;
function trip(estimates=true,offset=0,extra=""){
 const places=["A","B"].map(id=>`<Place><StopPoint><StopPointRef>${id}</StopPointRef><StopPointName>${id}</StopPointName></StopPoint><GeoPosition><Latitude>47</Latitude><Longitude>8</Longitude></GeoPosition></Place>`).join("");
 return `<OJP><OJPResponse><ServiceDelivery><OJPTripDelivery><ResponseTimestamp>${stamp}</ResponseTimestamp><TripResponseContext><Places>${places}</Places></TripResponseContext><TripResult><Trip><Leg><TimedLeg><LegBoard>${call("departure",estimates,offset)}</LegBoard><LegAlight>${call("arrival",estimates,offset)}</LegAlight>${service()}</TimedLeg></Leg></Trip></TripResult>${extra}</OJPTripDelivery></ServiceDelivery></OJPResponse></OJP>`;
}
const info=(estimates=true,id="train-1",timestamp=stamp)=>`<OJP><OJPResponse><ServiceDelivery><OJPTripInfoDelivery><ResponseTimestamp>${timestamp}</ResponseTimestamp><TripInfoResult>${service(id)}<OnwardCall>${call("departure",estimates)}</OnwardCall><OnwardCall>${call("arrival",estimates)}</OnwardCall></TripInfoResult></OJPTripInfoDelivery></ServiceDelivery></OJPResponse></OJP>`;
it("tests both explanatory request types with the real builders/parsers and accounts for each provider call",async()=>{
 const bodies:string[]=[];let quota=0;
 const result=await runLiveCanary(query,async(_url,init)=>{const body=String(init?.body);bodies.push(body);return new Response(body.includes("OJPTripInfoRequest")?info():trip());},now,"private-token",async()=>{quota++;});
 assert.equal(quota,2);assert.equal(bodies.length,2);assert.ok(bodies.every(b=>b.includes("<UseRealtimeData>explanatory</UseRealtimeData>")));
 assert.match(bodies[1],/<JourneyRef>train-1<\/JourneyRef>/);assert.equal(result.sample.status,"estimates-observed");
 assert.equal(result.sample.freshDelayedServices,1);assert.equal(result.sample.tripInfo!.freshEstimates,2);
 assert.equal(result.infoFixture!.reference!.fromRef,"A");assert.ok(result.tripFixture);assert.doesNotMatch(JSON.stringify(result),/private-token/);
});
it("does not let a successful search hide a mismatched or failed exact-service refresh",async()=>{
 const result=await runLiveCanary(query,async(_url,init)=>new Response(String(init?.body).includes("OJPTripInfoRequest")?info(true,"another-service"):trip()),now,"private-token",async()=>{});
 assert.equal(result.sample.status,"estimates-observed");assert.equal(result.sample.tripInfo!.status,"error");assert.equal(result.infoFixture,undefined);
 assert.equal(canaryAlert([result.sample],now).state,"error");assert.match(canaryAlert([result.sample],now).reason,/TripInfo/);
});
it("rejects raw unrelated EstimatedTime elements and stale detail timestamps as proof of live coverage",async()=>{
 const no=await runLiveCanary(query,async(_url,init)=>new Response(String(init?.body).includes("OJPTripInfoRequest")?info(false):trip(false,0,`<Unrelated><EstimatedTime>${time(10)}</EstimatedTime></Unrelated>`)),now,"private-token",async()=>{});
 assert.equal(no.sample.estimatedTimes,1);assert.equal(no.sample.parsedEstimates,0);assert.equal(no.sample.status,"no-estimates");assert.equal(no.infoFixture,undefined);assert.equal(no.tripFixture,undefined);
 const stale=await runLiveCanary(query,async(_url,init)=>new Response(String(init?.body).includes("OJPTripInfoRequest")?info(true,"train-1",time(-3)):trip()),now,"private-token",async()=>{});
 assert.equal(stale.sample.tripInfo!.status,"no-estimates");assert.equal(stale.sample.tripInfo!.freshEstimates,0);assert.equal(stale.infoFixture,undefined);
});
it("does not count historical or far-future journeys as current live canary success",async()=>{
 for(const offset of [-1440,180]){let calls=0;const r=await runLiveCanary(query,async()=>{calls++;return new Response(trip(true,offset));},now,"private-token",async()=>{});
  assert.equal(calls,1);assert.equal(r.sample.services,0);assert.equal(r.sample.status,"error");assert.equal(r.infoFixture,undefined);}
});
it("alerts independently when TripInfo is quiet for five weekdays despite healthy search estimates",()=>{
 const history:CanaryResult[]=["2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-16"].map(day=>({day,checkedAt:day+"T08:30:00Z",status:"estimates-observed",services:1,estimatedTimes:2,parsedEstimates:1,fixtureSaved:true,tripInfo:{status:"no-estimates",freshEstimates:0,fixtureSaved:false}}));
 const alert=canaryAlert(history,new Date("2026-10-16T12:00:00Z"));assert.equal(alert.state,"attention");assert.match(alert.reason,/TripInfo/);
 assert.equal(canaryAlert(history.map(({tripInfo:_,...row})=>row),new Date("2026-10-16T12:00:00Z")).state,"partial");
});
