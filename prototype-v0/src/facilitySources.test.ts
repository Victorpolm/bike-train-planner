import assert from "node:assert/strict";
import { it } from "node:test";
import { FACILITY_JOBS, mergeFacilitySources, validFacilityData, type FacilityLoad } from "./facilitySources.ts";
import { loadFacilityJobs } from "./facilityClient.ts";
import { amenityDetails, closestAmenity, parseOsmAmenities } from "./osmAmenities.ts";
import { facilityData, parseRuralWater, parseStationFacilities } from "../server/facilityParsers.ts";
import { createFacilityHandler } from "../server/facilityHandler.ts";
import { loadTlmWater, lv95ToWgs84, parseTlmWater, readBounded, zipDirectory } from "../server/tlmWater.ts";
import { TLM_WATER_SNAPSHOT } from "../server/tlmSnapshot.ts";

const DATE = "2026-09-30T12:00:00Z", ruralJob = FACILITY_JOBS[0];
const ruralPage = '<h1>Wasserbrunnen Sagogn Planezzas</h1>Flims Laax Falera Management AG. Offizielles Trinkwasser. Contact: Via Nova 62 <div data-map="{&quot;coordinates&quot;:{&quot;lat&quot;:46.798032,&quot;lng&quot;:9.272311}}"></div>';
const rural = () => parseRuralWater(ruralPage, "sagogn-planezzas", DATE);
const station = (features: unknown[], id = "8503000") => parseStationFacilities({ type: "FeatureCollection", features }, id, DATE);
const feature = (id: string, props: Record<string, unknown> = {}, coordinates = [8.5395, 47.3781]) => ({ type: "Feature", geometry: { type: "Point", coordinates },
  properties: { station_uic: "8503000", url_identifier: id, subcategory: "toilet", name: "Station toilet", ...props } });
const request = (path = ruralJob.path) => new Request(`https://planner.example${path}`);

it("rural water uses the publisher POI coordinates, not its repeated contact address", () => {
  const [f] = rural();
  assert.deepEqual([f.lat, f.lon], [46.798032, 9.272311]);
  assert.equal(f.potable, "yes"); assert.equal(f.tags.access, undefined); assert.equal(f.tags.bottle, undefined);
  assert.match(amenityDetails(f, "water").join(" "), /Seasonal availability unknown/);
  assert.equal(f.provenance?.updatedAt, undefined);
  assert.equal(validFacilityData(facilityData(ruralJob, [f], DATE), ruralJob), true);
  assert.throws(() => parseRuralWater(ruralPage.replace('coordinates', 'unrelated'), "sagogn-planezzas", DATE), /format/);
  assert.throws(() => parseRuralWater(ruralPage.replace('46.798032', '47.9'), "sagogn-planezzas", DATE), /location/);
});

it("negative rural water evidence beats positive marketing and missing evidence stays unknown", () => {
  for (const wording of ['Kein Trinkwasser', 'nicht trinkbar']) {
    const [f] = parseRuralWater(ruralPage + wording, "sagogn-planezzas", DATE);
    assert.equal(f.potable, "no"); assert.equal(closestAmenity([f], f, "water"), null);
  }
  assert.equal(parseRuralWater(ruralPage.replace('Offizielles Trinkwasser', ''), "sagogn-planezzas", DATE)[0].potable, "unknown");
});

it("SBB keeps distinct identities/floors at the same coordinate and preserves landmark directions", () => {
  const a = feature("toilet-a", { floor: { level: -1, name: { en: "ShopVille, 1st basement" } }, location_details_en: "Mezzanine level", modified: "2026-08-10T12:00:00Z" });
  const b = feature("toilet-b", { floor: { level: -2, name: { de: "2. Untergeschoss" } }, location_details_de: "Passage Sihlquai" });
  const records = station([a, b]); assert.equal(records.length, 2);
  assert.equal(records[0].location?.floorLabel, "ShopVille, 1st basement");
  assert.equal(records[0].location?.directions, "Mezzanine level");
  assert.equal(records[1].location?.floorLabel, "2. Untergeschoss");
  assert.equal(records[0].location?.planUrl, "https://plans.trafimage.ch/zuerich-hb");
  assert.equal(records[0].tags.access, undefined);
  assert.match(amenityDetails(records[0], "toilets").join(" "), /not an on-site observation date/);
});

it("SBB filters unrelated shops, wrong station IDs, invalid geometry and unspecified machines", () => {
  const records = station([feature("food", { subcategory: "supermarket" }), feature("kiosk", { subcategory: "kiosk" }),
    feature("machine", { subcategory: "vending_machine" }), feature("clothes", { subcategory: "clothes" }),
    feature("wrong-station", { station_uic: "8507000" }), feature("abroad", {}, [0, 0]),
    feature("water", { subcategory: "drinking_water" }), feature("fountain", { subcategory: "fountain" })]);
  assert.deepEqual(records.map(f => f.id.split(':').pop()), ["food", "water", "fountain"]);
  assert.equal(records[1].potable, "yes"); assert.equal(records[2].potable, "unknown");
  assert.throws(() => station([], "3000"), /Invalid/);
});

