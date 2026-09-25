import assert from "node:assert/strict";
import { it } from "node:test";
import { readFileSync } from "node:fs";
import { geocode, localSuggestions, mapPlace, nameMapPlace, suggestPlaces } from "./places.ts";
import { photonPlaces } from "./poiPlaces.ts";
import { preferenceOptions } from "./preferences.ts";
import { validateOptions } from "./model.ts";
const response = (value: unknown) => new Response(JSON.stringify(value));
const fortyseven = JSON.parse(readFileSync(new URL("./fixtures/photon-fortyseven-baden.json", import.meta.url), "utf8"));

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
it("offers usable local suggestions when all remote services fail without inventing an address", async () => {
  let labels: string[] = [];
  const result = await suggestPlaces("Bern", new AbortController().signal, places => { labels = places.map(p => p.label); },
    async () => { throw new TypeError("offline"); });
  assert.ok(result.unavailable); assert.ok(labels.includes("Bern"));
});
it("searching typed text accepts the first whole-query match and cancels slower providers", async () => {
  let cancelled = false;
  const place = await geocode("Example Street 12", new AbortController().signal, async (input, init) => {
    if (String(input).includes("geo.admin")) return response({ results: [{ attrs: { label: "Example Street 12", lat: 47.3, lon: 8.5 } }] });
    return new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => { cancelled = true; reject(init!.signal!.reason); }));
  });
  assert.equal(place.label, "Example Street 12"); assert.equal(cancelled, true);
});

it("reads the real FORTYSEVEN venue and its address without assigning an OSM ID as a transit stop", () => {
  const [bath, parking] = photonPlaces(fortyseven);
  assert.equal(bath.label, "Fortyseven Baden");
  assert.deepEqual([bath.lat, bath.lon, bath.stopId], [47.4813202, 8.3128908, undefined]);
  assert.match(bath.detail!, /Bath \/ spa.*Grosse Bäder 1.*5400 Baden/);
  assert.match(parking.detail!, /Car park/);
  const feature = fortyseven.features[0];
  assert.deepEqual(photonPlaces({ features: [null, {}, { ...feature, geometry: { type: "Point", coordinates: [null, 47] } },
    { ...feature, properties: { ...feature.properties, countrycode: "DE" } },
    { ...feature, geometry: { type: "Point", coordinates: [8, 999] } }] }), []);
});

it("promotes a delayed named venue above a full list of early town and station matches", async () => {
  let release!: (value: Response) => void;
  const slow = new Promise<Response>(resolve => { release = resolve; });
  let places: ReturnType<typeof photonPlaces> = [];
  const task = suggestPlaces("fortyseven baden", new AbortController().signal, result => { places = result; }, async input => {
    const url = new URL(String(input));
    if (url.hostname === "photon.komoot.io") {
      assert.equal(url.searchParams.get("q"), "fortyseven baden");
      assert.equal(url.searchParams.get("bbox"), "5.95,45.81,10.5,47.81");
      return slow;
    }
    if (url.hostname === "transport.opendata.ch") return response({ stations: Array.from({ length: 8 }, (_, index) => ({
      id: "stop-" + index, name: "Baden stop " + index, coordinate: { x: 47.47, y: 8.29 },
    })) });
    return response({ results: [{ attrs: { label: "Baden", lat: 47.47, lon: 8.29 } }] });
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(places.length, 8);
  release(response(fortyseven));
  await task;
  assert.equal(places.length, 8); assert.equal(places[0].label, "Fortyseven Baden");
});

it("waits for the named destination instead of silently geocoding FORTYSEVEN Baden to Baden town", async () => {
  let release!: (value: Response) => void, settled = false;
  const slow = new Promise<Response>(resolve => { release = resolve; });
  const task = geocode("FORTYSEVEN baden", new AbortController().signal, async input => {
    if (String(input).includes("photon.komoot.io")) return slow;
    if (String(input).includes("transport.opendata")) return response({ stations: [
      { id: null, name: "FORTYSEVEN Wellness-Therme, Baden, Grosse Bäder 1", coordinate: { x: null, y: null } },
    ] });
    return response({ results: [{ attrs: { label: "Baden", lat: 47.47, lon: 8.29 } }] });
  }).then(place => { settled = true; return place; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  release(response(fortyseven));
  const place = await task;
  assert.deepEqual([place.lat, place.lon], [47.4813202, 8.3128908]);
});

it("requests a selection when only partial town matches exist and honours POI rate limiting", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async input => {
    if (String(input).includes("photon.komoot.io")) { calls++; return new Response("busy", { status: 429, headers: { "Retry-After": "120" } }); }
    if (String(input).includes("transport.opendata")) return response({ stations: [] });
    return response({ results: [{ attrs: { label: "Baden", lat: 47.47, lon: 8.29 } }] });
  };
  await assert.rejects(geocode("fortyseven baden", new AbortController().signal, fetcher), /No exact match.*Choose a suggestion/);
  await suggestPlaces("fortyseven baden", new AbortController().signal, () => {}, fetcher);
  assert.equal(calls, 1);
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
