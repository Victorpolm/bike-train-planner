import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as nextTurn } from "node:timers/promises";
import { it } from "node:test";
import { createOjpHandler } from "../server/ojpHandler.ts";
import { OjpClient } from "./ojpClient.ts";
import { parseOjpConnections } from "./ojp.ts";

const xml = readFileSync(new URL("./fixtures/ojp-2026-09-24/rail-off.xml", import.meta.url), "utf8");
const firstLeg = parseOjpConnections(xml, false).find(l => l.reference)!;
const body = { from: firstLeg.from, to: firstLeg.to, departure: firstLeg.departure };
const env = { OJP_API_KEY: "fixture-only" };
const request = (i = 0, signal?: AbortSignal) => new Request("https://app.example/api/ojp/connections", {
  method: "POST", headers: { "Content-Type": "application/json" }, signal,
  body: JSON.stringify({ ...body, departure: new Date(Date.parse(body.departure) + i * 60_000).toISOString() }) });
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
function heldProvider() {
  const hold = gate(), entered = gate();
  let calls = 0, active = 0, peak = 0, cancellations = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    calls++; active++; peak = Math.max(peak, active); entered.release();
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { cancellations++; reject(init!.signal!.reason); };
        init!.signal!.addEventListener("abort", abort, { once: true });
        if (init!.signal!.aborted) abort();
        void hold.promise.then(resolve).finally(() => init!.signal!.removeEventListener("abort", abort));
      });
      return new Response(xml);
    } finally { active--; }
  };
  return { fetcher, release: hold.release, entered: entered.promise, stats: () => ({ calls, active, peak, cancellations }) };
}

for (const count of [1, 4, 8, 16, 32, 64]) it(`bounds a burst of ${count} distinct OJP searches and serializes every provider call`, async () => {
  const p = heldProvider(), handler = createOjpHandler(p.fetcher, 0);
  const pending = Array.from({ length: count }, (_, i) => handler(request(i), env));
  await p.entered; await nextTurn();
  for (const response of await Promise.all(pending.slice(4))) {
    assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "5");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  p.release();
  const replies = await Promise.all(pending.slice(0, 4));
  assert.ok(replies.every(r => r.status === 200));
  assert.equal(p.stats().calls, 2 * Math.min(count, 4)); assert.equal(p.stats().peak, 1);
  assert.equal((await handler(request(count), env)).status, 200, "slots are released after completion");
});

it("coalesces 32 identical checks into one paired provider request", async () => {
  const p = heldProvider(), handler = createOjpHandler(p.fetcher, 0);
  const pending = Array.from({ length: 32 }, () => handler(request(), env));
  await p.entered; await nextTurn(); p.release();
  const responses = await Promise.all(pending);
  assert.ok(responses.every(r => r.status === 200)); assert.equal(p.stats().calls, 2);
  assert.deepEqual(await responses[0].json(), await responses[31].json());
  assert.equal((await handler(request(), env)).status, 200); assert.equal(p.stats().calls, 2);
});

it("keeps a shared request alive when its initiating visitor cancels", async () => {
  const p = heldProvider(), handler = createOjpHandler(p.fetcher, 0), controller = new AbortController();
  const first = handler(request(0, controller.signal), env); await p.entered;
  const duplicate = handler(request(), env); await nextTurn(); controller.abort();
  assert.equal((await first).status, 499); assert.equal(p.stats().cancellations, 0);
  p.release(); assert.equal((await duplicate).status, 200); assert.equal(p.stats().calls, 2);
});

it("aborts work after every subscriber leaves and permits a fresh retry", async () => {
  const p = heldProvider(), handler = createOjpHandler(p.fetcher, 0), a = new AbortController(), b = new AbortController();
  const first = handler(request(0, a.signal), env); await p.entered;
  const second = handler(request(0, b.signal), env); await nextTurn();
  a.abort(); b.abort();
  assert.equal((await first).status, 499); assert.equal((await second).status, 499);
  await nextTurn(); assert.equal(p.stats().cancellations, 1);
  p.release(); assert.equal((await handler(request(), env)).status, 200); assert.equal(p.stats().calls, 3);
});

it("cancels a queued search without sending it upstream", async () => {
  const p = heldProvider(), handler = createOjpHandler(p.fetcher, 0), controller = new AbortController();
  const active = handler(request(), env); await p.entered;
  const queued = handler(request(1, controller.signal), env); await nextTurn(); controller.abort(new Error("Visitor stopped"));
  assert.equal((await queued).status, 499); p.release();
  assert.equal((await active).status, 200); assert.equal(p.stats().calls, 2);
});

it("returns explicit deadline errors for both running and queued searches, then recovers", async () => {
  const p = heldProvider(), handler = createOjpHandler(p.fetcher, 0, 500);
  const active = handler(request(), env); await p.entered;
  const queued = handler(request(1), env);
  assert.equal((await active).status, 504); assert.equal((await queued).status, 504);
  p.release(); assert.equal((await handler(request(2), env)).status, 200);
});

