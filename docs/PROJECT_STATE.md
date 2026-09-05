# Project state

_Last consolidated: 2026-09-05._

## Current objective

**Decision:** Build and validate a focused bicycle + public-transport journey planner, initially in Switzerland.

The immediate milestone is not a polished app. It is a working set of real journeys where the system can combine cycling and public transport in a way a real cyclist would plausibly choose.

## Current product hypothesis

**Hypothesis:** People travelling with bicycles and public transport often need to combine several apps, websites and operator rules. A planner that integrates comfortable cycling access/egress with bicycle-compatible transit can materially reduce planning friction.

The bicycle should be treated as accompanying the traveller through the journey, not merely as a first/last-mile mode that is parked before transit.

## Current implementation

**Fact:** The first runnable web prototype is preserved under `prototype-v0/`.

It currently:

- geocodes Swiss origin and destination text;
- enumerates up to five candidate stations near each endpoint;
- approximates a 20-minute bicycle catchment using straight-line distance and 15 km/h;
- queries current public-transport connections for station pairs;
- ranks alternatives by estimated final arrival time;
- displays the candidates and selected combination on a map.

It does not yet use routed cycling paths, bicycle-carriage rules, an adaptive catchment, comfort scoring or multicriteria/Pareto selection. See `docs/FIRST_PROTOTYPE.md` for provenance and limitations.

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

## Current routing ideas

**Decision:** A simple generalized-cost model is acceptable for the prototype.

**Hypothesis:** The final problem is genuinely multi-objective, with trade-offs between total time, cycling time, comfort, transfers, elevation, waiting and bicycle-rule complexity. Pareto-efficient alternatives may eventually be better than a single weighted optimum.

**Open question:** How much of the multimodal search and candidate-station logic OpenTripPlanner already solves adequately.

**Open question:** How best to generate candidate stations when a fixed cycling radius yields no feasible bicycle-compatible transit journey.

A discussed fallback is adaptive station search: expand the cycling catchment until feasible journeys exist. This is not yet a final algorithmic decision.

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

1. Clone and run `prototype-v0/` in a fresh local environment.
2. Select 3–6 golden journeys and record current v0 behaviour in `docs/EXPERIMENTS.md`.
3. Separate journey generation, feasibility, route metrics, ranking and explanation in the code.
4. Implement and compare adaptive candidate-station strategies with an explicit maximum/fallback.
5. Audit OSM and Swiss transit data on the golden journeys.
6. Investigate bicycle-carriage and reservation data as a separate subsystem.
7. Compare the custom prototype direction with OpenTripPlanner before building a full router.
8. Conduct user interviews before major frontend investment.

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
