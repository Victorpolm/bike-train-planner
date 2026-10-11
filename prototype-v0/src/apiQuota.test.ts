import assert from "node:assert/strict";
import { it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { reserveApiCall, coolDownApi, claimApiCall, QuotaError, type QuotaDatabase } from "../server/apiQuota.ts";
import { createOjpHandler } from "../server/ojpHandler.ts";
import { createFareHandler } from "../server/fareHandler.ts";
import { fareTrips } from "../server/fareProtocol.ts";

function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("../drizzle/0000_shared_api_quota.sql", import.meta.url), "utf8"));
  type Stmt = { sql: string; values: (string | number)[]; bind(...values: (string | number)[]): Stmt };
  const DB = {
    prepare(source: string): Stmt { return { sql: source, values: [], bind(...values) { this.values = values; return this; } }; },
    async batch(statements: Stmt[]) {
      sql.exec("BEGIN IMMEDIATE");
      try {
        const result = statements.map(s => ({ success: true, results: sql.prepare(s.sql).all(...s.values) }));
        sql.exec("COMMIT"); return result;
      } catch (error) { sql.exec("ROLLBACK"); throw error; }
    },
  } as unknown as QuotaDatabase;
  return { DB, sql };
}
it("atomically admits one of many independent callers, counts once and stores no key or itinerary", async () => {
  const { DB, sql } = database(), now = Date.now();
  const outcomes = await Promise.all(Array.from({ length: 30 }, () => reserveApiCall({ DB }, "secret-fixture", now)));
  assert.equal(outcomes.filter(n => n === 0).length, 1);
  assert.ok(outcomes.filter(n => n !== 0).every(n => n === 1500));
  assert.equal(sql.prepare("SELECT SUM(used) AS n FROM api_quota_hours").get()!.n, 1);
  const row = sql.prepare("SELECT * FROM api_quota_clock").get()!;
  assert.match(String(row.key_hash), /^[a-f0-9]{64}$/); assert.ok(!JSON.stringify(row).includes("secret-fixture"));
  assert.equal(await reserveApiCall({ DB }, "secret-fixture", now + 1500), 0);
  assert.equal(await reserveApiCall({ DB }, "other-key", now), 0);
  sql.close();
});
it("bounds rolling minute and day budgets across reset boundaries and retains previous-hour usage", async () => {
  const { DB, sql } = database(), hour = 3_600_000, now = Math.floor(Date.now() / hour) * hour + hour - 500;
  assert.equal(await reserveApiCall({ DB }, "quota-key", now), 0);
  assert.ok(await reserveApiCall({ DB }, "quota-key", now + 501) > 0);
  sql.exec("UPDATE api_quota_hours SET used=20000");
  await assert.rejects(reserveApiCall({ DB }, "quota-key", now + 2000), (e: any) => e instanceof QuotaError && e.status === 429 && e.retryAfter > 23 * 3600);
  assert.equal(sql.prepare("SELECT SUM(used) AS n FROM api_quota_hours").get()!.n, 20000);
  assert.equal(await reserveApiCall({ DB }, "quota-key", now + 25 * hour), 0);
  assert.equal(sql.prepare("SELECT SUM(used) AS n FROM api_quota_hours").get()!.n, 1);
  let admitted = 0;
  for (let i = 0; i < 60; i++) if (!await reserveApiCall({ DB }, "minute-key", now + i * 1000)) admitted++;
  assert.ok(admitted <= 40); sql.close();
});
it("shares provider cooldown, fails closed on missing/broken storage and aborts waiting callers", async () => {
  const { DB, sql } = database(); await reserveApiCall({ DB }, "key"); await coolDownApi({ DB }, "key");
  assert.ok(await reserveApiCall({ DB }, "key") > 59_000);
  await assert.rejects(claimApiCall({ DB }, "key", new AbortController().signal), (e: any) => e.status === 429);
  await assert.rejects(reserveApiCall({}, "key"), (e: any) => e.status === 503);
  const broken = { prepare: DB.prepare, batch: async () => { throw new Error("DB offline"); } } as QuotaDatabase;
  await assert.rejects(reserveApiCall({ DB: broken }, "key"), (e: any) => e.status === 503 && !e.message.includes("DB offline"));
  await reserveApiCall({ DB }, "cancel"); const controller = new AbortController();
  const pending = claimApiCall({ DB }, "cancel", controller.signal); controller.abort();
  await assert.rejects(pending, { name: "AbortError" }); sql.close();
});
it("requires the shared gate on production OJP and fare handlers before any upstream request", async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; return new Response(""); };
  const ref = { journeyRef: "fixture", operatingDay: "2026-10-12", fromRef: "8503000", toRef: "8507000", departure: "2026-10-12T08:00:00Z", arrival: "2026-10-12T09:00:00Z" };
  const request = (path: string, body: unknown) => new Request("https://app.test" + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await createOjpHandler(fetcher, 0)(request("/api/ojp/tripinfo", ref), { OJP_API_KEY: "key" })).status, 503);
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const xml = readFileSync(new URL("./fixtures/fares-2026-09-27/01-trip.xml", import.meta.url), "utf8").replaceAll("2026-09-29", day);
  const query = { segments: fareTrips(xml)[0].segments, passenger: "full", bicycle: true };
  const response = await createFareHandler(fetcher, 0)(request("/api/fares/quote", query), { OJP_FARE_API_KEY: "key" });
  assert.equal(response.status, 503); assert.ok(response.headers.has("Retry-After")); assert.equal(calls, 0);
});
it("meters both OJP requests, fare fallback and traveller quotes through the same shared key", async () => {
  const { DB, sql } = database(); let clock=Date.now(),calls=0;
  const day=new Date(clock+2*86400000).toISOString().slice(0,10);
  const fixture=(name: string)=>readFileSync(new URL(`./fixtures/fares-2026-09-27/01-${name}.xml`,import.meta.url),"utf8").replaceAll("2026-09-29",day).replaceAll("fareprobe","farequote");
  const xml=fixture("trip");
  const gate=async (env: {DB?:QuotaDatabase},key:string,signal:AbortSignal)=>{signal.throwIfAborted();assert.equal(await reserveApiCall(env,key,clock),0);clock+=1500;};
  const fetcher:typeof fetch=async (_url,init)=>{calls++;return new Response(String(init?.body).includes("<OJPFareRequest>")?fixture(String(init?.body).includes("<PassengerCategory>Bicycle")?"bicycle":"full"):xml);};
  const env={DB,OJP_API_KEY:"shared-key",OJP_FARE_API_KEY:"shared-key"};
  const request=(path:string,body:unknown)=>new Request("https://app.test"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const body={from:{id:"8509000",name:"Chur",lat:46.85,lon:9.53},to:{id:"8505000",name:"Luzern",lat:47.05,lon:8.31},departure:day+"T08:00:00Z"};
  const ojp=createOjpHandler(fetcher,0,undefined,gate),fares=createFareHandler(fetcher,0,undefined,gate);
  assert.equal((await ojp(request("/api/ojp/connections",body),env)).status,200);
  const fareBody={segments:fareTrips(xml)[0].segments,passenger:"full",bicycle:true};
  assert.equal((await fares(request("/api/fares/quote",fareBody),env)).status,200);
  assert.equal(calls,5);assert.equal(sql.prepare("SELECT SUM(used) AS n FROM api_quota_hours").get()!.n,5);
  await ojp(request("/api/ojp/connections",body),env);await fares(request("/api/fares/quote",fareBody),env);
  assert.equal(calls,5);assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM api_quota_clock").get()!.n,1);sql.close();
});
