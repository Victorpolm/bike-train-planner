# opendata.swiss: bounded facility-data discovery

_Investigated 30 September 2026. This is a discovery tool and research result, not a new production dependency or an automatic import._

## What the API provides

**Fact:** opendata.swiss is a catalogue of dataset metadata. The documented CKAN API returns descriptions, publishers, formats, update metadata, rights and access/download links. Actual facility data is normally served by each publisher. It does not offer one nationwide, consistently structured water/toilet/food/repair feed.

**Recommendation:** use the catalogue during development to find a small number of useful sources. Approve the actual publisher feed and its field mapping separately. The app should use that selected, cached feed directly; a catalogue outage should not affect map loading or journey search.

## Read-only workflow

The documented base is `https://ckan.opendata.swiss/api/3/action/`.

1. `package_search?q=...&rows=5&start=0` finds candidate datasets. Search multilingual terms: `Brunnen OR fontaines OR fontane`, `Toiletten OR toilettes OR WC`, `Velopumpstationen OR Veloreparatur`, and station plans. A missing search result is not evidence that the facility does not exist.
2. `package_show?id=<id-returned-by-search>` obtains the full metadata for a selected dataset. Use the returned ID; a website slug is not guaranteed to be the API ID.
3. Inspect `resources[]`, including `format`, `download_url`, `access_url` / `url`, rights and resource timestamps. Metadata fields can be multilingual objects and download links can have different representations.
4. Review reuse terms, actual schema, coordinate system, geographic scope, update process and accessibility/closure fields before fetching a chosen resource. CSV/GeoJSON is a container format, not a common facility schema. Catalogue modification does not establish a recent physical survey.
5. Compare a small known-place sample with OSM. Import only if the new source fills useful gaps or improves actionable fields at an acceptable maintenance cost. Preserve provenance and conflicts; do not merge floors or facilities using proximity alone.

Public read examples in the official handbook do not use an API key. Its authenticated examples concern publishing/updating metadata. The OJP keys are unrelated and must never be sent to this catalogue.

## Reusable lookup tool

From the repository root, using Node.js 24:

```bash
node scripts/opendata-discover.mjs --help
node scripts/opendata-discover.mjs search "Brunnen OR fontaines OR fontane" --rows 5 --start 0
node scripts/opendata-discover.mjs search "Toiletten OR toilettes OR WC" --rows 5
node scripts/opendata-discover.mjs search "Bahnhofpläne Trafimage" --rows 5
node scripts/opendata-discover.mjs show <id-from-search>
```

The script issues one read-only request, limits pages to 25 datasets, has a 20-second deadline and 2 MiB response bound, and prints concise JSON metadata/resource links. It does not download every resource, write to the catalogue, request credentials or retry a denied request. To inspect the next page, explicitly increase `--start`. Search and resource summaries are isolated from the deployed application.

**Verification:** help/argument handling and mocked smoke checks passed for multilingual names, URL filtering, query encoding, read-only actions and HTTP 403 without retries. No successful live CKAN JSON response was obtained in this environment.

## Live access result and platform change

**Observed:** the documented `ckan.opendata.swiss` searches for Brunnen, Toiletten, Velopumpstationen, Selecta and Bahnhofpläne Trafimage returned HTTP 403. A status request to `status_show` and the handbook's alternative `opendata.swiss/api/3/action/package_search` URL also returned a short nginx HTTP 403 page. No data-count inference can be made from these failures. Cause remains unknown; this does not establish that authentication is required. Do not bypass the denial or repeatedly retry it.

**Fact:** the official “opendata.swiss next” page, updated 22 July 2026, announces replacement of CKAN with a piveau-based platform. Productive migration and retirement are planned for late 2026 / early 2027; exact dates and replacement API/URL details remain unsettled. This announcement is not proof of the cause of today's HTTP 403 responses.

**Decision for this implementation:** keep discovery in a small replaceable script and document the API dependency. Do not add CKAN calls to each route search or map interaction. Recheck published migration specifications before investing in a larger catalogue integration. No recurring job has been scheduled.

## A successful national-source example

The catalogue's SBB **Haltestelle: Übersicht Bahnhofpläne Trafimage** entry links to a publisher GeoJSON export:

`https://sbb.opendatasoft.com/api/v2/catalog/datasets/haltestelle-karte-trafimage/exports/geojson`

**Live result, 30 September:** HTTP 200, 56,105 bytes, **63 station features**. Available fields include station name, `bpuic`, `sloid`, `didok_nr`, PDF-plan links and interactive-plan links. The Zürich HB feature has BPUIC `8503000`, SLOID `ch:1:sloid:3000`, and an interactive plan at `https://plans.trafimage.ch/zuerich-hb`.

This is a useful single source for finding official plans for the proposed ten-station pilot. Its points identify stations, and the properties link to plans; it is **not** an inventory of individual toilets/machines with floors or navigable entrances. The present app adds a checked PDF link only to the two existing Zürich HB Hygienecenter OSM components. It does not claim 63 stations have received detailed indoor mapping.

Zürich's public fountain, Züri WC and pump datasets remain potential optional imports. The first two project priorities are already bounded: stop losing existing location information, and handle small reviewed additions such as ETH HG. No city-by-city audit is needed for those improvements.

## Sources

- [Official API handbook](https://handbook.opendata.swiss/de/content/nutzen/api-nutzen.html)
- [Official migration announcement](https://opendata.swiss/de/opendata-swiss-next)
- [SBB station-plan catalogue entry](https://opendata.swiss/de/dataset/haltestelle-karte-trafimage1)
- [GeoJSON resource metadata and publisher link](https://opendata.swiss/de/dataset/haltestelle-karte-trafimage1/resource/541b0b4f-f56a-400f-bee2-21556c6a74f8)
- [Zürich fountains](https://data.stadt-zuerich.ch/dataset/geo_brunnen), [Züri WC](https://data.stadt-zuerich.ch/dataset/geo_zueri_wc), [bike pumps](https://data.stadt-zuerich.ch/dataset/geo_velopumpstationen)
