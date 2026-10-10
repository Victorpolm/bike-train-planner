# App roadmap: bicycle + public transport

**10 October preference corrections:** Commuter/Bikepacking hide the alternative selectors. Personalized now has At most/At least/No preference with presets and custom minutes. Extra categories groups independent endpoint choices, Reduce climbing and Gentler slopes; ordinary paths remain available. The minimum is enforced through search, edits and navigation. **566 JavaScript tests**, **13 Python tests**, 576 previous-release comparisons and 14 rendered panels pass. Browser/phone interaction remains unverified. [Behaviour and acceptance meaning](PREFERENCE_CONTROLS_2026-10-10.md).

**10 October facility implementation:** Up to five applied facility stops update the selected itinerary, map, checked time and transport-price eligibility while retaining fixed services. Parking now has destination/station/map-point suitability lists, arrival/collection hours and maximum-stay checks. Facility lists expose floors/directions and water coverage identifies cycling-section refill gaps. **552 JavaScript tests**, **13 Python tests**, 1,372 timing combinations and six rendered panels pass; browser/phone acceptance remains pending. [Behaviour, evidence and limits](FACILITY_STOPS_AND_CHOICES_2026-10-10.md).

**10 October GPS journey following — version 62:** Start/Stop now asks for phone location and follows cycling or mixed journeys with an accuracy circle, remaining path, manual stage/boarding controls, live connection estimates, explicit recalculation and optional screen wake lock. GPS updates do not rerun route searches. **488 tests**, builds, formatting and Knip pass; real-phone acceptance remains pending. [Behaviour, verification and limits](GPS_JOURNEY_FOLLOWING_2026-10-10.md).

**9 October realtime and speed — version 61:** Selected journeys show live OJP estimates, cancellations, platform changes and connection warnings, with visible-view refresh. Public map layers persist across reloads with background refresh. Cycling preferences share the same checked candidates, fixing the Fastest/Simplest inconsistency. Ranking reuse improves the recorded long-route benchmark by about 20%; **468 tests**, builds, formatting and Knip pass. A deployed Zürich–Bern check returned actual delay estimates. Phone/browser acceptance remains pending. [Implementation, live evidence and limits](REALTIME_AND_SPEED_2026-10-09.md).

**9 October review fixes — version 60:** Reservation evidence survives unrelated TripInfo notes; explicitly unknown dated requirements stay unknown. Missing platforms can use a labelled conservative station estimate. Permission/climbing help, comparison-window explanations, fare concurrency and experimental pace estimates are corrected. **452 tests in 11 suites**, TypeScript/frontend/Worker builds, formatting and Knip pass. At that release, the next priority was live updates; version 61 above implements them. [Fixes, release evidence and realtime plan](UPDATE_REVIEW_FIXES_2026-10-09.md).

**Earlier 9 October consolidation:** the [current next-steps checklist](NEXT_STEPS.md) distinguishes delivered version-59 features, immediate acceptance/reliability checks, remaining parking/useful-stop milestones and proposals. The agreed product order below is historical context; later owner instructions brought the implemented interface and objectives forward. The interface and transfer-ZIP branches are already merged.

**8 October objectives delivered:** version 58 implements the Commuter/Bikepacking objective sets, Personalized multi-select, fewer mandatory reservations, complete checked-price ranking and the boarding compromise. The subsequent version-59 adjustment uses 30 minutes per avoided boarding with a 25% overall ceiling and no fixed 30-minute cap. All pre-existing route, hill, endpoint and budget controls remain Preferences as requested. [Contract and current 441-test gate](JOURNEY_OBJECTIVES_2026-10-08.md). Earlier ideas for Discover, scenic/interesting-place routing, independent hill regrouping and custom cycling minimum/maximum remain separate proposals. Next validate the new choices on familiar trips; do not equate mapped traffic exposure with live traffic or scenic quality.

**7 October consolidation completed:** Interface/profile and ZIP branches merged on 6 October; version-53 application source is now synchronized to main. The general station-transfer lookup is delivered. Next: familiar-station desktop/phone acceptance, then scoped route/trip/calendar matching and a maintained feed refresh before 12 December 2026. [Evidence and remaining boundaries](STATION_TRANSFER_RUNTIME_2026-10-06.md).

