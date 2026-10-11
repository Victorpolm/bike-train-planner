import assert from "node:assert/strict";
import { it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { createMaintenanceHandler,canaryAlert,MAX_SOURCE_CHECKS,type CanaryResult } from "../server/maintenanceHandler.ts";
import { MONITORED_SOURCES, monitoredHealth } from "./monitoredSources.ts";
import type { QuotaDatabase } from "../server/apiQuota.ts";
function database(){const sql=new DatabaseSync(":memory:");type S={sql:string;values:(string|number)[];bind(...values:(string|number)[]):S};return {sql,DB:{prepare(source:string):S{return {sql:source,values:[],bind(...values){this.values=values;return this;}};},async batch(ss:S[]){sql.exec("BEGIN IMMEDIATE");try{const r=ss.map(s=>({success:true,results:sql.prepare(s.sql).all(...s.values)}));sql.exec("COMMIT");return r;}catch(e){sql.exec("ROLLBACK");throw e;}}} as unknown as QuotaDatabase};}
const original=readFileSync(new URL("./fixtures/ojp-2026-09-24/rail-off.xml",import.meta.url),"utf8");
// Synthetic estimates exercise capture/parser semantics. A live fixture is captured only by the deployed canary.
const xml=original.replace(/(<(?:\w+:)?TimetabledTime>)([^<]+)(<\/(?:\w+:)?TimetabledTime>)/g,"$1$2$3<EstimatedTime>$2</EstimatedTime>")
 .replace(/(<(?:\w+:)?ResponseTimestamp>)[^<]+/g,"$12026-10-12T08:30:00Z");
const request=()=>new Request("https://private.example/api/maintenance/check",{method:"POST",headers:{"X-Maintenance-Intent":"review"}});
it("persists one daily canary across concurrent workers, respects quota and reads back raw evidence without credentials",async()=>{
 const {DB,sql}=database();let provider=0,sources=0,quota=0;const now=()=>new Date("2026-10-12T08:30:00Z");
 const fetcher:typeof fetch=async url=>{if(String(url).includes("ojp20")){provider++;return new Response(xml);}sources++;return String(url).includes("Downloads")||String(url).endsWith(".pdf")?new Response("%PDF-1.7 fixture",{headers:{"Content-Type":"application/pdf"}}):new Response("<html>Published tariff</html>",{headers:{"Content-Type":"text/html"}});};
 const handlers=Array.from({length:8},()=>createMaintenanceHandler(fetcher,now,async()=>{quota++;}));
 const replies=await Promise.all(handlers.map(h=>h(request(),{DB,OJP_API_KEY:"fixture-secret"}).then(r=>r.json())));
 assert.equal(replies.filter(r=>r.status==="completed").length,1);assert.equal(provider,1);assert.equal(sources,MAX_SOURCE_CHECKS);assert.equal(quota,1);
 const status=await handlers[0](new Request("https://private.example/api/maintenance/status"),{DB}).then(r=>r.json());
 assert.equal(status.history[0].status,"estimates-observed");assert.ok(status.history[0].parsedEstimates>0);assert.equal(status.history[0].fixtureSaved,true);
 const fixture=await handlers[0](new Request("https://private.example/api/maintenance/fixture"),{DB}).then(r=>r.text());assert.equal(fixture,xml);
 assert.ok(!JSON.stringify(sql.prepare("SELECT * FROM maintenance_records").all()).includes("fixture-secret"));sql.close();
});
it("reports retrieval failure without extending any expiry and rejects an implicit writer",async()=>{
 const {DB,sql}=database();const handler=createMaintenanceHandler(async()=>new Response("unavailable",{status:503}),()=>new Date("2026-10-12T08:30:00Z"),async()=>{});
 assert.equal((await handler(new Request("https://private.example/api/maintenance/check",{method:"POST"}),{DB})).status,403);
 const result=await handler(request(),{DB,OJP_API_KEY:"fixture"}).then(r=>r.json());assert.equal(result.canary.status,"error");assert.equal(result.sources.filter((s:any)=>s.status==="error").length,MAX_SOURCE_CHECKS);
 assert.ok(result.sources.filter((s:any)=>s.status==="error").every((s:any)=>s.reason.startsWith("HTTP 503")));
 assert.equal(result.tariffs.find((s:any)=>s.source.id==="zvv").source.validThrough,"2026-12-12");sql.close();
});
it("rotates bounded source retrieval without starving unvisited sources and saves numbered line candidates",async()=>{
 const {DB,sql}=database(),visited=new Set<string>(),requests:string[]=[];let now=new Date("2026-10-12T08:30:00Z"),calls=0;
 const fetcher:typeof fetch=async(url,init)=>{
  if(String(url).includes("ojp20")){requests.push(String(init?.body));return new Response(xml.replaceAll("2026-10-12T08:30:00Z",now.toISOString()));}
  calls++;visited.add(String(url));const source=MONITORED_SOURCES.find(s=>s.url===String(url))!;
  return source.format==="pdf"?new Response("%PDF-1.7 fixture",{headers:{"Content-Type":"application/pdf"}}):source.format==="json"?Response.json({updated:"2026-10-04"}):new Response("<html>Published tariff</html>",{headers:{"Content-Type":"text/html"}});
 };
 const handler=createMaintenanceHandler(fetcher,()=>now,async()=>{});
 for(let i=0;i<Math.ceil(MONITORED_SOURCES.length/MAX_SOURCE_CHECKS);i++){
  const before=calls,result=await handler(request(),{DB,OJP_API_KEY:"fixture"}).then(r=>r.json());
  assert.equal(result.status,"completed");assert.ok(calls-before<=MAX_SOURCE_CHECKS);
  now=new Date(+now+86400000);
 }
 assert.equal(visited.size,MONITORED_SOURCES.length);assert.match(requests[0],/Zürich HB/);assert.match(requests[1],/Genève, Plainpalais/);
 const line=await handler(new Request("https://private.example/api/maintenance/sources/tpg-line-12"),{DB});assert.equal(line.status,200);
 assert.equal(line.headers.get("content-disposition"),'attachment; filename=tpg-line-12.html');
 const status=await handler(new Request("https://private.example/api/maintenance/status"),{DB}).then(r=>r.json());
 assert.ok(status.sourceChecks.every((s:any)=>s.status!=="pending"));
 sql.close();
});
it("keeps stale provider estimates out of successful live-observation counts",async()=>{
 const {DB,sql}=database();const stale=xml.replaceAll("2026-10-12T08:30:00Z","2026-10-11T08:30:00Z");
 const handler=createMaintenanceHandler(async url=>String(url).includes("ojp20")?new Response(stale):new Response("unavailable",{status:503}),()=>new Date("2026-10-12T08:30:00Z"),async()=>{});
 const result=await handler(request(),{DB,OJP_API_KEY:"fixture"}).then(r=>r.json());
 assert.ok(result.canary.estimatedTimes>0);assert.equal(result.canary.status,"no-estimates");assert.equal(result.canary.freshEstimatedServices,0);
 sql.close();
});
it("warns before rule/zone renewal and escalates 30, 14 and 7 days without extending coverage",()=>{
 const state=(day:string)=>monitoredHealth(new Date(day+"T12:00:00Z")).find(s=>s.source.id==="operator-bernmobil")!;
 assert.equal(state("2026-10-13").state,"review-due");assert.equal(state("2026-11-12").urgency,"soon");
 assert.equal(state("2026-11-28").urgency,"urgent");assert.equal(state("2026-12-05").urgency,"critical");
 assert.equal(state("2026-12-13").urgency,"expired");assert.equal(state("2026-12-13").source.validThrough,"2026-12-12");
});
it("alerts only on five consecutive weekday observations and distinguishes errors and missed samples",()=>{
 const row=(day:string):CanaryResult=>({day,checkedAt:day+"T08:30:00Z",status:"no-estimates",services:4,estimatedTimes:0,parsedEstimates:0,fixtureSaved:false});
 const history=["2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-16"].map(row);
 assert.equal(canaryAlert(history,new Date("2026-10-16T12:00:00Z")).state,"attention");
 assert.notEqual(canaryAlert(history.slice(1),new Date("2026-10-16T12:00:00Z")).state,"attention");
 assert.notEqual(canaryAlert(history.map((r,i)=>i===2?{...r,status:"error"}:r),new Date("2026-10-16T12:00:00Z")).state,"attention");
 assert.equal(canaryAlert(history,new Date("2026-10-22T12:00:00Z")).state,"stale");
});
