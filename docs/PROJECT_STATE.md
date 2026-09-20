# Project state

_Last consolidated: 2026-09-20._

## Current objective

**Decision:** Build and validate a focused bicycle + public-transport journey planner, initially in Switzerland.

The immediate milestone is not a polished app. It is a working set of real journeys where the system can combine cycling and public transport in a way a real cyclist would plausibly choose.

## Current product hypothesis

**Hypothesis:** People travelling with bicycles and public transport often need to combine several apps, websites and operator rules. A planner that integrates comfortable cycling access/egress with bicycle-compatible transit can materially reduce planning friction.

The bicycle should be treated as accompanying the traveller through the journey, not merely as a first/last-mile mode that is parked before transit.

## Current implementation

**Fact:** `prototype-v0/` now implements the user-approved Baseline/Extended mathematical experiment.

**Access:** The [private website](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site) is restricted to its owning ChatGPT account. The repository README links to it. [Website access and development](WEBSITE.md) explains how to open it from GitHub, run a local clone and republish; GitHub pushes do not automatically update the Site.

- **Baseline:** cycling before and after public transport, with ordinary transit/walking transfers.
- **Extended:** the same constraints and timetable graph, with at most one intermediate cycling leg; includes Baseline.
- A model switch appears before search results. A cycling-only reference estimate appears first, then transit categories select fastest, fewest boardings (including the first), and least cycling or walking. An optional fourth minimizes active time at the start or arrival. Duplicate winners share a card.
- Transit categories require public transport and obey explicit cycling, boarding and duration budgets. The cycling-only reference stays separate, even when it exceeds the transit journey's cycling budget. Exact timetable readiness is checked after cycling and before each boarding.
- Public-transport discovery includes buses and trams; selected stops are queried first, with independent outward catchment discovery in 20-minute bands used when initial queries return no feasible journey.
- Clicking a transit card opens every cycling, transit, walking and waiting leg. The map shows the selected route, a cycling-only comparison line, candidate/observed timetable stops and numbered boarding/alighting pins with available services, times and platforms. Pins match numbers in the plan. A toggle and Fit all stops control expose search coverage.
- The app displays the first usable proposals while alternatives load, reports incomplete searches and keeps proposals when stopped. Debounced address/stop suggestions preserve selected coordinates; the form needs only From, To and the model choice, with optional cycling presets.
- Departure defaults to Leave now, with an explicit Swiss date/time option. The arrival window is now 24 hours including waiting, so late-evening searches can retain next-morning services. Remaining station-pair slots prioritize rail candidates after the nearest pair; adjacent bus stops no longer consume the whole initial batch.
- Map click/tap sets start, finish or an intermediate stop; draggable A/B/V markers and named fields preserve exact coordinates. Up to four requested stops can be reordered/removed, and the route reversed. A separate stage-aware solver visits them in order with one global cycling/boarding/time budget. Baseline allows cycling at each requested stage's ends; Extended adds at most one automatic cycling transfer across the whole journey. Stopover time is zero. Two station pairs per stage share the existing 18-request limit; via searches do not add departure-board discovery.

The solver uses Pareto labels on a finite, sampled timetable graph. Walking contributes to active time during label pruning and ranking; cycling remains a separate constrained resource. The production planner now uses directed BRouter road routes and terrain-aware estimated times for all accepted cycling legs, including access, egress, required visits and automatic transfers. Missing routes are excluded, never replaced by geometric estimates. The independent cycling-only reference appears when its routed stages are ready. Profiles linked to the map show ascent/descent, steep/final climbs, infrastructure, surfaces and approximate posted-speed bands with explicit unknowns. This remains a sampled planner; bicycle carriage/reservation and platform access are unverified. See [CYCLING_ROUTES.md](CYCLING_ROUTES.md).

See [MATHEMATICAL_MODEL.md](MATHEMATICAL_MODEL.md) for equations, state, dominance, defaults, API limits and implementation boundaries, and [EXPERIMENTS.md](EXPERIMENTS.md) for verification.

## Current technical direction

- Responsive web prototype first.
- Preserve v0 before refactoring it.
- OpenStreetMap for road/cycling network and many cycling POIs.
- Swiss GTFS/open transport data for public-transport schedules.
- OpenTripPlanner as the first serious routing-engine candidate rather than writing the entire multimodal router from scratch.
- MapLibre is the likely serious map direction; v0 currently uses Leaflet.
- PostgreSQL/PostGIS when custom spatial storage/querying becomes useful.
- BRouter/SRTM elevation now supports route profiles; evaluate higher-resolution Swiss terrain and rider calibration later.
- Bicycle carriage rules likely need a separate structured subsystem because timetable data alone may be insufficient.

## Current routing model

**Decision (updated 2026-09-18):** Compare zero versus at most one intermediate cycling leg. Use the `(total time, cycling + walking time, boardings)` frontier and a small set of category winners, adding the selected endpoint's active time when requested. Preserve raw cycling and walking separately. The cycling-only estimate does not participate in transit-category dominance or the extra-time allowance. The earlier cycling-only objective is superseded; see the dated decision log.

**Fact:** This is implemented with shared constraints and paired searches over the same observed timetable graph. The live data adapter samples stops and departures; exact national optimality and globally minimal feasible catchments are not claimed.

**Open:** Whether the practical benefit of intermediate cycling justifies its extra discovery/search cost across representative real journeys. OpenTripPlanner remains the first production-engine candidate.

