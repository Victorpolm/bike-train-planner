// Node 24. Use --use-env-proxy where the execution environment needs its proxy.
// Public provider facts only; no user locations, credentials or raw datasets.
import { FACILITY_JOBS, validFacilityData } from '../src/facilitySources.ts';
import { createFacilityHandler } from '../server/facilityHandler.ts';
const handle = createFacilityHandler(), rows = [];
let next = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (next < FACILITY_JOBS.length) {
    const job = FACILITY_JOBS[next++], start = Date.now();
    const response = await handle(new Request(`https://audit.invalid${job.path}`));
    const data = await response.json(), valid = validFacilityData(data, job);
    rows.push({ key: job.key, status: response.status, valid, elapsedMs: Date.now() - start,
      ...(valid ? { fetchedAt: data.fetchedAt, records: data.facilities.length,
        categories: Object.fromEntries(['water', 'toilets', 'food', 'repairs'].map(c => [c, data.facilities.filter(f => f.categories.includes(c)).length])),
        potable: Object.fromEntries(['yes', 'no', 'unknown'].map(c => [c, data.facilities.filter(f => f.potable === c).length])),
        withFloor: data.facilities.filter(f => f.location?.floorLabel).length,
        withDirections: data.facilities.filter(f => f.location?.directions).length,
        samples: data.facilities.slice(0, 2).map(f => ({ id: f.id, name: f.name, lat: f.lat, lon: f.lon, floor: f.location?.floorLabel, directions: f.location?.directions })) }
        : { error: data.error }) });
  }
}));
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Live adapter/schema checks; not field verification or a completeness claim',
  topographicMode: 'Prepared February 2026 edition; optional refresh-tlm-water.mjs tests the upstream archive separately',
  passed: rows.filter(r => r.status === 200 && r.valid).length, total: rows.length, results: rows.sort((a, b) => a.key.localeCompare(b.key)) }, null, 2));
if (rows.some(r => r.status !== 200 || !r.valid)) process.exitCode = 1;
