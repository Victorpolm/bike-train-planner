# Journey objectives and boarding compromises — 8 October 2026

## Authorization and delivered choices

**Decision:** The owner explicitly approved implementing Commuter/Bikepacking objective sets, choosing lower traffic exposure instead of an unsupported scenic category, and adding fewer mandatory reservations and lower price to Personalized. Existing cycling duration, placement, road preference, hills and endpoint controls remain in Preferences. This supersedes the implementation boundary in the earlier [brainstorming proposal](PERSONALIZED_OBJECTIVES_PROPOSAL_2026-10-08.md).

| Trip mode | Default objectives |
|---|---|
| Commuter | Earliest arrival / latest departure; fewer boardings with a time compromise; least cycling |
| Bikepacking | Earliest arrival / latest departure; fewer boardings with the same compromise; less mapped traffic exposure |
| Personalized | Multi-select the above plus fewer mandatory bicycle reservations and lowest complete checked price |

Cycling only remains a separate reference in every mode, including its explicit outside-budget/placement labels; it cannot win a transit category. Main objective checkboxes appear under the trip style, separately from Preferences. Checking a custom combination switches to Personalized. At least one objective remains selected. Selecting a traveller profile does not overwrite these objectives. Duplicate winners share one card with multiple badges. Unsupported objectives show a missing-data explanation rather than an invented winner. Existing hill/endpoint preferences can still request their additional alternatives.

**Clarification / changed definition:** Least cycling now minimizes cycling minutes alone. Walking minutes remain visible and constrained independently by the existing pedestrian-section limit. The former main objective minimized cycling plus walking. A zero-cycling journey may therefore beat a short ride while involving more walking; the new label describes this deliberately. Endpoint preferences still minimize active time at their selected end.

## Fewer boardings: formulation and meaning

For the sampled feasible transit candidates within the user's general alternative window, let b count every boarding, including the first. In a departure search let T be elapsed minutes from the common ready time, not the newly displayed departure-to-arrival duration. Let T* be the earliest-arriving eligible reference. Select the minimum of T + 20 b subject to:

`T − T* <= min(general alternative allowance, 30 minutes, 0.25 T*)`.

Equivalently, the allowed arrival bound is the minimum of T* + 30 and 1.25 T*, also respecting the pre-existing general allowance. The percentage is dimensionless; the 20-minute boarding penalty is a separate parameter. Taking the minimum is stricter on short trips, not a relaxation of the absolute ceiling. Both 20 minutes/boarding and 30 minutes are explicit pilot settings, not calibrated willingness-to-wait estimates.

For Arrive by, the reference is the latest feasible origin departure. Replace extra arrival time by how much earlier an alternative must leave; apply the 25% bound to that reference's journey duration. Timetable feasibility, station minimums and departure/arrival constraints are unchanged. Ties favour less extra time. When no worthwhile reduction qualifies, the reference receives the badge with an explicit explanation; do not claim a saved boarding.

**Golden example:** 120 minutes / 3 boardings, 134 / 2, 178 / 1. Scores are 180, 174 and 198; the allowance is 30 minutes. The 134-minute candidate wins. On a 40-minute reference, the allowance is 10 minutes; a one-second excess fails. Long trips still have the 30-minute absolute ceiling. This is a synthetic ranking experiment, not a reproduced Zürich–Laax timetable.

## Less traffic exposure

**Implemented proxy:** Sum section length times a road-exposure weight. Separated cycleways use 0.2, shared paths 0.6, painted lanes start at 1.5, ordinary mixed traffic at 2, with higher weights for primary/secondary/trunk roads and higher posted-speed bands. Missing speed information on motor roads receives the conservative higher-speed weight. Missing road/infrastructure coverage is tracked independently and cannot win this category. These heuristic weights are uncalibrated: this is neither actual traffic volume, scenic quality, nor objective safety.

This is total mapped exposure, so cycling less can also improve it. It does not maximize a pleasant ride's length; custom cycling targets and a continuous-ride objective remain unimplemented. The existing infrastructure-preferred cycling setting remains available in Preferences.

The cycling client separately retains a lower-stress candidate from its bounded checked alternatives, preserving the ordinarily selected path. For the Fastest path preference, its alternative request explicitly prefers cycling infrastructure and lower traffic. Existing request/time caps remain binding. Cached and later-departure clients retain the extra path. A second solve over the alternative cycling map enforces all cycling budgets, dated boardings, walking, arrivals and visits; its complete journeys are merged with ordinary results. This is two path configurations over sampled links, not enumeration of every combination of cycling paths. Ordinary results survive a failed optional comparison. A six-minute alternative that misses an eight-minute service plus a three-minute boarding allowance must take a later feasible service.

## Fewer mandatory bicycle reservations

Count transit services with an applicable known mandatory bicycle reservation. All included reservation requirements must be known; unknown is not zero. A prohibited-bicycle itinerary cannot win this category. Permission scopes remain independent, and uncertain carriage permission remains visible where the user allowed it. Passenger-only trips need zero bicycle reservations.

