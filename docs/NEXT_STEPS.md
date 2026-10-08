# Next steps after version 59

_Consolidated 9 October 2026, Europe/Zurich. This is the current checklist of outstanding work discussed with the owner; it does not authorize every proposed feature or replace dated evidence._

## Confirmed starting point

- Owner-private **version 59** is published from Site source `f3c22542a5b46eb75487d2a1e9b8b7aca499360b`.
- All **237 application files** in GitHub implementation commit [`c002731`](https://github.com/Victorpolm/bike-train-planner/commit/c0027316213d2f7932f38ec3177566dfbd10be24) match that source. The local application checkout is clean.
- The release passed **441 tests in 11 suites**, TypeScript/frontend/Worker builds, formatting and Knip. GitHub's [Test and build run](https://github.com/Victorpolm/bike-train-planner/actions/runs/37849560615) also completed successfully for that commit.
- Interface/profile and transfer-ZIP branches are already merged. Plan / Map / Journey, walking at the non-cycling endpoint, passenger-only transit, arrival deadlines, later departures and the new objective controls are delivered.
- Fewer boardings values an avoided boarding at **30 minutes**, with a **25% overall extra-time ceiling**. Its candidate window is independent of the other objectives' general 60-minute window. [Current objective contract](JOURNEY_OBJECTIVES_2026-10-08.md).

This consolidation changes documentation only. It does not claim a new application release, another test run, completed browser acceptance or fresh live-provider evidence. Earlier uploaded project-state snapshots must not override the current repository.

## Immediate checks already pending

| Work | Concrete next check | Remaining uncertainty |
|---|---|---|
| Phone and desktop acceptance | Complete one journey through Plan, Map and Journey; switch Commuter/Bikepacking/Personalized; inspect reservations, incomplete prices, profiles and a familiar station transfer | Visual, keyboard and touch behaviour has not had the remaining manual acceptance pass |
| Objective usefulness | Compare a short ride and a long trip with fewer boardings; repeat with Arrive by and later departures | The 30-minute boarding value and mapped traffic weights are pilot settings, not calibrated user preferences |
| Route-quality reports | Reproduce the reported Zürich–Laax speed-dependent odd result using its exact endpoints, date/time, rider profile, mode and carriage scope; retain Baden–Witikon as another tracked case | Controlled ranking improvements do not establish the cause of the original live report; discovery is sampled |
| Food loading on phones | Reproduce the reported failure and record latency, source/session error and partial results; assess compact geographic batches if payload/loading is the cause | The 6 October successful ~30-second nationwide response did not reproduce the phone failure |

The concrete next action is the familiar-journey phone/desktop acceptance pass, recording exact inputs for any failure. A reproduced blocking route, fare, permission or loading defect takes priority over optional new features. [Interface acceptance](INTERFACE_PROFILES_2026-10-02.md#manual-acceptance-pass) · [Reported failures and proposed investigation](RESULTS_REVIEW_2026-10-06.md).

## Remaining product milestones from the agreed roadmap

The agreed product order was **parking → bike services/useful stops → broader interface work**. Later owner requests brought the interface and objectives forward; those implementations are now complete, with acceptance still pending. The remaining items below are milestone goals, not claims that every detailed pilot or interaction has been approved.

| Milestone | Already available | Planned follow-through |
|---|---|---|
| Useful bicycle parking | Official + OSM records, equipment colours, selected-route proximity and closest-to-start | Verify entrances/access and unresolved duplicates; improve relevant coverage; specify a destination/station suitability shortlist and retrieval conditions |
| Reliable useful stops | Water, toilets, food, repairs and parking layers; rural water and station-floor sources | Prioritise dependable rural refill information, access/seasonality and along-route gaps; then improve entrances/floors and opening at the expected visit. No renewed ETH-specific expansion |
| Facility stops in the journey | Cycling-section detour preview, visit-duration input and fixed-connection check | Specify and implement an explicit Apply/Add as stop action that rechecks cycling/time budgets and connections and updates cards/fares. Multiple stops and saved journeys remain further work |
| Interface completion | Profiles, three phone views, desktop Map/Journey, objective/preference separation | Fix observed usability problems while preserving selection, map state and all existing options; avoid another redesign without task evidence |

Parking suitability is the priority, not live occupancy. Map proximity does not verify an entrance or an available bicycle space. Larger pilots, sample sizes and municipality lists remain proposals. [Detailed roadmap](APP_ROADMAP.md) · [Parking](BIKE_PARKING.md) · [Useful-stop scope](CYCLING_AMENITIES.md) · [Detour boundaries](FACILITY_DETOURS_2026-09-30.md).

## Technical maintenance and data gaps already tracked

- **Station transfers:** validate a familiar station on phone/desktop; correctly match service/route/calendar exceptions; establish a maintained feed refresh before the imported feed's **12 December 2026** validity boundary. Entrances, lifts, stairs and bicycle passage remain unverified. [Current integration and remaining work](STATION_TRANSFER_RUNTIME_2026-10-06.md).
- **Fares and acquisition:** investigate demonstrated city/itinerary quote gaps, including unsupported through fares across cycling breaks. Measure bounded discovery, runtime and truncation on fixed cases; do not describe eight sampled fare queries as a global cheapest-fare search.
- **Cycling estimates:** retain elevation/road evidence and calibrate riding, pushing and carrying times against observations. No traffic-volume or safety guarantee follows from the mapped traffic proxy.

The feed-refresh item is a roadmap task; this document does not create a scheduled job or reminder.

## Discussed design items, not implemented commitments

| Item | Decision or work still needed |
|---|---|
| Personalized minimum/maximum cycling minutes | Keep existing presets; define whole-journey cycling versus walking accounting and enforce minimums during routing, rather than filtering valid candidates away after pruning |
| Discover compromises | Define a small set of useful intermediate trade-offs and test them against fixed candidates and rider choices |
| Scenic/interesting-place Bikepacking routes | Define reviewed places, access/visit evidence and a detour budget; the implemented less-traffic objective does not provide this capability |
| Independent hill alternatives / multi-select endpoint preferences | Earlier regrouping remains a proposal; the latest owner instruction keeps existing choices in Preferences. Revisit only with an explicit scoped design |
| Prefilled SBB handoff and further fare products | Check supported parameters and exact journey/profile semantics before adding behaviour |
| Reusable investigation / implementation / review procedures | The three written workflow procedures were proposed earlier; automatic test/build CI is already implemented. Branch protection and policy changes remain separate decisions |

GPS/navigation, full parking/retrieval or rental handling, additional bikepacking stages/overnights and saved journeys remain later options. A national engine migration, live bicycle-space availability, booking/ticket sales, community features, native apps and international expansion are deferred. Keep Switzerland first and the Site owner-private; new hosting costs need the owner's approval.

## Source and decision precedence

Use [PROJECT_STATE.md](PROJECT_STATE.md) for delivered behaviour, [DECISIONS.md](DECISIONS.md) for accepted changes, and the dated reports for evidence. Preserve historical records, but do not re-promote superseded constraints or assistant suggestions into current commitments. In particular, Extended already supports up to two automatic cycling connections, the branches are merged, and the 20-minute/fixed-30-minute boarding pilot has been superseded.