**6 October clarification and proposal:** Add a multi-select Extra categories group with independent hill proposals and Discover compromises; retain current cycling presets and add Personalized minimum/maximum minutes. Investigate food loading with compact geographic batches. The controlled ranking omission and slow successful nationwide food response are documented; the owner’s exact phone/route failures are not yet reproduced. [Audit and implementation order](RESULTS_REVIEW_2026-10-06.md).

**3 October follow-up, proposed:** Merge Reduce climbing and Gentler slopes into Extra categories. Gentle slope settings should affect the additional proposal, with ordinary cycling candidates retained. The subsequent original-ZIP general-rule lookup is now delivered; complete route/trip/calendar-specific matching and maintain feed freshness before claiming complete coverage. [Data and acceptance plan](STATION_TRANSFER_DATA_2026-10-03.md).

_Updated 2026-10-09 (Europe/Zurich). The user's latest order supersedes the delivery orders recorded on 21/25 September. Proposed work is distinguished from implemented behaviour._

## Product direction

**Decision:** Help people travelling with their own bicycle in Switzerland compare a small set of useful complete journeys: a separate cycling-only reference and requested objective winners. Commuter defaults to earliest arrival/latest departure, fewer boardings with a time compromise and least cycling; Bikepacking substitutes less mapped traffic exposure for least cycling. Personalized adds fewer mandatory bicycle reservations and lowest complete checked price. One journey can satisfy several categories. Missing alternatives need an explanation, not a fabricated result.

**Current implementation:** The route/terrain/carriage features and exact-trip fare integration are summarised in [PROJECT_STATE.md](PROJECT_STATE.md). Official and Swiss OSM parking share equipment colours, the map icon/filter, an adjustable selected-journey corridor (100 m default) and closest-to-start within the eligible set. Water and toilets now share those map/closest/corridor features, with potability/access uncertainty preserved; [version-36 evidence](WATER_AND_TOILETS_2026-09-29.md). Version 37 adds Repairs and Food, service subtypes, numbered marker groups, closest-from-A and shared 100 m / 500 m / 1 km route proximity (100 m default). Quick food and optional dining use separate cached feeds; closures, broken equipment and uncertain services remain explicit. [Repair/food implementation and checks](REPAIRS_AND_FOOD_2026-09-29.md). Suitability lists and entrance/floor evidence display are implemented on 10 October; physical entrance verification and custody-aware parking remain separate.

**Hypothesis:** Combining reliable journey planning with useful parking/repair information will reduce the need to switch between apps. Validate this with actual tasks; map-pin counts alone are not success.

**29 September follow-up brainstorming:** The owner repeatedly needs drinking water, snacks/vending, public toilets, good parking and repair help on long rides. Treat these five categories as the next product's useful-stop scope. Their proposed data model, filters, route association and staged delivery are in [CYCLING_AMENITIES.md](CYCLING_AMENITIES.md). All five useful-stop categories now have map filters and basic route association. Cycling-section detour previews with an editable visit duration and fixed-service timing checks are delivered in version 41. Evaluated opening, verified entrances, Apply/save stop insertion and road-safety classification remain later work.

**Review follow-up, implemented 30 September:** automatic detour framing and keyboard map selection simplify the controls. Permission cache/alias fixes, timetable extraction, conservative cleanup and automated offline verification are delivered. [Accepted/rejected review items and MOTIS pilot](REVIEW_IMPLEMENTATION_2026-09-30.md). Next: check the interaction on desktop/mobile, then resume facility precision. The engine pilot is not a migration.

## Interface milestone — implemented 2 October, merged 6 October

The owner authorised the revised interface and local profiles on `feature/novice-interface-profiles`. Profiles are independent of trip presets; all existing model/access/pace/fare/category choices remain accessible. Phone views keep the same mounted map and planner. Single-total cards and persistent ? explanations simplify inspection without hiding required bicycle conditions. [Implemented controls, evidence and manual acceptance](INTERFACE_PROFILES_2026-10-02.md).

The header profile/compact route follow-up now provides independent UI components and central layout settings; see the [editing guide](INTERFACE_EDITING.md). An owner-only visual layout preview/editor is a possible separate follow-up, not implemented. The branch is merged. Next: complete desktop/phone and keyboard acceptance, then continue facility precision. Past-date entry and real next-departure search are implemented on 3 October ([evidence](SEARCH_RELIABILITY_2026-10-03.md)); historical timetable completeness and additional SBB fare products remain separate work; foreground GPS following is now implemented, with phone acceptance pending; do not add cosmetic buttons or change the current endpoint category into a bicycle-availability constraint. Cross-device profile accounts remain optional future work.

