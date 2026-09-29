# Repairs, food and adjustable facility distance

_29 September 2026. User-authorised implementation of the repair/food proposal. Publication evidence is recorded below._

## Delivered behaviour

- Independent **Repairs** (wrench) and **Food** (apple) toggles join Parking, Water and Toilets. All layers start off. The toolbar wraps above the map so the controls do not cover the route.
- Repairs offers **Pumps**, **Self-service stations**, **DIY workshops**, **Repair workshops**, **Bike shops** and **Parts / tube machines**. All are initially selected. Multiple services can share one source object.
- Food initially selects **Bakeries**, **Groceries / farm shops** and **Food / drink machines**. **Cafés** and **Restaurants / takeaway** are optional. Type selections survive switching the layer off/on during the current page session.
- All five categories share **Along selected journey** and **100 m / 500 m / 1 km** proximity. The default remains 100 m. Matching follows actual cycling/routed walking geometry and known endpoints/stops; it never follows schematic transit lines or connects disconnected legs. Missing walking geometry remains disclosed.
- Repair and food symbols cluster in a 52-pixel grid below zoom 17. Click a numbered group to zoom. At most 1,000 groups/points per category are drawn in the viewport, with a zoom notice when capped. Cluster counts are records, not capacity or availability. Closest ranking uses the full eligible set independently of clustering, viewport and marker limits.
- **Find closest matching bicycle service / food stop** uses starting point A, the selected types and the route scope. A new scope/type/radius invalidates the previous closest highlight. The most recently requested category controls the closest focus. Geographic distance is to the mapped point/area centre, with entrances and detours unverified.
- Purple repair / pink food symbols mean a mapped service, not quality or confirmed opening. Amber means an explicit restriction/unavailability affecting the shown services. Icons and labels accompany colours. Shared source objects across enabled amenity categories have separated symbols; identities and ranking coordinates stay unchanged.
- Popups and closest cards include mapped hours, access, operator, tools/valves, workshop hours, machine contents, payment, address and website/phone when supplied. Only HTTP(S) websites and validated phone links are clickable; source text is rendered as text.

## Interpretation rules and limitations

A bicycle shop alone does not establish a repair service. `service:bicycle:repair=yes` (or explicit generic `repair=yes` on a bicycle shop when no bicycle-specific value exists) supplies repair evidence; an explicit bicycle-specific `no` wins. `service:bicycle:diy=yes` establishes DIY workspace/tools, not guaranteed assistance. The real VELOVE Hönggerberg record contains both DIY and repair tags: the card explicitly asks users to check whether staff perform the repair or guide them. No certification, paid professional service, appointment or immediate mechanic availability is inferred.

Generic compressed air needs explicit bicycle suitability (`bicycle=yes`, positive bicycle-pump service, or a mapped Presta/Sclaverand/Dunlop valve). Generic air without such evidence, including the real scuba-air fixture, is excluded. A pump-only repair-station object with `tools=no` is not listed as a self-service tool station. Missing pump/valve/tools information stays unknown. Explicit broken-pump status excludes that pump from a pump-only closest search without discarding the shop's other usable services. A workshop with `opening_hours:workshop=closed/off` cannot win a repair-workshop-only search.

Food vending requires a recognised semicolon-separated food/drink product. Bicycle tubes, tickets, unspecified vending and substring matches such as `dog_food` are not food. Farm shops remain labelled; ready-to-eat snacks and stock are unknown. `fee=no` is not presented as free food or free repairs.

Closest excludes explicit private/member/conditional/locked access, known closures and applicable broken equipment. **Ordinary `access=customers` is allowed for commercial food/repair services**, unlike public toilets. Unknown access remains eligible but visibly unknown. General hours are shown verbatim and are not evaluated for arrival. No entrance routing, pushing directions, GPS, stop insertion, visit duration, booking, live stock or live equipment check is added. Route results, bicycle permissions and fares are unchanged.

