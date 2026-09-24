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

## 2026-09-20 — Route cycling before determining train reachability

**Request:** Real cycling distance/time, ascent/descent, a map-linked elevation profile, steep/final climbs, infrastructure, surfaces and posted road limits; routed durations must determine which trains are reachable.

**Decision:** Add a directed BRouter touring adapter to the existing prototype. Use every accepted road duration in station readiness, solver edges, ordered visits, automatic transfers, budgets and final metrics. Keep the same observed timetable graph for Baseline/Extended. An unavailable link is excluded; old geometric helpers remain only for explicitly selected legacy tests. This is not an OTP implementation or an engine superiority claim.

**Profile and data:** Start with a touring bicycle at moderate effort and a 25 km/h model cap. Retain geometry and raw available road tags. Compute the displayed elevation metrics on one sampled/smoothed profile, preserve missingness and expose final-two-kilometre positive climbing. BRouter normalizes speed tags: show explicit bands rather than pretend they are exact posted limits or measured traffic speeds. Infrastructure is descriptive, not a safety grade.

**Exact coordinates:** Preserve selected points, reject snaps over 75 m at either end, and add estimated walking time for smaller dotted gaps. Station identity still implies zero endpoint cycling, with platform access unverified. These connectors are included in the cycling-leg budget and disclosed separately.

**Latency:** Route the first feasible access/egress before querying timetables, publish supported proposals immediately, then check more candidates. Compute the full cycling-only reference on a separate bounded stream. Finite road/timetable budgets can miss journeys; stop/cancellation keeps valid proposals.

**Validation and remaining work:** Recorded real road geometry plus synthetic missed-train, reverse-direction, ordered-stop, transfer, missing-data and cancellation regressions are in `cycling.test.ts`; live results and preview limitations are in [EXPERIMENTS.md](EXPERIMENTS.md). Calibrate times and inspect road/entrance access in the field, obtain exact speed/conditional-access attributes and benchmark OTP. Carriage, amenities and user modes remain separate roadmap work.

## 2026-09-20 — Allow reasonable endpoint placement tolerance

**User report:** Station-access checks fail, and the user asks for an error margin when selected points are not exactly on a path.

**Finding:** BRouter's default waypoint search permits 250 m, while the app rejected a returned route whenever either endpoint gap exceeded 75 m. The generic empty-candidate error also suggested moving the point when the underlying problem could be a service failure. The exact user's failing coordinates were not supplied in this report.

**Decision:** Use a shared 250 m per-end margin in both provider requests and local validation. Preserve the clicked/searched points, draw the gaps as dotted estimated walking access and include that walking time at 4 km/h in timetable readiness, solver constraints and total duration. Apply the same policy to start/end, requested stops and station access. Larger gaps and absent road routes still cannot become invented cycling links. Keep road distance, elevation and surface coverage separate from these gaps.

**Errors:** Distinguish unavailable routing service, exhausted checks, missing/disconnected paths and ordinary cycling-budget exclusion. Service failure must not imply that a coordinate is invalid.

**Verification:** Regressions accept 249 m gaps at both ends and reject 251 m at either end. A 111 m start gap delays station readiness from 08:23 to 08:25 and excludes the earlier train. This margin is a practical prototype choice, not validation of gates, crossings or platform access. Reconsider it after field testing.

## 2026-09-20 — Explain failed cycling checks without misdiagnosing HTTP 400

**Report:** The user sees “Some alternatives could not be checked” and a generic no-connected-path warning after the endpoint tolerance fix. The report supplies no endpoints or indication whether other results appeared.

**Finding:** The cycling client mapped every HTTP 400 to a missing path and discarded the provider's response body. BRouter's server returns HTTP 400 for any routing-engine error, including timeout; the old message therefore asserted more than the response established. A repeat of the recorded Libingen–EPFL journey succeeded without warnings and does not reproduce the unspecified user case.

**Decision:** Retain a bounded provider diagnostic and distinguish known timeout, unmatched-point, no-track/island and unknown service errors. Name each failed link with its place/station labels (coordinates if unnamed), and mark failures from the independent cycling-only comparison. Store raw diagnostics in memory but show only plain explanatory messages. Do not enlarge the 250 m tolerance again or invent replacement road links without evidence.

**Presentation:** If transit proposals exist, explain that they use successfully calculated cycling links and that other alternatives may be missing. With no proposals, open the search notes automatically. Keep valid results when a candidate or the independent comparison fails.

**Verification:** Production-flow regression returns valid transit while an alternative station has no path and the cycling-only query times out. Error-body cases cover known and unknown 400s, 429 and bounded retention. The exact reported search still needs its start/finish to reproduce.

