# Claude fares and live-times review — 13 October 2026

## Delivered status and source of truth

**Owner-private version 75 is deployed.** The exact Site source commit is `cfe9bfa1b6681d4c802a125348c77fd243a021f9`. Deployment succeeded on **13 October 2026 at 20:52:52 UTC** (22:52:52 Europe/Zurich), using environment revision **3**. The existing owner-only audience is retained.

- [Private app](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site)
- Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_2dd432d2a3288191bd0d8e6e238dd929`
- Deployment: `appgdep_6ace9a0d2bcc819199b129f399ceccb7`
- Source project: `appgprj_6a9bdfc1819481918c7085729f869ca9`

**GitHub application-source synchronization remains blocked.** After the exact source had been committed, pushed, packaged and deployed through Sites, the workspace disconnected. A fresh read-only command returned `409 Conflict, environment_offline: Environment is not connected`. This GitHub update records the release and outstanding work; it does **not** claim that `prototype-v0/` already contains version 75. Its last implementation is version 74. The intervening automated transfer-data refresh at `2508af3177c8e06708c23e3fc5beeb559c22dd61` must be preserved when synchronizing.

## The important “explanatory” comment

The attached *Fares and Live Times — a Design Proposal* calls the OJP option **explanatory**, which is the interpretation used for this implementation. A separate Discover-compromises/exploratory route feature remains a design item.

The [official TripRequest documentation](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/) defines explanatory real-time mode as including delayed and cancelled connections. The [TripInfo documentation](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptripinforequest-2-0/) recommends it to retain those details. Both production request builders already requested this mode. The remaining defect was verification: the scheduled monitor exercised journey search but did not independently prove that exact-service TripInfo updates still worked.

Version 75 checks both production paths, including request construction, provider response parsing, service/date/segment matching, provider timestamps and actual parsed estimates. This is essential because a healthy search response does not prove a healthy selected-journey refresh. Receiving real-time fields also does not establish complete operator coverage or SBB-equivalent reliability.

## Applied recommendations

| Review concern | Delivered behaviour |
|---|---|
| Prices must retain their meaning | Existing qualified `Offer`/`Priced` values remain authoritative. Known prices now expose source links and review/quote timestamps, plus time limits, unknown flexibility and capacity conditions. |
| Avoid alternate bare-price contracts | Data-quality report version 3 removes duplicate passenger/bicycle/reservation/total CHF fields. A TypeScript AST guard checks React views, objectives and report code for compatibility-amount aliases. Internal derived compatibility values remain for migration. |
| Profile and bicycle affect eligibility | The version 73–74 passenger, child, class, pass validity, bicycle type, packing, dimensions and trailer handling remain in use. Journey guidance now refers to the saved profile instead of assuming a standard unfolded bicycle. |
| Live times must be qualified | Bicycle-prerequisite departure rows use the shared timing renderer. A failed refresh immediately marks the retained estimate stale and identifies the failed check. It never renews the provider timestamp. |
| Disrupted arrival must not look reachable | Broken connections continue to suppress the unreachable arrival. Undefined-duration delays now show “Arrival time unknown” and omit the overall arrival/duration. Cancelled services and undefined delays retain scheduled context without presenting an old estimate as an original timetable time. |
| Bounded onward recovery | Confirming a known current stop starts one bounded search automatically; the rider explicitly accepts one of at most three results. The two-hour guard applies to the original boarding time, not the total onward horizon, so long onward journeys remain possible. Saved preferences, remaining budgets, visits, history and bicycle custody are retained. |
| Real evidence, not only synthetic tests | The actual 11 October OJP search XML is now an application regression fixture. A separate 13 October production search/TripInfo JSON record tests application of actual estimates without changing scheduled identity. Synthetic fixtures remain labelled synthetic. |
| Structural/property safeguards | 1,000 deterministic generated price combinations check total-price invariants. Additional tests cover freshness failures, cancellation context, wrong service/date matching, historical/future canary candidates, independent TripInfo alerts and long onward recovery. |

## Scheduled live monitoring

The existing weekday automation remains enabled for **08:30 Europe/Zurich**. The monitor rotates five corridors and now makes at most **two quota-accounted OJP calls** per claimed run: a current TripRequest and a TripInfo request for an exact dated service from that response.

Search and TripInfo have separate observations and alerts. A successful search cannot hide a detail-request/parser failure or a sustained lack of detail estimates. An older observation without TripInfo coverage is partial, not healthy. Five-weekday no-estimate streaks are evaluated independently. Only parsed estimates with fresh provider timestamps on relevant services count; an arbitrary XML estimate element is insufficient.

The owner-private maintenance interface retains the first qualifying raw response for each kind:

- `/api/maintenance/fixture?kind=triprequest` (also the default)
- `/api/maintenance/fixture?kind=tripinfo`
- Add `&format=metadata` for kind, capture time, service reference and SHA-256.

An uncaptured fixture returns 404; an unsupported kind returns 400. Existing retained evidence is not overwritten by later successful runs. The daily lease, shared quota accounting, request/body limits and bounded source refresh continue to apply.

The 13 October lease had already been used by the earlier monitor before deployment. It was not bypassed. **The first scheduled run of the new dual-path monitor is still to be observed**, expected on 14 October. The first raw scheduled TripInfo fixture is therefore still pending; the recorded manual check below is parsed production JSON, not raw TripInfo XML.

## Observed live evidence

The predeployment status on 13 October recorded eight fresh parsed services and 48 estimate fields for Geneva Plainpalais–Rive. The previous Zürich–Bern observation recorded nine fresh services and 46 estimate fields. These establish particular successful samples, not nationwide coverage.

A separate production check on **13 October at approximately 20:48 UTC** searched Zürich HB–Bern, selected **IC 8**, operator `ojp:11`, and received HTTP 200 from exact-service TripInfo with a verified provider timestamp:

| Field | Scheduled UTC | Estimated UTC |
|---|---|---|
| Departure | 2026-10-13 21:01:00 | 2026-10-13 21:01:36 |
| Arrival | 2026-10-13 22:02:00 | 2026-10-13 22:02:30 |

Search provider check: `2026-10-13T20:48:17.509Z`. TripInfo provider check: `2026-10-13T20:48:23.878Z`.

The source commit retains the credential-free record at `src/fixtures/ojp-live-2026-10-13/tripinfo.json`, with provenance. The actual search XML at `src/fixtures/ojp-live-2026-10-11/trip.xml` is 438,143 bytes, contains 34 estimate fields and yields seven parsed estimated services at its recorded time. SHA-256: `380fc6480b9321402f11513155dc5c0a249222b2341b002fa7c9190f4c1971a7`.

## Expiry and automatic acquisition

The source monitor covers **24 price, rule and route sources**. Scheduled retrieval and change detection already fetch official material before expiry, within the existing bounded refresh budget. Downloaded source changes are evidence for review; they do not automatically authorize a new tariff or extend its reviewed validity.

On **13 October**, **23 of 24 sources reached the 60-day review boundary** for the **12 December 2026** validity boundary. They are due for renewal review, not already expired. The expiry check is intentionally red. Review dates were not extended to make it pass. The observed source baseline was 19 established baselines, three pending sources and two acquisition errors.

Next: resolve acquisition errors, complete pending baselines, inspect changed official documents and future-dated tariffs, update affected rules/prices with their effective dates and provenance, then run the fare/profile and expiry checks. Contact the relevant local operator for unresolved scope, special-bicycle or line exceptions; no outreach was sent as part of this implementation.

## Verification

Before deployment, **693 JavaScript tests in 11 suites**, **16 Python tests**, and **53 rendered panels** passed. The panels comprise preferences 19, facilities 6, continuity 7, quality 15 and source notices 6. Formatting, unused-code analysis, TypeScript, source-register and licence checks, and frontend/Worker production builds passed. The Sites source helper pushed and packaged the exact tested source; the checkout was clean.

The expiry gate is separately and intentionally red as described above. **No version 75 GitHub application CI pass is claimed**, because its application source has not yet been mirrored. Browser interaction and physical-phone acceptance remain unverified; the supported browser QA capability was unavailable.

## Remaining work, in order

1. **Finish exact GitHub source synchronization.** Restore the Sites checkout at `cfe9bfa1b6681d4c802a125348c77fd243a021f9`; compare with the prior Site source `2eb873550d7210310f754e9f29ea75479c7db232`; mirror changed app files under `prototype-v0/` without overwriting root transfer-data updates. Verify changed files by Git blob hash and run GitHub Test and build. Record that commit and CI result here.
2. **Observe the new scheduled TripInfo path and retain its first real raw XML.** Confirm independent alerts, quota use and fixture metadata after a qualifying run. The manual successful sample is not proof of future scheduled execution.
3. **Renew the December source reviews.** Resolve the pending/error acquisitions and review effective dates, local fares, bicycle exceptions and changed official text. Keep unknown/conflicting cases explicit.
4. **Measure matched reliability.** Compare fixed dated journeys and profiles against SBB/operator results across the researched operators: departures, delays, cancellations, platforms, fares and bicycle conditions. Record coverage and disagreement rates before claiming parity.
5. **Complete fare and local-rule coverage.** Continue the exact route/zone mapping, unimplemented operator exceptions and source conflicts in the [public-transport reliability backlog](PUBLIC_TRANSPORT_RELIABILITY_2026-10-11.md). Public standard tariffs and production/discount offers remain different coverage questions. No universal cheapest-fare or available-bicycle-space guarantee is claimed.
6. **Recovery acceptance and later automation.** Test disruption, known-stop confirmation, remaining visits/budgets and bicycle custody on a real phone. Fully automatic on-vehicle alighting/location decisions are not implemented; recovery begins from a confirmed known stop.
7. **Aggregate evidence and wider access.** Add representative coverage/quality measurements and complete browser/phone acceptance. Before widening access, give the maintenance writer an independent authorization boundary and complete the existing [launch checklist](OFFICIAL_CYCLING_AND_LAUNCH_REVIEW_2026-10-11.md). Keep the Site private until that work is complete.

Earlier delivered work and nationwide public-source research remain documented in [fares/profiles/monitoring](FARES_PROFILES_AND_MONITORING_2026-10-11.md) and [public transport reliability](PUBLIC_TRANSPORT_RELIABILITY_2026-10-11.md).
