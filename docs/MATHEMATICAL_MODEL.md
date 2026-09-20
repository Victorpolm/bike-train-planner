# Implemented baseline and extended model

_Status: implemented on 2026-09-05; active-travel objectives and map/comparison presentation updated on 2026-09-18 following explicit user approval. Experimental, bounded live search; bicycle carriage rules are postponed._

## Product behavior

Select **Baseline** or **Extended** before searching. Baseline permits cycling only before and after public transport. Extended permits **at most one positive-duration cycling leg between public-transport rides** and includes Baseline. Either transit portion may contain several trains, buses, trams and ordinary walking transfers. Extended does not require an intermediate ride and is not limited to two vehicle rides.

The preceding zero-versus-one rule describes searches **without requested intermediate stops**. Ordered stopovers added on 2026-09-20 use the stage extension below; cycling to a required visit is part of that visit, not an automatically selected transfer.

Results first show a separate cycling-only estimate, then transit preferences: fastest, fewest boardings, and least cycling or walking. An optional fourth minimizes active time at the start or arrival. A transit journey winning multiple categories gets multiple badges on one card. Transit cards expand to the full timed sequence, including any intermediate cycling, service identifiers, stops, directions, available platforms, waiting and walking. Numbered map pins identify actual boarding/alighting events; candidate and observed timetable stops are shown separately. See [RESULTS_AND_MAP.md](RESULTS_AND_MAP.md).

## Graph and feasible paths

Use a directed mode-labelled graph. Timetable ride edges have fixed departure and arrival events; traversing one requires reaching its departure stop before departure, including the boarding buffer. Thus travel time is time-dependent, and waiting is part of elapsed time. Cycling edges use a directed road route and its terrain-aware estimated duration; unavailable links are absent from the production graph. See [CYCLING_ROUTES.md](CYCLING_ROUTES.md). Walking edges currently come from timed transfers supplied by the timetable API.

The implementation compresses a transit vehicle ride into a boarding-to-alighting edge. Valid arrival checkpoints in a ride's pass list provide additional exit edges from the original boarding stop. Staying aboard to a later exit is still one boarding. Missing checkpoint times are not invented; a point with no arrival time is not treated as an alighting stop. The graph does not automatically provide boarding at every pass-list stop: those outgoing rides must also be discovered.

For a path P define:

- T(P): destination arrival minus the common requested departure time, including all waiting.
- B(P) = B_start(P) + B_middle(P) + B_end(P): total cycling minutes.
- W(P): sum of timed walking-leg durations; waiting is excluded.
- A(P) = B(P) + W(P): total active travel minutes, the quantity minimized by "least cycling or walking".
- A_start(P): initial cycling plus walking before the first boarding.
- A_end(P): final cycling plus walking after the last alighting.
- k(P): number of actual vehicle boardings; changes = k(P) - 1.
- m(P): number of positive intermediate cycling blocks between rides.

The common feasible set requires k >= 1, k <= K_max, T <= H, B <= B_max, endpoint cycling within its separate limits, and intermediate cycling within its own limit. Walking and cycling are not vehicle boardings. Pure cycling never competes for fewest changes.

Cycling budgets remain constraints on B, not A. Under the current road adapter, a cycling leg includes its short endpoint walking connectors in B; these connectors are separately disclosed in the profile and are not counted again in W. Timetabled walking remains in W. Walking currently has no separate resource limit beyond the overall horizon; it is limited by the sampled timed transfer edges and now penalized in the active-time objective. A dedicated walking budget remains future work.

Let P_0 be this set with m = 0 and P_1 the same set with m <= 1. Then P_0 is a subset of P_1. In particular, the fastest Extended arrival cannot be later than the fastest Baseline arrival on the same graph and constraints. Pareto frontiers themselves need not be nested: new paths can dominate old ones.

The mathematical experiment assumes the bicycle is available after every transit ride. **This is not evidence that an operator permits carriage.** Carriage, capacity, reservations, station infrastructure, elevation and road accessibility are outside this experiment.

