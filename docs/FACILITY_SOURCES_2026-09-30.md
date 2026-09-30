# Three facility sources and implementation audit

_30 September 2026. User-authorised implementation; no new ETH-specific work. Publication details are recorded below after deployment._

## Delivered behaviour

OSM remains the national base. Three independent source adapters enrich the existing Water, Toilets and Food filters, route corridor and closest-to-start calculations. Repairs and parking keep their existing sources. A source failure does not discard another source's successful records or consume the journey-search budget.

| Source | Implemented scope | Evidence and limitations |
|---|---|---|
| Graubünden Tourism / Flims Laax Falera | Eight fixed public fountain pages around Flims, Laax, Sagogn and Trin; published POI coordinates, source link and explicit drinking-water description | Each returned one point marked as drinking water. The common publisher contact address is never geocoded as the fountain. Access, bottle suitability, seasonality and current flow remain unknown. This is a bounded pilot, not regional completeness. |
| SBB Trafimage / INSA | Public service exports for ten pilot stations; toilets and relevant food categories; named floor, landmark directions, available hours, provider modification time and plan link | 255 source records: 21 toilets and 234 food places. All had a floor label and location text in this check. No eligible water or repair record appeared. Generic kiosks, unspecified machines and unrelated shops are excluded. No indoor route or verified entrance is inferred. |
| swissTLM3D | Optional grey fountain/spring layer from the February 2026 release, off by default | 601 points: 272 fountains and 329 springs. All have **unknown drinkability** and are excluded from closest drinking water. Water-supply infrastructure is excluded. Coverage is explicitly non-systematic; this is location evidence, not a reliable refill recommendation. |

The stations are Zürich HB, Bern, Basel SBB, Lausanne, Genève, Luzern, Winterthur, St. Gallen, Olten and Lugano. They are **ten pilot stations**, not a demonstrated ranking of Switzerland's ten largest stations. Full UIC identifiers come from the SBB plan catalogue; no undocumented identifier conversion is used.

Enable Water to load the rural pilot. Enable Toilets/Food for the relevant station records; Water also loads the station source, allowing explicit drinking-water records if the provider later supplies them. In the Water panel, select **Show topographic fountains and springs (drinkability unknown)** to add TLM. Each source has its own coverage/loading/failure state and retry action. Closest uses the loaded eligible records within the existing user-selected scope. Sources and retrieval dates appear in facility details; provider modification and dataset edition are separate from any on-site observation date.

At detailed zoom, overlapping symbols open separate record details, including floors and sources. Low-zoom food/repair groups still zoom in. The only automatic cross-source enrichments use previously reviewed exact OSM identities; nearby coordinates are insufficient. Existing OSM restrictions, negative water evidence and mapped positions are preserved. The known Zürich HB Hygienecenter components receive the SBB evidence; all unresolved overlaps remain separately labelled records rather than a claimed unique-facility count.

## Source access, reuse and engineering boundaries

All three integrations work without a new API key. They use fixed server-side allowlists at `/api/facilities/v1/`; no arbitrary upstream URL or user-route coordinates are accepted. Source schema/geometry/identity validation, bounded bodies, per-feed deadlines, request coalescing, independent caches, cooldowns and labelled stale fallbacks contain provider failures. The client uses two concurrent requests per provider, browser-cache bypass and cancellation when a layer is disabled.

Graubünden reads eight public pages and extracts short factual fields. No photographs, full descriptions or bulk tourism inventory are republished. The source publisher is not silently treated as the fountain operator. A content/layout change fails the affected page rather than inventing coordinates or potability.

