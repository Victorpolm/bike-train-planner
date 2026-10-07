# Walking endpoints, bicycle custody and city fares — 7 October 2026

## Implemented behaviour

Reuse **Where would you like to cycle?**. Beginning-only means cycle before the first boarding, then walk after public transport. End-only means walk before public transport, then cycle after the last service. An address on the non-cycling side no longer has to coincide with a public-transport stop. Intermediate requested visits preserve this phase: after leaving the bicycle, later links and access to another service stay pedestrian.

Beginning/end-only defaults **Take my bicycle on public transport** to off. Off means a bicycle left at the first boarding station, or one already waiting at the last alighting station. It permits passenger use of services that prohibit bicycles and excludes bicycle tickets/reservations from the fare. Passenger entitlements and explicit bus avoidance remain. Checking it restores the chosen bicycle-access scope and bicycle costs; walking sections then mean walking with the bicycle. Unrestricted placement requires taking the bicycle on transit and retains the existing behaviour.

The walking allowance defaults to 30 minutes per street section and is adjustable from 0 to 60, separately from cycling time. Walking uses the FOSSGIS OSRM foot profile, rejects non-walking steps, keeps directed geometry, checks path distance and endpoint snaps, and estimates time at the slower of provider duration and 4.5 km/h plus endpoint connectors. Cycling speed never controls walking speed. Missing or invalid pedestrian responses cannot turn into geometric or bicycle substitutes. The existing one-request-per-second FOSSGIS queue now covers both foot requests and the cycling backup. Walking has a 20-request search allowance and shares the overall action deadline; cached successful paths survive later searches/extension.

Walking appears in the itinerary, map, active-travel totals, category objectives and final arrival. Timetable queries and arrival feasibility include the walk. Station pairs are ordered by total endpoint travel time while cycling and walking retain separate limits. Ordered-stage acquisition retains readiness by walking/cycling phase. Existing timetable walking transfers remain governed by their returned times and platform evidence.

## Passenger pricing

Two client-side problems were fixed: bicycle prohibitions suppressed passenger fare requests, and compact cards hid known passenger prices whenever a bicycle ticket or reservation total was incomplete. Passenger quotes are now requested independently. The card explicitly says **Passenger** for a partial amount; it says **Total** only when all applicable components are known. Passenger-only travel requests no bicycle product and adds no bicycle reservation fee. Missing passenger fares remain unknown, including unsupported GA coverage; historical departures still cannot receive an online fare quote.

The existing exact-itinerary server and tariff catalogue were not changed. OJP Fare remains the integration/test environment and its quotes are estimates to confirm before purchase. No city fare or zone count was hardcoded, and no cycling interruption is silently replaced by a different all-transit itinerary.

## Verification

**409 application tests in 11 suites pass**, including 14 new cases. TypeScript, frontend/Worker production builds, Knip, React formatting and git diff whitespace checks pass. Golden tests cover both directions, departure/arrival queries, a binding walking cap, directed/missing paths, service bicycle prohibitions, independent bike/walk totals, ordered walking visits, onward boarding on foot, pedestrian-response validation/caching, and passenger-only/partial fare presentation. The previous historical-time, hill-selection and Simplest-route regressions still pass.

Live public-service observations checked on 7 October for 8 October travel:

| Exact priced service leg | Passenger-only OJP test estimate |
|---|---|
| Zürich, Platte → Zürich, Zoo · Tram 6 · 08:15–08:24 UTC | CHF 4.70 · ZVV Einzelbillett |
| Bern, Markuskirche → Bern, Länggasse · B 20 · 08:10–08:26 UTC | CHF 5.20 · Libero Einzelbillett |

These are the actual selected individual legs, not quotes for the full original discovery requests. Each fare reused retained exact itinerary evidence. Both returned a passenger price with no bicycle product. [Sanitized observations](experiments/walking-city-fares-2026-10-07.json) contain no credentials, headers or signed fare payloads.

A live Stadelhofen → representative Grossmünster building point pedestrian response returned 661.1 m, 532.4 provider seconds and walking-only steps. The application estimates ten minutes including endpoint connectors. Its raw public fixture is `prototype-v0/src/fixtures/stadelhofen-walking-2026-10-07.json`, with source URL and OpenStreetMap attribution; regression tests reject cycling, driving or ferry responses and excessive endpoint gaps.

## Boundaries and next check

A station is the assumed bicycle handoff point. This release does not choose a parking rack, check spaces, add a parking/collection duration, verify rack-to-platform paths or plan later retrieval. The existing parking map remains available. Pedestrian paths may contain steps; step-free or pushable bicycle access and terrain-adjusted walking are not certified. Service, street-path and label budgets can miss routes.

The earlier Simplest improvement applies to any endpoint pair, with no ETH-specific exception. It compares a road-oriented candidate with the ordinary path and respects existing route checks; it cannot guarantee the global minimum number of turns or suitability on every street. [Earlier live comparison and limitations](SIMPLE_ROUTES_AND_TIME_CONTROLS_2026-10-07.md).

Browser interaction/visual QA is pending because the supported browser QA capability was unavailable in the managed environment. Next check in the owner's browser: choose an address destination with beginning-only, confirm the walking leg and leave-bike station, toggle bicycle carriage, then check end-only and an arrival deadline on a phone. Inspect nearby parking and physical access before relying on a specific handoff.

## Primary references

- [FOSSGIS routing service and usage policy](https://routing.openstreetmap.de/about.html)
- [OSRM route response documentation](https://project-osrm.org/docs/v26.6.1/index.html)
- [OJP Fare provider contract and test-environment limitations](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/)

## Publication

Owner-private **version 56** published successfully on **7 October 2026 at 12:04:52 UTC** (14:04:52 Europe/Zurich), environment revision **3**, from Site source `21ddd7c3793b488ed7ee08806df1ee803c725a8d`. The exact tested source was pushed and its matching frontend/Worker archive deployed. Access remains owner-only, with no groups or external visitors; runtime keys are unchanged. **409 tests** in 11 suites pass, plus formatting, Knip and production builds. Browser interaction/visual QA remains pending. GitHub synchronization is recorded in the containing commit.
