# App roadmap: bicycle + public transport

_Updated 2026-09-29. The user's latest order supersedes the delivery orders recorded on 21/25 September. Proposed work is distinguished from implemented behaviour._

## Product direction

**Decision:** Help people travelling with their own bicycle in Switzerland compare a small set of useful complete journeys: cycling only, fastest transit journey, fewest boardings, and least cycling/walking within the stated time allowance. One journey can satisfy several categories. Missing alternatives need an explanation, not a fabricated result.

**Current implementation:** The route/terrain/carriage features and exact-trip fare integration are summarised in [PROJECT_STATE.md](PROJECT_STATE.md). Official and Swiss OSM parking share equipment colours, the map icon/filter, a 100 m selected-journey corridor and closest-to-start within the eligible set. Structured bike-shop referencing and the richer suitability/entrance experience below are not delivered.

**Hypothesis:** Combining reliable journey planning with useful parking/repair information will reduce the need to switch between apps. Validate this with actual tasks; map-pin counts alone are not success.

**29 September follow-up brainstorming:** The owner repeatedly needs drinking water, snacks/vending, public toilets, good parking and repair help on long rides. Treat these five categories as the next product's useful-stop scope. Their proposed data model, filters, route association and staged delivery are in [CYCLING_AMENITIES.md](CYCLING_AMENITIES.md). Parking colours and basic route association are now delivered; other amenity categories and road-safety classification remain later work.

## Agreed ordering and proposed milestones

The ordering below records the user's request. Scope, pilot locations, numerical targets and interface details are recommendations to test, not claims of prior user approval or delivery.

| Order | Milestone | First useful result | Completion check |
|---|---|---|---|
| 1 | Bike parking | Suitable parking near the destination, selected station or chosen map point, with a short list and clear conditions | Pilot locations verified; relevant facilities found; sources/unknowns visible; entrance/access routing and missing-data cases handled |
| 2 | Bike services and useful stops | Repair/shop/pump referencing plus drinking water, toilets and snacks/vending, released by category | Correct services/access, category filters, position along the selected ride, known hours/contact, explained detour and visit duration before explicit Add as stop |
| 3 | Broader user interface | A simpler search → compare → inspect → act flow on mobile and desktop | Users can plan, understand bicycle conditions/prices, find parking and add a repair stop without hidden parameters or losing their selected journey |

**Recommendation:** Deliver each feature's basic interaction and accessibility within that feature, then make the broader interface pass third. Do not postpone essential parking/shop usability until the redesign.

**Reliability throughout:** Reproduced routing, price or bicycle-permission regressions take priority when they block these tasks. Keep the bounded-search limitations visible; parking/shop requests must neither delay initial journey proposals nor consume their provider budget. A complete engine migration is not a prerequisite for the parking pilot.

## 1. Bike parking

**First trial delivered in version 31:** Following the user's later 29 September request, begin with the Bike parking icon and Find closest parking relative to starting point A. Rank the loaded facilities by straight-line distance, highlight/refocus the result and update when A changes. GPS is deferred. This small approved trial precedes the more ambitious pilot below; it does not claim that the full milestone's completion criteria are met. [Implementation and verification](PARKING_FIRST_TRIAL_2026-09-29.md).

**Coverage extension delivered in version 32:** The owner reported missing ETH racks and approved OSM integration. Swiss OSM points, ways and relations now participate in the map and closest search. Sources, access, mapped rack type, cover, fee and hours are retained; identity-based deduplication preserves unresolved overlaps. Both ETH campuses are regression cases. [Evidence and limits](PARKING_OSM_2026-09-29.md).

**Colours and route filtering delivered in version 34:** The owner requested visibly less-preferred wall loops and parking along the selected journey. Four equipment colours retain unknowns; the default-on filter uses about 100 m around real cycling paths and known walking paths/endpoints/stops, excluding transit lines and other journey alternatives. Closest still ranks from A within that scope. Next: test the band on familiar trips, then improve entrance/access evidence and municipal coverage. [Behaviour, ten new regressions and release](PARKING_COLOURS_AND_ROUTE_2026-09-29.md).

The optional layer retains the official combined bicycle/car feed, filtering BIKE facilities. The 29 September audit confirms 1,608 official bicycle records and **no populated bicycle occupancy feed**; OSM adds 20,728 imported records in the dated check. Do not sum these into a verified distinct-facility total. A mapped location and nominal capacity do not establish a free space.

