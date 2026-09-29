# Bike + Train Journey Planner

A Switzerland-first planner for travelling with your bicycle, combining road-routed cycling and public transport. It compares a small set of useful journeys and makes bicycle conditions, effort, prices and uncertainty understandable.

## Current state — 29 September 2026

The app supports Baseline/Extended planning, ordered stops, named places, configurable cycling pace, terrain/profile information and three public-transport bicycle-access scopes. Passenger, bicycle-ticket and reservation costs are separate. OJP fare requests now reuse the exact retained trip or assemble its selected service/walking legs.

A **Bike parking** icon toggles official **and OpenStreetMap** parking, including local racks around ETH Zürich. Dots distinguish wheel-only equipment (red, including wall loops), frame-support stands (green), other mapped types (blue) and unknown rack types (grey). **Along selected journey** defaults on after selecting a result, showing parking within about 100 m of its cycling paths and known walking paths/endpoints and stops. Uncheck it to show all parking. **Find closest parking** ranks the eligible records relative to starting point A, with clearly labelled straight-line distance. Sources and access restrictions remain visible; colours are not a security guarantee. No journey search is required for the all-parking view. GPS, entrance routing, municipal imports and broader amenities remain later work. [Colour/filter behaviour and checks](docs/PARKING_COLOURS_AND_ROUTE_2026-09-29.md). The national timetable/street-routing engine remains a local pilot; route searches are bounded and can miss alternatives.

**Last verified release:** owner-private **version 34**, published 29 September 2026; 230 application tests and frontend/Worker production builds passed. [Parking colours and selected-journey filtering](docs/PARKING_COLOURS_AND_ROUTE_2026-09-29.md) include ETH equipment and route-geometry regressions; browser interaction QA remains unavailable. The earlier [loading correction](docs/PARKING_LOADING_2026-09-29.md) retains specific sign-in/network/data errors. Earlier [exact-trip fare evidence](docs/OJP_EXACT_TRIP_FARES_2026-09-28.md) records Zürich–Bern/Laax and modified-trip checks; OJP prices remain test estimates.

[Current project state](docs/PROJECT_STATE.md) · [Website/release details](docs/WEBSITE.md) · [Experiments and remaining gaps](docs/EXPERIMENTS.md)

## Next priorities

1. **Bike parking:** try the delivered colours, 100 m journey filter and closest-to-start action, then improve coverage and entrance/access information. Destination/station recommendations and an explicit GPS option remain later additions.
2. **Bike services and useful stops:** distinguish shops, assisted DIY/professional repairs and pumps; add drinking water, public toilets and snacks/vending, with category filters and useful options along the selected cycling route.
3. **User interface:** simplify search, comparison and map/details after the first two features, while including each feature's essential usability from the start.

[Roadmap and completion criteria](docs/APP_ROADMAP.md) · [Concrete bike-parking proposal](docs/BIKE_PARKING.md) · [Useful stops: brainstorming and data plan](docs/CYCLING_AMENITIES.md)

The 29 September follow-up records the owner's long-ride needs. OSM parking is now integrated; municipal enrichment, broader equipment/protection choices, other amenities and actual route detours remain proposed additions. [Road-safety research](docs/CYCLING_SAFETY_RESEARCH.md) follows later: investigate infrastructure and junction manoeuvres without treating every signal or turn as inherently dangerous.

The fresh official-feed audit contains 1,608 bicycle facilities but no bicycle occupancy observations or forecasts. The parking milestone therefore concerns suitability and access; capacity is not a free-space count. [Dated audit](docs/experiments/bike-parking-source-audit-2026-09-29.json).

## Open the private website

[**Open the journey planner**](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site)

Sign in with the ChatGPT account that owns the Site. The website remains owner-private; this GitHub repository is public. GitHub source updates and website publication are separate. Personal GPX data and secrets are not committed. New hosting spend requires the owner's approval.

The bicycle currently stays with the traveller on transit. A future **park the bicycle, then continue by public transport** option would be a separate routing mode with explicit retrieval and cost handling. It is a proposal, not current behaviour.

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

It compares Baseline (cycling before/after transit) and Extended (at most one intermediate cycling leg). Results show a clearly labelled cycling-only estimate first, followed by fastest transit, fewest boardings and least cycling-or-walking alternatives. Cards open full journey plans; the map shows explored stops and numbered boarding/alighting points with timetable details. Address suggestions and optional cycling presets simplify input. Cycling follows mapped roads, with an elevation profile linked to the map and surface/infrastructure breakdowns. Routed durations determine reachable trains. The cycling comparison and transit proposals appear progressively as their required paths are checked and survive cancellation once available. See [the result and map design](docs/RESULTS_AND_MAP.md), [the implemented mathematical model](docs/MATHEMATICAL_MODEL.md), the prototype README and `docs/EXPERIMENTS.md`. The sampled prototype is not the final routing architecture.

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
