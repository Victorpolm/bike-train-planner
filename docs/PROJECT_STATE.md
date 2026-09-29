# Project state

_Last consolidated: 2026-09-29. This is the current summary; dated reports and Git history preserve earlier states._

## Objective and current scope

**Decision:** Build a Switzerland-first bicycle + public-transport journey planner. In the current mode the traveller keeps the bicycle throughout transit, including intermediate cycling and walking/pushing transfers. Parking is currently an information layer, not a mode that leaves the bicycle behind.

**User's requested priority order, 29 September:** (1) bike parking, (2) bike shops/repair referencing, (3) the broader user-interface improvement. The proposed feature scope and completion criteria are in [APP_ROADMAP.md](APP_ROADMAP.md) and [BIKE_PARKING.md](BIKE_PARKING.md). This documentation update records a plan; the proposed additions are not implemented yet.

**Follow-up brainstorming, 29 September:** The user identifies water fountains, snacks/vending, public toilets, parking quality and repair help as important long-ride needs. Add filtered map/list information on or near the selected cycling path. [CYCLING_AMENITIES.md](CYCLING_AMENITIES.md) records the proposed expansion of the service milestone, OSM/municipal/operator source handling and validation. [Road-safety questions](CYCLING_SAFETY_RESEARCH.md) are a later investigation, not accepted risk rules.

## What works now

| Area | Implemented | Practical limit |
|---|---|---|
| Journey planning | Bounded multi-label Baseline/Extended search; road-routed access/egress; at most one intermediate cycle in Extended; ordered visits; category winners with identical results combined | Sampled acquisition can miss useful journeys; a timeout is not proof that no route exists |
| Inputs and comparison | Swiss places/addresses/venues, map-selected/draggable endpoints, up to four ordered stops, Swiss departure date/time, rider/electric profiles, cycling-only comparison | Stopover duration, arrive-by and more specialised modes are not delivered |
| Cycling | BRouter geometry and terrain/profile summaries; Fastest/Simplest/Lower traffic stress preferences; riding/pushing/carrying distinctions and bounded official terrain checks | Partial data coverage; riding times are estimates; no claim of objective safety or fully verified station entrances |
| Bicycle carriage | All-mode selector: verified only, include unknown, include prohibited for comparison; dated OJP filtering/TripInfo and scoped operator rules | Permission, ticket requirements, reservations and remaining spaces are distinct; live spaces/booking are not integrated |
| Prices | Server-side OJP Fare reuses retained trips or assembles exact selected service/walking legs; full/Half Fare/GA and annual-bike-pass handling; separate passenger, bicycle and reservation rows | OJP integration/test estimates; some provider results remain unavailable; no unsupported through fare across a cycling break |
| Bike parking | Optional official map layer, facility type, nominal capacity, cover information, public-access flag, descriptive traits and operator link | No structured hours/tariffs, nearby shortlist, routed entrance access, cross-source deduplication or bicycle occupancy feed |
| Bike shops | Venue search can find named places | A dedicated shop/repair/pump directory and route-related recommendations are not implemented |
| National data | Swiss GTFS/OSM downloaded and evaluated; experimental local timetable index/service | The published app still uses live providers; no complete national routing engine or OTP/RAPTOR/ULTRA migration is deployed |

## Last verified publication and tests

**Fact:** The last verified website release is owner-private **version 30**, published 28 September 2026 at 17:10:19 UTC, Site source `aee01405a58e955c51ef28cb172d4e6ef433dabb`, environment revision 3. Both OJP server secrets are active. GitHub source is public; website audience and GitHub visibility are separate. A GitHub push does not automatically publish the website.

**Last code-release gate:** 203 application tests plus TypeScript/frontend/Worker builds passed on 28 September. This documentation-only update does not claim a fresh application test run or deployment. Browser interaction QA was not completed in the previous release's unauthenticated browser session.

Live checks on 28 September returned passenger CHF 36.20 for Zürich HB–Bern and CHF 45.80 for Zürich HB–Laax on the documented 29 September departures. The Laax route combined services from different OJP responses. Later-bus and bus-only subtrip checks also passed. These are dated test observations, not standing tariffs. [Exact cases and limits](OJP_EXACT_TRIP_FARES_2026-09-28.md).

## Parking: evidence available for the next milestone

The 29 September public-feed audit found **1,608 BIKE facility records** and 1,269 CAR records, including nearby-border facilities. None of the bicycle records had current or forecast occupancy fields populated; 435 car records had current estimated occupancy. Bicycle operating-time structures were present in 570 records and pricing-model structures in 143, without establishing that those values are complete or semantically usable. [Audit](experiments/bike-parking-source-audit-2026-09-29.json).

**Proposal:** Make parking useful around the selected destination/station, retain official station coverage, and pilot municipal/OSM enrichment. Show a small shortlist with entrance/access evidence, conditions, known price and retrieval hours; do not invent free spaces or equate covered with secure. Details and acceptance cases are in [BIKE_PARKING.md](BIKE_PARKING.md).

## Next work and release discipline

1. **Parking:** audit a small pilot, normalise/deduplicate facilities and entrances, then deliver nearby search/cards and explicit route actions. Include basic mobile/keyboard usability in this feature.
2. **Bike services and useful stops:** reuse the place/source/card layer for shops, assisted DIY/professional repairs and pumps, then water, public toilets and snacks/vending in bounded releases. Include category filters, selected-ride position, checked detours and opening-at-visit evidence; visit duration must precede promised post-stop train connections.
3. **Broader interface:** simplify search, preferences, result comparison and the map/detail flow using the two completed features and short user-task tests.

Fix route/price/permission regressions when demonstrated; the unresolved Baden–Witikon search and bounded discovery remain tracked work. New amenities must load independently and must not consume the transit search budget. Keep each stage small, documented and independently reviewable; preserve completed test evidence between sessions.

## Later decisions and uncertainties

- An explicit **park the bicycle, then continue by public transport** mode would require passenger-only onward travel, parking-entry/exit conditions, parking cost, return/retrieval handling and access time. It is a separate proposal, not approved as a replacement for today's bicycle-accompanies-traveller mode.
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
