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


## 2026-09-24 — Allowed means verified; configurable rider and electric timing

**User clarification:** Permission is verified whenever applicable evidence says the bicycle is allowed. Ticket and reservation requirements are separate. Support slower, stronger and electric-bike riders; uphill differences should exceed a uniform flat-speed discount.

**Fix:** Every journey card previously repeated the selected “Allow uncertain permission” filter, making verified journeys appear unverified. Show actual permission on cards, label the filter once, and name unknown services in mixed cases. Confirm ordinary reviewed ZVV-operator/tpg buses and trams from their applicable published rules, with sources; this supersedes the previous decision to leave those conditional rules unverified. Preserve prohibitions, replacement exceptions and unknown PostBus routes.

**Timing decision:** Keep BRouter touring road selection, but calculate configurable timing locally over its smoothed elevation intervals. Flat speed calibrates constant riding power, naturally amplifying stronger riders' uphill advantage. Electric adds a documented heuristic for climbing support fading near 25 km/h. Preserve walking connectors, missing-elevation disclosure and all solver budgets. Profile-aware caches and 45 km/h lower bounds apply to every routing phase. Do not claim physical calibration, battery prediction, legal-speed modelling or a complete national graph. See CYCLING_ROUTES.md for formula and assumptions.

**Verification:** 145 tests, TypeScript and production builds pass. Server-render checks cover controls, the slope table, cycling explanation and verified PostBus prerequisites. Browser preview infrastructure is unavailable; no browser interaction/visual check is claimed. No remaining-space or booking integration is introduced.


## 2026-09-24 — Five neutral pace presets

**User request:** Use four nonjudgmental names for 15, 20, 25 and 30 km/h flat speeds, with five profiles overall. Keep Electric as the fifth from the preceding request.

**Decision:** City 15, Relaxed 20, Regular 25 (default), Sportive 30, Electric 25 km/h with the existing climbing assistance. Values remain editable from 8 to 35 km/h. Names indicate pace choices, not fitness ratings; they are configurable planning references rather than measured population averages. Five-km/h steps are simple to compare. Electric and Regular share a flat reference but have distinct climbing behavior.

**Clarification:** The original BRouter override of 25 km/h capped model speed; it did not assert 25 km/h as the flat-ground average. This change deliberately makes Regular's flat speed 25 instead of the previous 20. The slope-power formula, electric-assistance rule and 45 km/h downhill cap are unchanged. Existing timing regressions are updated for the new presets; no new unrelated feature is introduced.


## 2026-09-25 — Swiss-first implementation, private app and cost approval

Implement the approved proposal in stages. Keep the existing Site owner-only and ask before any hosting spend. The existing GitHub repository is public; documentation now distinguishes that from app privacy.

Use reviewed date/line/operator rules to fill missing train prerequisites, with dated prohibitions and conflicts taking precedence. Add full/Half Fare/GA plus annual-bike-pass preferences on the device. Show supported published bicycle charges; do not manufacture passenger prices or use the OJP Fare test environment as a production quote.

Import official bicycle parking as an optional map layer. Do not turn parking into a new park-and-ride routing mode or integrate free-space availability. Keep the bicycle with the traveller in the current mode.

Own Swiss timetable acquisition/search as a separate local service: streaming GTFS into a dated SQLite index, with the three access scopes applied before pruning. The current web runtime cannot contain the measured national service. Keep production disabled until its performance, headway, pathway and disruption gates and hosting decision are resolved. Preserve the live timetable fallback. A global 60-second deadline protects each user search.

Download/audit Swiss OSM coverage and the three pilot station surroundings; retain BRouter for road routing. Missing station-path evidence remains unknown. GPX analysis is local, with no automatic calibration without real rides. Finish and test this Swiss mode before Europe or new travel modes. See SWISS_IMPLEMENTATION.md and GPX_RECORDING.md.


## 2026-09-25 — Visible prices and named destinations

Show the supported bicycle ticket/reservation option below the boarding count on every collapsed journey card. Use the existing date/operator-scoped fare calculation and the selected Full Fare/Half Fare/GA/annual-bike-pass profile. Distinguish known bicycle cost, separately priced passenger tickets, unconfirmed charges and prohibited carriage. A zero additional cost requires applicable existing passes; cycling-only shows zero public-transport cost. Do not invent a live total fare.

Add Swiss named-place search with Photon/OpenStreetMap alongside existing address and station lookups. This resolves the coordinate-less FORTYSEVEN Transport API result without hardcoding a venue. Rank the whole result pool before truncating, and require the complete typed query to match before automatically selecting a destination. A partial Baden town match cannot silently replace FORTYSEVEN Baden. Preserve cancellation, independent updates and public-provider rate limits; no new paid host is needed. See PLACE_SEARCH.md.

## 2026-09-27 — Document user quality review before implementation

The user requests documentation only for missing/incorrect fares, reported S12 bicycle exclusions and proposed Fastest / Simplest / Safest cycling choices. Record findings and future acceptance checks in [USER_REVIEW_2026-09-27.md](USER_REVIEW_2026-09-27.md); do not change application behaviour or deploy in this turn.