Primary tagging references: [bicycle shops and services](https://wiki.openstreetmap.org/wiki/Tag:shop=bicycle), [self-service repair stations](https://wiki.openstreetmap.org/wiki/Tag:amenity=bicycle_repair_station), [compressed air](https://wiki.openstreetmap.org/wiki/Tag:amenity=compressed_air), [food categories](https://wiki.openstreetmap.org/wiki/Food), [vending machines](https://wiki.openstreetmap.org/wiki/Tag:amenity=vending_machine).

## Data and request design

Three independent fixed queries use the Swiss regional [Overpass endpoint](https://overpass.osm.ch/api/interpreter). Nodes, ways and relations retain stable OSM identities and source URLs. Inactive/invalid records are excluded. Nearby distinct objects are not merged. Quick food and optional dining deduplicate identical source IDs, retaining the newer record; fetched-at/stale reporting conservatively reflects the oldest input.

| Endpoint | When fetched | Normalized records in 29 September source audit | Raw response |
|---|---|---:|---:|
| `/api/services/v1/repairs` | Repairs first enabled | 2,425 | 1.09 MB |
| `/api/services/v1/food` | Food first enabled | 16,275 | 6.89 MB |
| `/api/services/v1/food-dining` | Food enabled with cafés or restaurants selected | 32,196 | 12.64 MB |

The two food datasets overlap in 386 objects (48,085 unique records together). Subtype counts overlap too. An initial combined food query returned 19.33 MB, above the existing 16 MiB bound; splitting quick food/dining keeps each query below it and makes the larger category optional. Direct source fetches took approximately 26 / 25 / 23 seconds for repairs / quick food / dining in this audit; these are observations, not latency guarantees.

Each dataset has its own 24-hour memory/edge cache, one in-flight refresh, a 60-second failure cooldown and up to seven days of stale fallback. Cross-dataset cache responses fail validation. Each upstream request retains the 16 MiB response cap and 40-second deadline; the browser has a body-inclusive 50-second deadline and at most one transient retry. Browser responses use `private, no-store`; the completed client data survives category/subtype/map changes. Disabling an in-flight layer cancels the client request. Dining is cancelled when its optional types are deselected. A partial food-source failure is disclosed and remaining data stays usable.

No user route or coordinates are forwarded in these fixed queries. The first use still downloads a regional dataset; this is not an area-tiled service. It reuses the existing host, with no new key, paid resource or scheduled job. [OSM attribution and ODbL](https://www.openstreetmap.org/copyright) remain visible. Bulk source downloads remain outside Git; the repository contains a 12-record public fixture and small aggregate evidence only.

## Verification

- **258 tests, 11 suites; zero failures, skips or cancellations.** TypeScript, frontend and Worker production builds pass. The existing bundle-size advisory remains nonblocking.
- Thirteen new regressions cover real Swiss records, negative/unknown pump and repair evidence, strict vending contents, inactive/area/identity handling, source separation, customer/private/closed access, broken-pump/workshop subtypes, all three corridor widths, clustering/ranking independence, deduplication, safe contacts, fixed queries, failure isolation, client validation and stale expiry.
- The production handlers accepted all three captured live response bodies under a Node 96 MiB old-space cap. This does not guarantee Cloudflare memory behaviour; it checks that the split payloads and normalisation run together under a bounded heap.
- [Source audit](experiments/repairs-food-source-2026-09-29.json) records dates, counts, sizes, hashes and subtype overlap. [Handler evidence](experiments/repairs-food-handler-2026-09-29.json) records exact public-start checks at ETH Zentrum, Bern and Biel. Distances are geographic, not verified access.
- Browser interaction/visual QA remains unavailable because the required managed browser-control skill is absent. Compilation, automated checks and direct endpoint checks must not be described as browser clicking or mobile visual verification.

## Publication

Owner-private **version 37** succeeded on **29 September 2026 at 21:42:17 UTC**, environment revision **3**, Site source `c3ca72b2c91fcbfbfd1903904a14d9e22ffbf3b6`. Deployment `appgdep_6abc30acb5008191a4cb1e9fe8aef131` reports succeeded. Ownership/audience were confirmed unchanged, with no external visitors. The existing OJP secrets were not changed.

The exact client loaders then received HTTP 200 JSON from all three new hosted endpoints, with fresh records and no retries: repairs 2,425 in 24.01 seconds; quick food 16,275 in 18.44 seconds; dining 32,196 in 18.29 seconds. The water/toilet endpoint also passed after the shared handler changes, returning 38,554 fresh records in 24.44 seconds. These are first uncached observations, not latency guarantees. [Hosted request and public-start results](experiments/repairs-food-live-2026-09-29.json).

Verification used the authenticated Node request header supplied for the Site. It did not exercise browser cookies, marker clicks or a mobile layout. GitHub application files are synchronized with this published source; release documentation is stored in the authoritative GitHub repository.

## Next concrete check

Try one familiar journey with Repairs and Food enabled, then compare 100 m and 500 m. Review a known pump, a DIY/workshop example and a food machine against local knowledge, especially access and opening. The next engineering work is evaluated opening-at-arrival and checked entrances/detours, followed by visit duration before Add as stop can promise an onward train. A compact area index is a possible later response to measured first-load latency; the broader interface and municipal enrichment work remain tracked separately.
