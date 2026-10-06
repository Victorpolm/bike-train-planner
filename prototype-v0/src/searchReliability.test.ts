import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { OjpClient, addOjpConnections } from './ojpClient.ts';
import { createOjpHandler } from '../server/ojpHandler.ts';
import { fareQuery } from './onlineFare.ts';
import { DEFAULT_FARE_PROFILE } from './fares.ts';
import { DEFAULT_OPTIONS, emptyNetwork } from './model.ts';
import { plan, type SearchSession } from './api.ts';
import { firstBoarding, laterDepartureStart, laterDepartures } from './laterDepartures.ts';
import { haversineKm } from './routing.ts';

it('keeps enriched stop requests within the OJP boundary and retains exact fare evidence', async () => {
  const xml = readFileSync(new URL('./fixtures/ojp-2026-09-24/rail-off.xml', import.meta.url), 'utf8');
  const server = createOjpHandler(async () => new Response(xml), 0);
  let bytes = 0;
  const client = new OjpClient(new AbortController().signal, async (_url, init) => {
    bytes = new TextEncoder().encode(String(init?.body)).length;
    return server(new Request('https://app.example/api/ojp/connections', init), { OJP_API_KEY: 'test-only-key' });
  });
  const detail = { cyclingRoute: { points: Array.from({length:2000}, () => ({lat:47.3,lon:8.5})), fetchedAt: 1 }, bikeMinutes: 12 };
  const from = { id:'8503000',name:'Zürich HB',lat:47.378,lon:8.54,...detail };
  const to = { id:'8507000',name:'Bern',lat:46.949,lon:7.439,...detail };
  const result = await client.connections(from, to, new Date('2026-10-05T08:00:00Z'), () => true);
  assert.ok(result); assert.ok(bytes < 512); assert.equal(client.warnings.size,0);
  assert.ok(result.fareSources?.length);
  const n = emptyNetwork(); addOjpConnections(n,result);
  const leg = [...n.edges.values()].find(e => e.leg.mode === 'transit' && e.leg.fareSources?.length)!.leg;
  assert.ok(fareQuery([leg],DEFAULT_FARE_PROFILE)?.sources?.length);
});

const start = new Date('2026-10-05T08:00:00Z');
const origin = {label:'Fixture A',stopId:'8500091',lat:46.11,lon:6.11,kind:'train'};
const destination = {label:'Fixture B',stopId:'8500092',lat:46.61,lon:6.81,kind:'train'};
const options = {...DEFAULT_OPTIONS,maxAccessMinutes:0,maxEgressMinutes:0,maxIntermediateMinutes:0,bicycleScope:'allow-uncertain' as const};
const station = (p: typeof origin) => ({id:p.stopId,name:p.label,coordinate:{x:p.lat,y:p.lon},icon:'train'});
const iso = (minutes:number) => new Date(+start+minutes*60_000).toISOString();
const fetcher: typeof fetch = async input => {
  const url = new URL(String(input));
  if (!url.pathname.endsWith('connections')) return Response.json({stations:[]});
  return Response.json({connections:[10,40,70,100].map(depart => ({sections:[{journey:{category:'IC',number:String(depart),operator:'SBB'},
    departure:{station:station(origin),departure:iso(depart)},arrival:{station:station(destination),arrival:iso(depart+30)}}]}))});
};

it('More advances successive departures, retains earlier results and preserves every trip preference', async () => {
  const signal = new AbortController().signal;
  let current = await plan(origin,destination,'baseline',options,signal,()=>{},()=>{}, {start,fetcher,gapMs:0,cyclingClient:null});
  const first = current.baseline.journeys[0], oldIds = current.baseline.journeys.map(j=>j.id);
  assert.equal(firstBoarding(first)?.toISOString(),iso(10));
  for (const departure of [40,70]) {
    const previous = current, journey = previous.baseline.journeys[0];
    current = await laterDepartures(previous,journey,'baseline',signal,()=>{});
    assert.equal(firstBoarding(current.baseline.journeys[0])?.toISOString(),iso(departure));
    assert.deepEqual(current.options,options);
    assert.ok(current.client.requests<=18);
    assert.ok(!previous.client.signal.aborted);
    assert.equal(previous.baseline.journeys[0],journey);
  }
  assert.deepEqual(oldIds,[first.id]);
});

it('later boarding readiness subtracts cycling and walking access exactly once', async () => {
  const s = await plan(origin,destination,'baseline',options,new AbortController().signal,()=>{},()=>{}, {start,fetcher,gapMs:0,cyclingClient:null});
  const j=s.baseline.journeys[0];
  const bike={...j.transitLegs[0],mode:'bike' as const,departure:new Date(+start),arrival:new Date(+start+5*60_000)};
  const walk={...bike,mode:'walk' as const,departure:bike.arrival,arrival:new Date(+start+7*60_000)};
  const result={...j,legsIncludeEndpoints:true,originStation:{...j.originStation,bikeMinutes:5},transitLegs:[bike,walk,{...j.transitLegs[0],departure:new Date(+start+20*60_000)}]};
  assert.equal(laterDepartureStart(result,3).toISOString(),iso(11));
});

it('tries the expanded stop pool when four short-distance access paths exceed the real cycling budget', async () => {
  const home={label:'Sparse-area fixture',lat:46.5,lon:9};
  const end={label:'End',stopId:'8500099',lat:47,lon:9.1,kind:'train'};
  const stops=Array.from({length:5},(_,i)=>({id:'850001'+i,name:'Candidate '+i,icon:'bus',coordinate:{x:46.501+i*.001,y:9}}));
  const result = await plan(home,end,'extended',{...options,maxBikeMinutes:5,maxAccessMinutes:5},new AbortController().signal,()=>{},()=>{}, {
    start,gapMs:0,fetcher:async input=>{
      const url=new URL(String(input));
      if(url.pathname.endsWith('locations'))return Response.json({stations:stops});
      return Response.json({connections:[{sections:[{journey:{category:'B',number:'1'},departure:{station:stops[4],departure:iso(20)},arrival:{station:station(end),arrival:iso(50)}}]}]});
    },
    cyclingFetcher:async input=>{
      const [a,b]=new URL(String(input)).searchParams.get('lonlats')!.split('|').map(p=>{const [lon,lat]=p.split(',').map(Number);return {lat,lon}});
      return Response.json({features:[{geometry:{type:'LineString',coordinates:[[a.lon,a.lat,400],[b.lon,b.lat,400]]},properties:{'track-length':haversineKm(a,b)*1000,'total-time':Math.abs(b.lat-46.505)<1e-7?120:6000}}]});
    }
  });
  assert.ok(result.originStations.some(s=>s.id===stops[4].id));
  assert.ok(result.extended?.journeys.length);
  assert.ok(result.extendedComplete);
  assert.ok(result.client.requests<=18);
});