## Current cycling-comfort direction

A conceptual cycling edge cost is:

`cost = travel_time × road_factor × speed_factor × cycleway_factor × surface_factor × slope_factor`

Possible route profiles:

- Fast
- Balanced
- Comfortable
- Cargo bike (later)
- E-bike (later)

**Decision:** Do not call these routes objectively “safe” based only on map attributes. Prefer terms such as comfortable, low-stress or infrastructure-preferred.

## Current main risks

1. **Bicycle carriage data** — permission/reservation rules may not be machine-readable or uniform.
2. **Cycling route quality** — OSM completeness and the comfort model may be insufficient.
3. **Multimodal candidate generation** — station selection and transit access/egress need to be useful, not merely feasible.
4. **User demand** — the planning problem must be recurrent and painful enough to justify a dedicated product.
5. **Explainability** — users must understand why an apparently longer or less obvious journey is recommended.

## Geographic focus

**Decision:** Start small. Zurich and one surrounding corridor are good candidates (for example Zurich–Winterthur or Zurich–Zug). Do not start with national or European scope.

## Validation direction

Interview users about actual past journeys rather than asking whether they like the idea.

Previous heuristic targets:

- 15–20 interviews with bike + public-transport users.
- ~10 reporting a recent relevant planning problem.
- ~5 currently combining several apps/sites.
- ~5 willing to test a prototype.

For a pilot, repeat journey planning matters more than downloads or compliments.

## Immediate next actions

**2026-09-20 endpoint tolerance fix:** Selected start, finish, stop and station coordinates now allow up to 250 m to the routed path, replacing the restrictive 75 m cutoff. Original pins remain fixed; dotted connectors add walking time before timetable queries and solver feasibility. Routing-service failures now have a separate message. All 84 tests and the production build pass; a live Libingen → Libingen, Dorf route also succeeded. See [EXPERIMENTS.md](EXPERIMENTS.md).

**2026-09-20 cycling update:** Road routes and their durations now feed timetable queries and both solvers. The map-linked cycling profile and road-attribute breakdowns are implemented. Automated verification has 81 passing tests plus a successful TypeScript/production build. A real Renens–EPFL road response and a live multimodal check are documented in [EXPERIMENTS.md](EXPERIMENTS.md). Managed preview remains unavailable, so the new profile interactions still need desktop/mobile checking. Exact posted speed signs cannot be recovered from the current provider; bands and unknowns are explicit.

**2026-09-20 map update:** The map/ordered-stop implementation and future [app roadmap](APP_ROADMAP.md) are complete. The roadmap captures real cycling routes and profiles, repair and parking, bicycle rules, commuting/bikepacking/expert presets, comfort research and the later community vision. Only map selection and ordered stops are implemented in this update. Automated verification now has 69 passing tests; map dragging/touch still needs a browser check because the managed preview service was unavailable. Live naming fell back to coordinates in this environment; its successful response parsing and failure behavior are covered with controlled responses.

**2026-09-05 update:** The user has authorized implementation and app changes after the mathematical discussion. This supersedes the earlier pause on routing changes. The Baseline/Extended switch, categories, bounded graph solver and bus-inclusive discovery are implemented.

**Verification (2026-09-18):** 53 automated tests, TypeScript and the production build pass. New cases cover active-time pruning, cycling resource constraints, the cycling-only reference and boarding/alighting markers, including the recorded Zürich–Laax walking transfer. Desktop/mobile browser checks with controlled timetable data verify result order, stop popups, map controls, selection, failure fallback and responsive framing; marker collisions and mobile cropping found during inspection were fixed. See [EXPERIMENTS.md](EXPERIMENTS.md) for inputs and limits. Earlier 2026-09-05 live latency observations remain in that log; this change does not establish a new live performance result.

**Follow-up verification (2026-09-18):** The exact Libingen (Mosnang) → EPFL (Ecublens VD) case is recorded: a 23:20 search that previously returned no proposals produces three category winners after the fix. More cycling queries Rapperswil–Renens; Balanced excludes the 78-minute estimated access ride under its 60-minute per-end limit. All 58 tests and the production build pass. Browser preview was unavailable for the new departure control; live adapter and recorded regression checks are documented in the latest experiment entry.

1. Try both models on 3–6 fixed real journeys and judge whether the cycling comparison, active-time trade-offs and boarding/alighting map pins are useful.
2. Capture exact endpoints, departure times, returned legs, failures and search cost for those cases.
3. Compare the sampled prototype with OpenTripPlanner and complete Swiss timetable/street data.
4. Validate routed cycling times, final climbs and station entrances against real rides; obtain exact speed-limit/conditional-access attributes. Routing alone does not certify transfer feasibility.
5. Introduce bicycle carriage and reservation constraints after this mathematical experiment, as requested by the user.
6. Continue user interviews before major frontend investment.

## What is explicitly not a priority yet

- Native iOS/Android apps
- Ticket sales
- Europe-wide coverage
- Real-time disruptions
- Social/community features
- Carbon tracking
- Machine-learning personalization
- Full turn-by-turn navigation
- Perfect Pareto routing
- Microservices / production-scale infrastructure

## Updating this file

Keep this file short. When the project changes materially, update the relevant detailed doc and then refresh this summary. If an old assumption changes, record the change in `DECISIONS.md` rather than silently rewriting history.
