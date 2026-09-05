# Decisions

This file records important project choices. Do not silently rewrite old decisions when the project changes; add a new dated entry explaining the change.

## 2026-08 — Focus on bike + public transport, not a generic cycling super-app

**Decision:** The core product is a journey planner for travelling with a bicycle and public transport. Broader cycling POIs and map layers are supporting features.

**Reason:** A generic “everything for cycling” product is too broad and risks obscuring the strongest user problem.

## 2026-08 — Start with Switzerland / Zurich-area pilot

**Decision:** Begin with Zurich and one nearby corridor rather than national or European coverage.

**Reason:** Data quality, bicycle rules and routing quality need deep local validation before geographic expansion.

## 2026-08 — Use an existing routing engine initially

**Decision:** Investigate and use OpenTripPlanner first rather than implementing a complete multimodal routing engine from scratch.

**Reason:** OTP already combines OSM and GTFS and supports bicycle/transit modes; custom development should target genuine gaps.

**Reconsider if:** OTP cannot expose or customize the bike-on-transit, station selection, comfort or rule behavior needed for the product.

## 2026-08 — Web prototype first

**Decision:** Build a responsive web app before native iOS/Android apps.

**Reason:** Faster iteration and adequate for validation.

## 2026-08 — Comfort, not “safety” claims

**Decision:** Use language such as comfortable, low-stress or infrastructure-preferred. Avoid claiming objective safety from map data alone.

**Reason:** Infrastructure attributes do not justify a general safety guarantee.

## 2026-08 — Scalar cost is acceptable for the MVP, but preserve objectives

**Decision:** A generalized scalar cost may be used for initial routing/ranking, but individual attributes such as time, comfort, transfers and elevation must remain separately available.

**Reason:** This allows a simple prototype without blocking later multicriteria/Pareto routing.

## 2026-08 — Pareto routing is a direction, not an MVP requirement

**Hypothesis/Direction:** A mature product may benefit from multi-objective routing because users face genuine trade-offs.

**Decision:** Do not implement a sophisticated Pareto engine until user evidence shows those trade-offs materially affect route choice.

## 2026-08 — Fixed station radius is insufficient as a general rule

**Observation:** A fixed cycling catchment can return no feasible journey even when cycling farther reaches a usable train.

**Direction:** Investigate adaptive or transit-aware candidate-station generation.

**Not yet decided:** Exact algorithm (radius expansion, nearest-station ordering, isochrones, OTP access/egress, RAPTOR variants, etc.).

## 2026-08 — Treat bicycle rules as a separate data subsystem

**Decision:** Do not assume timetable data alone can fully express bicycle carriage and reservations.

**Reason:** Rules may depend on operator, service, vehicle, season, reservations and other conditions.

## 2026-08 — Ticket sales are not an early priority

**Decision:** Explain bicycle tickets/reservations where possible, but do not prioritize integrated purchasing in early versions.

## 2026-08 — Repeat use is the key product signal

**Decision:** For pilots, prioritize repeat journey planning and routes users would actually take over downloads, map views or positive comments.

## 2026-09-05 — Explain journeys before revisiting the routing model

**User instruction / decision:** First make each result open its bike → transit sections → bike decomposition. Discuss the user's mathematical model afterwards, before changing station selection or ranking.

**Evidence / open question:** The user reports no result for Zürich → Laax. At the start of this change, the hosted application matched the current GitHub implementation, which still used a fixed five-kilometre catchment and rail-only connection requests. The exact cause of that failed search remains unverified.

## Template for future changes

### YYYY-MM-DD — Decision title

**Old view:**

**New evidence:**

**Decision / updated view:**

**Reason:**

**Reconsider if:**