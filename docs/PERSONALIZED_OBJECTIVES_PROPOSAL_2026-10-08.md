# Preset objectives and Personalized results — 8 October 2026

**Status: historical brainstorming, partly superseded by implementation later on 8 October.** The owner subsequently authorized the objective sets, chose less mapped traffic exposure for Bikepacking, added fewer mandatory reservations and lower price to Personalized, and approved a boarding compromise with a 1.25 relative ceiling. These changes are delivered in version 58. Existing controls remain Preferences, and Least cycling now means cycling alone. See the [current contract, decisions and evidence](JOURNEY_OBJECTIVES_2026-10-08.md).

The remainder records the earlier proposal and then-current implementation for context. Statements below about what was not implemented refer to the version-57 snapshot. Scenic/interesting-place routing, Discover and custom cycling minimum/maximum remain proposals.

## Owner's proposed choices

| Trip preset | Requested comparisons |
|---|---|
| Commuter | Cycling only; fastest trip; fewer boardings with a worthwhile time trade-off; least cycling |
| Bikepacking | Cycling only; fastest trip; fewer boardings with the same trade-off idea; a nice bicycle + public-transport route that visits interesting places and avoids busy motor roads |
| Personalized | All previous preferences, plus choosing which objectives determine the alternatives displayed |

**Recommendation:** Keep trip style, personal rider/ticket settings, feasibility constraints and result objectives separate. Commuter/Bikepacking can supply default sets of requested comparisons. Personalized exposes those sets as multi-select options, along with the already discussed start/end effort and hill alternatives. Selecting a profile must not silently overwrite objective choices. Selecting several objectives requests distinct meaningful alternatives; it does not mean all objectives are minimized simultaneously or silently combined into one score. Identical journeys should retain multiple badges without duplicate cards.

Cycling only remains a labelled reference and does not compete for transit categories (otherwise it always wins zero boardings). When outside the requested cycling placement, budget or horizon, its reference-only label remains. An explicit rider goal to cycle more must not be treated as a disadvantage merely because a least-effort category also exists.

## Version-57 implementation versus the original proposal

**Fact:** The current ordinary categories are earliest arrival/latest departure, strict fewest boardings, and least cycling **plus walking**. Cycling only is separate. Extras are a single start-or-arrival dropdown, a separate Reduce climbing checkbox and a Gentler slopes path preference. There is no general multi-select objective control or Discover implementation. Commuter currently uses a 45-minute cycling cap, Simplest path and uncertain-but-not-prohibited bike access; Bikepacking uses no separate cycling cap, lower-traffic-stress paths and confirmed bike access.

**Open question:** Does the requested Least cycling minimize cycling alone or total cycling/walking effort? The present implementation minimizes their sum. If split, keep a walking cap and show both metrics so saving a short ride does not disguise a long walk. A checkbox label must match the actual objective.

## Fewer boardings and time gained

Earlier discussion proposed either an acceptable-delay constraint or minimizing T + λb on feasible transit journeys. Here b includes the first boarding. Neither new rule nor λ has been adopted or implemented. The current rule still minimizes boardings first within a +60-minute alternative window.

**Candidate experiment:** Interpret λ as the number of extra minutes the traveller accepts to avoid one boarding, with a separate overall delay guardrail. For a departure search, T must mean elapsed time from the common ready time (equivalently arrival ordering), not the newly displayed departure-to-arrival duration. For an arrival deadline, compare how much earlier one must leave. Keep feasibility and independent bicycle-permission scopes before ranking, and preserve the raw attributes and nondominated alternatives.

The earlier hypothetical candidates (120 min / 3 boardings, 134 / 2, 178 / 1) illustrate the marginal costs: 14 minutes for one fewer boarding, then another 44. λ = 20 would select 134 / 2; it is an illustrative test value, not a decided default. A proposed guardrail of min(30 minutes, 25% of the reference elapsed time) is also uncalibrated. Labels should say **Fewer boardings**, with an explanation such as **one fewer boarding · arrives 14 minutes later**. The literal fewest-boardings extreme can remain inspectable if requested.

## Bikepacking: what a nice path would require

**Recommendation:** Separate two signals: (1) a low-traffic-stress or infrastructure-preferred cycling path, and (2) visiting worthwhile locations. The existing low-stress preference addresses only part of the first; it is not evidence of scenic quality, live traffic, quietness or objective safety. No scenic score, verified attraction inventory or automatic scenic-detour search currently exists.

Start with a small reviewed pilot set of optional places, with source, location, access and any opening/visit-time information needed. State why a route is offered: for example, visits a named lakeside location and uses mapped cycling infrastructure. Avoid an unexplained universal niceness score. Respect rider interests and exclude required purchases or time-sensitive access unless the user chose them and usable information exists. Never equate unknown road attributes with a low-traffic road.

An automatic optional place is different from an explicit required intermediate stop. It needs candidate generation through that place and complete rechecking of transit timing, additional cycling/walking, climbing, bicycle permission and detour budgets. Existing required-waypoint support is useful infrastructure but does not implement scenic exploration. Record unknown access, elevation and infrastructure; do not fill a category with unsupported claims.

## Proposed experiment and decision gate

1. Compare current strict boarding winners, the illustrative compromise rule and the rider's choices on fixed Zurich pilot journeys, including the problematic Zurich–Laax input once its exact date, locations and profile are available. Keep route discovery constant to isolate ranking.
2. Prototype Personalized objective checkboxes using supported criteria and deduplicated result explanations. Keep ordinary candidates when acquiring optional hill paths; a UI-only move of Gentler slopes would still change the ordinary comparison.
3. Test the Bikepacking alternative with a small reviewed place set and an explicit extra-time/cycling allowance. Ask whether the proposed stop and path are desirable, rather than treating the algorithm's score as validation.
4. Decide the boarding threshold/guardrail, cycling-versus-active-time objective and place preferences from those observations before changing preset defaults.

This document preserves the original owner proposal and its then-open decisions. It supersedes the earlier suggestion to remove least cycling from Commuter's defaults; it does not claim any of these proposed changes are already delivered.

