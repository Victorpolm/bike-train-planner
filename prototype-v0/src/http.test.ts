import assert from "node:assert/strict";
import { it } from "node:test";
import { fetchJson } from "./http.ts";

it("posts fare requests and reads the response without newer AbortSignal APIs", async () => {
  const any = AbortSignal.any, timeout = AbortSignal.timeout;
  try {
    Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
    Object.defineProperty(AbortSignal, "timeout", { value: undefined, configurable: true });
    const body = JSON.stringify({ passenger: "full", bicycle: true, segments: [] });
    const response = await fetchJson("/api/fares/quote", undefined, 60000, async (url, init) => {
      assert.equal(url, "/api/fares/quote"); assert.equal(init?.method, "POST");
      assert.equal(init?.body, body); assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
      assert.equal(init?.signal?.aborted, false);
      return Response.json({ status: "quoted", passenger: { chf: 36.2 } });
    }, { method: "POST", body, headers: { "Content-Type": "application/json" } });
    assert.deepEqual(response, { status: "quoted", passenger: { chf: 36.2 } });
  } finally {
    Object.defineProperty(AbortSignal, "any", { value: any, configurable: true });
    Object.defineProperty(AbortSignal, "timeout", { value: timeout, configurable: true });
  }
});

it("keeps a POST deadline active until its response body finishes", async () => {
  await assert.rejects(fetchJson("/api/fares/quote", undefined, 10, async (_url, init) => {
    return new Response(new ReadableStream({ start(controller) {
      init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason), { once: true });
    } }));
  }, { method: "POST", body: "{}" }), { name: "TimeoutError" });
});