The review distinguishes confirmed fare limitations and a broad regional uncertainty rule from the unreproduced original CHF 17/S12 results. The proposed fare presentation separates passenger, cheapest valid bicycle product and reservation. Proposed cycling preferences remain separate from rider pace and journey ranking; Lower traffic stress is suggested wording for the requested safety preference, without claiming objective safety. Numerical weights and detour allowances are still open. Preserve the earlier request to distinguish cycling, pushing and carrying.

Keep the Site owner-private and require approval before hosting spend. Keep residential addresses, private trace geometry and secrets out of the public repository. This documentation update does not approve a new provider or paid service.

## 2026-09-27 — On-demand official terrain checks and scoped fare tables

The user approved implementing the September review and swisstopo check. Use the existing private server for bounded GeoAdmin queries, retain OSM evidence and unmatched/ambiguous coverage, and exclude climbing passages unsuitable with a bicycle. Compare actual path alternatives for Fastest, Simplest and Lower traffic stress with a capped detour; retain uncertainty and partial results. Do not upload bulk terrain data to the public repository or create paid hosting.

Use actual published reduced fares on audited date/line/zone-scoped corridors, compare bicycle tickets with the valid day pass, and separate passenger, bicycle and reservation components. Do not treat the OJP integration-test fare endpoint as a production quotation source. Preserve exact dated bicycle prohibitions and narrow regional/SZU exceptions. See [implementation and limits](SWISSTOPO_AND_FARES_2026-09-27.md).

The live Muri–ETH probe exposed a timing conflict: first train-exit cycling validation was still pending at 60 seconds. Overlap endpoint discovery without bypassing provider rate limits; use a 90-second global limit when terrain checks are enabled, retain early results and cancellation, and disclose the limit in the loading UI. Legacy non-terrain searches retain 60 seconds. A same-station public-anchor retry addresses disconnected timetable centroids without increasing the existing 250 m connector limit.

## 2026-09-27 — Integrate OJP Fare with explicit test estimates

The user added OJP_FARE_API_KEY and authorized configuration and ten random checks. Use the separate fare endpoint server-side, exact itinerary matching, explicit full/HTA/Bicycle travellers, and complete gross-CHF fare coverage. Distinguish beta/test estimates from production purchase offers and keep reservation/permission independent. Preserve published fallbacks and refuse a substitute itinerary or unsupported cycling interruption. The new GitHub secret is valid; the Site runtime remains empty and no secret extraction or transfer is attempted. The bounded ten-case Actions run checkpoints each result and retains failures. Publication preserves the owner-private Site; no paid infrastructure or recurring job is introduced. [Evidence and activation gate](OJP_FARE_RESULTS_2026-09-27.md).

## 2026-09-28 — Activate hosted OJP and reject redirects compatibly

The user supplied both secrets through Site settings and asked to verify access. Deploy environment revision 3 on the existing owner-private Site. Presence checks succeeded but real requests exposed a hosted redirect-mode TypeError. Use manual redirect handling with explicit rejection of every 3xx, preserving server-only credentials and refusing to follow Location headers. Retain fixed operational failure categories without raw exceptions, bodies or headers. Three new regressions protect the runtime mode and redirect boundary; 188 app tests and production builds pass.

Version 26 now returns live OJP journey data and numeric full/Half Fare passenger and bicycle test estimates, including a quote constructed through the real client adapter. No new hosting, paid service or sharing change is introduced. The separate supplied code review supports a parser fix, clearer category qualification and a bounded four-versus-eight-pair comparison; those routing/product changes are not implemented by this activation patch. [Exact results and remaining work](OJP_ACTIVATION_2026-09-28.md).

## 2026-09-28 — Correct fares for actual planner journeys and implement confirmed review fixes

The user reports no passenger price for Zürich–Laax and Zürich–Bern and authorizes correction. Reproduce both through the actual planner, then fix station identity consistently in fare matching and OJP graph insertion: identical normalized station name, coordinates within 500 m, every fare-segment time unchanged and any supplied journey reference unchanged. Observed Zürich HB platform/entrance centroids exceed the previous 150 m fare and 250 m graph bounds. Do not change road connector limits or derive SLOIDs arithmetically.

Remove the redundant five-second fare-status gate; give OJP configuration fifteen seconds and retain compatible request/body deadlines. Fare requests contain coordinates only, excluding graph/cycling data and volatile timestamps. Shorten unsuccessful client-cache entries to thirty seconds. Preserve complete fare coverage checks, test-estimate labels, service permissions and reservation uncertainty.

Implement the confirmed malformed-final-station regression and qualify least-cycling/walking winners with their actual arrival allowance on the card. Keep the current four-pair/18-request limits; the proposed sampling comparison has not been performed. Version 28 is owner-private, 195 tests and builds pass, and both new live planner results have numeric passenger fares. Search exploration still times out gracefully; do not claim full route coverage or browser interaction QA. [Evidence and exact departures](OJP_ROUTE_FARES_2026-09-28.md).


## 2026-09-28 — Retain and price the exact selected OJP itinerary

