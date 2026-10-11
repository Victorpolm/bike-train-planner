import { PRICE_SOURCES, tariffHealth } from "../src/tariffSources.ts";
import { ojpTripRequest, parseOjpConnections } from "../src/ojp.ts";
import { claimApiCall, type QuotaGate, type QuotaDatabase } from "./apiQuota.ts";
import type { OjpEnvironment } from "./ojpHandler.ts";

type RecordRow = { key: string; payload: string; checked: string };
export type CanaryResult = { day:string; checkedAt:string; status:"estimates-observed"|"no-estimates"|"error"; services:number; estimatedTimes:number; parsedEstimates:number; fixtureSaved:boolean; reason?:string };
type SourceCheck = { id:string; url:string; checkedAt:string; status:"baseline"|"unchanged"|"changed"|"error"; sha256?:string; previousHash?:string; bytes?:number; candidateSaved?:boolean; contentType?:string; reason?:string };
const DAY=86400000;
const dayOf=(now:Date)=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Zurich"}).format(now);
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes as BufferSource)),b=>b.toString(16).padStart(2,"0")).join("");
async function bounded(response:Response,max:number,signal:AbortSignal) {
 if(!response.ok || !response.body || Number(response.headers.get("content-length"))>max) throw new Error("Source unavailable or oversized");
 const reader=response.body.getReader(), chunks:Uint8Array[]=[];let length=0;
 try { for(;;){signal.throwIfAborted();const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>max)throw new Error("Source oversized");chunks.push(r.value);} }
 finally {await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;
}
async function sourceResponse(fetcher:typeof fetch,url:string,signal:AbortSignal,accept:string) {
 const initial=new URL(url);let current=url;
 for(let redirects=0;redirects<4;redirects++) {
  const response=await fetcher(current,{signal,redirect:"manual",headers:{Accept:accept}});
  if(response.status<300||response.status>=400)return response;
  const location=response.headers.get("location");await response.body?.cancel();if(!location)throw new Error("Missing redirect target");
  const target=new URL(location,current);
  if(target.protocol!=="https:"||target.hostname.replace(/^www\./,"")!==initial.hostname.replace(/^www\./,""))throw new Error("Source redirect needs review");
  current=target.href;
 }
 throw new Error("Source redirect limit");
}
const base64=(bytes:Uint8Array)=>{let raw="";for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);};
async function initialize(db:QuotaDatabase){await db.batch([db.prepare("CREATE TABLE IF NOT EXISTS maintenance_records(key TEXT PRIMARY KEY,payload TEXT NOT NULL,checked TEXT NOT NULL)")]);}
async function read<T>(db:QuotaDatabase,key:string):Promise<T|null>{const r=await db.batch<RecordRow>([db.prepare("SELECT key,payload,checked FROM maintenance_records WHERE key=?1").bind(key)]);if(!r[0]?.success)throw new Error("Monitor storage unavailable");return r[0].results[0]?JSON.parse(r[0].results[0].payload) as T:null;}
const write=(db:QuotaDatabase,key:string,data:unknown,checked:string)=>db.prepare("INSERT INTO maintenance_records(key,payload,checked) VALUES(?1,?2,?3) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,checked=excluded.checked").bind(key,JSON.stringify(data),checked);
export function canaryAlert(history:CanaryResult[],now=new Date()) {
 const weekdays=history.filter(r=>![0,6].includes(new Date(r.day+"T12:00:00Z").getUTCDay())).sort((a,b)=>b.day.localeCompare(a.day));
 const expected:string[]=[];const cursor=new Date(dayOf(now)+"T12:00:00Z");
 // Only completed weekdays count; today's run may not yet have happened.
 for(let i=0;expected.length<5&&i<9;i++){cursor.setUTCDate(cursor.getUTCDate()-1);if(![0,6].includes(cursor.getUTCDay()))expected.push(cursor.toISOString().slice(0,10));}
 const noEstimates=expected.every(day=>weekdays.some(r=>r.day===day&&r.status==="no-estimates")) || weekdays.length>=5 && weekdays.slice(0,5).every(r=>r.status==="no-estimates") && weekdays.slice(0,5).map(r=>r.day).join() === [dayOf(now),...expected.slice(0,4)].join();
 const newest=weekdays[0];
 return {state:noEstimates?"attention":!newest||Date.parse(dayOf(now))-Date.parse(newest.day)>4*DAY?"stale":newest.status==="error"?"error":"observing",reason:noEstimates?"Five consecutive weekday samples contained no live estimates. Investigate the corridor and provider; this does not prove an outage.":!newest?"No weekday canary has run yet.":"Samples are a diagnostic, not a guarantee of live coverage on your journey."};
}
/** Private, owner-scoped Site. Never enable this writer on a public/shared deployment without adding server-side writer authorization. */
export function createMaintenanceHandler(fetcher:typeof fetch=fetch,clock=()=>new Date(),quota:QuotaGate=claimApiCall) {
 return async(request:Request,env:OjpEnvironment):Promise<Response>=>{
  const url=new URL(request.url),path=url.pathname,now=clock(),checkedAt=now.toISOString(),day=dayOf(now),db=env.DB;
  if(!db)return json({error:"Maintenance storage is unavailable."},503);
  try {
   await initialize(db);
   if(path==="/api/maintenance/status"&&request.method==="GET") {
    const latest=await read<{sources:SourceCheck[];checkedAt:string}>(db,"latest"),history=await read<CanaryResult[]>(db,"canary-history")??[];
    return json({checkedAt:latest?.checkedAt??null,sourceChecks:latest?.sources??[],canary:canaryAlert(history,now),history,tariffs:tariffHealth(now),sourceCheckStale:!latest||+now-Date.parse(latest.checkedAt)>4*DAY,policy:"Changed documents are candidates for review. Published prices and validity dates are never extended automatically."});
   }
   if(path==="/api/maintenance/fixture"&&request.method==="GET") {
    const fixture=await read<{xml:string;checkedAt:string}>(db,"fixture");
    return fixture?new Response(fixture.xml,{headers:{"Content-Type":"application/xml","Content-Disposition":"attachment; filename=ojp-live-estimates.xml","Cache-Control":"no-store"}}):json({error:"No raw live-estimate fixture has been captured yet."},404);
   }
   const sourceId=path.match(/^\/api\/maintenance\/sources\/([a-z-]+)$/)?.[1];
   if(sourceId&&request.method==="GET"&&PRICE_SOURCES.some(s=>s.id===sourceId)) {
    const candidate=await read<{base64:string;contentType:string}>(db,"candidate:"+sourceId);
    return candidate?new Response(Uint8Array.from(atob(candidate.base64),c=>c.charCodeAt(0)),{headers:{"Content-Type":candidate.contentType,"Content-Disposition":`attachment; filename=${sourceId}.${candidate.contentType.includes("pdf")?"pdf":"html"}`,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}):json({error:"Candidate unavailable; use the source URL in the status record."},404);
   }
   if(path!=="/api/maintenance/check")return json({error:"Not found"},404);
   if(request.method!=="POST")return json({error:"Use POST"},405);
   if(request.headers.get("X-Maintenance-Intent")!=="review" || request.headers.has("Origin")&&request.headers.get("Origin")!==url.origin)return json({error:"Explicit same-site maintenance request required."},403);
   // A persistent daily lease bounds cost across all Worker instances and retries.
   const lease=await db.batch<RecordRow>([db.prepare("INSERT INTO maintenance_records(key,payload,checked) VALUES(?1,'{}',?2) ON CONFLICT(key) DO NOTHING RETURNING key").bind("lease:"+day,checkedAt)]);
   if(!lease[0]?.success)throw new Error("Lease unavailable");
   if(!lease[0].results.length)return json({status:"already-claimed",day,message:"Read /api/maintenance/status for completion; an interrupted run is reported as stale."});
   const oldHistory=await read<CanaryResult[]>(db,"canary-history")??[],writes:ReturnType<QuotaDatabase["prepare"]>[]=[];
   const canary:CanaryResult={day,checkedAt,status:"error",services:0,estimatedTimes:0,parsedEstimates:0,fixtureSaved:false};
   const key=env.OJP_API_KEY?.trim().replace(/^Bearer\s+/i,"").trim();
   try {
    if(!key)throw new Error("Provider not configured");
    const signal=AbortSignal.timeout(20000);await quota(env,key,signal);
    const xmlRequest=ojpTripRequest({from:{id:"8503000",name:"Zürich HB",lat:47.378,lon:8.540},to:{id:"8507000",name:"Bern",lat:46.949,lon:7.439},departure:checkedAt},false,checkedAt);
    const response=await fetcher("https://api.opentransportdata.swiss/ojp20",{method:"POST",redirect:"manual",signal,headers:{Authorization:"Bearer "+key,"Content-Type":"application/xml",Accept:"application/xml"},body:xmlRequest});
    const raw=new TextDecoder().decode(await bounded(response,2000000,signal)).split(key).join("[REDACTED]");
    const legs=parseOjpConnections(raw,false);canary.services=legs.length;
    canary.estimatedTimes=(raw.match(/<(?:[\w-]+:)?EstimatedTime(?:\s[^>]*)?>/g)??[]).length;
    canary.parsedEstimates=legs.filter(l=>l.realtime?.estimatedDeparture||l.realtime?.estimatedArrival).length;
    if(!legs.length)throw new Error("No parsed services");
    canary.status=canary.estimatedTimes>0?"estimates-observed":"no-estimates";
    if(canary.estimatedTimes>0&&raw.length<=600000){writes.push(write(db,"fixture",{xml:raw,checkedAt},checkedAt));canary.fixtureSaved=true;}
   }catch {canary.reason="Canary request or parsing failed. Check provider configuration, quota and service availability; no secret or upstream diagnostic is retained.";}
   const previous=await read<{sources:SourceCheck[]}>(db,"latest");
   const sources=await Promise.all(PRICE_SOURCES.map(async source=>{
    const prior=previous?.sources.find(s=>s.id===source.id);
    if(prior?.status!=="error"&&prior?.sha256&&+now-Date.parse(prior.checkedAt)<7*DAY)return prior;
    const result:SourceCheck={id:source.id,url:source.url,checkedAt,status:"error",previousHash:prior?.sha256??prior?.previousHash};
    try {
     const signal=AbortSignal.timeout(20000), response=await sourceResponse(fetcher,source.url,signal,source.format==="pdf"?"application/pdf":"text/html");
     const bytes=await bounded(response,2500000,signal),type=response.headers.get("content-type")??"";
     if(source.format==="pdf" ? new TextDecoder().decode(bytes.subarray(0,5))!=="%PDF-" : !type.includes("html"))throw new Error("Unexpected document type");
     result.sha256=await hash(bytes);result.bytes=bytes.length;result.contentType=source.format==="pdf"?"application/pdf":"text/html";
     result.status=!result.previousHash?"baseline":result.sha256===result.previousHash?"unchanged":"changed";
     result.candidateSaved=bytes.length<=750000;
     if(!result.candidateSaved)writes.push(db.prepare("DELETE FROM maintenance_records WHERE key=?1").bind("candidate:"+source.id));
     if(result.candidateSaved)writes.push(write(db,"candidate:"+source.id,{base64:base64(bytes),contentType:result.contentType,sha256:result.sha256,checkedAt},checkedAt));
    }catch {result.reason="Source could not be downloaded or validated. Keep existing expiry; review the publisher URL manually.";}
    return result;
   }));
   const history=[...oldHistory.filter(r=>r.day!==day),canary].sort((a,b)=>b.day.localeCompare(a.day)).slice(0,30);
   writes.push(write(db,"latest",{checkedAt,sources},checkedAt),write(db,"canary-history",history,checkedAt),db.prepare("DELETE FROM maintenance_records WHERE key LIKE 'lease:%' AND checked<?1").bind(new Date(+now-40*DAY).toISOString()));
   const stored=await db.batch(writes);if(stored.some(r=>!r.success))throw new Error("Write failed");
   return json({status:"completed",checkedAt,canary,sources,alert:canaryAlert(history,now),tariffs:tariffHealth(now)});
  }catch {return json({error:"Maintenance could not complete or persist its results. Existing tariff validity is unchanged."},503);}
 };
}
export const handleMaintenance=createMaintenanceHandler();
