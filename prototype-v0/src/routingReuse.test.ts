import assert from "node:assert/strict";
import { it } from "node:test";
import { RoutingReuse } from "./routingReuse.ts";

it("reuses identical inputs but detects nested mutations, dates and replacement identities", () => {
  const reuse = new RoutingReuse<string>();
  const state = { options: { maxBikeMinutes: 30 }, leg: { realtime: { departurePlatform: "1" }, permission: { value: "unknown" }, departure: new Date(0) }, path: [{ lat: 47, lon: 8 }] };
  const changes = [() => state.options.maxBikeMinutes++, () => state.leg.realtime.departurePlatform = "2",
    () => state.leg.permission.value = "prohibited", () => state.leg.departure.setTime(1), () => state.path[0].lat++,
    () => state.leg = { ...state.leg }];
  for (const change of changes) {
    reuse.set(reuse.key([state]), "found"); assert.equal(reuse.get(reuse.key([state])), "found"); change();
    assert.equal(reuse.get(reuse.key([state])), undefined);
  }
});
it("preserves map insertion order, aliases and individual null/failed road entries", () => {
  const reuse = new RoutingReuse<string>(), route = { minutes: 12 }, routes = new Map<string, { minutes: number } | null>([["a", route], ["b", route]]);
  const check = (mutate: () => void) => { reuse.set(reuse.key([routes]), "value"); mutate(); assert.equal(reuse.get(reuse.key([routes])), undefined); };
  check(() => routes.set("a", { ...route })); check(() => routes.set("a", null));
  check(() => { const a = routes.get("a")!; routes.delete("a"); routes.set("a", a); });
  check(() => { route.minutes = 13; });
});
it("distinguishes undefined, null, nonfinite numbers, sparse arrays and exact strings", () => {
  const reuse = new RoutingReuse<string>(), values: unknown[] = [undefined];
  const variants: unknown[] = [null, NaN, Infinity, -Infinity, -0, 0, "nNaN;", "u;", "", "object{r1;}"];
  const keys = new Set([reuse.key([values])]);
  for (const value of variants) { values[0] = value; const key = reuse.key([values]); assert.ok(!keys.has(key)); keys.add(key); }
  values[0] = undefined; const filled = reuse.key([values]); delete values[0]; const hole = reuse.key([values]); values.length = 0;
  assert.notEqual(filled, hole); assert.notEqual(hole, reuse.key([values]));
});
it("handles cyclic inputs, keeps only the last result and declines unsupported shapes", () => {
  const reuse = new RoutingReuse<number>(), state: Record<string, unknown> = {}; state.self = state;
  const key = reuse.key([state]); assert.equal(typeof key, "string"); reuse.set(key, 1); assert.equal(reuse.get(reuse.key([state])), 1);
  reuse.set(reuse.key(["next"]), 2); assert.equal(reuse.get(key), undefined);
  assert.equal(reuse.key([() => {}]), undefined); assert.equal(reuse.get(undefined), undefined);
  reuse.set(undefined, 3); assert.equal(reuse.get(reuse.key(["next"])), undefined);
  const hidden = Object.defineProperty({}, "delay", { value: 0, writable: true });
  const hiddenKey = reuse.key([hidden]); hidden.delay = 1; assert.notEqual(reuse.key([hidden]), hiddenKey);
  const accessor = Object.defineProperty({}, "delay", { get() { throw new Error("Do not invoke accessors while checking reuse"); } });
  assert.equal(reuse.key([accessor]), undefined);
});
