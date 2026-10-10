# Re.route — Bike + Train Journey Planner

**10 October speed and scale review — version 64:** Guarded caches, reusable label resources and compatible transfer keys reduce the 32-station hydrated Extended CPU benchmark from **8.93 s to 2.49 s**, with identical full results. OJP now bounds outstanding work, coalesces requests and handles cancellation/deadlines explicitly. **515 JavaScript tests**, **13 Python tests** and **576 baseline comparisons** pass. Real-phone, full live-search timings and global quota enforcement remain separate. [Evidence and limits](docs/SPEED_AND_SCALE_2026-10-10.md).

**10 October name update — version 63:** The app is now **Re.route**, with the name in its header, accessible home link, browser/application metadata and Site listing. The website address, repository, saved profiles and map caches retain their identity. All **488 tests** and TypeScript/frontend/Worker builds pass; browser/phone visual acceptance remains pending.

**10 October GPS journey following — version 62:** Start/Stop now asks for phone location and follows cycling or mixed journeys with an accuracy circle, remaining path, manual stage/boarding controls, live connection estimates, explicit recalculation and optional screen wake lock. GPS updates do not rerun route searches. **488 tests**, builds, formatting and Knip pass; real-phone acceptance remains pending. [Behaviour, verification and limits](docs/GPS_JOURNEY_FOLLOWING_2026-10-10.md).

**9 October realtime and speed — version 61:** Selected journeys show live OJP estimates, cancellations, platform changes and connection warnings, with visible-view refresh. Public map layers persist across reloads with background refresh. Cycling preferences share the same checked candidates, fixing the Fastest/Simplest inconsistency. Ranking reuse improves the recorded long-route benchmark by about 20%; **468 tests**, builds, formatting and Knip pass. A deployed Zürich–Bern check returned actual delay estimates. Phone/browser acceptance remains pending. [Implementation, live evidence and limits](docs/REALTIME_AND_SPEED_2026-10-09.md).

**9 October review fixes — version 60:** Reservation evidence survives unrelated TripInfo notes; explicitly unknown dated requirements stay unknown. Missing platforms can use a labelled conservative station estimate. Permission/climbing help, comparison-window explanations, fare concurrency and experimental pace estimates are corrected. **452 tests in 11 suites**, TypeScript/frontend/Worker builds, formatting and Knip pass. At that release, the next priority was live updates; version 61 above implements them. [Fixes, release evidence and realtime plan](docs/UPDATE_REVIEW_FIXES_2026-10-09.md).

