# Project state

_Last consolidated: 2026-09-18._

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

The solver uses Pareto labels on a finite, sampled timetable graph. Walking now contributes to active time during label pruning and ranking; cycling remains a separate constrained resource. It is not a complete Swiss routing engine. Cycling, including the cycling-only comparison, is still estimated from straight-line distance at 15 km/h. The comparison is published before timetable acquisition and remains available after service failures. For this experiment, bicycle availability after transit is assumed and carriage/reservation constraints are explicitly deferred.

See [MATHEMATICAL_MODEL.md](MATHEMATICAL_MODEL.md) for equations, state, dominance, defaults, API limits and implementation boundaries, and [EXPERIMENTS.md](EXPERIMENTS.md) for verification.

## Current technical direction

- Responsive web prototype first.
- Preserve v0 before refactoring it.
- OpenStreetMap for road/cycling network and many cycling POIs.
- Swiss GTFS/open transport data for public-transport schedules.
- OpenTripPlanner as the first serious routing-engine candidate rather than writing the entire multimodal router from scratch.
- MapLibre is the likely serious map direction; v0 currently uses Leaflet.
- PostgreSQL/PostGIS when custom spatial storage/querying becomes useful.
- Swiss elevation data later for slope-aware routing.
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

**2026-09-05 update:** The user has authorized implementation and app changes after the mathematical discussion. This supersedes the earlier pause on routing changes. The Baseline/Extended switch, categories, bounded graph solver and bus-inclusive discovery are implemented.

**Verification (2026-09-18):** 53 automated tests, TypeScript and the production build pass. New cases cover active-time pruning, cycling resource constraints, the cycling-only reference and boarding/alighting markers, including the recorded Zürich–Laax walking transfer. Desktop/mobile browser checks with controlled timetable data verify result order, stop popups, map controls, selection, failure fallback and responsive framing; marker collisions and mobile cropping found during inspection were fixed. See [EXPERIMENTS.md](EXPERIMENTS.md) for inputs and limits. Earlier 2026-09-05 live latency observations remain in that log; this change does not establish a new live performance result.

**Follow-up verification (2026-09-18):** The exact Libingen (Mosnang) → EPFL (Ecublens VD) case is recorded: a 23:20 search that previously returned no proposals produces three category winners after the fix. More cycling queries Rapperswil–Renens; Balanced excludes the 78-minute estimated access ride under its 60-minute per-end limit. All 58 tests and the production build pass. Browser preview was unavailable for the new departure control; live adapter and recorded regression checks are documented in the latest experiment entry.

1. Try both models on 3–6 fixed real journeys and judge whether the cycling comparison, active-time trade-offs and boarding/alighting map pins are useful.
2. Capture exact endpoints, departure times, returned legs, failures and search cost for those cases.
3. Compare the sampled prototype with OpenTripPlanner and complete Swiss timetable/street data.
4. Replace straight-line cycling with routed cycling before claiming practical transfer feasibility.
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