<a id="route-editing-and-climbing--proposed-3-october"></a>
## Route editing and climbing — implemented, 3 October

The owner subsequently approved implementation, requested a better cycling editor and a user-selectable uphill percentage, and explicitly asked for transit-assisted climbing optimization. The previous proposal is now delivered on `feature/novice-interface-profiles`:

| Option | Delivered behaviour | Remaining limit |
|---|---|---|
| Edit cycling path | Ordered clickable/draggable points, section selection, automatic preview, Apply, Undo/reset and Restore | Keep selected services; reject missed connections or budget violations; no persistent saved route or facility visit duration |
| Gentler slopes | User-set 1–20% preference, default 6%, with 0–60 extra minutes per cycling section | Soft preference; short steep ramps may be missed and routes can still exceed it |
| Offer a Reduce climbing alternative | Optional Reduce climbing category, lower-climb station-pair/exit acquisition, original three ranking functions retained | Within 60 extra journey minutes and the same bicycle-access/cycling constraints; unknown elevation cannot win |

**360 regression cases pass** after the station-time follow-up. The global Less climbing preference and Climbing heading are removed; help is adjacent to Cycling hills. Scoped OJP access/interchange times are integrated. Complete station/platform coverage and bicycle-accessible pathways remain future work. [Current evidence](STATION_TIMES_2026-10-03.md). Earlier version-49 observation: A real Zürich HB–Zoo test found 3 m of cycling ascent with tram 6 versus 207 m cycling-only. The gentler 5% route still contained sampled grades around 10.2%, illustrating why the percentage is not a hard guarantee. [Controls, architecture, live evidence and remaining work](HILLS_AND_CYCLING_EDITOR_2026-10-03.md).

Next: desktop/phone/keyboard acceptance of point editing, then a small fixed hilly-route pilot. Facility-stop Apply with visit duration, saved journeys and finer slope validation remain separate. The **What does Extended add?** question mark remains beside **Journey options**.

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

**Colours and route filtering delivered in version 34:** The owner requested visibly less-preferred wall loops and parking along the selected journey. Three equipment colours retain unknowns (other and unknown share grey after the version-35 refinement); square P markers distinguish parking from hollow-circle explored stops; the default-on filter uses about 100 m around real cycling paths and known walking paths/endpoints/stops, excluding transit lines and other journey alternatives. Closest still ranks from A within that scope. Next: test the band on familiar trips, then improve entrance/access evidence and municipal coverage. [Behaviour, ten new regressions and release](PARKING_COLOURS_AND_ROUTE_2026-09-29.md).

The optional layer retains the official combined bicycle/car feed, filtering BIKE facilities. The 29 September audit confirms 1,608 official bicycle records and **no populated bicycle occupancy feed**; OSM adds 20,728 imported records in the dated check. Do not sum these into a verified distinct-facility total. A mapped location and nominal capacity do not establish a free space.

**Proposed scope after the small trial:** Find appropriate parking where the user is going or near a station they select. Respect the selected bicycle-on-transit setting; beginning/end-only passenger travel and its walking endpoint are already implemented. Keep parking optional and the core search form short. The delivered closest-to-start action already works without running a route search.

Deliver in three bounded pieces:

1. **Data and pilot:** inspect approximately 20 facilities, using the proposed Zürich/Winterthur/Bern/Chur sample and adding or substituting Biel/Bienne cases for municipal coverage comparison. Include different entrances and non-station destinations. Retain official records, audit municipal sources and OSM, and create a reviewed source/field/duplicate/entrance list. The sample size and towns are a proposed starting point.
2. **Useful choice:** list the nearest suitable options with named features, opening/retrieval conditions, fee evidence, source/review date and unknowns. Use an initial shortlist of three with Show more; test the limit with users. Support map/list selection, clustering, loading/error states and accessibility.
3. **Explicit journey action:** offer Show access and, where supported, Use as destination or Add as stop. Route to a documented entrance; replan when a user changes the journey. Preserve the original destination as context and label any final walking segment with its real bicycle-state limitations. Never silently leave the bicycle before an onward transit/cycling leg.

Detailed source rules, ranking, duration/retrieval handling and acceptance scenarios: [BIKE_PARKING.md](BIKE_PARKING.md).