it("SBB retains hours and validity without promising arrival-time opening", () => {
  const [f] = station([feature("hours", { valid_until: "2025-12-31", openinghours: [{ valid_from: null, valid_until: null,
    openinghours: [{ day_from: 4, day_to: 5, time_from: "09:00:00", time_to: "00:00:00" }] }] })]);
  assert.equal(f.tags.opening_hours, "Fr-Sa 09:00-00:00");
  assert.match(amenityDetails(f, "toilets").join(" "), /not checked for arrival/);
  assert.equal(closestAmenity([f], f, "toilets"), null);
});

it("cross-source enrichment requires a reviewed identity and cannot erase restrictions or negative evidence", () => {
  const base = parseOsmAmenities({ elements: [{ type: "node", id: 1, lat: 46.798032, lon: 9.272311,
    tags: { amenity: "drinking_water", access: "private", drinking_water: "no", level: "1" } }] }).facilities;
  assert.equal(mergeFacilitySources(base, rural(), ["water"]).length, 2); // Same coordinates are insufficient.
  const [external] = rural(); external.provenance!.referenceOsmIds = [base[0].id];
  const [merged] = mergeFacilitySources(base, [external], ["water"]);
  assert.equal(merged.id, base[0].id); assert.equal(merged.tags.access, "private"); assert.equal(merged.tags.level, "1");
  assert.equal(merged.potable, "no"); assert.equal(closestAmenity([merged], merged, "water"), null);
  base[0].potable = "yes"; external.potable = "no";
  assert.equal(mergeFacilitySources(base, [external], ["water"])[0].potable, "no");
});

it("supplemental schemas reject contamination, unsafe links and malformed nested values without throwing", () => {
  for (const patch of [ { provenance: { provider: "graubuenden", retrievedAt: DATE, note: "", referenceOsmIds: "not an array" } },
    { additionalSources: {} }, { additionalSources: [null] }, { tags: "text" }, { location: [] }, { url: "javascript:alert(1)" }, { lat: 0 } ]) {
    const data = facilityData(ruralJob, [{ ...rural()[0], ...patch } as any], DATE);
    assert.equal(validFacilityData(data, ruralJob), false);
  }
  assert.equal(validFacilityData(facilityData(ruralJob, rural(), DATE), FACILITY_JOBS.find(j => j.provider === "sbb")!), false);
});

function tlmFixture() {
  const fields = [["UUID", 38], ["OBJEKTART", 20], ["NAME", 20], ["DATUM_AEND", 8]] as const;
  const header = 32 + fields.length * 32 + 1, rowSize = 1 + fields.reduce((n, f) => n + f[1], 0), dbf = Buffer.alloc(header + 4 * rowSize, 32);
  dbf[0] = 3; dbf.writeUInt32LE(4, 4); dbf.writeUInt16LE(header, 8); dbf.writeUInt16LE(rowSize, 10);
  fields.forEach(([name, size], i) => { const start = 32 + i * 32; dbf.fill(0, start, start + 32); dbf.write(name, start); dbf[start + 11] = 67; dbf[start + 16] = size; });
  dbf[header - 1] = 13;
  ['Brunnen', 'Quelle', 'Wasserversorgung', 'Brunnen'].forEach((type, row) => {
    let offset = header + row * rowSize + 1;
    [`{00000000-0000-0000-0000-00000000000${row}}`, type, '', '20240801'].forEach((v, i) => { dbf.write(v, offset); offset += fields[i][1]; });
  });
  dbf[header + 3 * rowSize] = 42; // Deleted source record.
  const shp = Buffer.alloc(100 + 4 * 28); shp.writeInt32BE(9994, 0); shp.writeInt32BE(shp.length / 2, 24); shp.writeInt32LE(1000, 28); shp.writeInt32LE(1, 32);
  for (let i = 0; i < 4; i++) { const p = 100 + i * 28; shp.writeInt32BE(i + 1, p); shp.writeInt32BE(10, p + 4); shp.writeInt32LE(1, p + 8); shp.writeDoubleLE(2600000 + i, p + 12); shp.writeDoubleLE(1200000, p + 20); }
  return { dbf, shp };
}
it("TLM imports fountains/springs only, transforms LV95, retains edition/record dates and never recommends unconfirmed water", () => {
  const p = lv95ToWgs84(2600000, 1200000); assert.ok(Math.abs(p.lat - 46.95108) < .00002); assert.ok(Math.abs(p.lon - 7.43864) < .00002);
  const { dbf, shp } = tlmFixture(), records = parseTlmWater(dbf, shp, DATE);
  assert.equal(records.length, 2); assert.ok(records.every(f => f.potable === "unknown"));
  assert.equal(records[1].tags.natural, "spring"); assert.equal(records[0].provenance?.updatedAt, "2024-08-01");
  assert.equal(records[0].provenance?.datasetDate, "2026-02");
  assert.equal(closestAmenity(records, p, "water"), null);
  assert.throws(() => parseTlmWater(dbf, shp.subarray(0, shp.length - 28), DATE), /not aligned/);
  assert.throws(() => parseTlmWater(dbf, shp.subarray(0, 20), DATE), /Incomplete/);
});