Preserve complete provider trips with inherited namespaces and exact service/intermediate-stop data during route acquisition. Carry signed self-contained sources with graph edges, including internal walking transfers, and deduplicate sources in the fare query. This supports stateless Worker execution without new storage or exposing keys. Reuse whole trips; build subtrips/combinations solely from retained timed legs and provider walking connections. Recalculate aggregate fields and unique leg IDs, and verify that returned fare products cover the complete selected transit sequence. Never substitute a new route when retained data fails validation.

Keep bounded exact-match lookup compatibility for results without complete retained sources. It is observable as `itinerarySource: lookup`; preserved trips report `retained` or `assembled`. Future-date/profile/coverage constraints, explicit unknown bicycle conditions and test-estimate labelling continue. Fresh live Zürich–Laax routing exercised the combined path successfully. [Evidence and release](OJP_EXACT_TRIP_FARES_2026-09-28.md).


## 2026-09-29 — Parking, shop referencing and interface priorities

**User request:** Update GitHub to describe the actual product and intended work, prioritising (1) bike parking, (2) bike-shop referencing, (3) broader user-interface improvements. This order supersedes the earlier 21/25 September delivery orders. Record it in the current roadmap, project summary, product and backlog; remove superseded activation/implementation claims from current summaries while retaining dated evidence and Git history.

**Facts checked:** The existing app already has a static official parking layer. Today's feed contains 1,608 BIKE facilities, with no populated bicycle current/forecast occupancy; 435 CAR records carry current estimated occupancy. Opening-time/pricing structures exist for some bicycle records but need semantic validation. All BIKE public-access flags are true, including records describing badge access; public access is not the same as free or unconditional entry. The [audit](experiments/bike-parking-source-audit-2026-09-29.json) records the source/hash/counting method.

**Recommendation, not delivered behaviour:** Make parking a contextual facility choice near a destination/selected station, with a shortlist, entrance/access evidence, independent fees/hours/retrieval conditions and transparent unknowns. Combine official records with reviewed municipal/OSM enrichment and preserve field-level sources and conflicts. Build shared facility/data/card components for the following shop/repair milestone. Deliver each feature's necessary interface alongside it, then perform the broader interface pass third.

**Scope retained:** Today's bicycle accompanies the traveller. Leaving it at a station is a distinct future mode requiring custody/retrieval, access time, passenger-only onward travel and correct costs. Live spaces, booking/sales and new paid hosting are not authorised here. Pilot towns, sample sizes, ranking defaults and detailed interface actions in [BIKE_PARKING.md](BIKE_PARKING.md) and [APP_ROADMAP.md](APP_ROADMAP.md) are proposals to validate. This turn changes documentation only; version 30 remains the last verified app release and the 203-test/build gate is dated 28 September.

## 2026-09-29 — Record useful-stop brainstorming and later safety questions

**User request and experience:** Preserve these ideas in GitHub next steps. On long rides the owner looks for drinking fountains, snacks/shops/vending, public toilets, suitable bicycle parking and repair help, including pumps, assisted workshops such as VELOVE and professional services such as Züri rollt. Show relevant facilities on/near the chosen path and allow category filtering. OSM and municipal inventories should extend the transport-oriented parking layer. Investigate road safety later, including crossings/signals, physical separation, lower-speed streets, pedestrian paths and turning.

**Recorded direction:** Keep parking first, expand the shop/service milestone to the five essential amenity categories, and include their basic usable interfaces before the broader redesign. [CYCLING_AMENITIES.md](CYCLING_AMENITIES.md) contains the brainstorming and source/data proposal; [CYCLING_SAFETY_RESEARCH.md](CYCLING_SAFETY_RESEARCH.md) preserves the later questions. Sample sizes, sub-release order, filter defaults, indexing and ranking details remain recommendations, not implemented or fully approved specifications.

**Evidence and interpretation:** The Biel/Bienne catalogue counts locations and bicycle spaces separately; its figures are not directly comparable to the national feed's facility count or to live occupancy. Source review found municipal water/WC/pump inventories and OSM tags useful for the broader scope. Keep service type, public access, opening, condition and provenance separate. Retain frame-locking support, cover, access control and CCTV independently rather than declaring camera-covered parking best. Associate amenities with real cycling legs and checked access routes, not schematic transit lines; visit duration is a prerequisite for reliable post-stop train timing.

**Later research, not established rules:** Analyse junction manoeuvres and mapped infrastructure before changing stress/routing weights. Signals may separate conflicts; ordinary bends are not all equivalent to across-traffic turns. Pedestrian access needs verification, and crash counts without exposure are not per-cyclist risk. Preserve existing lower-traffic-stress uncertainty.

**Scope of this work:** Documentation and source review only. No new feature, source import, app test/build, deployment, subscription, operator outreach or upstream map edit is claimed. Current release evidence remains dated 28 September. The uploaded 5 September project summary is historical, not the current implementation state.

## 2026-09-29 — Implement the small closest-to-start parking trial

**User decision:** Start with a map icon/filter and closest bicycle parking relative to the supplied starting point; GPS access comes later. This explicitly narrows the immediate parking implementation to a small trial rather than the full earlier destination/entrance/municipal-enrichment proposal.