**Delivered boundary and later work:** beginning/end-only already supports passenger-only transit and walking on the opposite end. A full parking-facility workflow still needs an explicitly selected rack, locking/access time, applicable fees, return/retrieval and any explicitly chosen second bicycle/rental. Displaying parking near stations does not implement those requirements.

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

Offer Nearby and Along selected route, with distance initially and a routed detour for shortlisted choices. Evaluate opening at estimated arrival where hours are usable. Unknown hours remain visible separately from confirmed-open results. Preview the affected cycling section first, preserving the selected public-transport services. Add as stop must be explicit; a future Apply action must validate time/cycling budgets and update cards. Search alternative timetables only on an explicit request when the fixed connection does not fit. A repair visit has an unknown duration until the user supplies one; do not promise the next train using today's zero-stopover assumption. Do not assume a rider with a broken bike can cycle the detour; until pushing routes are supported, provide location/contact and label access limitations.

**Initial referencing delivered:** Repairs/Food and the five-category map controls are implemented. [Repair/food implementation and checks](REPAIRS_AND_FOOD_2026-09-29.md). The broader service/access pilot and routing work below remain open.

**Proposed pilot gate:** review roughly 20 varied records across the same pilot areas, including closed/unknown-hours records, a repair-only service, a stand and a pump. Check duplicate handling and safe links. First release provides referencing and contact/handoff, not bookings or emergency assistance guarantees.

Extend the same model to **water, public toilets and snacks/vending** before treating the broad interface milestone as complete. Initial repair/pump, water/WC and food layers are delivered; richer visit handling remains open. The broader mixed-amenity pilot is proposed at roughly 30 reviewed records; include the repair cases above rather than treating each sample target as an additional mandatory workload. VELOVE and Züri rollt are classification examples, not assumed partners.

Provide five independent filters and Along this ride / In this map area choices. Derive route proximity from actual cycling legs, then check shortlisted entrance detours; a pin beside a train line or across a river is not automatically an accessible stop. Display extra travel separately from visit duration. Evaluate drinking-water evidence, seasonal shutdowns, public/customer access and hours over the expected visit. Do not infer ready-to-eat food or stock from every vending/retail object.

Current OSM raster basemap symbols cannot be individually hidden by our overlay filters. Evaluate a quieter basemap or controllable style as a bounded interface improvement. Keep attribution, roads, access restrictions and route context. The [detailed plan](CYCLING_AMENITIES.md) covers sources, caching, duplicates, missing data and acceptance cases.

## 30 September implementation and remaining precision work

**Earlier user instruction:** implement Graubünden, SBB and swissTLM3D; do not focus further on ETH. The three adapters are delivered with independent source states, explicit unknowns, ten pilot stations and a small rural-water pilot. Version 40 serves TLM from a compact dated edition index after runtime archive extraction timed out on the hosted Site. The source check returned 8 rural water records, 255 SBB toilet/food records and 601 optional TLM candidates; these are not unique or field-verified facility counts. [Implementation, tests and complete outstanding-work audit](FACILITY_SOURCES_2026-09-30.md).

**Latest user request, delivered in version 41:** stable, scrollable facility details and a cycling-only detour preview through a clicked facility. The preview keeps section endpoints, required stops and chosen public transport fixed, includes an editable visit duration and checks the next connection with walking and the boarding buffer. Original cards and prices remain unchanged. [Behaviour and checks](FACILITY_DETOURS_2026-09-30.md).

**Updated 10 October:** refill gaps, supported weekly hours, Add as stop with budget validation, up to five visits and destination/station/map-point parking lists are implemented. Still missing: physically verified entrances, complex/holiday schedule evaluation, a reviewed correction workflow, saved journeys and GPS-based facility ranking. Journey GPS following and the broader interface are implemented; their acceptance and facility-flow refinements remain pending. Ten-station feed integration does not complete field curation or indoor navigation. Wider SBB publication/redistribution terms remain a separate gate. The historical first steps below are retained for context.

**Later 30 September priority refinement:** The owner prioritises precision over more records, especially dependable water where alternatives are scarce. Within useful-stop work, start with a small rural-water pilot, then improve floors/entrances in large buildings. Measure whether people can find and use the facility, not marker counts. [Research, successful SBB indoor API checks, rural source gaps and bounded next steps](FACILITY_PRECISION_2026-09-30.md). The eight-location rural source pilot and ten-station feeds are now implemented; further field review, wider search beyond the existing choices and along-route gap information remain proposals.

