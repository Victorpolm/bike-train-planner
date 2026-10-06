# Cycling connection count and position

**3 October follow-up:** [Search reliability, clickable preference help, live city fares and functional later departures](SEARCH_RELIABILITY_2026-10-03.md) supersede the earlier deferred More/past-date notes and describe the new per-action discovery budgets. This report preserves the 2 October implementation history.

_2 October 2026 · implemented on `feature/novice-interface-profiles` following the user's request for Baseline 0 / Extended 2 and cycling only at the beginning/end. This supersedes the earlier investigation and proposed 0/1/2 selector._

## Delivered controls

| Choice | Behaviour |
|---|---|
| Baseline | 0 automatic cycling connections between public-transport services |
| Extended | Up to 2; zero- and one-connection journeys remain eligible |
| At either end and between services | Cycling position is unrestricted; the model's connection count still applies |
| Only at the beginning | Ride before the first public-transport boarding; no cycling afterwards |
| Only at the end | Ride after the last public-transport service; no cycling before the first boarding or between services |

The position selector is in Preferences and is separate from **Extra category**, which ranks active time at an endpoint. Choosing only one end switches to Baseline and disables Extended. Returning to unrestricted position enables Extended again. Saved traveller profiles remain rider/ticket settings, not route constraints. Trip-style presets retain the cycling position; it does not silently reset when choosing a profile or style.

Cycling to the first service and from the last service does not consume the two-transfer allowance. Requested intermediate stops retain their existing stage access/egress behaviour in both models; their explicit cycling is separate from automatic connections. The start/end restriction, however, applies to the entire journey including requested stops. The automatic allowance never resets at a waypoint.

## What changed in the engine

- Both ordinary and waypoint solvers count 0/1/2 automatic connections. A positive automatic transfer must be followed by public transport. Boarding, cumulative/per-leg cycling, horizon and permission constraints remain binding.
- Start-only disallows positive cycling after any boarding. End-only records when final cycling begins and then disallows further transit boardings. That phase participates in waypoint dominance so incompatible futures cannot prune each other.
- Timed walking edges can be reached at an exact starting stop and remain available at the finish or after a requested stop. Zero-distance waypoint transitions preserve this possibility.
- Ordinary and waypoint acquisition now use up to two discovery rounds from eligible, reached exits. Each round samples at most two stop/stage groups, one neighbouring cycling target per group and two onward connection queries. First-round target departure boards can reveal the middle ride even when there is no all-transit through journey from that target.
- Waypoint discovery aims at the next required stop, retains stage/count information and retries onward stage queries after newly reachable visits. Existing observed waypoint-transfer routing allows up to eight directed link checks.
- Each round shares the existing 18-request timetable cap, cycling-request budget and overall 90-second deadline for normal terrain searches. No per-round reset. Three bicycle-permission scopes remain independent before pruning. Paired results preserve completed zero/one-transfer alternatives, and partial-result warnings remain visible.

## Practical limits

The non-cycling endpoint needs to match a public-transport stop. Existing timed walking links are allowed, but there is no new general address-to-stop pedestrian router. An off-stop endpoint gets a specific explanation rather than an invented straight-line walk. The bicycle still travels with the person: this does not implement leaving it in parking, retrieval, rental or destination-bike availability.

The cycling-only card stays as a labelled reference outside a start/end-only restriction and is not automatically selected as the fastest eligible trip. It remains available for map comparison.

**Fares:** the existing online quote code does not quote a through trip interrupted by positive cycling legs. This remains true for one or two connections. It must not silently substitute an all-transit journey or sum overlapping through tickets. New tests preserve that boundary; per-block ticket aggregation is separate future work.

Discovery remains sampled. More potential connections can consume the existing deadline/request allowance; an empty or truncated search does not establish that no useful journey exists. Nationwide latency, route-quality gains and real station access have not been benchmarked in this release. The default four-boardings budget is unchanged. More than two automatic cycling connections remain unsupported.

## Verification and next checks

**322 offline tests in 11 suites pass.** Ten new regressions cover the 130/110/70-minute zero/one/two-transfer golden route, a third-transfer rejection, second-connection timing/budgets, all three permission scopes, start/end constraints independent of ranking, ordered-stop bypass prevention, walking links, two-round discovery after an empty first through query, idempotent extension and an unsupported address at the restricted end. Formatting, Knip and TypeScript/frontend/Worker builds pass. [Exact experiment and fixtures](EXPERIMENTS.md#2026-10-02--two-automatic-cycling-connections-and-placement-constraints).

Browser interaction QA and new live Swiss provider/performance checks remain pending. Manually select Personalized → Preferences; test Baseline/Extended and all three cycling positions; use a transit stop at the non-cycling end; reverse the endpoints and recheck the intended position; verify profile/style changes retain it; test an intermediate stop before/after transit; inspect every bike/walk leg and price uncertainty. Reversing locations leaves the relative beginning/end preference unchanged.

**Next step:** a small fixed Swiss route pilot with saved inputs and checkpoints, measuring useful two-transfer routes, provider calls, elapsed time and truncation, followed separately by address walking access. No new paid infrastructure, GPS or third-transfer rollout is implied.

## Publication

Owner-private **version 46** published on **2 October 2026 at 21:45:56 UTC**, environment revision **3**, Site source `043d35340c35317a2c54b3f473e3bf0a85d30125`. All **198 current application files** match `feature/novice-interface-profiles`; the branch and [draft PR #1](https://github.com/Victorpolm/bike-train-planner/pull/1) remain unmerged. Sharing and runtime secrets are unchanged.