**Implementation:** A labelled icon toggle reveals the official parking layer and Find closest parking. Rank all loaded facilities by Haversine distance from A; clearly label straight-line distance and incomplete coverage. Highlight the selected facility and fit it with A, update when A changes, retain access uncertainty and handle missing start/loading/empty/error states. Leave routing, fares, GPS permission and source ingestion unchanged. [Implementation, checks and publication](PARKING_FIRST_TRIAL_2026-09-29.md).

**Publication:** Owner-private version 31 succeeded at 12:50:32 UTC with environment revision 3. 206 tests and production builds pass. The three live-source calculations are recorded in the linked report; browser interaction QA remains unperformed. The broader parking and amenities proposals remain later work.

## 2026-09-29 — Include OpenStreetMap parking after the ETH coverage gap

**User authorization:** Add OSM parking to the existing filter and closest-to-start search after the owner reported missing ETH Zürich racks. Keep GPS later.

**Decision:** Load a cached Swiss regional OSM parking query alongside the official feed, including points, ways and relations. Rank the full loaded dataset relative to A, independently of map visibility. Preserve source IDs/links, access restrictions, mapped rack/cover/capacity/fee/hours information and unknowns. Deduplicate stable identities/explicit OSM links; do not merge nearby racks by distance alone or sum capacities. Unresolved overlap remains visible as a limitation of record counts. Area-centre distance is not a verified entrance route.

**Reliability:** Source requests/caches are independent. Daily memory/edge caching, shared in-flight requests, finite response/time limits, OSM failure cooldown and bounded stale fallback avoid repeating national queries unnecessarily. Missing sources are disclosed before a partial closest result; OSM attribution is visible. No new key, paid service, schedule or GPS permission is introduced.

**Verified delivery:** Private version 32 succeeded at 14:28:31 UTC, environment revision 3. 213 tests and production builds pass. Deployed endpoints returned 20,728 OSM and 1,608 official records; the ETH Zentrum/Hönggerberg checks selected OSM parking 42/38 metres away. Browser interaction testing remains unavailable. [Implementation and evidence](PARKING_OSM_2026-09-29.md).

## 2026-09-29 — Diagnose parking load errors without declaring both providers down

**Report/evidence:** The owner saw both sources unavailable. Direct authenticated deployed checks succeeded, and available logs did not reproduce the browser failure. The original loader hid every HTTP/session/network/JSON/provider mismatch behind one generic message, while the server trusted cached data without checking its source/schema shape. The exact original browser cause remains unconfirmed.

**Decision:** Use separate versioned source paths, bypass browser HTTP caching while retaining server daily caching, validate edge-cache source/content/time, apply a body-inclusive client deadline and one bounded transient retry, and preserve source-specific errors. Explain sign-in refresh and own-tab access only when a session/access/network error supports that advice. Keep partial-source/straight-line uncertainty, OSM attribution and unchanged routing/fares/GPS.

**Delivery:** Version 33 succeeded at 15:11:50 UTC, environment revision 3; 220 tests and production builds passed. The latest report explicitly distinguishes the authenticated loader verification from a user-browser cookie session. [Evidence and next diagnostic](PARKING_LOADING_2026-09-29.md).


## 2026-09-29 — Colour parking equipment and restrict it to the selected journey

**User request:** After positive feedback on the loader fix, distinguish wall loops from preferable equipment and show parking along the selected journey.

**Decision and delivery:** Version 34 uses red for mapped wheel-only forms (including wall loops), green for frame-support stands, blue for other recognised equipment and grey for unknown rack types. Mixed wheel-only tags retain red; cover, capacity and access do not determine the rack category. Labels accompany colours, and security/access conditions remain separate.

Default to an optional approximately 100 m corridor around the selected cycling-only or transit journey's cycling paths, explicitly routed walking paths and known endpoints/boarding/alighting points. Do not follow schematic transit/walking lines or bridge disconnected legs. Missing geometry is disclosed. Closest remains straight-line from A within the eligible set; an unchecked filter restores the full loaded set. No GPS, detour routing, timetable change, security guarantee or new provider is added.

**Evidence:** 230 app tests and production builds pass, including ten new geometry/equipment regressions. Private version 34 succeeded at 15:51:24 UTC from Site source `b74ad2037d5d59ebe5fe621995b3e54856a33953`, environment revision 3. Browser interaction QA remains unavailable. [Implementation, limits and next trial](PARKING_COLOURS_AND_ROUTE_2026-09-29.md).


## 2026-09-29 — Distinguish parking symbols and combine neutral equipment colours

