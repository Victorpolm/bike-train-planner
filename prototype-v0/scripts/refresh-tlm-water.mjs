// Explicit maintenance task for the reviewed edition. Node 24; no full archive.
// Review the pinned URL/schema in server/tlmWater.ts before changing editions.
import { writeFile } from 'node:fs/promises';
import { loadTlmWater, TLM_WATER_ARCHIVE } from '../server/tlmWater.ts';
const importedAt = new Date().toISOString();
const facilities = await loadTlmWater(fetch, AbortSignal.timeout(120000), importedAt);
if (!facilities.length || facilities.some(f => f.potable !== 'unknown')) throw new Error('Unexpected TLM water classification');
const points = facilities.map(f => ({ id: f.id.slice('swisstlm3d:'.length), lat: f.lat, lon: f.lon, spring: f.tags.natural === 'spring',
  ...(f.name.startsWith('Mapped ') ? {} : { name: f.name }), ...(f.provenance.updatedAt ? { updatedAt: f.provenance.updatedAt } : {}) }));
await writeFile(new URL('../server/data/tlm-water-2026-02.json', import.meta.url), JSON.stringify({ edition: '2026-02', importedAt, source: TLM_WATER_ARCHIVE,
  attribution: '© swisstopo. Derived fountain/spring point index; no potability or availability evidence.', points }) + '\n');
console.log(JSON.stringify({ edition: '2026-02', importedAt, records: points.length }));
