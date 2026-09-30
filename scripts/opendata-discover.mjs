#!/usr/bin/env node
// Read-only catalogue discovery. Kept outside the app so the announced CKAN
// replacement cannot interrupt journey planning or facility loading.
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

export const CKAN_BASE = 'https://ckan.opendata.swiss/api/3/action/';
const text = value => typeof value === 'string' ? value : value && typeof value === 'object'
  ? ['en', 'de', 'fr', 'it'].map(language => value[language]).find(v => typeof v === 'string') ?? '' : '';
const publicUrls = value => (Array.isArray(value) ? value : [value]).flatMap(item => {
  if (typeof item !== 'string') return [];
  try { const url = new URL(item); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? [url.href] : []; }
  catch { return []; }
});

export function summariseDataset(dataset) {
  return {
    id: dataset.id, name: dataset.name, title: text(dataset.title ?? dataset.display_name),
    publisher: text(dataset.organization?.title) || dataset.organization?.name || text(dataset.publisher),
    // Catalogue modification is not a field survey or a facility's last update.
    metadataModified: dataset.metadata_modified ?? null,
    licence: dataset.license_url ?? dataset.license_id ?? null,
    resources: (dataset.resources ?? []).map(resource => ({
      id: resource.id, name: text(resource.name ?? resource.title), format: text(resource.format),
      mediaType: resource['media-type'] ?? resource.media_type ?? resource.mimetype ?? null,
      urls: [...new Set([...publicUrls(resource.download_url), ...publicUrls(resource.access_url), ...publicUrls(resource.url)])],
      rights: resource.rights ?? null, modified: resource.modified ?? resource.last_modified ?? null,
    })),
  };
}

export async function queryCatalogue(action, parameters, fetcher = fetch) {
  if (!['package_search', 'package_show'].includes(action)) throw new Error('Only read-only dataset search/show are supported.');
  const url = new URL(action, CKAN_BASE);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
  const response = await fetcher(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Catalogue HTTP ${response.status}. No automatic retry. Check portal availability; this does not establish that an API key is required.`);
  }
  if (!response.headers.get('content-type')?.includes('json') || !response.body) throw new Error('Catalogue did not return JSON.');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0, body = '';
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 2 * 1024 * 1024) { await reader.cancel(); throw new Error('Catalogue response exceeds 2 MiB. Reduce --rows.'); }
      body += decoder.decode(value, { stream: true });
    }
  } finally { reader.releaseLock(); }
  const data = JSON.parse(body + decoder.decode());
  if (data.success !== true || !data.result) throw new Error('Catalogue returned an unsuccessful CKAN response.');
  return { request: url.href, result: data.result };
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean' }, rows: { type: 'string', default: '5' }, start: { type: 'string', default: '0' },
  } });
  if (values.help) {
    console.log('Read-only discovery; one request, no data downloads or credentials.\n' +
      'node scripts/opendata-discover.mjs search "Brunnen OR fontaines OR fontane" --rows 5 --start 0\n' +
      'node scripts/opendata-discover.mjs show <id-from-search>\n' +
      'CKAN replacement is announced for late 2026 / early 2027; see docs/OPENDATA_SWISS_2026-09-30.md.');
    return;
  }
  const [command, input] = positionals, rows = Number(values.rows), start = Number(values.start);
  if (!['search', 'show'].includes(command) || !input || input.length > 500 || positionals.length !== 2
    || !Number.isInteger(rows) || rows < 1 || rows > 25 || !Number.isInteger(start) || start < 0)
    throw new Error('Use search <query> or show <dataset-id>, --rows 1..25 and --start >= 0. See --help.');
  const { request, result } = await queryCatalogue(command === 'search' ? 'package_search' : 'package_show',
    command === 'search' ? { q: input, rows, start } : { id: input });
  if (command === 'search' && (!Array.isArray(result.results) || !Number.isFinite(result.count))) throw new Error('Unexpected search result format.');
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), request,
    count: command === 'search' ? result.count : 1, start: command === 'search' ? start : 0,
    datasets: (command === 'search' ? result.results : [result]).map(summariseDataset),
    note: 'Metadata and resource links only. Verify reuse terms, geographic coverage, freshness and field meanings before importing.',
  }, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
}