The owner requested the same colour for other mapped equipment and unknown rack types, and reported confusion between parking and explored stops. Version 35 uses shared grey for these two equipment categories, square P parking markers, small hollow-circle explored stops and a larger outlined P for the closest result. Popups retain the distinction between other and missing equipment data; route filtering and source handling are unchanged. Existing 230 tests and builds pass. [Release and verification limits](PARKING_COLOURS_AND_ROUTE_2026-09-29.md#version-35-marker-refinement).


## 2026-09-29 — Add water/toilet layers and expand preferred parking types

**User decision:** Bollards and handlebar holders should be green; implement the parking-style exploration flow for fountains and toilets. These two categories now precede remaining shop/repair referencing in delivery, while the broader interface pass remains later.

**Implementation:** Extend the green parking preference group without claiming universal frame support. Add independent water-drop/WC map toggles, source/detail popups, the shared 100 m selected-journey corridor and closest-from-A actions. Exclude unconfirmed/non-drinking water and explicit restrictions from closest water; exclude explicit restrictions/keys/known closures from closest toilets while preserving unknown access and unevaluated hours. Keep actual route geometry/known endpoints, stable OSM identities, shared-service marker offsets and explicit area-centre/coverage limits. No GPS, route insertion or live quality/opening claim.

**Data and release:** One fixed Swiss OSM query serves both categories through a separate bounded, cached endpoint; no user coordinates are sent upstream. Version 36 succeeded at 18:02:13 UTC, environment revision 3. 245 tests and builds pass; the live endpoint returned 38,552 fresh records in 32.55 seconds. Browser interaction QA remains unavailable. [Full behaviour, source rules and next check](WATER_AND_TOILETS_2026-09-29.md).


## 2026-09-29 — Implement repairs, food and adjustable proximity

**User authorisation:** Implement the repair/food proposal after reviewing usefulness and map clutter.

**Decision:** Add independent filters, explicit service types, closest-from-A, marker grouping and 100/500/1,000 m shared route proximity. Keep the toolbar above the map. Split quick food from optional dining after a live combined payload exceeded the 16 MiB bound. Use independent fixed-query caches without sending user coordinates to OSM. A shop is not automatically a workshop; DIY/repair overlap is not proof of a professional service; broken pumps cannot win pump-only searches. Commercial customer access is allowed; private/conditional access stays excluded. No evaluated hours, entrance/pushing route, stop insertion or fare/routing change.

**Release:** Version 37 succeeded at 21:42:17 UTC, environment revision 3, Site source `c3ca72b2c91fcbfbfd1903904a14d9e22ffbf3b6`. 258 tests and production builds pass. [Repair/food implementation and checks](REPAIRS_AND_FOOD_2026-09-29.md).

## 2026-09-30 — Preserve facility locations and bound enrichment

**User authorisation:** Implement the recommended small fixes and investigate the opendata.swiss API. Retain the reported HG location: floor F, next to the Starbucks coffee machines.

**Decision and implementation:** Keep OSM as the national base; preserve floor/place/direction evidence. Add a reviewed file for additions and exact-identity enrichment. HG uses one explicitly approximate building reference; existing Zürich HB Hygienecenter components gain SBB floor/zone/plan evidence without changing raw restrictions or coordinates. Source review does not mean on-site verification. No automatic proximity merge, public submission backend, full indoor router or city-by-city audit.

**API research:** The documented CKAN endpoints returned HTTP 403 in this environment; no API key was requested or transmitted. The official portal announces a future CKAN replacement, so discovery remains an isolated read-only script. One SBB publisher GeoJSON feed successfully returned 63 station-plan references, not indoor facility inventories. [Research and commands](OPENDATA_SWISS_2026-09-30.md).

**Release:** Owner-private version 38 succeeded at 08:18:00 UTC, environment revision 3; 265 tests and builds pass. [Implementation and limits](FACILITY_LOCATIONS_2026-09-30.md).

## 2026-09-30 — Prioritise facility precision and scarce rural water

**User decision:** Prefer information that helps a cyclist reliably find and use a facility over increasing coverage counts. Scarce-area water is the first useful-stop refinement; large-building localisation follows. Investigate online sources while keeping maintenance manageable.

**Research facts:** rural destination pages supply explicit drinking-water descriptions and coordinates; a fresh bounded Crestasee OSM query returned zero candidates. SBB's public INSA exports returned Zürich HB service/floor/access data without credentials, beyond the earlier plan-link feed. swissTLM3D fountain/spring classes are incomplete and do not establish potability. Public API access does not settle SBB reuse rights, which remain an explicit open question. [Sources, live checks and limitations](FACILITY_PRECISION_2026-09-30.md).

**Proposed next work, not implemented:** a 15–20-point rural-water pilot; evidence/access/seasonality details, checked detours and route-gap information; then bounded station floor/entrance enrichment. Keep source, modification, fetch and field-observation dates separate; never infer flowing water or public access from a map pin. No application change, automated import, account creation, provider message or new hosting spend was made for this research.


## 2026-09-30 — Implement three precise facility sources, exclude further ETH focus

**User authorisation:** Update GitHub, audit unimplemented roadmap items and implement Graubünden, SBB and swissTLM3D without focusing on ETH.

**Delivered decision:** OSM remains the base; add eight fixed rural fountain pages, ten public SBB station-service exports and an optional grey TLM fountain/spring layer. Preserve floors, landmark text, source/edit/edition dates, negative evidence and independent failure states. Closest water never accepts unknown potability. Exact reviewed identity is required for enrichment; overlapping source/floor records stay inspectable. No new ETH-specific work, indoor router, live-flow inference or stop insertion.

**Reuse boundary:** The SBB portal describes service data as freely usable but links restrictive general terms. Use only public factual service exports with attribution in the existing owner-private prototype. Blanket redistribution/publication rights remain unconfirmed and must be clarified before wider distribution. No restricted endpoint, provider message, paid dependency or invented agreement.

**Verification:** 277 offline tests and production builds; 19/19 live adapter checks pass. [Implementation and audited remaining work](FACILITY_SOURCES_2026-09-30.md). Rural route-gap/access evidence, routed detours, arrival-time opening and visit duration are still unimplemented; the broader UI remains the third main milestone.

**Publication:** Owner-private version 39 succeeded at 13:22:19 UTC, environment revision 3; all 163 current application files match GitHub implementation `becab48`.

**Hosted follow-up:** The version-39 checks passed 18 rural/station feeds but TLM archive loading timed out at 80 seconds. Version 40 replaces runtime archive extraction with a compact dated 601-point application index, preserves the import/edition dates and keeps all points excluded from closest drinking water. The maintenance importer remains bounded and was checked again successfully. **278 tests in 11 suites and production builds pass.** Owner-private version 40 succeeded at **13:34:20 UTC**, environment revision 3, Site source `73aa9b1dfbd4ee989e17b3d77824279287e53d23`; all **166 current application files** match GitHub implementation `53ef965e0e20a437431912042f8083ee7d823ad4`.

**Final hosted check:** Version 40 returned valid HTTP 200 data for all 19 endpoints, including 601 TLM points in 698 ms; root/new frontend control and rejection guards passed. [Dated hosted evidence](experiments/facility-sources-hosted-v40-2026-09-30.json).


## 2026-09-30 — Persistent map details and fixed-service cycling detours

**User request:** fix facility details disappearing when the map moves or the pointer leaves; propose a detour through a facility without recalculating the whole trip.

**Decision and delivery:** detach clicked popups from transient marker layers. Offer one explicit cycling detour preview using two directed links within an existing cycling section, preserving all other stages and the selected transit. Include rider-chosen visit time, walking before boarding and the three-minute buffer. Report missed or unknown timing instead of choosing a new service. Keep original journey cards/fares available. Use independent cancellation/deadline handling and no timetable/fare queries.

Unknown/non-potable water and mapped restricted/unavailable facilities cannot be suggested as stops. Coordinates do not establish a verified entrance or indoor route. Applying/saving a preview, multiple facilities, verified opening, broken-bike pushing-only routing and original search-budget validation remain later work.

**Verification and release:** 290 tests in 11 suites and production builds pass. Owner-private version 41 succeeded at 17:12:53 UTC, environment revision 3, Site source `c68854db9e257e97b6e9f891f01ab18283d234fd`. Browser interaction QA and live provider detour tests were unavailable/not run. [Evidence and limits](FACILITY_DETOURS_2026-09-30.md).


## 2026-09-30 — Apply the approved external-review corrections

**Decision:** Automatically frame completed detours and remove the two redundant controls while retaining keyboard location selection. Share exact operator/name normalization, invalidate cached permissions whenever rule/evidence inputs change, extract timetable acquisition and adopt automatic offline CI/Knip plus separately committed React formatting.

**Cleanup boundary:** Remove only demonstrated dead code/unused exports. Keep the boarding buffer, BLS/RhB/regional rules, fare tables, journey IDs and search label cap. No identity-only cache or claimed 27× full-search speedup.

**Engine decision:** The local MOTIS 2.11.3 pilot preserves strict/unrestricted winners but cannot recover the middle-scope winner by postfiltering an unrestricted result. Keep the deployed engine and require pre-routing three-state handling, coordinate-waypoint/intermediate-cycling and category tests before any migration. 300 tests/builds pass; browser QA remains unavailable. [Implementation, reproducible pilot and caveats](REVIEW_IMPLEMENTATION_2026-09-30.md).


## 2026-10-02 — Novice interface and optional local traveller profiles

**Authorisation:** Implement the revised proposal on a new GitHub branch. Branch `feature/novice-interface-profiles` starts at main `5f17985`; do not merge as part of the redesign.

**Decision:** Simplify presentation while preserving options and routing semantics. Separate named personal settings from trip presets and per-trip overrides. Store profiles only in this browser, keep Guest, require explicit Save to profile, preserve legacy fare selections and show storage failures. Age is optional metadata, not a fare entitlement. Presets retain current personal fare/pace; new Guest pace is Relaxed 20 km/h. Add a 45-minute total cycling choice without replacing existing limits. Bikepacking uses no separate cap within the existing overall horizon.

**Preservation:** Baseline/Extended stay independent; endpoint preferences remain extra categories. Phone views hide rather than unmount. Map filter changes and view switches do not start journey search. Permission/reservation requirements remain visible; explanatory sources use accessible persistent disclosures. No functional More/Start controls until their separate capabilities exist.

**Evidence:** 309 offline tests in 11 suites, including profile isolation/storage and 45/46-minute routed boundary cases, plus formatting/Knip and production builds. Browser QA remains pending. [Full mapping and remaining work](INTERFACE_PROFILES_2026-10-02.md).

**Publication:** Owner-private version 43 succeeded on 2 October at 19:34:27 UTC, environment revision 3, Site source `79394f5eb992779f1d48048fb5d4f1abf9ec3bf4`; all 188 current application files match the feature branch.


## 2026-10-02 — Compact header profile and modular presentation

**User request:** place profile behind a circular person icon at the header's right, reduce reverse/To spacing, explain Extended and make the editing interface more modular.

**Delivery:** consolidate the existing personal controls in a native modal; keep device-local storage and explicit Save to profile. Place the reversal action beside the field boundary without consuming a grid row. Extract independent presentation components and named layout/style settings, with [an editing guide](INTERFACE_EDITING.md). Preserve the existing planning state, model constraints, fares and facilities. Personalized opens trip preferences; personal settings are always accessible from the header. Extended remains at most one extra automatic cycling transfer across the complete journey.

**Boundary:** this is a modular code structure and configuration, not a delivered visual drag-and-drop editor. A possible owner-only preview/editor is documented separately. 309 regressions pass; browser interaction QA remains pending.

## 2026-10-02 — Saved profiles visible in Your trip

**User request:** represent created profiles among the Your trip choices, and explain the limitation on more than one optional cycling connection between services.

**Delivery:** saved profiles have selectable cards with name, pace, fare and selected/modified status. Cards and the header manager share profile state and persistence, including creation, rename, deletion and storage errors. Profiles apply personal settings while trip-style and route preferences remain independent. Saves remain explicit; schema and device-only scope are unchanged. 312 offline tests pass, including three new persistence regressions; browser QA is pending.

**Routing finding/proposal:** the single automatic-transfer limit is hard-coded in both solvers and reflected in one-round timetable discovery; no provider restriction is established. A bounded 0/1/2 experiment with shared budgets, measured discovery/runtime and permission/fare regressions is proposed, not implemented. [Details](MULTIPLE_CYCLING_TRANSFERS.md).

## 2026-10-02 — Baseline 0, Extended up to 2, and cycling position

**User authorisation:** implement zero automatic cycling connections in Baseline, up to two in Extended and choices to ride only at the beginning or only at the end.

**Decision/delivery:** count automatic transfers in both solvers and expand the sampled network in two bounded discovery rounds, including a departure-board seed after the first cycling link. Keep the original total request/deadline/cycling/boarding budgets and independent permission scopes. Preserve zero/one-transfer solutions in the larger comparison. Explicit waypoint-stage cycling remains separate, but beginning/end-only constraints apply to the entire journey and cannot reset at a visit.

**Position semantics:** a hard restriction on riding, distinct from ranking a less-active endpoint. Choosing one end selects Baseline and disables intermediate cycling. The other endpoint must match a transport stop; existing timed walking links remain usable. No new pedestrian router, parking/retrieval or bike rental. Bike custody and saved-profile fields are unchanged. The cycling-only card is labelled as an outside-preference reference and cannot automatically win.

**Evidence/boundary:** 322 offline regressions pass; new golden/acquisition cases are recorded in [EXPERIMENTS.md](EXPERIMENTS.md). Through quotes across cycling gaps remain unsupported; no price substitution. Live nationwide coverage/performance and browser interaction QA remain unmeasured. [Implementation and publication](MULTIPLE_CYCLING_TRANSFERS.md).


## 2026-10-03 — Bound each explicit search action and preserve exact fare evidence

**Authorisation:** Fix Extended and city fares, add the missing More time options and replace two help paragraphs with question-mark controls. **Delivery:** Minimal OJP stop payloads; expanded road-checked endpoint recovery; transfer discovery before ordinary alternatives; a fresh bounded allowance for an explicit Extended/More action, retaining checked paths and prior results. No budget reset inside a round. Functional later-departure pages preserve trip constraints and category ranking for their new start time. Allow past-date entry while keeping online fares future-only. A verified stationary connector does not interrupt fare lookup; real cycling gaps still do. Live city quotes succeeded without key or tariff-table changes. 327 regressions pass; browser QA remains pending. [Detailed evidence and caveats](SEARCH_RELIABILITY_2026-10-03.md). SBB prefilled handoff is the next discussion, not a delivered booking capability.

## 2026-10-03 — Soft hill preferences, transit climbing category and applicable section edits

**Authorisation:** implement the discussed hill options and improved path editing, including adjustable steepness and an independent transit-assisted climb optimization.

**Delivery:** preserve the three main recommendation categories and add optional Least cycling ascent/Gentlest cycling. Carry positive cycling ascent and chosen-grade resources through both solvers and waypoint stages; reserve lower-climb acquisition candidates. Prefer less excess uphill rise, then distance above the user-selected 1–20% threshold; do not claim a hard gradient cap from sampled elevation. Unknown elevation is ineligible for a climbing-category win. Hill preferences retain ordinary bike-access rules and shared budgets.

**Editing decision:** recalculate one cycling section through ordered map points; preserve exact public-transport objects and fare evidence. Apply must revalidate walking/boarding timing, section/total cycling limits, required visits and the horizon. Label custom results as edited journeys and retain the original proposal; support Restore. Do not falsely assign an optimization badge to a manual edit. Facility visit-duration insertion and persistent saved routes remain separate.

**Evidence:** 343 regressions pass, including 16 new cases. A dated Zürich HB–Zoo check returned tram 6 with 3 m cycling ascent versus 207 m cycling-only; live section application preserved transit/fare identity. Gentle 5% still exceeded 5%, confirming the soft-preference wording. [Evidence and pending browser QA](HILLS_AND_CYCLING_EDITOR_2026-10-03.md).

## 2026-10-03 — Separate climbing propositions and retain station-time evidence

**Decision:** Reduce climbing is an optional recommendation category, not a global cycling-route preference. Keep Gentler slopes and its editable percentage, remove the Climbing heading, and place help beside Cycling hills.

**Decision:** Use exact dated OJP interchange and point-to-platform access evidence before the documented Swiss stop default or app estimate. Keep passenger timing distinct from bicycle accessibility. Preserve incoming service/platform context during pruning; do not add the app buffer twice. A complete static transfer-table import remains pending (the official bulk endpoint returned HTTP 403 in this session). Source keys and hosting audience are unchanged. [Implementation and evidence](STATION_TIMES_2026-10-03.md).

## 2026-10-03 — National transfer sources and extra-category follow-up

**Research:** The publisher's dated GTFS SQLite copy is publicly readable with HTTP ranges and contains actual platform-pair rules. Its schema drops the Swiss transfer service-validity field and the stop DIDOK column. Do not treat the research copy as a complete lossless production import. Prefer a pinned original GTFS feed, explicit SLOID/platform mapping and scoped calendar-aware resolution. [Evidence and acceptance plan](STATION_TRANSFER_DATA_2026-10-03.md).

**Proposed interface:** Group Reduce climbing and Gentler slopes under Extra categories, retaining ordinary cycling candidates separately. The owner asked whether the controls could be merged; this update records the recommendation and does not change runtime behaviour.


## 2026-10-04 — Share the Less cycling budget across sections

**User feedback:** Reduce/Less cycling is too restrictive. **Decision:** keep the displayed 40-minute total and remove its hidden 20-minute access/egress and 10-minute intermediate caps. Use the same shared budget in candidate discovery, ordinary/ordered-stop routing and existing edit validation. Explain the split in Preferences. This is a change to the Less preset, not the Least cycling or walking ranking or Reduce climbing proposition. Other presets, cycling position, transport permission and transfer timing keep their existing meanings.

**Evidence:** Three routed regressions fail before the fix and pass afterwards; the full 363-case suite and production builds pass. Forty minutes remains accepted and 41 rejected, including journeys with requested stops. [Experiment](EXPERIMENTS.md#2026-10-04--less-cycling-shares-one-total-time-budget). National transfer-data integration remains separate and awaits a lossless original feed; no new data source or key was added.


## 2026-10-06–07 — Consolidate the approved branches and deployed transfer integration

**Authorization:** On 6 October the owner approved merging both prepared PRs and making the planner use the ZIP. PR #1 merged as `a62ac023f92a11817b1b176bd8e7122e3809eda7`; PR #2 merged as `ef18c8571cedfc67de272dfaf6c2c1688b9c0ea1`. This supersedes the 2 October instruction to leave the interface branch unmerged. On 7 October the owner requested synchronization of the deployed follow-up and current documentation to `main`.

**Decision / implemented boundary:** Compile only unrestricted type-2 minimum-time rows from the supplied original feed into a server-side runtime index. Keep explicit original/SLOID/DIDOK/platform identities, checksum, source and feed dates. Exact dated OJP evidence has priority; imported minima govern otherwise matched connections. Preserve incoming platform/service context in dominance, count existing walking once and keep the same check for editing/detours. Exclude all route/trip/calendar-scoped and other transfer types from this general index; never reinterpret them as general permission or bicycle-accessible paths.

**Consolidation:** Copy the already deployed version-53 application's 214 files exactly, including nine existing transfer regressions and the 12-second lookup timeout. Preserve unrelated GitHub work and historical decisions. Site-only archived project-documentation snapshots and source metadata are not copied into the authoritative repository. GitHub remains the durable source of truth; publication is separate, and this synchronization needs no duplicate deployment.

**Verification / limits:** 372 tests in 11 suites, formatting, Knip and TypeScript/frontend/Worker builds pass on 7 October. Source equality with Site commit `619bc7bb6814d69054e582b632a152a437adeba4` was checked file by file. General rules do not resolve service-specific exceptions, entrances, lifts/stairs or bicycle accessibility. Refresh the feed before its 12 December 2026 validity boundary. [Detailed implementation and release evidence](STATION_TRANSFER_RUNTIME_2026-10-06.md).

## 2026-10-07 — Arrival deadlines and worthwhile climbing compromises

**Decision:** Implement Arrive at as a destination deadline with latest-origin-departure ranking. Preserve forward directed routing and exact boarding checks; retain departure in dominance. Provider acquisition respects the deadline and ordered-stage suffixes. Ordinary Depart at behaviour remains available.

**Decision:** Reduce climbing uses a pilot minimum saving of 50 m and 25%, an extra-time cap of 30 minutes and 25% of reference duration, and a five-minute value per 100 m saved. Apply these tolerances only to category selection; retain raw ascent and strict Pareto resources. Unknown elevation cannot qualify. Do not add a card when its score ties the ordinary reference.

**Boundary:** Beginning/end-only currently keeps the bike through transit. Reuse that control when parking/collection routing is implemented, but do not imply parking markers alone supply that behaviour. Full Extra categories regrouping and Discover/boarding trade-offs remain proposals. [Details and evidence](ARRIVAL_AND_CLIMBING_2026-10-07.md).
