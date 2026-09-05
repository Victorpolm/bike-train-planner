# Project state

_Last consolidated: 2026-09-05._

## Current objective

**Decision:** Build and validate a focused bicycle + public-transport journey planner, initially in Switzerland.

The immediate milestone is not a polished app. It is a working set of real journeys where the system can combine cycling and public transport in a way a real cyclist would plausibly choose.

## Current product hypothesis

**Hypothesis:** People travelling with bicycles and public transport often need to combine several apps, websites and operator rules. A planner that integrates comfortable cycling access/egress with bicycle-compatible transit can materially reduce planning friction.

The bicycle should be treated as accompanying the traveller through the journey, not merely as a first/last-mile mode that is parked before transit.

## Current implementation

**Fact:** `prototype-v0/` now implements the user-approved Baseline/Extended mathematical experiment.

- **Baseline:** cycling before and after public transport, with ordinary transit/walking transfers.
- **Extended:** the same constraints and timetable graph, with at most one intermediate cycling leg; includes Baseline.
- A model switch appears before search results. Three categories select fastest, least cycling and fewest changes; an optional fourth minimizes initial or final cycling. Duplicate winners share a card.
- All proposals require public transport and obey explicit cycling, boarding and duration budgets. Exact timetable readiness is checked after cycling and before each boarding.
- Public-transport discovery includes buses and trams; departure and arrival catchments expand independently in 20-minute bands within configurable limits.
- Clicking a card opens every cycling, transit, walking and waiting leg with available service IDs, stops, scheduled times and platforms. The map includes intermediate cycling.
- The app reports partial searches and supports cancellation. Address lookup falls back to timetable stop-name lookup.

The solver uses Pareto labels on a finite, sampled timetable graph. It is not a complete Swiss routing engine. Cycling is still estimated from straight-line distance at 15 km/h. For this experiment, bicycle availability after transit is assumed and carriage/reservation constraints are explicitly deferred.

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

**Decision (2026-09-05):** Implement and compare zero versus at most one intermediate cycling leg. Use the `(total time, total cycling, boardings)` frontier and a small set of category winners. Preserve endpoint cycling separately for optional preferences.

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

**Verification:** 35 automated tests pass, including exhaustive comparison of 54 toy-graph/budget/model configurations and a recorded Zürich HB → Chur → Laax train/walk/bus journey. TypeScript and production build pass. A live Zürich HB–Laax search returned category proposals in both models, with explicit warnings because upstream requests timed out. See the experiment log for its exact departure time, results and limits. Browser interaction is not tested.

1. Try both models on 3–6 fixed real journeys and judge whether category trade-offs are useful.
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
