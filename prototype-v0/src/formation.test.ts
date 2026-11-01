import assert from "node:assert/strict";
import { it } from "node:test";
import { formationSymbols, parseFormation, type FormationReference } from "./formation.ts";
import { createFormationService, formationKey } from "../server/formationService.ts";
import { swissDateTimeInput } from "./departure.ts";
import { applyRealtimeService } from "./realtimeService.ts";
import { carriageForLeg, interpretBicycleAttributes } from "./bicycleCarriage.ts";
import type { TransitLeg } from "./routing.ts";
const day = swissDateTimeInput(new Date()).slice(0,10), dep = day + "T12:00:00Z", arr = day + "T13:00:00Z";
const ref: FormationReference = { journeyRef: "ch:1:sjyid:100001:900-001", operatingDay: day, trainNumber: "900", operator: "ojp:11", evu: "SBBP", from: "Zürich HB", to: "Bern", departure: dep, arrival: arr };
const a = { uic: 8503000, name: ref.from }, b = { uic: 8507000, name: ref.to }, c = { uic: 8500218, name: "Olten" };
function fixture() { return {
  journeyMetaInformation: { operationDate: day, SJYID: ref.journeyRef }, trainMetaInformation: { trainNumber: 900, toCode: "11", runs: "J" },
  formationsAtScheduledStops: [
    { scheduledStop: { stopPoint: a, stopType: "H", stopTime: { departureTime: dep } }, formationShort: { formationShortString: "@A[1:1,2:2#VR;NF]" } },
    { scheduledStop: { stopPoint: c, stopType: "H", stopTime: { arrivalTime: day+"T12:30:00Z", departureTime: day+"T12:32:00Z" } }, formationShort: { formationShortString: "[1:1,2:2#VR]" } },
    { scheduledStop: { stopPoint: b, stopType: "H", stopTime: { arrivalTime: arr } }, formationShort: { formationShortString: "[1:1,2:2#VR]" } }],
  formations: [{ formationVehicles: [{ number: 2, vehicleProperties: { fromStop: a, toStop: b, closed: false, bikePlatform: true, trolleyStatus: "Normal" } }] }],
}; }
it("matches the exact dated train and through bicycle coach with reservation symbol", () => {
  const result = parseFormation(fixture(), ref);
  assert.equal(result.status,"matched"); assert.equal(result.rule?.permission,"allowed");
  assert.equal(result.rule?.bikeReservation,"required"); assert.deepEqual(result.coaches,["2"]);
  for (const mismatch of [{ journeyRef:"other" }, { trainNumber:"999" }, { operatingDay:"2000-01-01" }, { from:"Bern" }, { departure:day+"T12:01:00Z" }])
    assert.equal(parseFormation(fixture(), {...ref,...mismatch}).status,"unmatched");
});
it("a bike pictogram proves permission, not a reservation exemption", () => {
  const data = fixture(); for (const s of data.formationsAtScheduledStops) s.formationShort.formationShortString = "[2:2#VH]";
  assert.equal(parseFormation(data,ref).rule?.bikeReservation,"unknown");
  assert.equal(parseFormation(data,ref).rule?.reservationUnspecified,true);
});
it("rejects closed, detached, stabled, section-only or missing bicycle coaches", () => {
  for (const change of ["closed","detached","section","missing"]) {
    const data = fixture(), p = data.formations[0].formationVehicles[0].vehicleProperties;
    if (change === "closed") p.closed = true;
    if (change === "detached") Object.assign(p,{vehicleWillBePutAway:true});
    if (change === "section") p.toStop = c;
    if (change === "missing") p.bikePlatform = false;
    for (const s of data.formationsAtScheduledStops) s.formationShort.formationShortString = "2:9#VR[1:1,-2:2#VR,X:3#VH]";
    assert.equal(parseFormation(data,ref).rule,undefined, change);
  }
  const data = fixture(); data.formationsAtScheduledStops[0].scheduledStop.stopType="D";
  assert.equal(parseFormation(data,ref).status,"unmatched");
});
it("parses only exact bike offers inside moving groups, not passenger R or parked coaches", () => {
  const s = formationSymbols("2:7#VR@A[1:1#R,-2:2#VR,X:3#VR,(2:4#VH),2:5#VR;NF]");
  assert.deepEqual(s.filter(x=>x.bike).map(x=>x.number),["4","5"]);
  assert.equal(formationSymbols("[2:4#VR").length,0);
});
it("keeps explicit prohibitions and reservation conflicts and expires formation-only evidence", () => {
  const f = parseFormation(fixture(),ref), leg: TransitLeg = { mode:"transit", from:ref.from,to:ref.to,fromId:"a",toId:"b",departure:new Date(dep),arrival:new Date(arr),service:"Train",operator:"unreviewed",category:"Train",
    ojp:{ journeyRef:ref.journeyRef,operatingDay:day,fromRef:"a",toRef:"b",departure:dep,arrival:arr,fromOrder:1,toOrder:2,bikeFiltered:false,attributes:[] } };
  const detail = { checked:new Date().toISOString(),rule:interpretBicycleAttributes([]),formation:f };
  const applied = applyRealtimeService(leg,detail);
  assert.equal(carriageForLeg(applied).permission,"confirmed"); assert.equal(carriageForLeg(applied).bikeReservation,"required");
  applied.bicycleEvidence!.formation!.checked = new Date(Date.now()-121000).toISOString();
  assert.equal(carriageForLeg(applied).permission,"uncertain");
  const prohibited = applyRealtimeService(leg,{...detail,formation:parseFormation(fixture(),ref),rule:interpretBicycleAttributes([{code:"A__VN",text:"",scope:"service"}])});
  assert.equal(carriageForLeg(prohibited).permission,"prohibited");
  const conflict = applyRealtimeService(leg,{...detail,formation:parseFormation(fixture(),ref),rule:interpretBicycleAttributes([{code:"",text:"Bicycles: no reservation required",scope:"service"}])});
  assert.equal(carriageForLeg(conflict).bikeReservation,"unknown");
});
it("supports both secret names, keeps keys server-side, meters and caches formation responses", async () => {
  assert.equal(formationKey({API_FORMATION_KEY:" Bearer new ",OJP_FORMATION_KEY:"old"}),"new");
  assert.equal(formationKey({OJP_FORMATION_KEY:"old"}),"old");
  let calls=0, quotas=0;
  const service = createFormationService(async (url,init) => { calls++; assert.match(String(url),/formations_full/); assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer fake-secret"); return Response.json(fixture()); },async()=>{quotas++;});
  const env = { OJP_FORMATION_KEY:"fake-secret" }, signal = new AbortController().signal;
  const result = await service(ref,env,signal); assert.equal(result.status,"matched"); assert.ok(!JSON.stringify(result).includes("fake-secret"));
  await service(ref,env,signal); assert.equal(calls,1); assert.equal(quotas,1);
  assert.equal((await service({...ref,operatingDay:"2000-01-01"},env,signal)).status,"outside-window");
  const refused = createFormationService(async()=>new Response("sensitive error",{status:403}),async()=>{});
  assert.equal((await refused(ref,env,signal)).status,"auth-failed");
  const failed = createFormationService(async()=>{throw Error("secret")},async()=>{});
  assert.equal((await failed(ref,env,signal)).status,"unavailable");
});

it("falls back from unavailable full formations to stop symbols without losing a required reservation", async()=>{
  const paths:string[]=[];
  const service=createFormationService(async(url,init)=>{
    paths.push(new URL(String(url)).pathname);assert.equal(init?.redirect,"manual");
    const data=fixture();data.formations=[];
    return paths.length===1?new Response("private provider diagnostics",{status:500}):Response.json(data);
  },async()=>{});
  const result=await service(ref,{API_FORMATION_KEY:"fake-secret"},new AbortController().signal);
  assert.equal(result.providerStatus,200);assert.equal(result.rule?.bikeReservation,"required");
  assert.deepEqual(paths,["/formation/v2/formations_full","/formation/v2/formations_stop_based"]);
});
it("bounds a provider that never resolves and rejects redirects without returning diagnostics",async()=>{
  const timeout=createFormationService(async()=>new Promise<Response>(()=>{}),async()=>{},10);
  assert.equal((await timeout(ref,{API_FORMATION_KEY:"test"},new AbortController().signal)).status,"unavailable");
  const redirect=createFormationService(async()=>new Response("sensitive",{status:302,headers:{Location:"https://example.test"}}),async()=>{});
  const result=await redirect(ref,{API_FORMATION_KEY:"test"},new AbortController().signal);
  assert.equal(result.providerStatus,302);assert.ok(!JSON.stringify(result).includes("sensitive"));
});
it("uses observed RE37 CUS group symbols even when FOS bicycle equipment flags are false",()=>{
  const observed=["@D,F,F,F@C,F,F,F,F,F@B,F,F,[(2#VH;NF,2#NF@A,1#VH;NF,12#NF,2#BHP;KW;NF,2)#KW;NF]",
    "@E,F,F,F@D,F,F,F@C,[(2#VH;NF,2#NF@B,1#VH;NF,12#NF@A,2#BHP;KW;NF,2)#KW;NF],F,F,F"];
  const data=fixture();data.formations[0].formationVehicles=[{number:0,position:1,vehicleProperties:{fromStop:a,toStop:b,closed:false,bikePlatform:false,trolleyStatus:"Normal"}} as any];
  observed.forEach((s,i)=>data.formationsAtScheduledStops[i].formationShort.formationShortString=s);
  assert.equal(formationSymbols(observed[0]).length,6);
  assert.deepEqual(formationSymbols(observed[0]).filter(s=>s.bike).map(s=>s.position),[1,3]);
  const result=parseFormation(data,ref);assert.equal(result.status,"matched");assert.equal(result.rule?.bikeReservation,"unknown");
  data.formations[0].formationVehicles[0].vehicleProperties.toStop=c;
  assert.equal(parseFormation(data,ref).status,"no-data");
});
it("inherits bicycle R only inside its group, excludes closed groups, and rejects malformed syntax",()=>{
  assert.deepEqual(formationSymbols("[(2:1,2:2)#VR,2:3#VH]").filter(s=>s.reservation).map(s=>s.number),["1","2"]);
  assert.equal(formationSymbols("[-(2:1,2:2)#VR]").filter(s=>s.bike).length,0);
  for(const text of ["[(2:1#VR]","[2:1#VR,unexpected]","[2:1#VR,2:2#VHX]"]) {
    const symbols=formationSymbols(text);assert.ok(!symbols.length || symbols.filter(s=>s.bike).length===1);
  }
});

it("uses explicit vehicle destinations when a stop-only formation has no coach numbers",()=>{
  const data=fixture();data.formations=[];
  data.formationsAtScheduledStops.forEach(s=>s.formationShort.formationShortString="[(2,2)#VR]");
  Object.assign(data.formationsAtScheduledStops[0].formationShort,{vehicleGoals:[{fromVehicleAtPosition:1,toVehicleAtPosition:2,destinationStopPoint:b}]});
  assert.equal(parseFormation(data,ref).rule?.bikeReservation,"required");
  Object.assign(data.formationsAtScheduledStops[0].formationShort,{vehicleGoals:[{fromVehicleAtPosition:1,toVehicleAtPosition:2,destinationStopPoint:c}]});
  assert.equal(parseFormation(data,ref).rule,undefined);
});