## Objectives, dominance and categories

The main vector to minimize is F(P) = (T(P), A(P), k(P)). This supersedes the 2026-09-05 cycling-only objective. P dominates Q when every component is no larger and at least one is smaller. Equal vectors are tied, not strictly dominant. Incomparable vectors express different user trade-offs. Raw B and W remain separately available.

The selected endpoint's active duration is added as a fourth objective when an endpoint preference is active; otherwise filtering only on the three main objectives could wrongly remove its best candidate. The UI still offers one optional endpoint category at a time.

| Category | Lexicographic minimization |
|---|---|
| Fastest | (T, A, k) |
| Fewest boardings | (k, T, A) |
| Least cycling or walking | (A, T, k) |
| Optional least cycling or walking at start | (A_start, T, A, k) |
| Optional least cycling or walking at arrival | (A_end, T, A, k) |

Candidates for display must arrive within the configurable extra-time allowance of that model's fastest journey. This is a **presentation filter**. It does not change the absolute feasibility horizon or the underlying comparison. Ties are resolved by a stable journey identifier. Multiple category wins are merged; the interface shows at most four distinct cards, and sometimes fewer than three.

These are transit cards; the cycling-only reference is an additional first card. It uses the same departure instant and sums the upward-rounded routed stage times, including estimated short endpoint walking access. It stays outside transit feasibility, Pareto comparison and the extra-time filter, and remains visible when above the cycling budget. It appears when every cycling-only stage has a usable road route; mixed journeys may appear first. A completed reference survives timetable failure or cancellation. The former `ceil(60 * haversine_km / 15)` rule is retained only in explicitly opted-in historical/synthetic tests, never as a production fallback.

## Multi-label search

`prototype-v0/src/model.ts` contains the pure solver. A label records:

`(stop, arrival time, cumulative cycling, cumulative walking, initial active time, walking since last alighting, boardings, intermediate blocks used, needsTransit, initial station, leg sequence)`

`needsTransit` is true after initial cycling or intermediate cycling and becomes false on boarding a transit ride. The destination can only be accepted when it is false. This prevents a second cycling segment being misclassified as an intermediate leg without subsequent transit.

Transitions are:

1. Initial estimated cycling to an observed boarding stop within the start limit.
2. A scheduled transit ride if departure >= current time + boarding buffer; increment boardings.
3. A supplied timed walking transfer if its departure is reachable; preserve the phase and add its duration to walking. Before any boarding, add it to initial active time. Track walking since the most recent alighting; boarding resets that trailing amount to zero.
4. In Extended, cycling from a reached transit stop to another observed boarding stop if no intermediate leg has been used; increment m and require another transit ride.
5. Final estimated cycling after transit, within arrival and cumulative limits.

Only labels with the **same stop, intermediate count and needsTransit phase** are compared for pruning. A label can replace another if it is no later and has no more cumulative cycling, total active time, boardings, initial active time or trailing walking. Cycling must remain a separate dominance coordinate because it consumes a hard budget: a path with less active time but more cycling may not afford a later cycling leg. Initial active time and trailing walking preserve endpoint preferences. Final cycling is determined by the current stop, while final walking depends on the path history. Keeping only earliest arrival, or adding walking only after the search, could discard the desired result.

With no resource truncation, the solver finds the relevant non-dominated objective vectors on its supplied finite graph. It is a label-correcting enumerator, not an implementation of RAPTOR, McRAPTOR or ULTRA. Its cost depends on the number of incomparable labels: a conservative bound is O(L(E + V^2 + L)), with L labels, E timed edges and V stops. This is not a claim of nationwide interactive scalability. The implementation caps generated labels at 50,000 per solve and reports truncation. Baseline candidates are explicitly unioned into Extended to preserve the inclusion check even at that cap.

## Defaults and controls

These numbers are implementation defaults for the experiment, not empirically calibrated user preferences.

