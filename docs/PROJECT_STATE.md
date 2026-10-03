# Project state

**Latest branch implementation, 3 October:** Clickable preference help, compact OJP requests, bounded Extended recovery, expanded endpoint candidates and functional later-departure pages are implemented. Past dates are accepted subject to provider data. **327 regressions** and live ZVV/Libero/Extended/later-departure checks pass; browser QA remains pending. [Current evidence and remaining limits](SEARCH_RELIABILITY_2026-10-03.md).

_Last consolidated: 2026-10-03. This is the current summary; dated reports and Git history preserve earlier states._

## Objective and current scope

**Decision:** Build a Switzerland-first bicycle + public-transport journey planner. In the current mode the traveller keeps the bicycle throughout transit, including intermediate cycling and walking/pushing transfers. Parking is currently an information layer, not a mode that leaves the bicycle behind.

**User's requested priority order, 29 September:** (1) bike parking, (2) bike shops/repair referencing, (3) the broader user-interface improvement. The broader proposed scope remains in [APP_ROADMAP.md](APP_ROADMAP.md) and [BIKE_PARKING.md](BIKE_PARKING.md).

**Latest branch implementation, 2 October:** `feature/novice-interface-profiles` delivers optional browser-local traveller profiles behind a compact header icon with explicit save and synchronized cards under Your trip, separate Commuter/Bikepacking/Personalized trip presets, a simpler form, persistent phone Planning / Map views, a map filter menu, single-total cards and clickable explanations. The latest routing update sets Baseline to 0 and Extended to up to 2 automatic cycling connections, adds bounded two-round discovery and beginning/end-only hard constraints; [scope and limits](MULTIPLE_CYCLING_TRANSFERS.md). **322 offline tests**, formatting/Knip and builds pass. The follow-up extracts independent UI modules and central layout/spacing settings, tightens route reversal and explains Extended; [editing guide](INTERFACE_EDITING.md). Browser QA is pending. [Capability mapping, acceptance checks and scope](INTERFACE_PROFILES_2026-10-02.md). The branch is not merged into main.

**Previous implementation, 30 September — version 42:** approved review changes add automatic detour framing, remove redundant map controls, share exact operator normalization and cache bicycle permission with evidence-mutation invalidation. `TimetableClient` is extracted; active rules/fares are retained during cleanup. Automatic offline CI, broader mixed-mode sweeps, Knip and separate React formatting are added. **300 tests/builds pass.** The bounded local MOTIS pilot reproduces a three-scope integration gap; migration remains deferred. [Implementation and evidence](REVIEW_IMPLEMENTATION_2026-09-30.md).

**Previous implementation, 30 September:** **Version 41** fixes facility popups disappearing after map movement and adds cycling-only facility detour previews. Only the selected cycling section is routed again; public-transport services, required waypoint boundaries, original cards and prices remain fixed. The preview includes editable visit time, extra distance/travel time and a same-connection check with walking and the three-minute buffer. **290 tests and production builds pass.** [Implementation, checks and limits](FACILITY_DETOURS_2026-09-30.md).

**Previous implementation, 30 September:** The owner approved Graubünden, SBB and swissTLM3D integration and requested a GitHub/roadmap audit, without further ETH focus. **Version 40** connects eight rural water pages, ten station service feeds and an optional unknown-drinkability TLM layer. Floors/directions, source dates, overlap details and independent failure/retry handling are preserved. **278 tests/builds and 19 hosted endpoint checks pass.** [Implementation, source terms and outstanding work](FACILITY_SOURCES_2026-09-30.md).

**Earlier direction, 30 September:** Prioritise usable, precise facility information over record counts, with rural drinking-water reliability first and large-building localisation next. Research found destination-published rural refill points and successfully accessed SBB's detailed indoor service/floor API; current flow, some floor semantics and production reuse rights remain unresolved. [Findings and proposed pilot](FACILITY_PRECISION_2026-09-30.md). This is a research/documentation update, not a new app release.

**Previous request and delivery:** Version 38 retains and displays facility floors, building/place/room/direction details, supports a small reviewed inventory, adds the reported ETH HG Selecta location (floor F beside the Starbucks machines, approximate building pin), and enriches existing Zürich HB Hygienecenter records with floor/zone and a station-plan link. User reports, document review and OSM evidence stay separate. [Implementation, checks and release](FACILITY_LOCATIONS_2026-09-30.md). The [opendata.swiss investigation](OPENDATA_SWISS_2026-09-30.md) adds a read-only discovery script, records live CKAN HTTP 403 responses and the announced API replacement, and verifies one SBB publisher feed with 63 station-plan references. No catalogue dependency or city-by-city import was added to the app.