## 2026-09-20 — Allow cycling above 150 minutes

**Request:** Add “Above 150 minutes cycling” so longer bike-and-transit journeys are not excluded by the highest existing preset.

**Decision:** Add a fourth optional preset with no separate cycling cap inside the existing 24-hour whole-journey horizon. Set total cycling, access, egress and intermediate cycling allowances to the finite 1,440-minute horizon, and raise validation bounds accordingly. Increasing only the total would still exclude long station-access rides. Keep shorter routes eligible; the label means these longer rides are permitted, not required. Preserve the other three presets and Balanced default.

**Constraints:** Riding, walking, transit and waiting share the same 24 hours, including every requested-stop stage. Actual road durations and boarding buffers still determine train catchability. Baseline/Extended behavior, boardings and bounded sampling/request limits remain unchanged. A larger allowance cannot ensure that available road and timetable data yield a route; no fallback line is invented.

**Presentation and verification:** Explain the shared journey window next to the choice and suggest the new preset when ordinary cycling limits exclude a search. Do not suggest raising the allowance when already selected. Controlled production-flow and solver cases cover 300 cycling minutes across access/egress, a 180-minute automatic transfer, 360 minutes via a requested stop, missed onward trains, shorter eligible routes and arrivals beyond 24 hours. See [EXPERIMENTS.md](EXPERIMENTS.md).

## 2026-09-20 — Include buses with explicit bicycle-carriage uncertainty

**Request:** The user now authorizes consideration of buses that take bicycles. This advances the previously deferred carriage work, with bus policies as the first slice.

**Finding:** Buses were already in the timetable graph, but normalization discarded operator/category evidence and routing had no bicycle-carriage predicate. The documented public API does not supply per-departure bicycle permission, reservation availability or bike-space counts. Official operator rules have conditions and exceptions.

**Decision:** Preserve the metadata, maintain a small sourced policy registry, and expose conditional, prohibited and unknown bus carriage. Default to matched conditional policies; allow an explicit unverified-bus opt-in and an avoid-buses choice. Matched prohibitions remain exclusions in every setting. Apply the filter before label dominance in Baseline, Extended and ordered-stop routing; preserve excluded observations for explanations. Recognized replacement markers remain unknown unless an operator prohibition applies.

**Presentation:** A visible bus preference, carriage notice on each result, per-leg boarding/ticket/reservation guidance, source/review date and bicycle status on map pins. Cover a standard unfolded bicycle only. State that live space and individual departures are unverified; never present an operator policy as a booked or guaranteed place. Other transit modes remain explicitly outside this initial policy coverage.

**Validation/next:** Controlled preference/dominance, waypoint, production adapter, station-board, metadata and recorded Zürich–Laax tests pass. The older reduced Libingen fixture now opts into unverified buses for its historical timing test because it omitted operators. Extend verified identifiers and obtain trip-level bicycle rules before claiming confirmed compatibility. See [BUS_BICYCLES.md](BUS_BICYCLES.md).

## Template for future changes

### YYYY-MM-DD — Decision title

**Old view:**

**New evidence:**

**Decision / updated view:**

**Reason:**

**Reconsider if:**

## 2026-09-21 — Optimize confirmed and uncertain bicycle permission independently

**Request:** Preserve both optimization problems, collapsing identical results. Do not treat operator-level conditions as certainty or let a quicker uncertain service remove a confirmed one. Proceed with OJP evaluation and regression cases.

**Decision:** Run independent feasibility/dominance/category searches for confirmed-only and uncertainty-permitted graphs in each existing model. Apply evidence to every transit leg, preserve unknowns, exclude prohibitions in both, and deduplicate only after optimization. Keep cycling as a clear comparison, including saved active time versus additional elapsed time. Permissive bus inclusion replaces the previous known-policy-only form default; Avoid buses remains.

**Data:** Current operator policies do not provide service confirmation. The confirmed group truthfully reports insufficient evidence. A future trusted source must match exact departure, service, operator and segment; space/reservations remain separate. No live OJP claim is made without its API key.

**Discovery:** Always consider nearby local stops for nonzero catchments, reserve local and rail query coverage, and do not stop outward exploration solely because a poor transit path exists. The finite overall budget remains explicit.

**Next:** Run the prepared OJP paired-request benchmark on fixed dated inputs once API access is configured, then validate bicycle attribute semantics before any engine migration. See [BICYCLE_PERMISSION_AND_OJP.md](BICYCLE_PERMISSION_AND_OJP.md).

## 2026-09-21 — Evaluate OJP through a repository Actions secret