| Parameter | Default |
|---|---:|
| Cycling profile | BRouter touring, moderate effort, 25 km/h cap |
| Initial catchment band / expansion step | 20 min / 20 min |
| Maximum initial cycling | 60 min |
| Maximum final cycling | 60 min |
| Maximum intermediate cycling | 20 min |
| Maximum total cycling | 90 min |
| Maximum vehicle boardings | 4 (3 changes) |
| Boarding buffer before every vehicle ride | 3 min |
| Absolute journey horizon | 1,440 min (includes waiting) |
| Extra arrival allowance for category alternatives | 60 min |

The form exposes **From**, **To**, **Departure** (Leave now by default, or a chosen Swiss date/time), and **Baseline / Extended**. Optional preferences select one of the following cycling presets and an endpoint category; there are no required numeric controls. Other budgets remain the defaults above. The 24-hour horizon replaces the implicit eight-hour default after the recorded Libingen–EPFL failure; it includes overnight waiting, which remains part of elapsed time. Next-day arrival dates are explicit.

| Cycling preference | Total cycling | Initial / final, each | Intermediate |
|---|---:|---:|---:|
| Less | 40 min | 20 min | 10 min |
| Balanced | 90 min | 60 min | 20 min |
| More | 150 min | 90 min | 30 min |

Cycling estimates round positive durations up to whole minutes. Coincident points within half a metre, or matching selected/provider stop IDs, get zero minutes. Identity avoids adding fictitious cycling for slight coordinate differences between datasets. The API query time rounds up to a Swiss local minute and the solver rechecks exact catchability against timestamps, including seconds and midnight.

## Catchment expansion and live candidate sampling

Departure and arrival are handled separately. A selected stop retains its ID and coordinates and can be queried without geocoding or nearby lookup. An address initially uses a known rail hub within 20 cycling minutes if one exists; otherwise it requests nearby public-transport stops. If no candidate is available, or initial successful connection requests yield no feasible journey, additional discovery samples outward in 20-minute bands within each hard limit. At most two extra probes per endpoint are made (north/south). Earlier candidates and known rail hubs remain eligible through their hard bounds; this is not a complete isochrone.

Geographic distance at a 25 km/h upper bound is only a coarse discovery filter. Every accepted candidate is rechecked with a directed road route and actual time limits. The first feasible road pair can be queried before the remaining candidates are routed; already supported proposals are published before checking additional observed-stop links.

At most four query stops per endpoint retain nearest stops, rail hubs and band representatives as space permits. All returned public-transport modes, including buses and trams, are available in both models. Pairs exceeding the cumulative cycling budget are rejected before HTTP. Up to three pairs request four upcoming connections each. The first pair uses the initially verified candidate paths; remaining slots first cover rail departure candidates, choosing the nearest feasible rail arrival when available, then rail arrival candidates and other pairs. Duplicate/already-queried pairs are excluded. This prevents several adjacent bus stops consuming all query slots before a feasible rail hub is tried. After fallback discovery at most three previously unqueried pairs are tried. Every response contributes all usable timed sections and pass-list exits, followed immediately by model/category computation and publication. The UI does not wait for the whole batch.

The user's minimal-feasible-radius-plus-20 idea remains the motivation for adaptive discovery. There can be incomparable minimal `(start radius, arrival radius)` pairs, so separate scalar minima need not form a feasible pair. This implementation does not prove a globally minimal feasible radius. Fewer pair queries and deferred outward probes intentionally prioritize early results; they can miss better connections, including ones in the extra band after initial success.

Extended first compares both models on the graph already obtained, then additionally:

- seeds one departure board with six services even if Baseline has no complete journey;
- finds reachable alighting stops without intermediate cycling;
- samples two such stops, ordered by proximity to the destination, for one nearby cycling-transfer target each;
- requests at most two onward connections to the nearest sampled arrival stop from the earliest feasible target readiness;
- constructs positive cycling links within the intermediate limit between reached stops and observed boarding stops.