**Previous delivery:** Version 37 adds Repairs and Food, service subtypes, numbered marker groups, closest-from-A and shared 100 m / 500 m / 1 km route proximity (100 m default). Quick food and optional dining use separate cached feeds; closures, broken equipment and uncertain services remain explicit. [Repair/food implementation and checks](REPAIRS_AND_FOOD_2026-09-29.md). Version 36 added Water and Toilets toggles, water-drop/WC symbols, closest-from-A actions and the shared selected-journey corridor. Potability, access, fees/hours and seasonal unknowns remain explicit. Bollards and handlebar holders join stands in the green preferred parking group; wheel-only equipment stays red and other/unknown types grey. [New implementation and evidence](WATER_AND_TOILETS_2026-09-29.md). Square P markers distinguish parking from hollow-circle explored stops; the closest parking has a larger outlined P. Selecting a journey enables an optional 100/500/1,000 m filter around its cycling paths, known walking paths/endpoints, requested locations and boarding/alighting points. Closest remains relative to A, within the filtered records; GPS comes later. The official + OSM coverage and source/access details remain. [Implementation, checks and release](PARKING_COLOURS_AND_ROUTE_2026-09-29.md).

**Latest reliability report:** Both sources appeared unavailable in the owner's browser. Version 33 adds separate versioned requests, browser-cache bypass, edge-cache validation and specific authentication/network/data errors with bounded retry. Direct live checks succeeded for both providers; the original browser-session failure remains unconfirmed. [Diagnosis and checks](PARKING_LOADING_2026-09-29.md).

**Follow-up brainstorming, 29 September:** The user identifies water fountains, snacks/vending, public toilets, parking quality and repair help as important long-ride needs. Add filtered map/list information on or near the selected cycling path. [CYCLING_AMENITIES.md](CYCLING_AMENITIES.md) records the proposed expansion of the service milestone, OSM/municipal/operator source handling and validation. [Road-safety questions](CYCLING_SAFETY_RESEARCH.md) are a later investigation, not accepted risk rules.

## What works now

| Area | Implemented | Practical limit |
|---|---|---|
| Journey planning | Bounded multi-label Baseline/Extended search; road-routed access/egress; up to two automatic cycling connections in Extended; beginning/end-only hard constraints; ordered visits; category winners with identical results combined | Sampled acquisition can miss useful journeys; a timeout is not proof that no route exists |
| Inputs and comparison | Swiss places/addresses/venues, map-selected/draggable endpoints, up to four ordered stops, Swiss departure date/time, rider/electric profiles, cycling-only comparison | Stopover duration, arrive-by and more specialised modes are not delivered |
| Facility detour previews | Persistent readable popups; nearest cycling-section selection; two links through the facility; editable visit duration; added distance/time, map overlay and fixed-service timing | Preview only: no saved stop insertion, card/fare updates, original-budget revalidation or verified indoor/entrance access |
| Cycling | BRouter geometry and terrain/profile summaries; Fastest/Simplest/Lower traffic stress preferences; riding/pushing/carrying distinctions and bounded official terrain checks | Partial data coverage; riding times are estimates; no claim of objective safety or fully verified station entrances |
| Bicycle carriage | All-mode selector: verified only, include unknown, include prohibited for comparison; dated OJP filtering/TripInfo and scoped operator rules | Permission, ticket requirements, reservations and remaining spaces are distinct; live spaces/booking are not integrated |
| Prices | Server-side OJP Fare reuses retained trips or assembles exact selected service/walking legs; full/Half Fare/GA and annual-bike-pass handling; separate passenger, bicycle and reservation rows | OJP integration/test estimates; some provider results remain unavailable; no unsupported through fare across a cycling break |
| Bike parking | Official + Swiss OSM points/areas, equipment colours, map toggle, optional selected-journey 100/500/1,000 m corridor, closest eligible facility to A, source/access/equipment details; independent loading/retry and conservative identity deduplication | Geographic proximity to point/area centre, not entrance routing; missing walking paths use endpoints only. Coverage/duplicates incomplete; no security guarantee, GPS, municipal imports, suitability shortlist, evaluated hours/tariffs or occupancy |
| Water and toilets | Swiss OSM plus eight Graubünden water pages, ten-station SBB toilet/floor/direction feeds and optional grey swissTLM3D fountains/springs; independent toggles, source states, proximity and closest to A | TLM drinkability stays unknown and cannot win closest water. No live flow/quality, evaluated opening, verified entrances or along-route refill gaps; mapped-location detour previews are available. Source overlaps remain explicit. |
| Repairs and food | Independent layers/subtypes, contact/details, closest-to-A and route proximity; SBB adds station food with floors/directions; overlapping records remain inspectable; independent caches | No live stock/equipment/mechanic check; DIY/repair arrangements can overlap. Unknown access/hours and unverified entrances remain explicit; mapped-location detour previews are available |
| National data | Swiss GTFS/OSM downloaded and evaluated; experimental local timetable index/service | The published app still uses live providers; no complete national routing engine or OTP/RAPTOR/ULTRA migration is deployed |

## Last verified publication and tests

**Fact:** Owner-private **version 46** published on **2 October 2026 at 21:45:56 UTC**, environment revision **3**, Site source `043d35340c35317a2c54b3f473e3bf0a85d30125`. All **198 current application files** match `feature/novice-interface-profiles`; historical Site documentation snapshots are excluded. The branch is not merged into main. Owner-only access and runtime configuration remain unchanged. GitHub source is public; GitHub CI verifies code but does not publish the website.

