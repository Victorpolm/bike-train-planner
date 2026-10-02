# More than one cycling connection

_2 October 2026 · investigation and proposed next experiment. No routing expansion is implemented by the profile-card release._

## What limits the current planner

**Fact from the code:** Baseline allows cycling at the journey ends. Extended permits one additional automatic cycling connection between public-transport services. Ordinary public-transport changes are already possible. Access and egress rides do not consume this automatic-transfer allowance. Cycling through explicitly requested intermediate stops is handled separately; it does not grant one automatic transfer per stage.

The cap is an application choice in `prototype-v0/src/model.ts` (`middle !== 0`) and `src/waypoints.ts` (`extraTransfers >= 1`). It is not evidence of an OJP rule restricting travellers to one cycling transfer.

| Constraint | Current implementation | Implication for two or more transfers |
|---|---|---|
| Search state | The model sets a used-transfer state to 1; waypoint search shares it across all stages | Count transfers and retain the remaining allowance when pruning alternatives |
| Discovery | `api.ts` expands exits reachable without an automatic cycling transfer, then queries onward connections once | Explore newly reachable exits in subsequent bounded rounds; changing the solver cap alone can miss routes |
| Candidate sampling | Up to 2 transfer stops, 1 neighbour per stop, 2 onward queries in the ordinary Extended expansion | More rounds compete for a small sampled network; broader coverage must be measured |
| Timetable acquisition | Default shared client budget 18 requests; cycling requests are budgeted separately | Reuse cached results and stop with explicit incomplete-search evidence when budgets run out |
| Time and state limits | Typical road-routed search deadline 90 seconds, 50,000 labels per solver call | More transfer choices can increase both query work and alternative states; no multiplier has been measured |
| Journey constraints | 4 transit boardings by default, shared cycling budget, preset-dependent per-connection cap, 24-hour horizon | Two intervening rides need at least 3 boardings; with 4 boardings, at most 3 such rides could fit after an expansion |
| Connection feasibility | Directed road routes, walking access, estimated rider pace, boarding buffer, service times and bicycle-permission scope | Every additional transfer must pass the same checks; proximity alone is insufficient |
| Prices and display | Quotes and summaries follow selected transit legs | Verify multi-part exact-trip fare coverage and all intermediate rides; missing quotes must remain explicit |

The limit is therefore feasible to increase, but the complete change spans acquisition, both solvers, feasibility and presentation. It is not a one-line configuration change. National performance and useful-route gains are unmeasured.

## Recommended next experiment — not yet implemented

1. Offer a maximum of **0 / 1 / 2 cycling connections between services** in advanced trip preferences; default remains the existing choice. “Maximum” allows fewer when they are better. Keep access/egress out of the count.
2. Introduce one transfer-count option shared by ordinary and waypoint solvers. Preserve permission filtering before pruning, ordered stops, total cycling/boarding/time limits and the requirement to board a service after an automatic cycling transfer.
3. Expand discovery in bounded rounds from newly reachable exits, with cached directed bike links and onward timetable calls. Preserve useful 0/1-transfer journeys and publish partial results before exploring another round.
4. Verify golden cases requiring exactly two transfers, a tempting missed connection, total-budget exhaustion, all three bicycle-permission scopes, waypoints, loops and complete/partial fare coverage. Use identical acquired graphs when comparing solver behaviour.
5. Run a small fixed Swiss trip set with checkpoints. Compare new useful journeys, runtime, provider requests and incomplete-search rate. Decide whether a third transfer is useful only after those measurements. Do not default to unlimited transfers or imply complete network coverage.

**User decision still open:** whether to start this routing experiment next. The current request asks for its limitations; only saved-profile cards are implemented now.