**Authorization:** The user reports adding `OJP_API_KEY` after the GitHub Actions secret setup. Connect the prepared benchmark and run it; the token is not requested in chat or retrieved from GitHub.

**Implementation:** The initial manifest commit triggered the first run. Subsequent runs are manual only. Eight paired cases cover Zürich/Küsnacht daytime and overnight, Libingen–EPFL, Zürich–Laax and Rapperswil–Renens. At most 16 requests, scheduled times, bounded responses, paced calls, no retries, and no calls after an authentication/quota error. The key exists only in the capture step's environment; reports retain service evidence without authorization headers. Actions artifacts expire after seven days.

**Scope:** This is evaluation infrastructure. No production timetable adapter, secret in the static website, automated permission promotion or engine migration is introduced. Küsnacht station is a reference origin until the user's exact location is known. Default OJP walking access must be replaced with the app's routed cycling access before claiming comparable door-to-door times.

**Observed outcome:** [Run 35604479414](https://github.com/Victorpolm/bike-train-planner/actions/runs/35604479414) succeeded on all 16 calls. Local bus 31 and Rapperswil–Renens are returned; bus 81 carries a bicycle-reservation requirement and bus 411 a space-conditional carriage note. Many other legs have no positive bicycle note, including the returned Zürich local services. Retain the two optimizations and unknowns. OJP duration can exclude hours before the proposed trip starts; record request-to-arrival elapsed time as well. The parser was corrected using saved responses, with an actual overnight regression, without repeating API calls. [Full findings](OJP_BENCHMARK_2026-09-21.md).

**Privacy review:** Automatic approval review rejected publishing the exact street address and coordinates in the findings. Current benchmark files and documentation generalize that origin to a public stop; mock geocoding tests use fictional addresses. The reduced recorded XML omits endpoint geometry. This current-revision cleanup does not rewrite older Git history or remove the first run artifact, whose retention is seven days.

## 2026-09-21 — Three transit comparisons; TripInfo inspection; capacity deferred

**Latest user instruction:** Synchronize GitHub, investigate TripInfoRequest, do not integrate remaining bicycle spaces, and consider (1) bicycles authorised throughout, (2) uncertain permission, (3) all public transport. The user asks whether nationwide land/boat and cycle-path coverage is actually present.

**Updated decision:** Add the unrestricted comparison to the previously implemented independent strict/permissive solves. The sets are nested. Apply each scope before dominance, retain independent category windows, then merge identical journeys. Keep the same mode preference and physical/time budgets. Known prohibitions remain forbidden in the first two scopes and are prominently labelled comparison-only in the third. Preserve the same behavior across Baseline, Extended and ordered visits, including onward acquisition for each distinct reachable scope time.

**Research and implementation:** Official TripInfo documentation was inspected. Add an offline/single-call evaluation command and manual secret-backed workflow that retain dated service and stop conditions without promoting them to permission. No live TripInfo success or production OJP migration is claimed in this change. This supersedes treating a third comparison as merely pending; it does not supersede the requirement for reviewed service/segment evidence.

**Parked:** Remaining bicycle spaces, occupancy, reservation availability and bookings. Published reservation requirements may remain explanatory notes.

**Coverage finding:** The app has sampled services and requested BRouter paths, not a complete national transit/boat map or audited inventory of all cycle paths. The national GTFS source includes boat modes but is not imported. Keep source coverage, model coverage and actual app coverage separate.

**Synchronization:** Update the project instruction block, agent scope, current state and related docs. Preserve older dated decisions and experiments as history. A GitHub change does not automatically update pasted ChatGPT instructions or the private Site. See [TripInfo and coverage](TRIPINFO_AND_NETWORK_COVERAGE.md).

## 2026-09-24 — Display dated bicycle permission and prerequisites

**Authorization:** The user says the key is in GitHub and asks to show whether a bicycle is allowed, with prerequisites such as tickets and bike-space reservations. Keep the three comparisons; do not integrate remaining spaces or booking transactions.

**Verified:** Actions run 36034855752 used the existing `OJP_API_KEY` successfully for six paired TripRequests and three TripInfo calls on public train/bus/boat examples. Boat prohibitions disappeared from filtered results; train/bus reservation requirements and explicit bus no-reservation conditions were returned.

**Decision:** A successful `BikeTransport=true` result establishes permission according to OJP for its exact dated service/segment, unless an applicable prohibition overrides it. This replaces the earlier requirement for a separate positive textual note on every filtered leg. A missing note on an unfiltered-only service remains unknown. Tickets, reservations and original provider conditions are separate fields; passenger/group reservation notes are never promoted to bike requirements.

**Implementation:** Worker-protected OJP connections, bounded/paced calls, short-lived caching, scoped TripInfo on journey opening and full three-comparison rerouting after evidence changes. Credentials stay in server runtime environment; no key is included in client assets, logs or captures. The existing private Site identity and audience are preserved.

**Activation boundary:** GitHub Actions and the Site store secrets separately. The Site environment is empty; GitHub does not return stored secret values. Implement and publish the app with a truthful fallback, then configure `OJP_API_KEY` as a Site runtime secret to activate live OJP. No credential-extraction workflow is authorized or introduced.

**Limits:** 120 app tests, 13 Python tests and production build pass; browser QA is blocked by absent managed-preview infrastructure. No complete Swiss GTFS/OSM graph, live capacity, booking or routing-engine migration is implied.


## 2026-09-24 — Baden exits and temporary provider failures

**Report:** A Zürich-to-Baden journey included an avoidable bus after the train; a short Baden cycling route and a Baden-to-Zürich search returned service-failure notes instead of useful options. The original departure/settings and provider response bodies were not retained, so the exact historical outages cannot be reconstructed.

**Confirmed code defects:** Observed cycling links were limited to the four geographically nearest stops, letting nearby bus stops hide a rail exit. Timetable and cycling phase clocks advanced while the other provider was working. HTTP 429 permanently stopped each client, and a temporary failed cycling link was cached as unusable within that search. Station-access failure could reject the search before its independent cycling-only calculation completed.

**Decision:** Retain bounded sampling and all three permission searches. Prioritize observed egress by reachable boarding count and potential arrival, preserve rail access among nearby candidates, and use real routed durations for feasibility. Charge phase budgets to each provider's own work. Add bounded transient retries, respect Retry-After/cooldowns and retain the 18/32 request caps. Successful timetable replies can be reused for 30 seconds; temporary cycling failure can be rechecked. Wait for and return a valid independent cycling-only result when station access fails.

**Road-service resilience:** A temporary BRouter outage can use the independent FOSSGIS OSRM bicycle service. Serialize backup calls across both cycling streams at no more than one per second. Validate geometry, distance, duration and endpoint gaps using the existing checks; reject any returned step whose mode is not cycling, including ferries, trains and pushing-bike sections. Identify the provider and retain missing elevation/road attributes as unknown. This is a road-network fallback, never a straight-line substitute. Conclusive off-network/disconnected-path responses are not rerouted through another provider.

**Limits:** Public services can still be unavailable or rate-limited, and sampling remains incomplete. No new national dataset, routing-engine migration, bicycle-capacity query or booking integration is implied. See the dated regressions and live checks in [EXPERIMENTS.md](EXPERIMENTS.md).


## 2026-09-24 — All-mode access choice, public bicycle symbols and overnight exits

**Latest request:** Replace the bus-only choice with three all-public-transport access levels, use public prerequisite information, and investigate premature train exits on late Zürich–Laax journeys with Above 150 minutes cycling.

**Decision:** One selected scope controls feasibility before dominance and ranking; show only its category winners. Keep the independent solver capability internally. Explicitly included prohibitions remain visibly prohibited. This supersedes the previous bus selector and simultaneous three-group display.

**Data finding:** Transport API connection objects drop bicycle symbols exposed by their underlying public search.ch source. Read that feed directly, preserving `VN`, `VR`, `VB`, exact dated segment identity and original notes. Keep source URLs/review dates. No extra detail call per leg is needed. All timetable calls share the existing cap/retry/cooldown logic. OJP remains preferred if configured, but its missing Site runtime secret no longer blocks public service notes.

**Reviewed rules:** Narrow domestic SBB IR and SOB mainline policies may confirm access for the matching operator/service, visibly identified as published-rule evidence. SBB IR and SOB mainline reservation defaults are separate from service notes; explicit bans, mandatory reservations and reservation conflicts override defaults. Other conditional operator policies remain unverified. No remaining-space lookup or booking transaction is added.

**Discovery:** Probe up to two useful rail exits at the original boarding-ready time before spending the road budget on long early exits. Check their cycling finishes promptly and refine other unchecked exits using actual road times. Reuse directed cycling links when the same station ID has slightly different provider coordinates. The finite search is still sampled, not globally optimal.

**Dated result:** On 2 November at 23:00, the whole-trip query omits IR35 23:12–00:49 to Chur. With that train acquired, live-source replay plus fresh BRouter links produces Chur cycling (151 min) and arrival about 03:20. Some September nights instead have a bicycle-prohibited replacement bus; never generalize this outcome across dates. See EXPERIMENTS.md.
