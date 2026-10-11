import assert from "node:assert/strict";
import { it } from "node:test";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createTransferFeedLoader, decodeTransferData } from "../server/transferFeeds.ts";
import { handleStationTransfers } from "../server/stationTransferHandler.ts";
import { transferEndpointKey } from "./staticTransfers.ts";

const feed = { version: "20261007", validFrom: "2026-12-13", validThrough: "2027-12-11", zipSha256: "1".repeat(64),
  generalRules: 1, excludedScopedRows: 3, source: "https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/" };
const data = { feed, stops: [["p1","p1","8503000",-1,"1",""],["p2","p2","8503000",-1,"2",""]], rules: [[0,1,180]] };
const packed = (value = data) => ({ feed:value.feed, gzip:gzipSync(JSON.stringify(value)).toString("base64") });
function fixture() {
  const raw = JSON.stringify(packed()) + "\n", entry = { file:"2027-20261007.json", edition:feed.version, validFrom:feed.validFrom,
    validThrough:feed.validThrough, bytes:Buffer.byteLength(raw), sha256:createHash("sha256").update(raw).digest("hex") };
  return { raw, entry, manifest:{ version:1, feeds:[entry] } };
}
it("selects the correct timetable across12/13December and preserves legacy undated requests", async () => {
  const f=fixture(); let calls=0;
  const loader=createTransferFeedLoader(async input => { calls++; return String(input).endsWith("index.json") ? Response.json(f.manifest) : new Response(f.raw); });
  assert.equal((await loader("2026-12-12")).feed.version,"20260930");
  assert.equal((await loader("2026-12-13")).feed.version,"20261007");
  assert.equal((await loader("2027-03-01")).feed.version,"20261007");
  assert.equal((await loader()).feed.version,"20260930"); assert.equal(calls,2);
  assert.notEqual(transferEndpointKey({ref:"p1",serviceDate:"2026-12-12"}), transferEndpointKey({ref:"p1",serviceDate:"2026-12-13"}));
});
it("retains the bundled usable feed on outage/checksum failure and reports uncovered travel dates", async () => {
  const f=fixture();f.entry.sha256="0".repeat(64);
  for (const fetcher of [async () => new Response("",{status:503}), async (input: RequestInfo | URL) => String(input).endsWith("index.json") ? Response.json(f.manifest) : new Response(f.raw)]) {
    const loader=createTransferFeedLoader(fetcher);
    assert.equal((await loader("2026-10-11")).feed.version,"20260930");
    const request=new Request("https://app.test/api/station-transfers/v1",{method:"POST",body:JSON.stringify({endpoints:[{ref:"8503000",serviceDate:"2026-12-13"}]})});
    const result=await (await handleStationTransfers(request,loader)).json();
    assert.equal(result.endpoints[0].status,"unavailable");assert.match(result.endpoints[0].reason,/outside that period/);
  }
});
it("rejects malformed dates, corrupted stop/rule indexes, incorrect hashes and mismatched metadata", async () => {
  await assert.rejects(decodeTransferData(packed({...data,rules:[[0,8,30]]})));
  await assert.rejects(decodeTransferData(packed({...data,feed:{...feed,validFrom:"2026-02-30"}})));
  const mismatch=packed();mismatch.feed={...feed,version:"different"};await assert.rejects(decodeTransferData(mismatch));
  const bad=new Request("https://app.test/api/station-transfers/v1",{method:"POST",body:JSON.stringify({endpoints:[{ref:"8503000",serviceDate:"2026-02-30"}]})});
  assert.equal((await handleStationTransfers(bad)).status,400);
});
it("coalesces manifest/edition loads and keeps a valid bundled lookup off the network wait", async () => {
  const f=fixture();let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>release=resolve);
  const loader=createTransferFeedLoader(async input=>{calls++;await gate;return String(input).endsWith("index.json")?Response.json(f.manifest):new Response(f.raw);});
  const background:Promise<unknown>[]=[];assert.equal((await loader("2026-10-11",work=>background.push(work))).feed.version,"20260930");
  assert.equal(calls,1);release();await Promise.all(background);
  const results=await Promise.all(Array.from({length:20},()=>loader("2026-12-13")));
  assert.ok(results.every(r=>r.feed.version===feed.version));assert.equal(calls,2);
});