After each data-producing query, both models are recomputed on the same graph and proposals are published. The solver still keeps lower-cycling/lower-boarding labels; provider windows and geographic sampling can omit useful later services. Comprehensive coverage remains a future routing-engine experiment.

## Fair comparison, failures and cancellation

One departure instant and one set of budgets are captured per search. Leave now captures the current instant; a selected date/time is parsed in Europe/Zurich independently of device timezone. Invalid dates and the nonexistent spring clock-change hour are rejected; the first occurrence of a repeated autumn hour is used. The form rejects past selected departures. Switching to Extended reuses the in-memory timetable responses, discovers its additional edges, and recomputes **both** solutions on the same expanded graph. Subsequent toggling reuses completed paired results. An explicit completion flag distinguishes a provisional Extended solution from completed acquisition. Baseline category winners may improve after this data expansion. Editing an address, departure or budget invalidates old results and starts a new comparison.

The graph is a per-search collection of API responses, not an atomic nationwide timetable snapshot. Real-time delay/prognosis fields are not used; the experiment compares scheduled times. This is shown as a dated Swiss-time search, not a continuously refreshed departure board.

Transport requests are serialized, spaced by at least 400 ms and limited to 18 per search. A deadline of at most 20 seconds covers both HTTP and reading the response body; each acquisition phase has a 90-second wall-clock budget. Requesting Extended starts a new phase while retaining the total cap and any rate-limit stop. Successful responses are cached in the search; failed queries are not cached as valid empty results. A rate-limit response stops further timetable requests.

Errors, rejected sections and resource caps generate an incomplete-search notice. The first proposals remain interactive while more data loads; cancellation aborts active/queued requests and keeps published proposals. A cancelled session must start a fresh search to acquire more data, rather than reuse an aborted controller. Empty results with upstream failures say the search is incomplete; an empty successful sample is not proof travel is impossible.

Address and stop suggestions appear after two typed characters, using immediate accent-insensitive known-hub matches and independently published GeoAdmin/Transport results. A 350 ms debounce, cancellation and a generation guard reject stale queries. Each live lookup has a 20-second deadline; successful combined suggestions use a bounded 50-query in-memory cache. Selection preserves coordinates and stop IDs. Searching unselected text proceeds on the first valid match and cancels the slower provider; resolved labels are shown for checking. These lookup requests are separate from the timetable acquisition budget. There is no persisted address history.

## Ordered requested stops (2026-09-20)

`src/waypoints.ts` handles up to four requested intermediate points. For points `(origin, via_1, ..., via_n, destination)`, a label also records the index of the last visited point, whether its current stage has used transit, and whether it must board after a cycling access/automatic transfer. Advancing to the next point preserves cumulative cycling, walking, boardings, automatic transfers used, endpoint active time and elapsed time. Dominance compares only compatible stage/phase states, including whether the complete journey has any transit. A slower prefix with fewer boardings or less cycling must survive when it enables an onward stage.

Each stage may cycle directly within `max(maxAccessMinutes, maxEgressMinutes)`, or cycle to transit and out to its requested endpoint within the corresponding per-leg limits. The global cycling cap still applies. A complete transit-category journey needs at least one transit boarding across all stages. Baseline allows access/egress at every **requested** stage. Extended adds at most one **automatic** cycling transfer across the whole journey, followed by another boarding. Required visits can therefore create more than one cycling block between rides without violating this extended-stage definition. Both models are evaluated on the same observed graph; Extended retains Baseline journeys explicitly.

Requested points are visits, not merely stations a train passes through: the itinerary reaches the point and continues from there. No dwell duration is currently added. Reboarding still requires the three-minute buffer. All stages share the original departure, absolute horizon, total cycling and boarding limits. Stage solutions are not independently optimized and concatenated. Pure cycling follows the same ordered points and sums the rounded segment estimates.

