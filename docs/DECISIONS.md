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


## 2026-09-05 — Compare zero versus at most one intermediate cycling leg

**Decision (explicit user agreement):** The next mathematical experiment compares (A) cycling only before and after transit with (B) the same model allowing at most one intermediate cycling leg between transit rides. B includes A; an intermediate cycling leg is permitted, not compulsory. Ordinary transit changes may occur in either variant.

**Reason / hypothesis:** Intermediate cycling may connect useful services and improve arrival time or other trade-offs, but its practical benefit relative to search cost is not yet established.

**Scope:** This approves the experiment direction. It does not select an implementation algorithm, numerical budgets, or a deployment change. A proposed comparison protocol and remaining parameters are in `EXPERIMENTS.md`.


## 2026-09-05 — Implement the model and category-based application

**New authorization:** After agreeing to the zero-versus-one-intermediate-leg experiment, the user explicitly requested implementation, a Baseline/Extended control before results, category proposals and documentation on GitHub.

**Decision:** Implement a bounded multi-label timetable graph over the existing live data adapter. Include buses/trams in both models; preserve Baseline within Extended; keep initial, intermediate and final cycling budgets separate and also enforce their shared sum. Fewest changes requires public transport and the same cycling limits.

**Presentation:** Three main categories (fastest, least cycling, fewest changes), optional fourth for shorter initial or final cycling. Merge duplicate winners. Apply a configurable extra-time allowance to category display, independently of the common absolute horizon.

**Experiment defaults:** 15 km/h estimated cycling, 60 minutes per endpoint, 20 minutes intermediate cycling, 90 minutes cumulative cycling, four boardings, eight-hour horizon and three minutes before each boarding. These are configurable implementation defaults, not validated behavioral preferences.

**Catchments:** Expand the endpoints independently in 20-minute bands up to their hard bounds. Scan those bands rather than asserting that a sampled first feasible pair is the globally minimal radius. API stop/service caps remain explicit.

**Deferred:** Bicycle carriage and reservation constraints, at the user's request. Bicycle availability after transit is an idealization, not an allowed-carriage state. Routed cycling and platform/infrastructure feasibility remain future work.

**Architecture:** This small experimental solver does not replace the decision to evaluate OpenTripPlanner for comprehensive routing. The adapter, solver, ranking and presentation are separated. The precise model and limitations are recorded in `MATHEMATICAL_MODEL.md`.

**Repository identity:** The user's requested `bike-travel-app` name was checked; the existing project is `Victorpolm/bike-train-planner`, and no repository of the former name was found. Continue the existing repository without creating or renaming one.

**User confirmation:** The user explicitly confirmed `Victorpolm/bike-train-planner` as the destination for the prepared code and mathematical documentation after the repository-name mismatch was explained.

## 2026-09-05 — Return proposals promptly and simplify input

**User report:** Searches stop before proposing routes even for easy journeys; filling many parameters is burdensome; partial address suggestions are requested.

**Evidence:** Live provider responses took about 13 seconds, exceeding the previous eight-second request timeout. The old UI waited for all endpoint pairs and, in Extended mode, all additional discovery before showing any results. Seven required numeric controls lived inside a collapsed section; clearing one could block native form submission. The recorded graph solver was small (34/80 explored labels), so the measured bottleneck is data acquisition, not proof that the mathematical experiment is too complex.

**Decision:** Keep the agreed solver, categories, bus support and full decomposition. Query selected stops first, publish proposals after every usable response, limit initial sampling to three pairs, allow 20 seconds per request and retain valid proposals after cancellation or failed additional requests. Outward stop probing becomes a fallback when initial requests return no feasible route without service failures. Extended publishes results on the current shared graph immediately, then samples one departure board and at most two transfer stops with two onward queries. The reduced sampling trades candidate coverage for earlier usable results; it does not establish global optimality.

**Input:** From and To are cancellable address/stop comboboxes with local known hubs, live GeoAdmin/Transport suggestions, 350 ms debounce, keyboard selection and preserved coordinates/stop IDs. Replace mandatory numeric controls with optional Less / Balanced / More cycling presets and the optional fourth category. Keep the form before the map on mobile.

**Precision correction:** A selected stop and the same provider stop ID have zero endpoint cycling even when different datasets give slightly different coordinates for that station.

**Validation:** New live Zürich–Bern and Zürich–Laax checks publish proposals in approximately 15 and 12 seconds respectively; Extended completes later without hiding those proposals. This is a small observation, not an availability or latency guarantee. Browser interaction is untested.

## 2026-09-18 — Include walking, compare cycling only, and explain stops on the map

**User instruction:** Replace "least cycling" with "least cycling or walking"; show a cycling-only path before the fastest transit option; expose the stations investigated and pinpoint boarding/change locations. Implement and document this in the existing GitHub repository.

**Decision:** Minimize active time A = cycling minutes + walking minutes. Keep the raw quantities separate and preserve cycling as a constrained resource during dominance checks. Optional endpoint categories use active time before the first boarding or after the final alighting. Waiting remains part of total elapsed time, not active time. Label pruning must retain these quantities; a text-only category rename is insufficient.

**Counting:** Display actual public-transport boardings, including the first. Retain conventional changes = boardings - 1 as supplementary information. Staying aboard through passage stops does not add a boarding.