**Proposed scope after the small trial:** Find appropriate parking where the user is going or near a station they select. Retain the bicycle on all current transit legs. Keep parking optional and the core search form short. The delivered closest-to-start action already works without running a route search.

Deliver in three bounded pieces:

1. **Data and pilot:** inspect approximately 20 facilities, using the proposed Zürich/Winterthur/Bern/Chur sample and adding or substituting Biel/Bienne cases for municipal coverage comparison. Include different entrances and non-station destinations. Retain official records, audit municipal sources and OSM, and create a reviewed source/field/duplicate/entrance list. The sample size and towns are a proposed starting point.
2. **Useful choice:** list the nearest suitable options with named features, opening/retrieval conditions, fee evidence, source/review date and unknowns. Use an initial shortlist of three with Show more; test the limit with users. Support map/list selection, clustering, loading/error states and accessibility.
3. **Explicit journey action:** offer Show access and, where supported, Use as destination or Add as stop. Route to a documented entrance; replan when a user changes the journey. Preserve the original destination as context and label any final walking segment with its real bicycle-state limitations. Never silently leave the bicycle before an onward transit/cycling leg.

Detailed source rules, ranking, duration/retrieval handling and acceptance scenarios: [BIKE_PARKING.md](BIKE_PARKING.md).

**Later, separate decision:** a bicycle-parking + passenger-only transit mode. It must model the stored bicycle, onboarding/locking/walking time, applicable fees, return/retrieval and a second bicycle/rental only when explicitly selected. Displaying parking near stations does not implement this mode.

## 2. Bike services and useful stops

Build on the same facility identity, provenance, map/list and detour components used by parking. Begin with public mapped listings and link to the business/operator for current details; no partnership, payment or booking is implied.

Keep the following distinct:

| Type | Information useful to the traveller | Required uncertainty handling |
|---|---|---|
| Bicycle shop | Name, address, website/contact, known hours and supported services | A bicycle shop is not automatically a repair workshop |
| Staffed repair service | Repair evidence, contact, hours, access and any stated appointment conditions | Open does not mean a mechanic is available immediately |
| Self-service repair stand | Tools, stand, maintenance evidence and access | A mapped stand is not evidence that every tool works |
| Assisted DIY workshop | Public sessions, tools, guidance, parts/fees and membership conditions | Volunteer/member access is not unrestricted public access; assistance is different from a mechanic performing the repair |
| Pump | Location, access and known valve compatibility | Do not label every compressed-air device bicycle-compatible |

OSM starting points are `shop=bicycle`, documented bicycle-service tags and `amenity=bicycle_repair_station`; source links are in [DATA_SOURCES.md](DATA_SOURCES.md). Treat station-provided pumps/repairs as services of an existing facility where appropriate, rather than duplicate businesses.

Offer Nearby and Along selected route, with distance initially and a routed detour for shortlisted choices. Evaluate opening at estimated arrival where hours are usable. Unknown hours remain visible separately from confirmed-open results. Add as stop is explicit; replan the timetable after insertion. A repair visit has an unknown duration until the user supplies one; do not promise the next train using today's zero-stopover assumption. Do not assume a rider with a broken bike can cycle the detour; until pushing routes are supported, provide location/contact and label access limitations.

**Proposed pilot gate:** review roughly 20 varied records across the same pilot areas, including closed/unknown-hours records, a repair-only service, a stand and a pump. Check duplicate handling and safe links. First release provides referencing and contact/handoff, not bookings or emergency assistance guarantees.

Extend the same model to **water, public toilets and snacks/vending** before treating the broad interface milestone as complete. Deliver repair/pump, water/WC and food categories in small releases. The broader mixed-amenity pilot is proposed at roughly 30 reviewed records; include the repair cases above rather than treating each sample target as an additional mandatory workload. VELOVE and Züri rollt are classification examples, not assumed partners.

Provide five independent filters and Along this ride / In this map area choices. Derive route proximity from actual cycling legs, then check shortlisted entrance detours; a pin beside a train line or across a river is not automatically an accessible stop. Display extra travel separately from visit duration. Evaluate drinking-water evidence, seasonal shutdowns, public/customer access and hours over the expected visit. Do not infer ready-to-eat food or stock from every vending/retail object.