it("bounds a stalled response body and releases the provider queue after cancellation", async () => {
  const controller = new AbortController(), entered = gate(); let calls = 0, cancelled = false;
  const handler = createOjpHandler(async () => {
    if (++calls > 1) return new Response(xml);
    entered.release();
    return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("<OJP>")); }, cancel() { cancelled = true; } }));
  }, 0);
  const pending = handler(request(0, controller.signal), env); await entered.promise; await nextTurn();
  controller.abort(); assert.equal((await pending).status, 499);
  await nextTurn(); assert.equal(cancelled, true);
  assert.equal((await handler(request(1), env)).status, 200);
});

it("retains pacing between successful calls even with several concurrent searches", async () => {
  const starts: number[] = [];
  const handler = createOjpHandler(async () => { starts.push(Date.now()); return new Response(xml); }, 20);
  const replies = await Promise.all([0, 1, 2].map(i => handler(request(i), env)));
  assert.ok(replies.every(r => r.status === 200)); assert.equal(starts.length, 6);
  assert.ok(starts.slice(1).every((time, i) => time - starts[i] >= 18));
});

it("invalidates cached and in-flight work when the runtime credential changes", async () => {
  const p = heldProvider(), handler = createOjpHandler(p.fetcher, 0);
  const old = handler(request(), env); await p.entered;
  const replacement = handler(request(), { OJP_API_KEY: "new-fixture-only" }); await nextTurn(); p.release();
  assert.equal((await old).status, 499); assert.equal((await replacement).status, 200);
  assert.equal(p.stats().calls, 3); assert.equal(p.stats().cancellations, 1);
  assert.equal((await handler(request(), { OJP_API_KEY: "new-fixture-only" })).status, 200); assert.equal(p.stats().calls, 3);
});

it("shares the bounded capacity between connection and selected-service checks", async () => {
  const p = heldProvider(), handler = createOjpHandler(p.fetcher, 0);
  const searches = [0, 1, 2, 3].map(i => handler(request(i), env)); await p.entered; await nextTurn();
  const details = await handler(new Request("https://app.example/api/ojp/tripinfo", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(firstLeg.reference) }), env);
  assert.equal(details.status, 429); p.release(); await Promise.all(searches);
});

it("serves a fresh cache hit even when all distinct-request slots are occupied", async () => {
  const held = gate(), entered = gate(); let hold = false, calls = 0;
  const handler = createOjpHandler(async () => { calls++; if (hold) { entered.release(); await held.promise; } return new Response(xml); }, 0);
  assert.equal((await handler(request(), env)).status, 200); assert.equal(calls, 2); hold = true;
  const busy = [1, 2, 3, 4].map(i => handler(request(i), env)); await entered.promise; await nextTurn();
  assert.equal((await handler(request(), env)).status, 200); assert.equal(calls, 3);
  assert.equal((await handler(request(5), env)).status, 429);
  held.release(); await Promise.all(busy); assert.equal(calls, 10);
});

it("cancels an unfinished request body before admitting provider work", async () => {
  const controller = new AbortController(); let cancelled = false, calls = 0;
  const handler = createOjpHandler(async () => { calls++; return new Response(xml); }, 0);
  const bodyStream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"from":')); }, cancel() { cancelled = true; } });
  const pending = handler(new Request("https://app.example/api/ojp/connections", { method: "POST", headers: { "Content-Type": "application/json" },
    body: bodyStream, signal: controller.signal, duplex: "half" } as RequestInit), env);
  await nextTurn(); controller.abort();
  assert.equal((await pending).status, 499); assert.equal(calls, 0); assert.equal(cancelled, true);
});

it("rejects an old request body that finishes after credential rotation", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>, calls = 0;
  const handler = createOjpHandler(async () => { calls++; return new Response(xml); }, 0);
  const pending = handler(new Request("https://app.example/api/ojp/connections", { method: "POST", headers: { "Content-Type": "application/json" },
    body: new ReadableStream({ start(c) { stream = c; } }), duplex: "half" } as RequestInit), env);
  await nextTurn();
  assert.equal((await handler(request(1), { OJP_API_KEY: "rotated-fixture" })).status, 200);
  stream.enqueue(new TextEncoder().encode(JSON.stringify(body))); stream.close();
  assert.equal((await pending).status, 503); assert.equal(calls, 2);
});

for (const status of [429, 504]) it(`shows an actionable client warning for HTTP ${status} while retaining unknown permissions`, async () => {
  const signal = new AbortController().signal;
  const client = new OjpClient(signal, async () => Response.json({ error: "Private diagnostic must not be shown" }, { status, headers: { "Retry-After": "7" } }));
  assert.equal(await client.connections(body.from, body.to, new Date(body.departure), () => true), null);
  const warnings = [...client.warnings].join(" ");
  assert.match(warnings, status === 429 ? /busy.*7 seconds/ : /timed out/);
  assert.match(warnings, /unknown bicycle permission/); assert.doesNotMatch(warnings, /Private diagnostic/);
});