**Last code-release gate:** **322 application tests in 11 suites**, React formatting/Knip and TypeScript/frontend/Worker builds pass. Tests cover profiles, Commuter boundaries and ten new two-transfer/discovery/position regressions. [Routing experiment](EXPERIMENTS.md#2026-10-02--two-automatic-cycling-connections-and-placement-constraints). [Implementation, CI status and acceptance checks](INTERFACE_PROFILES_2026-10-02.md). Browser interaction/visual QA remains pending; no new live Swiss provider checks are claimed.

Live checks on 28 September returned passenger CHF 36.20 for Zürich HB–Bern and CHF 45.80 for Zürich HB–Laax on the documented 29 September departures. The Laax route combined services from different OJP responses. Later-bus and bus-only subtrip checks also passed. These are dated test observations, not standing tariffs. [Exact cases and limits](OJP_EXACT_TRIP_FARES_2026-09-28.md).

## Parking: evidence available for the next milestone

The 29 September public-feed audit found **1,608 BIKE facility records** and 1,269 CAR records, including nearby-border facilities. None of the bicycle records had current or forecast occupancy fields populated; 435 car records had current estimated occupancy. Bicycle operating-time structures were present in 570 records and pricing-model structures in 143, without establishing that those values are complete or semantically usable. [Audit](experiments/bike-parking-source-audit-2026-09-29.json).

**Current coverage and proposal:** OSM now extends official station coverage with local points/areas, including ETH. Continue with municipal enrichment and reviewed duplicate/entrance identities, then a small suitability shortlist, checked access and retrieval conditions. Do not invent free spaces or equate covered with secure. Details and acceptance cases are in [BIKE_PARKING.md](BIKE_PARKING.md).

## Next work and release discipline

1. **Parking:** try the colours and adjustable selected-journey filter on familiar trips, then review municipal coverage, unresolved duplicate identities and entrances. GPS is a later explicit permission-based action. Do not treat proximity or equipment colours as a completed suitability/entrance-routing milestone.
2. **Bike services and useful stops:** validate all five filters against familiar places, especially DIY/repair ambiguity, broken pumps, food-machine access and hours. Validate the new timed detour preview, then add checked entrances and opening-at-visit evidence. Applying/saving a preview must revalidate original search limits before changing cards or fares.
3. **Broader interface:** the novice/profile implementation is on the new branch. Run the [desktop/phone acceptance pass](INTERFACE_PROFILES_2026-10-02.md#manual-acceptance-pass) before merging; preserve all options. Historical search, next departures, extra fare products and navigation remain separate backlog items.

Fix route/price/permission regressions when demonstrated; the unresolved Baden–Witikon search and bounded discovery remain tracked work. New amenities must load independently and must not consume the transit search budget. Keep each stage small, documented and independently reviewable; preserve completed test evidence between sessions.

## Later decisions and uncertainties

- An explicit **park the bicycle, then continue by public transport** mode would require passenger-only onward travel, parking-entry/exit conditions, parking cost, return/retrieval handling and access time. It is a separate proposal, not approved as a replacement for today's bicycle-accompanies-traveller mode.
- Baseline 0 / Extended up to 2 and cycling position are implemented. Next measure live route quality, runtime and truncation; general address walking access, through fares across cycling gaps and more than two automatic connections remain open. [Scope and checks](MULTIPLE_CYCLING_TRANSFERS.md).
- Station entrances/pathways, timetable completeness, riding calibration, real user value and the four-versus-eight station-pair experiment remain open.
- Later road-safety work should examine junction manoeuvres, separation from motor traffic and speed/access evidence; a low speed limit, a traffic signal or the absence of recorded crashes cannot establish a universal safety rating.
- Engine evaluation, production national timetable hosting and richer commuting/bikepacking/expert modes remain later work. New hosting spend still needs the owner's approval.
- Native apps, ticket/parking sales, reservation/space booking, social/community features and international expansion are deferred.

## Durable references

- [Roadmap](APP_ROADMAP.md) · [Parking proposal](BIKE_PARKING.md) · [Product](PRODUCT.md)
- [Useful stops and data treatment](CYCLING_AMENITIES.md) · [Later safety research](CYCLING_SAFETY_RESEARCH.md)
- [Data sources](DATA_SOURCES.md) · [Decisions](DECISIONS.md) · [Experiments](EXPERIMENTS.md)
- [Website](WEBSITE.md) · [Exact-trip fare release](OJP_EXACT_TRIP_FARES_2026-09-28.md)
- [Swiss implementation/local pilots](SWISS_IMPLEMENTATION.md) · [Cycling](CYCLING_ROUTES.md) · [Bicycle permissions](BICYCLE_PERMISSION_AND_OJP.md)

An uploaded PROJECT_STATE.md is a snapshot. The attached 5 September copy describes an earlier prototype and must not override this repository state. Keep this summary concise; put detailed observations in dated reports and explain changed decisions in DECISIONS.md.
