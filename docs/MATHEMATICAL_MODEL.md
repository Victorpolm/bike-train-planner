# Implemented baseline and extended model

_Status: implemented on 2026-09-05 following explicit user approval. Experimental, bounded live search; bicycle carriage rules are postponed._

## Product behavior

Select **Baseline** or **Extended** before searching. Baseline permits cycling only before and after public transport. Extended permits **at most one positive-duration cycling leg between public-transport rides** and includes Baseline. Either transit portion may contain several trains, buses, trams and ordinary walking transfers. Extended does not require an intermediate ride and is not limited to two vehicle rides.

Results represent three main preferences: fastest, least cycling, fewest changes. An optional fourth preference minimizes cycling at the start or arrival. A journey winning multiple categories gets multiple badges on one card. Every card expands to the full timed sequence, including any intermediate cycling, service identifiers, stops, directions, available platforms, waiting and walking.

## Graph and feasible paths

Use a directed mode-labelled graph. Timetable ride edges have fixed departure and arrival events; traversing one requires reaching its departure stop before departure, including the boarding buffer. Thus travel time is time-dependent, and waiting is part of elapsed time. Cycling edges use an estimated duration. Walking edges currently come from timed transfers supplied by the timetable API.

The implementation compresses a transit vehicle ride into a boarding-to-alighting edge. Valid arrival checkpoints in a ride's pass list provide additional exit edges from the original boarding stop. Staying aboard to a later exit is still one boarding. Missing checkpoint times are not invented; a point with no arrival time is not treated as an alighting stop. The graph does not automatically provide boarding at every pass-list stop: those outgoing rides must also be discovered.

For a path P define:

- T(P): destination arrival minus the common requested departure time, including all waiting.
- B(P) = B_start(P) + B_middle(P) + B_end(P): total cycling minutes.
- k(P): number of actual vehicle boardings; changes = k(P) - 1.
- m(P): number of positive intermediate cycling blocks between rides.

The common feasible set requires k >= 1, k <= K_max, T <= H, B <= B_max, endpoint cycling within its separate limits, and intermediate cycling within its own limit. Walking and cycling are not vehicle boardings. Pure cycling never competes for fewest changes.

Let P_0 be this set with m = 0 and P_1 the same set with m <= 1. Then P_0 is a subset of P_1. In particular, the fastest Extended arrival cannot be later than the fastest Baseline arrival on the same graph and constraints. Pareto frontiers themselves need not be nested: new paths can dominate old ones.

The mathematical experiment assumes the bicycle is available after every transit ride. **This is not evidence that an operator permits carriage.** Carriage, capacity, reservations, station infrastructure, elevation and road accessibility are outside this experiment.

## Objectives, dominance and categories

The main vector to minimize is F(P) = (T(P), B(P), k(P)). P dominates Q when every component is no larger and at least one is smaller. Equal vectors are tied, not strictly dominant. Incomparable vectors express different user trade-offs.

The selected endpoint duration is added as a fourth objective when an endpoint preference is active; otherwise filtering only on the three main objectives could wrongly remove its best candidate.

| Category | Lexicographic minimization |
|---|---|
| Fastest | (T, B, k) |
| Least cycling | (B, T, k) |
| Fewest changes | (k, T, B) |
| Optional shorter ride at start | (B_start, T, B, k) |
| Optional shorter ride at arrival | (B_end, T, B, k) |

Candidates for display must arrive within the configurable extra-time allowance of that model's fastest journey. This is a **presentation filter**. It does not change the absolute feasibility horizon or the underlying comparison. Ties are resolved by a stable journey identifier. Multiple category wins are merged; the interface shows at most four distinct cards, and sometimes fewer than three.

## Multi-label search

`prototype-v0/src/model.ts` contains the pure solver. A label records:

`(stop, arrival time, cumulative cycling, boardings, intermediate blocks used, needsTransit, initial cycling, leg sequence)`