it("TLM refuses full-archive fallbacks and excessive or malformed archive responses", async () => {
  let calls = 0;
  await assert.rejects(loadTlmWater(async (_url, init) => { calls++; assert.equal(new Headers(init?.headers).get('Range'), 'bytes=-65557'); return new Response('huge archive'); }, new AbortController().signal, DATE), /Bounded archive/);
  assert.equal(calls, 1);
  await assert.rejects(readBounded(new Response('abcd'), 3), /limit/);
  await assert.rejects(readBounded(new Response('small', { headers: { 'Content-Length': '99999' } }), 20), /oversized/);
  assert.throws(() => zipDirectory(new Uint8Array(70)), /Invalid/);
});

it("the hosted TLM layer serves the dated prepared index without waiting for the archive", async () => {
  const job = FACILITY_JOBS.find(j => j.provider === 'swisstlm3d')!;
  assert.equal(validFacilityData(TLM_WATER_SNAPSHOT, job), true);
  assert.equal(TLM_WATER_SNAPSHOT.facilities.length, 601);
  assert.ok(TLM_WATER_SNAPSHOT.facilities.every(f => f.potable === 'unknown'));
  assert.equal(closestAmenity(TLM_WATER_SNAPSHOT.facilities, { lat: 47, lon: 8 }, 'water'), null);
  const response = await createFacilityHandler()(request(job.path), async () => { assert.fail('Published TLM edition must not download the archive'); });
  assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.fetchedAt, TLM_WATER_SNAPSHOT.fetchedAt);
});

it("facility requests use fixed URLs, coalesce/cache work and isolate a failed station", async () => {
  const handle = createFacilityHandler(), seen: string[] = [];
  const fetcher = async (url: RequestInfo | URL) => { seen.push(String(url)); return String(url).includes('graubuenden.ch') ? new Response(ruralPage) : new Response('down', { status: 503 }); };
  const [a, b] = await Promise.all([handle(request(), fetcher), handle(request(), fetcher)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200); assert.equal(seen.length, 1);
  assert.equal((await handle(request(FACILITY_JOBS.find(j => j.provider === 'sbb')!.path), fetcher)).status, 503);
  assert.equal((await handle(request(), fetcher)).status, 200); assert.equal(seen.length, 2);
  assert.equal((await handle(request(ruralJob.path + '?url=https://example.com'), fetcher)).status, 404);
  assert.equal((await handle(request('/api/facilities/v1/sbb/3000'), fetcher)).status, 404);
  assert.equal((await handle(new Request(request(), { method: 'POST' }), fetcher)).status, 405);
  assert.equal(seen.length, 2);
});

it("facility stale fallback is labelled, bounded and cooled down", async () => {
  let now = Date.parse(DATE), calls = 0; const handle = createFacilityHandler({ now: () => now });
  const fetcher = async () => ++calls === 1 ? new Response(ruralPage) : new Response('down', { status: 503 });
  assert.equal((await handle(request(), fetcher)).status, 200);
  now += 86400001; const old = await (await handle(request(), fetcher)).json(); assert.equal(old.stale, true); assert.equal(old.fetchedAt, DATE.replace('Z', '.000Z'));
  await handle(request(), fetcher); assert.equal(calls, 2);
  now += 8 * 86400000; assert.equal((await handle(request(), fetcher)).status, 503);
});

it("the client keeps partial successes, bounds concurrency, validates responses and respects cancellation", async () => {
  const jobs = FACILITY_JOBS.slice(0, 4), updates = new Map<string, FacilityLoad>(); let active = 0, maximum = 0;
  await loadFacilityJobs(jobs, new AbortController().signal, l => updates.set(l.key, l), async (url, init) => {
    active++; maximum = Math.max(maximum, active); assert.equal(init?.credentials, 'same-origin');
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    const job = jobs.find(j => j.path === url)!;
    return job === jobs[1] ? new Response('down', { status: 503 }) : Response.json(facilityData(job, parseRuralWater(ruralPage, job.key.split('/')[1], DATE), DATE));
  });
  assert.equal(maximum, 2); assert.equal([...updates.values()].filter(l => l.status === 'ready').length, 3);
  assert.equal(updates.get(jobs[1].key)?.status, 'error');
  const controller = new AbortController(); controller.abort();
  await loadFacilityJobs(jobs, controller.signal, () => assert.fail('Cancelled batch must not update'), async () => { assert.fail('Cancelled batch must not fetch'); });
});