**User report, 2026-09-30:** The missing Selecta machines in ETH Hauptgebäude (HG) are on **floor F, next to the Starbucks coffee machines**. The owner previously reported at least two machines. This is a user-reported building/floor/landmark location, not an independently surveyed machine coordinate. Exact positions, entrance, access conditions and hours remain unknown. A fresh bounded all-vending query around HG on 30 September returned ticket and newspaper machines, but no food/drink machines; this establishes a gap in the source response, not proof that no such machines exist.

**User scope preference:** Limit detailed indoor station localisation initially to about the ten biggest stations; avoid maintaining a separate integration for every municipality. This started as brainstorming. The owner then approved the bounded first implementation on 30 September; the remaining source expansion and larger station pilot below are proposals.

**First step delivered in version 38:** retain/display location fields, support reviewed additions, add the HG report at building-level precision, and enrich the existing Zürich HB Hygienecenter records with floor/zone/plan information. [Implementation and limits](FACILITY_LOCATIONS_2026-09-30.md). [Catalogue/API investigation](OPENDATA_SWISS_2026-09-30.md): read-only lookup script, observed HTTP 403 limitation, planned API replacement, and a verified single SBB publisher feed linking 63 station plans. At that release only Zürich HB received indoor enrichment; the subsequent three-source release adds ten station feeds with provider floors/directions, without field verification.

**Recommended approach:**

1. **Keep Swiss OSM as the national base.** Preserve and display available floor labels, building/location descriptions and access details across all places, including small stations. Before version 38, the amenity parser retained `indoor` but dropped `level` and `level:ref`; this loss is now fixed. Unknown floor stays unknown. Limited station curation does not imply that other stations have only one level.
2. **Add a small, reviewed corrections/additions file.** Use one shared format for water, toilets, food and repairs. It can hold reports such as HG without building a municipal connector or a community platform. Record a stable local ID, category, building, displayed floor label, landmark description, source, report/review dates, access uncertainty and location precision. Do not invent separate exact pins for two machines known only to share a floor/landmark. Later resolve records against OSM identities to avoid permanent duplicates.
3. **Validate the ten pilot stations now connected.** Zürich HB, Bern, Basel SBB, Lausanne, Genève, Luzern, Winterthur, St. Gallen, Olten and Lugano have provider floor/direction/plan evidence. Review ambiguous floors, components and entrances in a bounded sample; keep indoor turn-by-turn routing deferred. No further ETH work is prioritised.
4. **Add extra official sources selectively.** Start with at most one optional source pilot after the first two steps. Assess how many missing usable facilities or useful fields it adds, freshness, reuse terms and continuing maintenance. Prefer national/cantonal/operator coverage when a suitable feed exists. Use a shared importer and source-specific field mapping where feasible; common CSV/GeoJSON formats do not guarantee common meanings. Municipal checks are optional enrichment, not a national rollout prerequisite.
5. **Use reports to target the next gap.** Begin with a lightweight “missing place / wrong floor / closed” reporting route and review entries before promotion. Consider contributing suitable verified observations back to OSM so national refreshes benefit. Build richer reporting/moderation only if report volume justifies it.

**Merge and display rules:** Preserve source-specific evidence; newer or official data is not automatically correct for every field. Compare identity, category, building and floor as well as distance. Do not merge distinct facilities on different floors. Distinguish a building/address point from an entrance or an exact machine/toilet position. Keep closure/access conflicts explicit, and do not turn straight-line distance into a walking-time claim.

**First bounded implementation delivered:** location fields, the reviewed-additions format, the HG user report at its supported precision, and the Zürich HB floor/zone/plan example are in version 38. A city-by-city audit, complete ten-station curation and full indoor navigation remain outside this release. The owner subsequently approved the three-source integration. Next validate rural access/seasonality and a small station sample, rather than extending the ETH example.