`needsTransit` is true after initial cycling or intermediate cycling and becomes false on boarding a transit ride. The destination can only be accepted when it is false. This prevents a second cycling segment being misclassified as an intermediate leg without subsequent transit.

Transitions are:

1. Initial estimated cycling to an observed boarding stop within the start limit.
2. A scheduled transit ride if departure >= current time + boarding buffer; increment boardings.
3. A supplied timed walking transfer if its departure is reachable; preserve the phase.
4. In Extended, cycling from a reached transit stop to another observed boarding stop if no intermediate leg has been used; increment m and require another transit ride.
5. Final estimated cycling after transit, within arrival and cumulative limits.

Only labels with the **same stop, intermediate count and needsTransit phase** are compared for pruning. A label can replace another if it is no later and has no more cumulative cycling, boardings or initial cycling. Initial cycling is retained for optional endpoint ranking. Final cycling is determined by the current stop. Keeping only one earliest-arrival label per station would lose useful low-cycling or low-boarding journeys.

With no resource truncation, the solver finds the relevant non-dominated objective vectors on its supplied finite graph. It is a label-correcting enumerator, not an implementation of RAPTOR, McRAPTOR or ULTRA. Its cost depends on the number of incomparable labels: a conservative bound is O(L(E + V^2 + L)), with L labels, E timed edges and V stops. This is not a claim of nationwide interactive scalability. The implementation caps generated labels at 50,000 per solve and reports truncation. Baseline candidates are explicitly unioned into Extended to preserve the inclusion check even at that cap.

## Defaults and controls

These numbers are implementation defaults for the experiment, not empirically calibrated user preferences.

| Parameter | Default |
|---|---:|
| Estimated cycling speed | 15 km/h |
| Initial catchment band / expansion step | 20 min / 20 min |
| Maximum initial cycling | 60 min |
| Maximum final cycling | 60 min |
| Maximum intermediate cycling | 20 min |
| Maximum total cycling | 90 min |
| Maximum vehicle boardings | 4 (3 changes) |
| Boarding buffer before every vehicle ride | 3 min |
| Absolute journey horizon | 480 min |
| Extra arrival allowance for category alternatives | 60 min |

All budgets and the optional endpoint category are exposed under **Cycling limits & preferences**. Speed and boarding buffer are currently fixed in the interface. Cycling estimates round positive durations up to whole minutes. Coincident points within one metre get zero minutes. The API query time rounds up to a Swiss local minute and the solver rechecks exact catchability against timestamps, including seconds and midnight.

## Catchment expansion and live candidate sampling

Departure and arrival are handled separately. Each starts with nearby public-transport stops plus a small existing list of Swiss rail hubs. Discovery scans outward in 20-minute bands to the respective hard limit, retaining earlier discoveries. A centre with existing stops can skip additional sampling inside its initial band. At most two additional geographic probes per endpoint sample outward bands, rotating directions; this is not an entire cycling isochrone. Known stops and rail hubs remain eligible through the hard radius bound even when the discovery probe cap is reached. A stop successfully resolved during geocoding is retained as a candidate even if nearby lookup later fails.

At most six query stops per endpoint retain the closest two stops, up to two rail hubs, and representatives from the radius bands before filling remaining slots by distance. Buses and trams are not rejected by name, punctuation or icon. All returned public-transport modes are available in **both** models. The same cumulative budget removes impossible endpoint pairs before requesting connections.

The user's minimal-feasible-radius-plus-20 idea motivates this search. There may be several incomparable minimal `(start radius, arrival radius)` pairs, so independent scalar minima need not form a feasible pair. **This prototype scans all bands within the hard limits instead of claiming to identify an exact global minimum or stopping at the first connection.** Sampling and the six-stop cap mean it can still miss a useful station or a better journey. This is an explicit bounded approximation of adaptive discovery.

Baseline requests up to six upcoming API connections per eligible endpoint pair and keeps all usable timed sections, not just the earliest-arriving returned connection. The graph may expose additional usable stops through those sections and pass-list exits.

Extended additionally:

