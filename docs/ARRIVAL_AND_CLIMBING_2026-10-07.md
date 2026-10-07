# Arrive at and worthwhile climbing alternatives — 7 October 2026

## Delivered behaviour

The time control offers **Depart at**, **Arrive at**, and the existing **Leave now** action, all interpreted in Europe/Zurich. Arrive at means reaching the requested destination by that time, including final cycling and observed walking. Its primary transit card is **Leave latest**. Alternatives state how much earlier departure is required. Ordinary departing searches retain their elapsed-time reference. Identical category winners still share a card.

Future arrival searches consider departures from now up to the requested deadline, within the preceding 24-hour horizon. Historical deadlines use the preceding horizon subject to provider availability. Cycling-only comparisons calculate their own departure from the deadline; rides outside the allowed window are marked as references and cannot automatically win. Later-departure pagination is hidden in arrival mode; change the arrival time to search a later window. Cycling edits retain exact services, recheck connections and reject a late final arrival. Facility detour previews flag a missed arrival deadline.

**Reduce climbing** now requires complete elevation for both the reference and alternative. Estimated ascent savings must be at least **50 m and 25%** of the reference ascent. Additional time must fit **30 minutes and 25% of the reference duration**, as well as the ordinary alternative allowance. Among eligible journeys, minimize `extraMinutes - 5 × savedMetres / 100`; require a strictly negative score. This values a 100 m saving at up to five extra minutes; an exact tie retains the ordinary reference. In arrival mode, extra minutes mean leaving earlier than the latest feasible departure.

These are initial product defaults, not calibrated physiological thresholds or a power model. Raw ascent, duration and exact Pareto resources remain unchanged. The category can merge onto an ordinary winner or add one card. When nothing qualifies, the interface says no worthwhile reduction was verified instead of incorrectly claiming every such case has missing elevation. Existing gentle-slope percentages remain preferences based on sampled elevation, not certified physical maxima. No new mandatory numeric controls were introduced.

## Routing and acquisition

The observed timetable graph still uses forward directed cycling and exact dated boarding/transfer checks. Arrival searches seed the latest origin start for each feasible first timed edge, subtracting routed access and its applicable platform allowance. Ordered visits include checked cycling prefixes before the first boarding. Labels retain origin departure as a dominance resource; an earlier arrival at an interchange cannot discard a later-origin journey solely for reaching it later. Final feasibility checks include the destination deadline. Baseline/Extended and bicycle-permission scopes remain independent.

OJP puts `DepArrTime` on Destination; search.ch uses `time_type=arrival`; Transport API uses `isArrivalTime=1`. Minute-only arrival queries round down, while departure readiness rounds up. Client and server cache keys distinguish direction. Destination station queries subtract the routed final cycle from the deadline. Requested stages are acquired from last to first using the suffix's feasible departure; complete journeys still undergo a forward search with shared cycling and boarding budgets. Extended suffix queries respect the arrival bound. The optional local national feed is forward-only and is skipped for arrival queries; the published live adapters provide them.

Acquisition remains sampled and bounded. Providers may omit an earlier service, Extended's forward departure-board seed can miss useful late services, and arrival labels can reach the existing label cap. This is latest departure among checked feasible candidates, not proof of the national optimum. No new live-provider or browser interaction verification is claimed; the approved browser capability is unavailable in this execution environment.

## Regression evidence

**388 tests in 11 suites pass**, including 16 added cases. TypeScript, frontend/Worker production builds, React formatting and Knip pass. The existing frontend chunk-size advisory remains.

- Golden arrival graph: A departs at 08:40, reaches X at 09:00, connects at 09:10, reaches D at 09:30 and cycles ten minutes to arrive at 09:40 Swiss time. Latest origin departure is 08:37 with the three-minute access allowance. A direct service arriving at D at 09:31 is rejected despite its later departure. The same case works with X as a required visit.
- Exhaustive minute-by-minute forward departure searches agree with arrival-mode latest departures in Baseline and Extended, with/without an ordered visit, across three cycling budgets. A directed cycling prefix before first boarding is also covered.
- Exact 241-second OJP platform access and 420-second interchange are retained. A required 421-second interchange with only 420 seconds available is rejected. Deadline-minus-one-second, earliest-start, horizon, placement and boarding-budget boundaries are covered.
- Climbing fixture: 120 min / 600 m, 130 min / 300 m, 149 min / 0 m. The middle journey wins Reduce climbing; the 120-minute journey remains Fastest. Near-flat 30 → 10 m, small proportional savings, poor-value detours and hard time-limit violations do not qualify. Unknown elevation remains ineligible.
- Adapter tests cover OJP/fallback arrival parameters, final-cycle subtraction, backward stage acquisition, direction-separated caches, Swiss rounding, cycling-only timing, and edit rejection after the deadline.

Tests live in `arrival.test.ts`, `arrivalApi.test.ts`, and the existing hills, transfer-times, cycling-editor and OJP suites. No network calls are used by these regressions.

## Parking question and next check

**Where would you like to cycle?** is the right existing control to reuse in a future parking/collection flow. Today it limits riding to the beginning/end while the bicycle still accompanies the traveller through transit. Showing parking at the boarding or alighting station does not itself enable passenger-only transit, a walking connection to the entrance, a parked-bike state or a bike waiting at arrival. This release does not relabel that existing mode as parking. A future implementation should integrate those states and default parking at the relevant station without adding another top-level category.

Next acceptance check: on desktop and phone, choose Arrive at for a familiar station-to-address route, inspect the departure, platform allowance and final-cycle arrival, then compare climbing suggestions with the option off/on. Discovery/boarding compromise redesign, custom minimum/maximum cycling and full Extra categories regrouping remain separate proposed work.

Primary adapter references checked for this implementation:

- https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/
- https://search.ch/timetable/api/help.en.html
- https://transport.opendata.ch/docs.html

## Publication

Owner-private **version 54** published on **7 October 2026 at 09:25:15 UTC** (11:25:15 Europe/Zurich), environment revision **3**, Site source `4646573e346a5b734366b0264441384f1fa0cbd1`. Adds Arrive at and worthwhile climbing alternatives. **388 regressions** in 11 suites, formatting, Knip and TypeScript/frontend/Worker production builds pass. Browser interaction and a new live-provider route check remain pending. Runtime keys and audience are unchanged.

- Project: `appgprj_6a9bdfc1819481918c7085729f869ca9`
- Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_2ea3284ca7cc8191959e2c71f9a377a2`
- Deployment: `appgdep_6ac60fe7880c81919944e79549dcb359`
- Deployment status: `succeeded`
- URL: https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site

The source was built, pushed and packaged by the Sites workflow before publication. GitHub main is synchronized to the same application files; durable project documentation stays in GitHub.