**Earlier 9 October synchronization:** GitHub contains all 237 application files from published version 59, and the [implementation CI run](https://github.com/Victorpolm/bike-train-planner/actions/runs/37849560615) passed. The [current next-steps checklist](docs/NEXT_STEPS.md) separates pending acceptance, remaining milestones and design proposals. This is a documentation consolidation; the application remains version 59.

**8 October objective implementation:** Commuter compares earliest arrival/latest departure, fewer boardings and least cycling. Bikepacking replaces least cycling with less mapped traffic exposure. Personalized can select these plus fewer mandatory bicycle reservations and lowest complete checked price. Existing controls remain Preferences; cycling only remains a separate reference. After the owner's follow-up, the boarding compromise uses 30 minutes per avoided boarding within 25% of the reference time, without a fixed 30-minute cap. **441 regressions** and production builds pass. [Behaviour, verification and limitations](docs/JOURNEY_OBJECTIVES_2026-10-08.md).

**8 October Journey view and timing:** Phones now have **Plan / Map / Journey**; desktop keeps results beside a **Map / Journey** switch. Bicycle requirements and full prices live in Journey, with mandatory actions, permission, prices and CFF/SBB links still visible on cards. Cards distinguish a checked later origin departure, journey duration and time before leaving. Earliest-arrival ranking is preserved. **418 regressions** and production builds pass; browser/phone QA remains pending. [Implementation and timing contract](docs/JOURNEY_VIEW_AND_TIMING_2026-10-08.md). At that earlier release, the objective redesign was [brainstorming](docs/PERSONALIZED_OBJECTIVES_PROPOSAL_2026-10-08.md); the subsequently authorized subset is delivered in the objective update above. Scenic routing remains a proposal.

**7 October walking and fares:** “Only at the beginning” now cycles to transit and walks to the destination; “Only at the end” starts on foot and cycles after transit. A bicycle-on-transit checkbox controls both service eligibility and bicycle charges. Pedestrian routes have a separate 30-minute allowance per section, adjustable from 0 to 60. Available city passenger prices stay visible when bicycle prices are incomplete. **409 regressions**, formatting, Knip and production builds pass. [Behaviour, live checks and limits](docs/WALKING_ENDPOINTS_AND_CITY_FARES_2026-10-07.md).

**7 October follow-up:** Compact departure/arrival controls keep a clock reset beside the time. Historical searches in both directions are regression-tested. Simplest now compares a road-oriented bicycle candidate and counts actual turning decisions: the checked ETH HG–Stadelhofen example uses Rämistrasse and improves from 1.774 km / 16 turns to 1.551 km / 11 turns. [Implementation, fixtures and limits](docs/SIMPLE_ROUTES_AND_TIME_CONTROLS_2026-10-07.md).

**7 October implementation:** **Arrive at** finds the latest checked feasible departure, including final cycling and platform allowances. **Reduce climbing** now requires worthwhile absolute and relative ascent savings within a limited time cost; near-flat gains do not create an extra suggestion. **388 regressions**, formatting, Knip and production builds pass. [Behaviour, pilot defaults and limits](docs/ARRIVAL_AND_CLIMBING_2026-10-07.md).

**7 October consolidation:** Both branches are merged into `main`, and the deployed station-transfer implementation is now included here. The planner uses 109,116 general platform-transfer minimums from the supplied SBB ZIP, behind exact dated OJP evidence. [Implementation, provenance and checks](docs/STATION_TRANSFER_RUNTIME_2026-10-06.md).

**4 October cycling preference fix:** **Less · up to 40 min total** now lets you share those minutes freely between cycling sections, for example 30 at the start and 5 at the end. The total remains binding, including ordered stops. **363 regressions pass.** [Behaviour and checks](docs/EXPERIMENTS.md#2026-10-04--less-cycling-shares-one-total-time-budget).

**3 October station-time and climbing update:** **Reduce climbing** is an optional journey proposition alongside the main categories. The global ascent preference and Climbing heading are removed; help sits beside **Cycling hills**, with the adjustable gentle-slope preference retained. OJP station-access and connection-specific transfer times now govern boarding, with explicit fallbacks when evidence is missing. Cycling editing keeps fixed services and fare evidence. **360 regressions pass.** [Behaviour, public sources, live checks and limits](docs/STATION_TIMES_2026-10-03.md).

**3 October reliability update:** Compact OJP requests fix rejected searches and preserve exact city-fare evidence. Extended gets bounded transfer-discovery work; endpoint checks retry a larger candidate pool. Clickable ? help and functional **More · later departures** are delivered, with past-date entry restored. **327 regressions pass** and live ZVV/Libero fares and Extended/later-departure checks succeeded. [Changes, evidence and limits](docs/SEARCH_RELIABILITY_2026-10-03.md).

A Switzerland-first planner combining cycling, walking and public transport, with an explicit choice to take the bicycle on board or leave it at a station. It compares a small set of useful journeys and makes bicycle conditions, effort, prices and uncertainty understandable.

## Current state — 10 October 2026

**Interface/profile implementation (merged 6 October):** `feature/novice-interface-profiles` adds optional device-local traveller profiles behind a compact header icon, modular interface sections, Commuter/Bikepacking/Personalized presets, a simpler desktop form, phone Planning / Map views, compact prices and expandable explanations. Baseline now allows 0 automatic cycling connections and Extended up to 2, with beginning-only/end-only restrictions in Preferences. [Routing changes and limits](docs/MULTIPLE_CYCLING_TRANSFERS.md). All existing planner choices remain accessible. **363 offline tests pass.** [Controls, verification, manual checks and remaining work](docs/INTERFACE_PROFILES_2026-10-02.md). [How to edit the modular interface](docs/INTERFACE_EDITING.md).

The app supports Baseline/Extended planning, ordered stops, named places, configurable cycling pace, terrain/profile information and three public-transport bicycle-access scopes. Passenger, bicycle-ticket and reservation costs are separate. OJP fare requests now reuse the exact retained trip or assemble its selected service/walking legs.

A **Bike parking** icon toggles official **and OpenStreetMap** parking, including local racks around ETH Zürich. Square **P** markers distinguish wheel-only equipment (red, including wall loops), preferred stands, bollards and handlebar holders (green), and other or unknown rack types (shared grey). Explored stops are small hollow circles; the closest parking is a larger outlined P. **Along selected journey** defaults on after selecting a result, showing parking within the selected 100 m / 500 m / 1 km distance (100 m default) of its cycling paths and known walking paths/endpoints and stops. Uncheck it to show all parking. **Find closest parking** ranks the eligible records relative to starting point A, with clearly labelled straight-line distance. Sources and access restrictions remain visible; colours are not a security guarantee. No journey search is required for the all-parking view. Journey GPS following is available through Start. GPS-based facility ranking, entrance routing and municipal imports remain later work. [Colour/filter behaviour and checks](docs/PARKING_COLOURS_AND_ROUTE_2026-09-29.md). The national timetable/street-routing engine remains a local pilot; route searches are bounded and can miss alternatives.

**Water** and **Toilets** now have independent map filters, distinctive water-drop/WC symbols, the shared selected-journey corridor and closest-from-A buttons. Popups preserve potability/access/fee/hours/seasonal details and unknowns. Closest water excludes unconfirmed/non-drinking sources; both new closest searches exclude explicit restrictions. [Implementation, source counts and limits](docs/WATER_AND_TOILETS_2026-09-29.md).

**Repairs** and **Food** now have independent filters, service subtypes, closest-from-A and grouped map markers. Food starts with quick stops; cafés and restaurants are optional and load separately. All five categories share adjustable route proximity. [Implementation and limits](docs/REPAIRS_AND_FOOD_2026-09-29.md).

**Three added sources:** eight rural drinking-water listings from Graubünden Tourism / Flims Laax Falera; SBB toilets and food with floors/directions at ten pilot stations; optional grey swissTLM3D fountains/springs with **unknown drinkability**, excluded from closest drinking water. Independent loading/retry and source dates keep partial coverage visible. No new ETH-specific work. [Implementation and remaining-work audit](docs/FACILITY_SOURCES_2026-09-30.md).

**Earlier facility locations:** popups retain mapped floors and directions. A small reviewed inventory adds the owner-reported ETH HG Selecta machines (floor F, beside the Starbucks machines; approximate building location) and enriches existing Zürich HB Hygienecenter records with an official plan. [Behaviour and checks](docs/FACILITY_LOCATIONS_2026-09-30.md). [opendata.swiss investigation and lookup tool](docs/OPENDATA_SWISS_2026-09-30.md) records catalogue access limits, the upcoming API replacement and a successful national SBB plan-link feed.

**Approved review changes implemented:** detours frame automatically; the two redundant map buttons are removed with keyboard location selection retained. Shared operator normalization, mutation-aware bicycle-permission caching, extracted timetable code, conservative cleanup, automatic offline CI and React formatting are in place. **300 tests and production builds pass.** A local MOTIS comparison found a middle-permission-scope gap; there is no engine migration. [Changes, rejected suggestions and evidence](docs/REVIEW_IMPLEMENTATION_2026-09-30.md).

**Last verified release:** Owner-private **version 63** published on **10 October 2026 at 12:37:50 UTC** (14:37:50 Europe/Zurich), environment revision **3**, from Site source `36ee02bb319083bd6ccde70d7855b0b102ea5e0c`. The app is named **Re.route**. **488 tests in 11 suites** and TypeScript/frontend/Worker builds pass; generated metadata and the server-rendered header were checked. Browser/phone acceptance remains pending.

[Current project state](docs/PROJECT_STATE.md) · [Website/release details](docs/WEBSITE.md) · [Experiments and remaining gaps](docs/EXPERIMENTS.md)

## Next priorities

**Immediate checks:** finish phone/desktop acceptance of the delivered interface and objectives, reproduce the reported route and food-loading failures, and fix demonstrated blockers. See the [current checklist and status](docs/NEXT_STEPS.md). The remaining product milestones retain the order below.

1. **Bike parking:** try the delivered colours, adjustable journey filter and closest-to-start action, then improve coverage and entrance/access information. Destination/station recommendations and GPS-based parking ranking remain later additions; Start already follows journeys using phone location.
2. **Bike services and useful stops:** prioritise rural refill precision: access/seasonality evidence, distance along the ride to the next supported refill point, checked entrances/detours, then opening at arrival. Use the new timed detour preview; an explicit Apply/save action still needs search-budget checks before updating the journey. [Audited gaps and acceptance checks](docs/FACILITY_SOURCES_2026-09-30.md#what-the-roadmap-still-promises-but-the-app-does-not-yet-implement).
3. **User interface:** the requested redesign and objective controls are delivered. Complete their phone/desktop acceptance, then refine parking and useful-stop interactions from observed problems.

[Roadmap and completion criteria](docs/APP_ROADMAP.md) · [Concrete bike-parking proposal](docs/BIKE_PARKING.md) · [Useful stops: brainstorming and data plan](docs/CYCLING_AMENITIES.md)

The 29 September follow-up records the owner's long-ride needs. OSM parking, water, toilets, repairs and food are integrated; municipal enrichment, broader equipment/protection choices and verified entrances remain proposed additions; a cycling-section detour preview is now available. [Road-safety research](docs/CYCLING_SAFETY_RESEARCH.md) follows later: investigate infrastructure and junction manoeuvres without treating every signal or turn as inherently dangerous.

The fresh official-feed audit contains 1,608 bicycle facilities but no bicycle occupancy observations or forecasts. The parking milestone therefore concerns suitability and access; capacity is not a free-space count. [Dated audit](docs/experiments/bike-parking-source-audit-2026-09-29.json).

## Open the private website

[**Open the journey planner**](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site)

Sign in with the ChatGPT account that owns the Site. The website remains owner-private; this GitHub repository is public. GitHub source updates and website publication are separate. Personal GPX data and secrets are not committed. New hosting spend requires the owner's approval.

The default keeps the bicycle on public transport. Beginning/end-only can instead leave it at the first boarding station or use one already at the last alighting station, with walking at the opposite end. Specific parking racks, availability, parking duration/cost and later retrieval remain unimplemented; their requirements are tracked in the roadmap.

## Repository as project memory

This repository is the authoritative source for both code and accumulated project knowledge. ChatGPT/Codex sessions should read the documentation before making substantial product, architecture, routing or research recommendations.

### Read in this order

1. [`docs/PROJECT_STATE.md`](docs/PROJECT_STATE.md) — where the project stands now.
2. [`docs/PRODUCT.md`](docs/PRODUCT.md) — problem, users, MVP, validation and scope.
3. [`docs/INITIAL_MATHEMATICAL_MODEL.md`](docs/INITIAL_MATHEMATICAL_MODEL.md) — the original graph/optimization formulation, fixed-radius failure mode, adaptive-radius idea, and early Pareto concerns.
4. [`docs/ROUTING.md`](docs/ROUTING.md) — current graph formulation, station search, comfort model and multi-objective direction.
5. [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) — OSM, Swiss transport data, bicycle rules, elevation and data risks.
6. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — prototype architecture and engineering principles.
7. [`docs/FIRST_PROTOTYPE.md`](docs/FIRST_PROTOTYPE.md) — provenance, limitations and preservation of the first runnable implementation.
8. [`docs/DECISIONS.md`](docs/DECISIONS.md) — important decisions and their rationale.
9. [`docs/RESEARCH_LOG.md`](docs/RESEARCH_LOG.md) — accumulated research questions and findings.
10. [`docs/USER_RESEARCH.md`](docs/USER_RESEARCH.md) — interview and validation plan.
11. [`docs/EXPERIMENTS.md`](docs/EXPERIMENTS.md) — technical/product experiments and regression journeys.
12. [`docs/BACKLOG.md`](docs/BACKLOG.md) — later ideas that are intentionally not current priorities.
13. [`CHATGPT_PROJECT_SETTING.md`](CHATGPT_PROJECT_SETTING.md) — stable instruction block to paste into a dedicated ChatGPT Project.
14. [`docs/CHATGPT_PROJECT_SETUP.md`](docs/CHATGPT_PROJECT_SETUP.md) — exact setup and working routine for that Project.
15. [`AGENTS.md`](AGENTS.md) — repository rules for coding agents.

For the next product milestone, also read [`docs/APP_ROADMAP.md`](docs/APP_ROADMAP.md) and [`docs/BIKE_PARKING.md`](docs/BIKE_PARKING.md).

## Runnable prototype

The runnable prototype is in [`prototype-v0/`](prototype-v0/).

```bash
cd prototype-v0
npm install
npm run dev
```

It compares Baseline (cycling before/after transit) and Extended (up to two automatic cycling connections). Results show a clearly labelled cycling-only reference first, followed by the selected objective winners: earliest arrival/latest departure, fewer boardings with a time compromise, least cycling, less mapped traffic exposure, fewer mandatory bicycle reservations or lowest complete checked price. Presets choose defaults; Personalized supports multiple objectives. Walking remains separately visible and constrained. Cards open full journey plans; the map shows explored stops and numbered boarding/alighting points with timetable details. Address suggestions and optional cycling presets simplify input. Cycling follows mapped roads, with an elevation profile linked to the map and surface/infrastructure breakdowns. Routed durations determine reachable trains. The cycling comparison and transit proposals appear progressively as their required paths are checked and survive cancellation once available. See [the result and map design](docs/RESULTS_AND_MAP.md), [the implemented mathematical model](docs/MATHEMATICAL_MODEL.md), the prototype README and `docs/EXPERIMENTS.md`. The sampled prototype is not the final routing architecture.

Departure defaults to Leave now, with an optional Swiss date/time. A 24-hour arrival window includes overnight waiting. Initial connection queries now cover feasible rail access as well as the nearest stops; the recorded Libingen–EPFL failure and its repair are in [the experiment log](docs/EXPERIMENTS.md).

Click/tap the map for **Start here**, **Finish here** or **Add intermediate stop**, then drag markers to adjust them. Up to four intermediate stops can be searched, reordered or removed; Reverse route reverses their order too. Routes visit every requested stop in order under one shared cycling/boarding/time budget. Naming keeps the exact clicked coordinates; coordinates remain usable if no nearby name is found. Stopover time is not added yet.

## Documentation semantics

Use explicit status labels:

- **Fact** — supported by a reliable source or direct observation.
- **Decision** — a deliberate current choice, with rationale.
- **Hypothesis** — plausible but not established.
- **Open question** — unresolved and potentially decision-changing.
- **Parked / rejected** — considered but intentionally not active.

Do not let repeated hypotheses silently become facts.

## Current strategic principle

The immediate objective is not to build the perfect multimodal routing engine. It is to determine whether available Swiss data and existing routing infrastructure can produce genuinely useful bicycle + public-transport journeys for real users.