- seeds up to three departure boards, with six services each, even when Baseline has no complete journey;
- finds reachable alighting stops without intermediate cycling;
- samples six such stops, ordered by geographic proximity to the destination, for up to two nearby cycling-transfer targets each;
- requests at most 18 onward connections to up to two sampled arrival stops, starting from the earliest feasible readiness at each target;
- constructs positive cycling links within the intermediate limit between reached stops and observed boarding stops in the graph.

The suffix queries only return a finite next-service window; later low-boarding/low-cycling possibilities can still be absent. Geographic ordering is a heuristic, not a proof of optimality. A full Swiss timetable graph or an existing routing engine remains the route toward comprehensive search.

## Fair comparison, failures and cancellation

One departure instant and one set of budgets are captured per search. Switching to Extended reuses the in-memory timetable responses, discovers its additional edges, and recomputes **both** solutions on the same expanded graph. Subsequent toggling reuses those paired results. Baseline category winners may improve after this data expansion. Editing an address or a budget invalidates old results and starts a new comparison.

The graph is a per-search collection of API responses, not an atomic nationwide timetable snapshot. Real-time delay/prognosis fields are not used; the experiment compares scheduled times. This is shown as a dated Swiss-time search, not a continuously refreshed departure board.

Transport requests are serialized, spaced by at least 400 ms, cached within the search, limited to 100 and given timeouts of at most eight seconds. Each acquisition phase has a 90-second wall-clock budget; requesting Extended starts a new phase while retaining the total request cap and any rate-limit stop. Endpoint pairs with less cycling are queried first so useful local connections are considered early. Stop-name geocoding fallback requests are separate from this routing budget (five seconds for the primary address lookup, then at most ten seconds for fallback). A rate-limit response stops further timetable requests. Errors, timeouts, rejected sections and resource caps produce a visible partial-search notice. Cancellation aborts active and queued requests. An empty candidate set is described as no journey **found among sampled connections**, not proof that travel is impossible.

GeoAdmin address lookup falls back to the Transport API's place/stop lookup on missing results, service failure or timeout. Resolved place names appear with the results so the user can check the interpretation.

## Implementation boundaries and next experiment

| File | Responsibility |
|---|---|
| `src/routing.ts` | Shared types, distance and formatting helpers |
| `src/timetable.ts` | Normalize timed API sections and departure-board exits |
| `src/api.ts` | Geocoding, sampling, throttling, caching and live graph acquisition |
| `src/model.ts` | Feasibility, multi-label graph search, Pareto filtering and categories |
| `src/App.tsx` | Model switch, preferences, categories, empty/partial/cancel states |
| `src/itinerary.ts`, `src/JourneyPlan.tsx` | Full chronological journey decomposition |
| `src/MapView.tsx` | Schematic transit, walking and cycling legs |

Cycling lines are straight-line estimates, not navigable roads. Walking transfers are only the observed timed edges. Stops are station-level rather than a platform/infrastructure graph; the three-minute buffer does not certify real-world transfer feasibility. Departure times can become stale while a long search runs. No bike permission, route-safety or national optimality claims are made.

OpenTripPlanner remains the production-engine candidate. Its documented access/egress limits, stop caps, transit transfer controls and itinerary filters confirm that bounded discovery and result filtering are existing-engine concerns. The next technical comparison should run fixed Swiss cases against an OTP deployment with complete timetable/street data, and check whether its state and objective support can reproduce this zero-versus-one-intermediate-leg experiment. No OTP instance has been installed or benchmarked here.

Primary references consulted:

- [Transport API schema and request limits](https://transport.opendata.ch/docs.html)
- [OpenTripPlanner route-request controls](https://docs.opentripplanner.org/en/latest/RouteRequest/)
- [RAPTOR / multicriteria transit routing paper](https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf)
- [ULTRA: unrestricted multimodal transfer routing](https://arxiv.org/abs/1906.04832)

For measured results and the recorded Zürich–Laax case, see [EXPERIMENTS.md](EXPERIMENTS.md).