The count concerns services requiring reservations, not purchases or separate booking transactions: connecting trains may share a booking. The existing dated evidence and reviewed operator rules remain authoritative. No live space-availability or booking integration is added.

## Lowest checked price

Rank complete additional totals from the shared existing fare calculation: passenger + bicycle ticket + required reservation charges, for the selected travelcard/annual bicycle pass and bicycle-custody setting. Incomplete components cannot become zero. Public-transport-only prices, prohibited carriage, unsupported through fares over cycling breaks, GA coverage and dated bicycle tariffs retain their existing semantics. Online prices remain explicitly OJP test estimates; this does not establish the cheapest purchasable offer.

**Acquisition:** After route discovery, request up to eight distinct eligible fare queries per search batch, ordered by earliest arrival/latest departure with deterministic ties. These are sampled from the retained candidate pool, not just ordinary winning cards, within the existing general extra-time window. Identical service quotes are shared with result cards through one serialized short-lived cache. Changing the trip/profile stops scheduling further objective requests; a shared in-flight request may complete. Quotes update the winners progressively, without re-querying the timetable. Later-departure batches receive the same comparison. More than eight combinations or unavailable quotes mean the result is only the lowest complete checked total among this subset; UI status discloses incomplete sampling.

Quotes do not consume timetable/cycling discovery budgets. The per-query timeout remains 60 seconds; a serial eight-query comparison can be slow. Historical online quotes remain unavailable. A supported complete published total or valid existing pass can still be compared without an online request. There is no unsupported passenger-only shortcut for a bicycle journey.

## State, dominance, complexity and failure boundaries

The time-dependent network, boarding actions and hard feasibility constraints remain those in [MATHEMATICAL_MODEL.md](MATHEMATICAL_MODEL.md). Baseline/Extended, ordered visits, fixed-service editing and independent permission scopes are retained.

Reservation-required/unknown/prohibited counts and traffic exposure/unknown coverage become additive dominance resources only when their objectives are selected. Cycling remains a raw resource and a separate final Pareto criterion for least cycling. Monetary cost is non-additive and unknown before quoting, so Cheapest partitions intermediate labels by dated service/walking/cycling-break history. A faster prefix cannot discard a distinct cheaper service sequence before it is priced. Reusing the exact same timed edge is excluded for fare-history search to prevent zero-time loops from generating unlimited histories. Later raw candidate prices are used for final selection, not as fabricated additive edge fares.

No new global optimality guarantee is claimed. Fare histories can enlarge label sets; the existing 50,000-label cap remains with its visible warning. For a retained pool of n journeys, existing pairwise dominance is O(n²) times vector/history comparison, and category selection is O(n log n) per requested ordering plus route-attribute evaluation. Fare work is capped per batch; lower-traffic path configurations add at most another solve per permission scope/model. Station discovery, provider budgets, incomplete attributes and unknown fares can still hide useful alternatives.

## Verification

**Verified gate:** All 437 tests in 11 suites pass, along with TypeScript/frontend/Worker production builds, Knip and React formatting. Nineteen new regressions cover preset validation, weighted/proportional boarding boundaries, arrive-by timing, cycling/walking separation, deduplication, reservation completeness, preservation of reservation-free and unpriced prefixes through ordered visits, complete fare/profile/custody accounting, request caps/cache sharing, unknown traffic, alternate-path catchability and zero-time cycles. The mixed-mode fixture also exercises all six objectives under the existing label/resource limits.

Existing historical/overnight searches, station minima, cycling edits, permission scopes and later-departure tests remain in the full suite. Earlier tests asserting strict fewest-boardings and active-time labels were updated to the newly authorized behaviour, rather than weakening feasibility assertions.

**Verification limit:** No new live-provider observation or browser/phone interaction test is claimed. The required managed-preview control-browser capability is unavailable, so no alternative browser path was started. Next acceptance pass: choose a familiar journey, switch Commuter/Bikepacking, select custom objectives, inspect a mandatory reservation and incomplete fare, then check a later departure and Arrive by on phone and desktop.

## Publication

Owner-private **version 58** published successfully at **2026-10-08 19:41:40 UTC** (21:41:40 Europe/Zurich), with environment revision **3**. The exact tested source was pushed and its matching frontend/Worker archive deployed. Runtime secrets and owner-only audience are unchanged.

- Site project: `appgprj_6a9bdfc1819481918c7085729f869ca9`.
- Source commit: `82ceea9078c13a38be215ed58bb115e7a3f2e11e`.
- Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_14c353b9c1d48191bf5be46478344638`.
- Deployment: `appgdep_6ac7f1e009d48191b484fcabe4a49d45`, confirmed `succeeded`.
- Archive SHA-256: `1fb0b888c836374aaeec54ad7b5869703d6e97a90731e1f535dfba3ccc0b1196`.
- [Open the private website](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site).

GitHub main receives the matching application files and this release documentation. Site source snapshots of earlier project documentation are historical; GitHub remains authoritative.
