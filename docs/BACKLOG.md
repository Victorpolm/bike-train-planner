# Backlog

**Current next step (21 September):** Build a server-side OJP adapter, validate per-service/segment bicycle evidence and recompute routed cycling access before selecting reachable departures. The configured Actions secret and all 16 live benchmark requests succeeded; OJP's positive bicycle notes remain incomplete across whole journeys. See [the live findings](OJP_BENCHMARK_2026-09-21.md) and [evaluation plan](BICYCLE_PERMISSION_AND_OJP.md). The static website has not migrated to OJP.

These ideas may be useful later, but they should not distract from validating the core bike + public-transport journey planner.

## Later product features

- realtime disruption handling
- GPX export
- weather-aware planning
- crowdsourced infrastructure corrections
- secure bicycle-parking availability
- train composition and bicycle-coach location
- cargo-bike routing
- family/trailer routing
- e-bike battery-aware routing
- international rail
- integrated ticket purchase
- personalized comfort profiles
- saved journeys / commute alerts

## Later infrastructure ideas

- more sophisticated station-transfer graph
- full Pareto routing engine
- adaptive user preference learning
- routing speed-up / preprocessing techniques
- dedicated rule-ingestion pipeline for operators
- crowdsourced data-quality workflow

## Parked for now

- native iOS app
- native Android app
- social network/community layer
- gamification
- carbon scoreboard
- broad “everything for cyclists” map
- Europe-wide launch before Swiss validation

## Rule

A backlog item should become active only when it either:

1. reduces a major uncertainty,
2. enables a meaningful user test,
3. fixes a demonstrated failure mode, or
4. materially improves route usefulness for validated users.