**Source discovery checked 30 September:** [opendata.swiss API documentation](https://handbook.opendata.swiss/de/content/nutzen/api-nutzen.html) describes a central metadata catalogue with publisher download/access links; it does not host or standardise all underlying facility datasets. [SBB station-plan catalogue](https://opendata.swiss/de/dataset/haltestelle-karte-trafimage1) provides station-plan references. [Zürich HB plan](https://company.sbb.ch/content/dam/infrastruktur/trafimage/bahnhofplaene/plan-zuerich-hb-a4.pdf) includes floor/zone/grid information. These support discovery and plan links; they do not establish a complete nationwide indoor-facility API.

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

- **Two automatic cycling transfers — implemented and merged:** Baseline 0 / Extended up to 2, two-round discovery, and beginning-only/end-only hard constraints now share the existing budgets. Next measure live route quality, runtime and truncation with a small fixed Swiss pilot; address walking access is delivered; per-block fare aggregation across cycling breaks remains separate work. [Scope, regressions and limits](MULTIPLE_CYCLING_TRANSFERS.md).

- **Later road safety:** investigate crossings/signals, turning manoeuvres, physical separation, documented lower speed limits and pedestrian access. Review official injury-crash data with exposure, age and geometry limitations. Existing lower-traffic-stress summaries remain heuristics; no “every turn is dangerous” rule or guaranteed-safe route. See [CYCLING_SAFETY_RESEARCH.md](CYCLING_SAFETY_RESEARCH.md).

- **Route acquisition and engine comparison:** diagnose missed useful routes (including Baden–Witikon) and evaluate the four-versus-eight station-pair trade-off with fixed date/input cases, bounded requests and checkpoints. A local MOTIS 2.11.3 permission/stop-via pilot is complete: strict and unrestricted cases match, but postfiltering loses the middle-scope winner. Next evaluate pre-routing three-state permission handling, intermediate cycling, four coordinate stops and category completeness; national performance remains unmeasured. [Pilot and evidence](REVIEW_IMPLEMENTATION_2026-09-30.md#motis-pilot-result).
- **Station access:** distinguish a facility centroid, an entrance and a connected platform path; verify stairs/lifts/ramps and realistic bicycle transfer times.
- **National timetable pilot:** validate performance, headways, calendars, pathways and disruption handling before production activation. Data availability alone is not a complete routing product; resolve hosting/costs before adopting new infrastructure.
- **Cycling and comfort:** calibrate riding/pushing/carrying timing and preserve source coverage. Retain lower-traffic-stress explanations; do not claim measured accident risk or objective safety.
- **Carriage and fares:** maintain dated operator/service evidence, exact itinerary coverage and unknowns. Live remaining bicycle spaces, reservation availability and transaction/booking integration remain deferred.

## Longer-term product options

| Option | Requirements before delivery |
|---|---|
| Further Commuter features | The preset, arrive-by and cycling cap are delivered; repeated trips and further transfer-reliability validation remain |
| Further Bikepacking features | The preset and mapped traffic objective are delivered; daily budgets, loaded-bike suitability, timed stages and optional overnight stops remain |
| Further Personalized controls | Objective selection is delivered; custom minimum/maximum cycling time and Discover remain design items |
| Gentle final kilometres | Specify distance, gradient tolerance and positive ascent; net elevation alone can hide a climb |
| Panoramic preference | Sourced definition, eligible services and an explicit detour allowance |
| Rentals/park-and-ride | Explicit bicycle custody, pickup/return, availability/return rules and costs; a separate travel mode |
| Saved journeys/community | Refresh stale timetable/rule data; decide visibility, privacy, moderation and reporting first |

Cargo/trailer suitability, battery-aware e-bike planning, navigation export, international expansion and monetisation remain backlog items. No native app, broad social product, ticket sales or new paid hosting is implied by this roadmap.

## How to keep delivery manageable

For each bounded piece, state the expected behaviour and failure cases, implement it, verify those cases, record the result and next open item, then move to the next piece. Keep documentation and implementation in the same reviewed change when coding starts. Save long experiments incrementally and report partial results honestly; do not let a large random test run become the only release gate.

## 8 October interface delivery and preset brainstorming

**Delivered:** Plan / Map / Journey on phone; desktop Map / Journey switch; critical bicycle conditions and CFF/SBB links retained on cards; explicit departure-to-arrival duration and separate origin waiting. [Implementation and remaining browser acceptance checks](JOURNEY_VIEW_AND_TIMING_2026-10-08.md).

**Earlier proposal (subsequently implemented in part; see the current update above):** Commuter keeps cycling only, fastest, a boarding/time compromise and least cycling; Bikepacking requests cycling only, fastest, a boarding/time compromise and an interesting-place/low-traffic-stress alternative; Personalized chooses the displayed objective alternatives. The later owner authorization replaces this earlier hold for the specified objective subset. A scenic alternative needs reviewed place evidence and route generation through optional visits; the existing lower-stress path preference is not that capability. [Latest owner proposal, assumptions and experiment](PERSONALIZED_OBJECTIVES_PROPOSAL_2026-10-08.md).

