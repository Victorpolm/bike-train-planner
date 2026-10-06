# Result selection, extra categories and mobile food loading — 6 October 2026

Status: inspected the current feature branch and live owner-private version 51. This is an audit and design proposal, not an application release or an approved set of new scoring weights.

## Owner feedback

Zürich–Laax proposals change with profile speed and sometimes become unreasonably long. Reconsider the trade-offs behind fewest boardings and the other categories; explore a Discover category for useful compromises. Food records failed to load on the owner's phone. Move hill proposals into a multi-select Extra categories control. Keep current cycling-time presets while adding a Personalized choice for a user-entered minimum or maximum cycling duration.

## What the current application actually does

`prototype-v0/src/model.ts` filters feasible journeys with at least one public-transport boarding, computes the fastest observed eligible journey, and limits category candidates to that journey's duration plus 60 minutes. It retains nondominated candidates and chooses one winner per category using strict priority ordering:

| Category | First objective | Tie-breaks |
|---|---|---|
| Fastest | Total elapsed time, including waiting | Cycling/walking time, then boardings |
| Fewest boardings | Number of vehicle boardings, including the first | Total time, then cycling/walking |
| Least cycling or walking | Cycling plus timetable walking minutes | Total time, then boardings |
| Optional start or arrival category | Active time at the selected end | Total time, all active time, boardings |
| Reduce climbing | Known cycling ascent | Total time, active time, boardings |
| Gentlest cycling | Estimated uphill rise above the chosen gradient, then affected distance | Ascent, then total time |

The same itinerary receives several badges if it wins several categories. Cycling only is a separate comparison, including when outside the selected cycling limit. More requests later departures and ranks the new group separately. Prices are displayed after route selection; they are not a ranking objective. Unquoted prices must never be treated as zero.

A journey can survive Pareto pruning yet never be displayed, because it wins none of the individual categories. The fixed +60-minute allowance is not a proportional or benefit-sensitive rule: even a small active-time reduction can win despite a large increase in total time.

## Controlled demonstration

The production `categorize` and `pareto` functions were run on these hypothetical candidate metrics (not a real Zürich–Laax timetable):

| Candidate | Total minutes | Boardings | Cycling minutes |
|---|---:|---:|---:|
| Fastest | 120 | 3 | 15 |
| Compromise | 134 | 2 | 12 |
| Extreme | 178 | 1 | 10 |

All three survive Pareto pruning. The displayed results are Fastest and Extreme; Extreme receives both Fewest boardings and Least cycling or walking. Compromise is omitted despite saving a boarding for 14 extra minutes. This verifies a presentation limitation; it does not establish which issue produced the owner's specific journey.

## Why speed changes results

`cyclingPace.ts` uses flat speed to calibrate rider power and integrates estimated speed over the path elevation. It is not a uniform division of every cycling duration by the entered flat speed. In the present model without electric assistance, 20 km/h on the flat implies approximately 5.1 km/h on a continuous 6% climb; 25 km/h implies about 7.8 km/h. These are model outputs, not measured performance claims.

Changed cycling times alter connection readiness, cycling-budget eligibility, category ordering and which sampled station pairs receive timetable queries. Missing elevation and backup-provider paths can also change estimates. `searchLimits.ts` bounds acquisition, including four initial stations per side and four baseline station-pair queries, so separate searches do not prove an exhaustive optimum.

For fixed departure time, identical paths/services and identical upper-bound constraints, making cycling faster should not worsen the fastest achievable arrival: a rider can wait for the same services. A category winner may nevertheless change. Future speed comparisons must hold all other inputs and provider responses fixed, then separately measure discovery changes. A new minimum-cycling constraint would change this monotonicity expectation because faster riding can fall below the requested minimum.

The exact date/time, selected places, speeds, access scope, mode and unusual result from the user's test are not available. Do not label a specific cause as reproduced.

## Proposed result selection