Current OSM raster basemap symbols cannot be individually hidden by our overlay filters. Evaluate a quieter basemap or controllable style as a bounded interface improvement. Keep attribution, roads, access restrictions and route context. The [detailed plan](CYCLING_AMENITIES.md) covers sources, caching, duplicates, missing data and acceptance cases.

## 3. Broader interface work

Use observations from the first two milestones to redesign the journey flow. Focus on:

- A short initial form: start, destination, departure; keep bicycle-access choice understandable and advanced constraints behind a clearly labelled control.
- A small set of distinct proposals, explaining extra minutes, cycling effort, boardings and uncertainties. Keep passenger, bicycle and reservation amounts separate.
- A stable map/list/detail relationship; selecting parking or a shop must not lose the selected journey or reset inputs.
- Contextual useful-stop actions and category filters; avoid showing every map layer at once or turning amenities into mandatory planning parameters.
- Responsive layout, keyboard/touch use, readable text, non-colour-only status, useful empty/loading/error/partial-result states and cancellation.

**Proposed validation:** five task-based user sessions on mobile and desktop, covering one complete planning task, fare/permission interpretation, parking selection and adding a repair stop. Record completion, mistakes, confusion and time; fix blocking issues before cosmetic polish. This is a proposed pilot, not statistical proof.

Include long-ride tasks: find drinking water, a public toilet and a food stop reachable when needed; distinguish assisted DIY from professional repair and frame-locking parking from wheel-only support. A blank map must explain source/coverage limits.

Baseline/Extended remain available for the current mathematical experiment. Moving that comparison into advanced controls is a later interface decision, not a change made by this documentation update.

## Technical work retained after these priorities

- **Later road safety:** investigate crossings/signals, turning manoeuvres, physical separation, documented lower speed limits and pedestrian access. Review official injury-crash data with exposure, age and geometry limitations. Existing lower-traffic-stress summaries remain heuristics; no “every turn is dangerous” rule or guaranteed-safe route. See [CYCLING_SAFETY_RESEARCH.md](CYCLING_SAFETY_RESEARCH.md).

- **Route acquisition and engine comparison:** diagnose missed useful routes (including Baden–Witikon) and evaluate the four-versus-eight station-pair trade-off with fixed date/input cases, bounded requests and checkpoints. Benchmark a configured established engine against bicycle accompaniment, intermediate cycling, ordered stops and category alternatives before deciding on migration.
- **Station access:** distinguish a facility centroid, an entrance and a connected platform path; verify stairs/lifts/ramps and realistic bicycle transfer times.
- **National timetable pilot:** validate performance, headways, calendars, pathways and disruption handling before production activation. Data availability alone is not a complete routing product; resolve hosting/costs before adopting new infrastructure.
- **Cycling and comfort:** calibrate riding/pushing/carrying timing and preserve source coverage. Retain lower-traffic-stress explanations; do not claim measured accident risk or objective safety.
- **Carriage and fares:** maintain dated operator/service evidence, exact itinerary coverage and unknowns. Live remaining bicycle spaces, reservation availability and transaction/booking integration remain deferred.

## Longer-term product options

| Option | Requirements before delivery |
|---|---|
| Commuting preset | Arrive-by, repeated trips, robust transfers and an understandable cycling/effort cap |
| Bikepacking preset | Longer/daily budgets, surfaces, loaded-bike suitability, ordered stages, stopover duration and optional overnight stops |
| Expert controls | Expose supported constraints/objectives on the same engine; define detour limits and distinguish hard requirements from preferences |
| Gentle final kilometres | Specify distance, gradient tolerance and positive ascent; net elevation alone can hide a climb |
| Panoramic preference | Sourced definition, eligible services and an explicit detour allowance |
| Rentals/park-and-ride | Explicit bicycle custody, pickup/return, availability/return rules and costs; a separate travel mode |
| Saved journeys/community | Refresh stale timetable/rule data; decide visibility, privacy, moderation and reporting first |

Cargo/trailer suitability, battery-aware e-bike planning, navigation export, international expansion and monetisation remain backlog items. No native app, broad social product, ticket sales or new paid hosting is implied by this roadmap.

## How to keep delivery manageable

For each bounded piece, state the expected behaviour and failure cases, implement it, verify those cases, record the result and next open item, then move to the next piece. Keep documentation and implementation in the same reviewed change when coding starts. Save long experiments incrementally and report partial results honestly; do not let a large random test run become the only release gate.
