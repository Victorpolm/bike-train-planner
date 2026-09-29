import assert from "node:assert/strict";
import { it } from "node:test";
import { loadParkingSource, ParkingLoadError } from "./parkingClient.ts";

const data = { provider: "osm", facilities: [], fetchedAt: "2026-09-29T12:00:00Z", source: "https://www.openstreetmap.org/copyright", coverage: "Test" };
const signal = () => new AbortController().signal;

it("uses separate versioned paths, bypasses browser cache and retains same-origin authentication", async () => {
  const result = await loadParkingSource("osm", signal(), async (url, init) => {
    assert.equal(url, "/api/parking/v3/osm"); assert.equal(init?.cache, "no-store"); assert.equal(init?.credentials, "same-origin");
    assert.equal(new Headers(init?.headers).get("Accept"), "application/json"); return Response.json(data);
  });
  assert.equal(result.provider, "osm");
});

it("distinguishes expired sign-in and denied access from a failed parking provider, without retrying authentication", async () => {
  for (const [response, code] of [[new Response("sign in", { status: 401 }), "session"],
    [new Response("<html>Sign in</html>", { headers: { "Content-Type": "text/html" } }), "session"],
    [new Response("denied", { status: 403 }), "access"]] as const) {
    let calls = 0;
    await assert.rejects(loadParkingSource("osm", signal(), async () => { calls++; return response; }, { retryDelayMs: 0 }),
      error => error instanceof ParkingLoadError && error.code === code);
    assert.equal(calls, 1);
  }
});

it("recovers once from a wrong-source response or temporary connection failure", async () => {
  for (const wrong of [true, false]) {
    let calls = 0;
    const result = await loadParkingSource("osm", signal(), async () => {
      calls++;
      if (calls === 1) { if (wrong) return Response.json({ ...data, provider: "official" }); throw new TypeError("Network unavailable"); }
      return Response.json(data);
    }, { retryDelayMs: 0 });
    assert.equal(result.provider, "osm"); assert.equal(calls, 2);
  }
});

it("reports mismatched and incomplete JSON responses instead of claiming the upstream source is unavailable", async () => {
  let calls = 0;
  await assert.rejects(loadParkingSource("osm", signal(), async () => {
    calls++; return new Response('{"facilities":', { headers: { "Content-Type": "application/json" } });
  }, { retryDelayMs: 0 }), error => error instanceof ParkingLoadError && error.code === "response");
  assert.equal(calls, 2);
});

it("preserves HTTP status and Retry-After without immediate repeated provider requests", async () => {
  let calls = 0;
  await assert.rejects(loadParkingSource("osm", signal(), async () => {
    calls++; return Response.json({ error: "busy" }, { status: 503, headers: { "Retry-After": "60" } });
  }, { retryDelayMs: 0 }), error => error instanceof ParkingLoadError && error.status === 503 && error.retryAfterMs === 60000 && /60 seconds/.test(error.message));
  assert.equal(calls, 1);
});

it("keeps the deadline active while reading JSON and preserves user cancellation", async () => {
  const slow = async (_url: RequestInfo | URL, init?: RequestInit) => new Response(new ReadableStream({ start(controller) {
    init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
  } }), { headers: { "Content-Type": "application/json" } });
  await assert.rejects(loadParkingSource("osm", signal(), slow, { timeoutMs: 5, retryDelayMs: 0 }),
    error => error instanceof ParkingLoadError && error.code === "timeout");
  const cancelled = new AbortController(); cancelled.abort(); let calls = 0;
  await assert.rejects(loadParkingSource("osm", cancelled.signal, async () => { calls++; return Response.json(data); }), { name: "AbortError" });
  assert.equal(calls, 0);
});
