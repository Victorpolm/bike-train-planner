import assert from "node:assert/strict";
import { it } from "node:test";
import { geocode, localSuggestions, mapPlace, nameMapPlace, suggestPlaces } from "./places.ts";
import { preferenceOptions } from "./preferences.ts";
import { validateOptions } from "./model.ts";
const response = (value: unknown) => new Response(JSON.stringify(value));

it("suggests real hubs immediately with accent-insensitive partial typing", async () => {
  assert.ok(localSuggestions("Zur").some(p => p.label === "Zürich HB" && p.stopId === "8503000"));
  const p = await geocode("Zürich HB", new AbortController().signal, async () => { throw new Error("An exact known stop needs no HTTP"); });
  assert.equal(p.stopId, "8503000");
  assert.equal(localSuggestions("x").length, 0);
});
it("publishes actual address matches independently of a slow stop lookup and ignores replies after cancellation", async () => {
  const abort = new AbortController(), updates: string[][] = [];
  let release!: (value: Response) => void;
  const slow = new Promise<Response>(resolve => { release = resolve; });
  const task = suggestPlaces("Teststrasse 12", abort.signal, places => updates.push(places.map(p => p.label)), async input => {
    if (String(input).includes("transport.opendata")) return slow;
    return response({ results: [{ attrs: { label: "<b>Teststrasse 12</b> Zürich", lat: 47.3, lon: 8.5 } },
      { attrs: { label: "Invalid", lat: null, lon: null } }] });
  });
  const rejected = assert.rejects(task, { name: "AbortError" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(updates.at(-1), ["Teststrasse 12 Zürich"]);
  const count = updates.length;
  abort.abort(); release(response({ stations: [{ id: "stale", name: "Old query", coordinate: { x: 47, y: 8 } }] }));
  await rejected; assert.equal(updates.length, count);
});
it("offers usable local suggestions when both remote services fail without inventing an address", async () => {
  let labels: string[] = [];
  const result = await suggestPlaces("Bern", new AbortController().signal, places => { labels = places.map(p => p.label); },
    async () => { throw new TypeError("offline"); });
  assert.ok(result.unavailable); assert.ok(labels.includes("Bern"));
});
it("searching typed text accepts the first valid location and cancels the slower provider", async () => {
  let cancelled = false;
  const place = await geocode("Example Street 12", new AbortController().signal, async (input, init) => {
    if (String(input).includes("geo.admin")) return response({ results: [{ attrs: { label: "Example Street 12", lat: 47.3, lon: 8.5 } }] });
    return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => { cancelled = true; reject(init!.signal!.reason); }));
  });
  assert.equal(place.label, "Example Street 12"); assert.equal(cancelled, true);
});
it("all cycling preference choices produce valid constraints with ordered budgets", () => {
  for (const profile of ["less", "balanced", "more", "unrestricted"] as const) {
    for (const endpoint of ["none", "start", "end"] as const) validateOptions(preferenceOptions(profile, endpoint));
  }
  assert.ok(preferenceOptions("less", "none").maxBikeMinutes < preferenceOptions("balanced", "none").maxBikeMinutes);
  assert.ok(preferenceOptions("more", "none").maxBikeMinutes > preferenceOptions("balanced", "none").maxBikeMinutes);
  const unrestricted = preferenceOptions("unrestricted", "none");
  assert.ok(unrestricted.maxBikeMinutes > preferenceOptions("more", "none").maxBikeMinutes);
  for (const key of ["maxBikeMinutes", "maxAccessMinutes", "maxEgressMinutes", "maxIntermediateMinutes"] as const) {
    assert.equal(unrestricted[key], unrestricted.horizonMinutes);
    assert.throws(() => validateOptions({ ...unrestricted, [key]: Infinity }));
  }
});

it("names a map point without snapping its coordinates or inventing a station identity", async () => {
  const point = { lat: 47.123456, lon: 8.123456 };
  const place = await nameMapPlace(point, new AbortController().signal, async input => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("geometry"), `${point.lon},${point.lat}`);
    assert.equal(url.searchParams.get("sr"), "4326");
    return response({ results: [{ attributes: { label: "<b>Teststrasse 12</b>", com_name: "Example" }, geometry: { x: point.lon + .00001, y: point.lat } }] });
  });
  assert.match(place.label, /Teststrasse 12.*Example/);
  assert.deepEqual([place.lat, place.lon, place.stopId], [point.lat, point.lon, undefined]);
});

it("keeps clicked coordinates usable when naming fails, but respects cancellation", async () => {
  const point = { lat: 47, lon: 8 };
  const fallback = await nameMapPlace(point, new AbortController().signal, async () => { throw new TypeError("offline"); });
  assert.deepEqual(fallback, mapPlace(point));
  assert.match(fallback.label, /47\.00000, 8\.00000/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(nameMapPlace(point, controller.signal, async () => response({ results: [] })), { name: "AbortError" });
  assert.throws(() => mapPlace({ lat: NaN, lon: 8 }));
});