Acquisition considers a pool of up to four stops per requested point and checks directed road links, initially stopping after a feasible candidate. It queries up to two available station pairs per adjacent stage; the progressive road pass can leave fewer candidates than the legacy geometric experiment. Onward queries start at a reached waypoint time plus the chosen station access and boarding buffer. All stages share the original 18-request/90-second phase budget. The first provider window can omit services needed by a slower feasible prefix; a label/resource cap can also make acquisition incomplete. Unlike no-via Extended searches, this first implementation does not add departure-board or transfer-suffix discovery to via searches. Switching to Extended also checks up to four short directed automatic-transfer pairs on the already acquired stage graph; no extra timetable departure-board discovery is added.

Map selection creates an exact coordinate, then asks GeoAdmin for nearby feature names with a six-second deadline. A name is labelled “Near …”; lookup never snaps to a station or assigns its ID. Failure retains the coordinate label. Repeated drags cancel obsolete naming requests; names update only the still-matching selected point, including after reordering or reversal. Form changes and marker moves invalidate previous route results. Editing is disabled while acquiring a journey; Stop search enables editing again.

## Implementation boundaries and next experiment

| File | Responsibility |
|---|---|
| `src/routing.ts` | Shared types, distance and formatting helpers |
| `src/timetable.ts` | Normalize timed API sections and departure-board exits |
| `src/api.ts` | Progressive timetable acquisition, stop sampling, throttling and per-search caching |
| `src/http.ts` | Portable cancellation and full-response deadlines |
| `src/places.ts`, `src/PlaceInput.tsx` | Address/stop suggestions, selected places and stale-query handling |
| `src/preferences.ts` | User cycling preferences mapped to mathematical budgets |
| `src/departure.ts` | Swiss-time form values and timezone-independent departure parsing |
| `src/model.ts` | Feasibility, multi-label graph search, Pareto filtering and categories |
| `src/waypoints.ts` | Ordered requested visits with cumulative journey budgets |
| `src/App.tsx` | Model switch, preferences, categories, empty/partial/cancel states |
| `src/itinerary.ts`, `src/JourneyPlan.tsx` | Full chronological journey decomposition |
| `src/MapView.tsx` | Routed cycling, schematic transit/walking and profile position |
| `src/cycling.ts`, `src/cyclingClient.ts` | Directed road geometry/time, attributes, elevation and bounded provider requests |
| `src/CyclingDetails.tsx` | Map-linked elevation and road-attribute summaries |
| `src/mapData.ts` | Distinct explored stops and ordered boarding/alighting events for map pins |

Cycling lines follow the provider road network; short endpoint gaps are explicitly unverified walking connectors. Route estimates do not provide turn-by-turn navigation or validate every access restriction. Walking transfers are only the observed timed edges. Stops are station-level rather than a platform/infrastructure graph; the three-minute buffer does not certify real-world transfer feasibility. Departure times can become stale while a long search runs. No bike permission, route-safety or national optimality claims are made.

OpenTripPlanner remains the production-engine candidate. Its documented access/egress limits, stop caps, transit transfer controls and itinerary filters confirm that bounded discovery and result filtering are existing-engine concerns. The next technical comparison should run fixed Swiss cases against an OTP deployment with complete timetable/street data, and check whether its state and objective support can reproduce this zero-versus-one-intermediate-leg experiment. No OTP instance has been installed or benchmarked here.

Primary references consulted:

- [GeoAdmin search service](https://docs.geo.admin.ch/access-data/search.html)
- [Transport API schema and request limits](https://transport.opendata.ch/docs.html)
- [OpenTripPlanner route-request controls](https://docs.opentripplanner.org/en/latest/RouteRequest/)
- [RAPTOR / multicriteria transit routing paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf)
- [ULTRA: unrestricted multimodal transfer routing](https://arxiv.org/abs/1906.04832)

For measured results and the recorded Zürich–Laax case, see [EXPERIMENTS.md](EXPERIMENTS.md).
