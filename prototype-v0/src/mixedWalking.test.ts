import assert from "node:assert/strict";
import { it } from "node:test";
import { cyclingEffort, cyclingKey, zeroCycling } from "./cycling.ts";
import { DEFAULT_OPTIONS, emptyNetwork, metrics, solve, type Network } from "./model.ts";
import { solveWaypoints } from "./waypoints.ts";
import { applyCyclingEdit } from "./cyclingEditor.ts";
import { detourStages } from "./cyclingDetour.ts";
import { navigationTrip, navigationReplan } from "./navigation.ts";
import type { Point, TransitLeg } from "./routing.ts";
const start = new Date("2026-11-01T08:00:00Z"), at = (m:number)=>new Date(+start+m*60000);
const a={id:"A",name:"A",lat:47.3,lon:8.4}, b={id:"B",name:"B",lat:47.4,lon:8.5};
const home={label:"Home",lat:47.299,lon:8.4}, finish={...b,label:"Finish",stopId:"B"};
const options={...DEFAULT_OPTIONS,maxBikeMinutes:5,maxAccessMinutes:5,maxEgressMinutes:0,maxWalkingMinutes:3,bicycleScope:"all-transit" as const};
function mixed(n:Network,from:Point,to:Point,ride=5,walk=3) {
  const route={...zeroCycling(from,to),source:"BRouter" as const,ridingSeconds:ride*60,connectorMinutes:walk,minutes:ride+walk,distanceKm:1};
  n.cycling!.set(cyclingKey(from,to),route); return route;
}
function train(n:Network,from:typeof a,to:typeof a,departure:number,arrival:number) {
  for(const s of [from,to]) n.stops.set(s.id,s);
  const leg:TransitLeg={mode:"transit",from:from.name,to:to.name,fromId:from.id,toId:to.id,departure:at(departure),arrival:at(arrival),service:"Test",serviceName:null,direction:null,departurePlatform:null,arrivalPlatform:null};
  n.edges.set(from.id+to.id,{id:from.id+to.id,from:from.id,to:to.id,leg});
}
function fixture() { const n=emptyNetwork();n.cycling=new Map();mixed(n,home,a);train(n,a,b,11,31);return n; }
it("a 5-minute cycling cap accepts 5 riding + 3 walking, while the train still needs 8 elapsed minutes",()=>{
  for(const mode of ["baseline","extended"] as const) for(const arriveBy of [undefined,at(31).toISOString()]) {
    const n=fixture(),o={...options,arriveBy};const j=solve(n,home,finish,start,o,mode).journeys[0];
    assert.ok(j);assert.equal(metrics(j).bike,5);assert.equal(metrics(j).walk,3);assert.equal(j.totalMinutes,31);
    assert.equal(+j.transitLegs[0].arrival!,+at(8));
    assert.equal(solve(n,home,finish,start,{...o,maxWalkingMinutes:2},mode).journeys.length,0);
    assert.equal(solve(n,home,finish,start,{...o,maxBikeMinutes:8,minBikeMinutes:8},mode).journeys.length,0);
    train(n,a,b,10,30);assert.equal(solve(n,home,finish,start,o,mode).journeys.length,0);
  }
});
it("pushing and carrying remain walking in ordered visits and arrival searches",()=>{
  const n=fixture(),r=n.cycling!.get(cyclingKey(home,a))!;r.connectorMinutes=0;r.pushingSeconds=120;r.carryingSeconds=60;
  const via={...a,label:"Visit",stopId:"A"};
  for(const arriveBy of [undefined,at(31).toISOString()]) {
    const j=solveWaypoints(n,[home,via,finish],start,{...options,arriveBy},"extended").journeys[0];
    assert.ok(j);assert.equal(metrics(j).bike,5);assert.equal(metrics(j).walk,3);assert.equal(j.totalMinutes,31);
  }
});
it("an intermediate connection charges riding to its cycling cap and walking to its own allowance",()=>{
  const n=emptyNetwork();n.cycling=new Map();
  const x={id:"X",name:"X",lat:47.32,lon:8.41}, y={id:"Y",name:"Y",lat:47.321,lon:8.42};
  train(n,a,x,3,10);train(n,y,b,22,35);mixed(n,x,y,2,7);
  const o={...options,maxBikeMinutes:2,maxAccessMinutes:0,maxIntermediateMinutes:2,maxWalkingMinutes:7};
  const j=solve(n,{...a,label:"Start",stopId:"A"},finish,start,o,"extended").journeys[0];
  assert.ok(j);assert.equal(metrics(j).bike,2);assert.equal(metrics(j).walk,7);assert.equal(j.totalMinutes,35);
  assert.equal(solve(n,{...a,label:"Start",stopId:"A"},finish,start,{...o,maxWalkingMinutes:6},"extended").journeys.length,0);
});
it("edits retain cycling budgets while using all walking time for connection feasibility",()=>{
  const n=fixture(),j=solve(n,home,finish,start,options,"baseline").journeys[0];
  const stage=detourStages(j,null,home,finish,start)[0];
  const context={journey:j,cycling:null,origin:home,destination:finish,start,options:{...options,maxWalkingMinutes:10}};
  const r={...stage.route,minutes:8,ridingSeconds:300,connectorMinutes:3};
  const edit=applyCyclingEdit(context,stage,[r]);assert.equal(metrics(edit.journey!).bike,5);assert.equal(metrics(edit.journey!).walk,3);
  assert.throws(()=>applyCyclingEdit(context,stage,[{...r,minutes:9,connectorMinutes:4}]),/miss|before/);
});
it("legacy routes stay compatible and walking cannot manufacture a cycling minimum",()=>{
  const legacy={...zeroCycling(home,a),minutes:8};assert.equal(cyclingEffort(legacy).bike,8);
  const route={...legacy,connectorMinutes:3,ridingSeconds:300};assert.deepEqual(cyclingEffort(route),{bike:5,walk:3,elapsed:8});
});

it("navigation deducts completed riding without using walking as cycling",()=>{
  const n=fixture(),j=solve(n,home,finish,start,options,"baseline").journeys[0];
  const trip=navigationTrip({key:"test",journey:j,cycling:null,origin:home,destination:finish,waypoints:[],options:{...options,maxBikeMinutes:10,maxAccessMinutes:10},mode:"baseline",start});
  assert.equal(trip.stages[0].minutes,8);assert.equal(trip.stages[0].ridingMinutes,5);
  const request=navigationReplan(trip,1,false,null,{lat:a.lat,lon:a.lon,accuracy:5,timestamp:+at(8)},+at(8));
  assert.equal(request.options.maxBikeMinutes,5);assert.equal(request.options.maxWalkingMinutes,3);
});