1. Keep Fastest as a visible reference. Retain valid alternatives instead of changing the three existing capabilities without explanation.
2. Add Discover alternatives: expose two or three meaningfully different compromises from the nondominated candidate set, including candidates between the individual extremes. Compare extra elapsed time, boardings, requested cycling amount and known climbing metrics; do not equate Discover with scenic-route evidence that is not available.
3. Introduce an adjustable allowance for ordinary highlighted alternatives. A starting experiment is the smaller of 30 minutes or 25% of the fastest eligible trip. This is a proposed tuning value, not a delivered rule; longer alternatives remain inspectable on request, and Bikepacking may need a different allowance.
4. Require a worthwhile benefit and explain it on each card, e.g. +14 min / one fewer boarding / three fewer cycling minutes. Avoid filling a category just to save a negligible amount. Preserve distinct routes and merge identical ones with badges.
5. Treat the rider's requested cycling amount as a preference/constraint to satisfy. More cycling is not intrinsically worse for a rider seeking a longer ride. Keep unknown elevation and unavailable fares explicit; price should join ranking only with comparable complete evidence.

Avoid presenting an uncalibrated weighted score as an objective definition of the best trip. The first experiment should measure which compromises users choose and how frequently the current +60-minute winners are rejected.

## Extra categories and personalized cycling time

The prior full hills regrouping was recorded as a proposal, not implemented. Today Extra category is a single endpoint dropdown; Reduce climbing is a separate checkbox; Gentler slopes still changes the cycling paths used by the ordinary categories. This is broader than an extra proposition.

Proposed multi-select checkboxes under Extra categories:

- Discover alternatives.
- Less cycling or walking at the start.
- Less cycling or walking at arrival.
- Reduce climbing.
- Gentler slopes, revealing the uphill percentage and its extra-time allowance.

Several can be selected together. The ordinary route candidates must be retained when adding hill-specific paths, so enabling an extra category does not silently replace the fastest comparison. A UI-only move of the existing Gentler slopes selector would not meet that requirement.

Keep 40/45/90/150-minute and unrestricted presets while adding Personalized custom At most [N] min or At least [N] min, optionally a range later. The value applies to the complete journey rather than each section. A requested minimum is cycling time, not waiting or public-transport time; walking/pushing accounting must be explicit because current section budgets can include short walking connectors. Report when no checked journey satisfies it. Do not add artificial backtracking solely to fill time.

Implementation must enforce minimum-duration feasibility before discarding candidates: applying a final filter after today's less-active dominance pruning can lose valid longer-cycling routes. Ordered stops, cycling edits, later departures and the cycling-only reference need the same semantics.

## Food loading investigation

On 6 October at 18:26:07 UTC (20:26 Swiss time), an authenticated request through the exact current `loadAmenities` client to `/api/services/v1/food` returned HTTP 200 in 30,289 ms. It returned 16,286 OSM food records, approximately 6,001,389 bytes of serialized normalized JSON, fetched at 18:26:05 UTC. That byte count is JSON content size, not a measurement of compressed network transfer.

The source handler requests the Swiss regional OSM dataset through overpass.osm.ch, then sends the whole food dataset to the client; map/route filtering happens afterwards. Upstream requests have a 40-second timeout, the client has a 50-second timeout, server failures use a 60-second retry cooldown, and existing server/edge caches have bounded stale fallback. Cafés/restaurants load as a separate optional dataset; SBB enrichment is also separate.

A first attempt to query a day of Worker error logs failed internally; the default recent-error query returned no events. Neither establishes the cause of the earlier phone failure. This endpoint check used a verification header, not a phone browser's session/cookies, and does not validate phone interaction or memory behaviour.

Recommended improvement: serve compact reusable geographic batches for the visible map/selected cycling sections; cache them; render successful batches progressively; retain loaded records on partial failures; use bounded retry and show stale data with its date while refreshing. Preserve source attribution, geographic coverage and closest-among-loaded-records semantics. Do not make the map claim no food exists when a source failed.

## Verification and implementation order

No application files were changed, no release was published and no new full-suite pass is claimed for this audit. The last application verification remains version 51's 363 tests. The controlled ranking example and live food response above are new evidence.

Suggested order: obtain the exact odd Zürich–Laax example and phone error; stabilize food loading; add multi-select categories with independent hill candidates and custom minimum/maximum cycling constraints; then compare the current winners against Discover using fixed candidate sets and several rider speeds. Keep provider acquisition failures separate from ranking-quality failures.