The [Trafimage developer portal](https://doc.trafimage.ch/) specifically describes station-service and platform data as freely usable and links to the [public INSA API](https://api.insa.geops.ch/docs/). Its OpenAccess GeoJSON service route is the implementation's technical access path. The same portal also links [general January 2024 terms](https://doc.trafimage.ch/Bestimmung_Datenabgabe_v1_2024_DE.pdf) with order, publication and onward-sharing restrictions. This release implements a limited factual-service integration in the **existing owner-private prototype**, with © SBB CFF FFS attribution. It does not claim a blanket open licence or resolution of that wording. Clarification remains a gate before wider/public distribution or dataset redistribution. Protected endpoints, media, marketing descriptions, cartographic artwork and downloadable bulk SBB datasets are excluded; official plans are linked. No provider was contacted or agreement invented.

The official [swissTLM3D release](https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/swisstlm3d_2026-02/swisstlm3d_2026-02_2056_5728.shp.zip) is about 3.6 GB. The adapter uses validated HTTP byte ranges to read the ZIP directory and the two small `TLM_EINZELOBJEKT` members only, around 1.4 MB transferred in this check. Expansion is capped, ZIP CRCs are checked, DBF/SHP alignment is validated and LV95 coordinates are converted using the swisstopo approximation. Full-archive HTTP 200 fallbacks are rejected. The release is pinned: a future edition needs a schema review, rather than silently changing categories. © swisstopo is displayed; bulk source files stay out of Git.

The central opendata.swiss catalogue is not an application dependency. Its metadata access/replacement investigation remains in [OPENDATA_SWISS_2026-09-30.md](OPENDATA_SWISS_2026-09-30.md). These integrations use the verified publisher sources directly.

## Checks and release

- **277 application tests in 11 suites pass**, including 12 new source regressions. They cover rural map coordinates and negative evidence; SBB identity/floor/direction/category/validity handling; conservative enrichment; malformed data; TLM projection/category/unknown-water rules; bounded archive access; independent cache/stale failures; and client concurrency/cancellation/partial success.
- TypeScript, frontend and Worker production builds pass. The existing frontend chunk-size advisory remains non-blocking.
- **19/19 live adapter/schema checks returned HTTP 200 and valid normalised data:** eight rural pages, ten station exports and one range-based TLM extraction. [Dated compact evidence](experiments/facility-sources-live-2026-09-30.json). This checks data access and parsing, not physical availability, uniqueness or completeness.
- Reproduce the optional network audit with Node 24: `cd prototype-v0 && node --use-env-proxy scripts/audit-facility-sources.mjs`. It prints a compact JSON result and exits nonzero if any source fails. Ordinary unit tests remain offline.
- No new browser visual/interaction QA is claimed: the managed browser-control skill is unavailable. No field visit, indoor-navigation trial, flow measurement or updated fare/routing benchmark was run for this facility-only change.

**Publication:** pending release verification. The existing owner-private Site and environment revision are preserved; no new account, hosting service, paid dependency or recurring job is introduced.

## What the roadmap still promises but the app does not yet implement

The audit compares [APP_ROADMAP.md](APP_ROADMAP.md), the parking/useful-stop proposals and current source code. It distinguishes basic referencing from the full feature. These remaining items were not silently marked complete by adding feeds.

| Priority / status | Gap | Concrete next acceptance check |
|---|---|---|
| Next within useful stops | Rural access/seasonality evidence and **distance along the cycling route to the next supported refill point** | Pilot one Flims–Laax–Sagogn–Trin ride; label unsupported stretches and missing fields. A blank source response must not become “no water exists”. Expand beyond eight points only where useful evidence exists. |
| Next, shared with parking | Actual entrance and routed detour/access distance | Shortlist a few candidates, route to an evidenced entrance and separate added travel from visit time. Include a river/barrier and a multi-level station. The present 100/500/1,000 m band is only geometric proximity. |
| Next | Opening at estimated arrival and visit duration | Evaluate usable hours in Swiss local time, retain unknowns and ask for visit duration before explicit stop insertion/replanning. Raw displayed hours are not an opening decision. |
| Needed validation | Field review, correction workflow and source/floor conflicts | Verify selected rural outlets and station directions; distinguish observed date, publisher edit and fetch date. Add a small reviewed “missing/wrong floor/closed” workflow before any broad crowdsourcing. |
| Parking milestone unfinished | Suitability shortlist, destination/station search, municipal comparisons and documented entrances | Review a bounded Biel/Bienne/other-city sample; retain unresolved identities and access/retrieval uncertainty. Equipment colour is not a security score. |
| Later explicit feature | GPS | Request location permission only after the user chooses it; keep A as the current distance origin. |
| Third main milestone | Broader mobile/desktop interface and quieter basemap | Test search → compare → inspect → use a facility, keyboard/touch access and partial data. Current OSM raster symbols cannot be individually hidden by overlay filters. |
| Reliability work retained | Missed useful routes such as Baden–Witikon; four-versus-eight station-pair comparison | Fixed dated regression inputs, bounded requests and saved intermediate evidence. No full national routing engine is deployed. |
| Before wider distribution | Source reuse clarification and continued schema monitoring | Resolve the SBB terms question for the intended audience/use; review rural-page and pinned TLM changes. No promise of blanket redistribution rights. |
| Deliberately deferred | Indoor turn-by-turn navigation, measured road-safety ranking, live bicycle occupancy/booking and park-and-ride bicycle custody | Separate product/data decisions; these are not regressions in this release. |

The agreed overall order remains parking → useful services → broader UI. Within the current useful-stop work, **rural refill precision comes before adding more categories or city connectors**. ETH-specific expansion is excluded from the next work; its prior labelled report is simply retained.