**Comparison:** Show a separate cycling-only estimate first, followed by fastest transit and other category winners. Use the same departure instant and existing straight-line/15 km/h assumption. Keep it available before timetable replies and after timetable failure/cancellation. It cannot win fewest boardings or establish the transit extra-time cutoff. If it exceeds the chosen cycling budget, show that explicitly rather than hide the reference.

**Map:** Show the union of endpoint candidate stops and observed timetable-network stops, deduplicated by provider stop ID. Distinguish these small markers from numbered boarding/alighting pins on the selected itinerary. Merge repeat events at the same station while keeping service, time, platform and boarding number. Different train/bus stop IDs remain separate across a walking transfer. Passing stations can be observed candidates but are not falsely labelled as changes. Add explored-stop visibility and Fit all stops controls; preserve user zoom during background timetable updates.

**Limits:** Lines are schematic and cycling is not routed. Candidate presence implies neither a complete service search nor bicycle-carriage permission. Carriage/reservation checks, rentals, a dedicated walking budget and an OTP deployment remain open work. This is an incremental change on main, not an engine migration.

**Design record:** [RESULTS_AND_MAP.md](RESULTS_AND_MAP.md) preserves the product tree, implemented behavior and OTP compatibility questions.

## 2026-09-18 — Publish the existing private Site and link it from GitHub

**User instruction:** Make the updated website accessible here, keep it private, and explain how to open it from Git.

**Decision:** Reuse the existing Bike + Train Site and preserve its verified owner-only access. GitHub remains the authoritative source; add the Site identity to the app's hosting manifest and a direct website link plus local Git instructions to the repository documentation.

**Publication:** The Site has a separate source repository. GitHub pushes do not automatically deploy; publish the tested application revision explicitly and verify deployment success. Do not create a second website or enable public access.

## 2026-09-18 — Keep overnight connections and actually query feasible rail access

**User report:** No result for the selected Libingen (Mosnang) and EPFL (Ecublens VD) places, despite an expected rail journey through Rapperswil and Renens.

**Evidence:** The exact endpoints return daytime journeys. Repeating the old search at 23:20 returned next-morning connections but zero proposals: the implicit eight-hour arrival horizon discarded that sample. Its three initial queries also all started at neighboring Libingen bus stops, omitting feasible rail access through Wil. The subsequent location expansion exhausted the 90-second acquisition budget. Rapperswil is estimated at 78 cycling minutes, outside Balanced's 60-minute per-end constraint; even under More cycling, the previous pair order failed to query it.

**Decision:** Default to a 24-hour arrival horizon, count all waiting in elapsed travel time, label next-day arrivals, and offer an explicit departure date/time in Europe/Zurich. Keep cycling and boarding constraints unchanged. Query the nearest eligible pair first, then reserve remaining query slots for rail access before neighboring bus alternatives. Preserve the finite three-query batch, progressive results, request/label caps and Baseline/Extended comparison.

**Result:** The repeated late-evening live search returns three category winners. A separate More cycling daytime search explicitly queries Rapperswil–Renens and returns four connections. That route is feasible when examined independently; Wil dominates it in the combined graph for the recorded departure, so Rapperswil need not win a category. This is still a sampled search, not proof of complete timetable coverage. See [EXPERIMENTS.md](EXPERIMENTS.md).

## 2026-09-20 — Map-selected places and ordered intermediate visits

**Request:** Implement map click/tap selection, draggable named markers and intermediate steps; record the remaining app work in GitHub.

**Decision:** Map clicks offer Start here, Finish here and Add intermediate stop. Preserve the exact selected coordinate when finding a nearby name, retaining coordinates when naming fails. Support up to four ordered requested stops, reordering/removal and route reversal. Invalidate stale results when the route changes; stop an active search before editing.

**Routing meaning:** A stop is an actual visit in the requested order, with no added dwell time yet. Use stage-aware labels and one cumulative cycling/boarding/time budget, not independently optimized stage results. Baseline permits cycling at each requested stage's ends; Extended adds at most one automatic cycling transfer across the whole journey. Thus the original zero-versus-one-intermediate-block experiment applies directly to searches without requested stops. Both modes share the observed stage graph. The cycling-only reference visits the same points.

**Acquisition limit:** Up to two station pairs per stage share the existing request/phase cap. Onward query times come from reachable stage arrivals. Via searches currently omit the extra departure-board/suffix acquisition used by no-via Extended searches. Completeness and practical bicycle feasibility are not claimed.

**Roadmap:** [APP_ROADMAP.md](APP_ROADMAP.md) records routed cycling/profiles, carriage instructions, repair and parking layers, commuting/bikepacking/expert modes, comfort research and the later community vision. This request authorizes the map/ordered-stop implementation and that document; it does not make the future features implemented. Preserve the own-bicycle-first scope and evaluate an existing routing engine before further solver expansion.

**Reconsider if:** Actual stopovers need dwell durations, pass-through waypoints are desired instead of visits, or the bounded stage acquisition misses useful journeys. Replace geometric cycling before treating the resulting transfers as practically feasible.

## Template for future changes

### YYYY-MM-DD — Decision title

**Old view:**

**New evidence:**

**Decision / updated view:**

**Reason:**

**Reconsider if:**
