# Next steps after performance steps 1–3

_Consolidated 10 October 2026, Europe/Zurich. This is the current checklist of outstanding work discussed with the owner; it does not authorize every proposed feature or replace dated evidence._

## Owner's three next priorities — 10 October

1. **Design proposals:** Discover compromises and scenic/interesting-place Bikepacking routes remain design work. The owner’s subsequent feedback now authorizes custom cycling minimum/maximum and Extra-category regrouping; these are delivered in the [preference release](PREFERENCE_CONTROLS_2026-10-10.md).
2. **Before wider access:** implement global API quota control across Worker isolates, confirm actual provider allowances and refresh the station-transfer feed before **12 December 2026**. Local concurrency/cache bounds do not supply a global quota. This is a project task, not a scheduled reminder.
3. **Europe:** scope a later expansion with country/provider coverage, bicycle-carriage rules, fares, station transfers and data licensing. Current delivery remains Switzerland-first and owner-private; no European coverage is claimed.

## Requested work now delivered

**10 October performance steps 1–3:** Search timings now separate place, timetable, transfer, road-route, queue and solver work. Unchanged result updates reuse guarded calculations, and both solvers reject impossible vehicle connections before station-access checks. The controlled 24-station benchmark is **2.2–2.6× faster per solve**, with unchanged full results; an identical Extended refresh falls from **2.701 s to 0.011 s**. **593 JavaScript tests**, **13 Python tests**, **25 rendered panels** and **864 previous-release comparisons** pass. These are CPU/offline measurements; live whole-search and phone timing remain separate. [Evidence](PERFORMANCE_PASS_2026-10-10.md).

**10 October location and compact controls:** From now offers **From your location**, a single requested GPS reading. Cycling quick choices are **20/45/90/150 minutes**, and Commuter defaults to **At most 30 minutes**. Explanations live in clickable question-mark help; **How much cycling** is one heading and **Extra categories** is a collapsible multi-select. **576 JavaScript tests**, **13 Python tests** and **19 rendered panels** pass. A controlled benchmark identifies minimum-duration search as a substantial CPU cost; full live-search and physical-phone timings remain unmeasured. [Evidence](LOCATION_AND_COMPACT_CONTROLS_2026-10-10.md).

**10 October preference corrections:** Commuter/Bikepacking hide the alternative selectors. Personalized now has At most/At least/No preference with presets and custom minutes. Extra categories groups independent endpoint choices, Reduce climbing and Gentler slopes; ordinary paths remain available. The minimum is enforced through search, edits and navigation. **566 JavaScript tests**, **13 Python tests**, 576 previous-release comparisons and 14 rendered panels pass. Browser/phone interaction remains unverified. [Behaviour and acceptance meaning](PREFERENCE_CONTROLS_2026-10-10.md).

The owner explicitly authorized synchronization, facility-stop insertion and useful parking/facility information on 10 October. GitHub main was first fast-forwarded to `d1241db0937a9d81d5d2343521ba9324b80c544b`; [CI passed](https://github.com/Victorpolm/bike-train-planner/actions/runs/38059847074). Applied visits, parking choices, timing/access checks and refill gaps are delivered as described in the [facility release record](FACILITY_STOPS_AND_CHOICES_2026-10-10.md). The record carries final publication and synchronization evidence: private version 65, implementation commit `a4e5339680db41767d45460d39f3b156f6fca9b4`, all 272 application files matching the deployed source by Git blob hash, and [passing implementation CI](https://github.com/Victorpolm/bike-train-planner/actions/runs/38062304134).

## Search speed — next technical follow-up

Steps 1–3 are delivered: local stage timing, unchanged-result reuse and early rejection of impossible connections. Use **Search timings** on a representative slow journey, cold and warm, to separate remaining solver time from provider/queue work. Browser Web Worker execution remains a separate proposal for responsiveness on the user's device; it does not require buying remote computation. The sports target-duration/marked-route collection and later ride-sharing ideas remain design proposals. [Measurements and proposed sequence](PERFORMANCE_PASS_2026-10-10.md).

## Confirmed starting point

GitHub main contains implementation commit `16e41247befee481ab20cdda7912601e48670ed6`. All **288 application files** match the published Site source by Git blob hash. [Implementation CI run 38086502123](https://github.com/Victorpolm/bike-train-planner/actions/runs/38086502123) completed successfully, including JavaScript/Python tests, both React render checks, formatting, unused-code analysis and production builds. The subsequent release-record confirmation changes documentation only.

Owner-private **version 68** published successfully on **10 October 2026 at 21:06:33 UTC** (23:06:33 Europe/Zurich), environment revision **3**, from Site source `b133828038eba6bdce4b17ede3dc1ae61764b5d3`. The exact pushed source and matching frontend/server-Worker archive were deployed. **593 JavaScript tests in 11 suites**, **13 Python tests**, **25 rendered panels** and **864 previous-release comparisons** pass, together with TypeScript/frontend/Worker builds, formatting and unused-code analysis. Stage timings, guarded result reuse and early connection rejection are delivered. The controlled CPU benchmark is 2.2–2.6× faster per solve; live whole-search and phone timing remain unmeasured. Re.route, the existing URL, runtime bindings and owner-only audience are preserved. [Release evidence](PERFORMANCE_PASS_2026-10-10.md).

- **Earlier release:** Owner-private **version 67** published successfully on **10 October 2026 at 17:06:36 UTC** (19:06:36 Europe/Zurich), environment revision **3**, from Site source `8cae50704eaedc42d4af6cdb1dee1b34c0724f8a`. The exact pushed source and matching frontend/server-Worker archive were deployed. **576 JavaScript tests in 11 suites**, **13 Python tests** and **19 rendered panels** pass, together with formatting, unused-code analysis and production builds. One-shot GPS origin, compact help, an Extra categories dropdown, 20/45/90/150 quick choices and a 30-minute Commuter default are delivered. Real-phone location/touch and browser interaction remain unverified. [Release record](LOCATION_AND_COMPACT_CONTROLS_2026-10-10.md).

- **Earlier release:** Owner-private **version 66** published successfully on **10 October 2026 at 16:11:45 UTC** (18:11:45 Europe/Zurich), environment revision **3**, from Site source `32a5a6ed3677b2d969bd2c9b654d998bada70794`. The pushed source and matching frontend/Worker archive were deployed. **566 JavaScript tests in 11 suites**, **13 Python tests**, 168 independent duration-bound cases, 576 previous-release full-result comparisons and 14 React render panels/callback checks pass, together with builds, formatting and unused-code analysis. Interactive browser and physical-phone acceptance remain unverified. Re.route, the existing URL and the owner-only audience are preserved. [Release record](PREFERENCE_CONTROLS_2026-10-10.md).

- **Earlier release:** Owner-private **version 65** published successfully on **10 October 2026 at 15:03:12 UTC** (17:03:12 Europe/Zurich), environment revision **3**, from Site source `d10c8af18f011c104756035d8a07f3d174236a82`. The exact pushed source and matching frontend/Worker archive were deployed. **552 JavaScript tests in 11 suites**, **13 Python tests**, 1,372 fixed-connection combinations and six actual React panel render checks pass, together with builds, formatting and Knip. Browser/phone interaction and physical field acceptance remain pending. Title Re.route, the existing URL, runtime secret bindings and owner-only audience are preserved. [Release record](FACILITY_STOPS_AND_CHOICES_2026-10-10.md).

- **Earlier release:** owner-private **version 64** published on **10 October 2026 at 13:21:58 UTC**, environment revision **3**, from Site source `0d53a951686e563ad7c96957aa28fb90b6c19ee6`. Re.route branding, speed-review fixes and bounded OJP work are deployed. **515 JavaScript tests**, **13 Python tests**, 576 baseline solver comparisons, production builds, formatting and Knip pass. [Release evidence](SPEED_AND_SCALE_2026-10-10.md).
- The earlier main-update approval block is resolved by the owner’s explicit 10 October synchronization request. The rename and performance commits were fast-forwarded and CI passed; see the new release record for this implementation’s final synchronization.
- Interface/profile and transfer-ZIP branches are already merged. Plan / Map / Journey, walking at the non-cycling endpoint, passenger-only transit, arrival deadlines, later departures and the new objective controls are delivered.
- Fewer boardings values an avoided boarding at **30 minutes**, with a **25% overall extra-time ceiling**. Its candidate window is independent of the other objectives' general 60-minute window. [Current objective contract](JOURNEY_OBJECTIVES_2026-10-08.md).

The attached update review is addressed in version 60. Its external stress/benchmark harness was not supplied, so its measurements are not claimed as rerun. Browser/phone acceptance remains pending; version 61 adds fresh deployed OJP and BRouter checks.

## Next priority: real-phone navigation acceptance

Foreground GPS journey following is implemented after the owner's approval. Try Start/permission, accuracy and route progress, pan/recenter, explicit boarding/alighting, live connection estimates, deliberate off-route recalculation, remaining stops/budgets, Stop and hidden-page/resume behaviour. Check optional screen wake lock and phone battery use. Complete this on a short familiar ride with iOS Safari or Android Chrome before extending navigation. [Detailed acceptance checklist](GPS_JOURNEY_FOLLOWING_2026-10-10.md).

Voice, automatic rerouting, screen-locked/background tracking and custody-aware continuation are not delivered. GPS does not replace station signs or verified entrances.

## Realtime and cache acceptance

The owner subsequently authorized realtime implementation, speed improvements and the EPFL–Basel Fastest/Simplest correction. **Version 61 delivers these changes.** OJP estimates remain separate from scheduled identity; today's selected services refresh while visible, with cancellation/platform/connection warnings and freshness. Public map records persist across reloads. Cycling preferences rank the same checked pool. [Implementation, actual live estimates and benchmark](REALTIME_AND_SPEED_2026-10-09.md).

Next verify on a real phone/desktop: a delayed selected service, changed platform and tight connection; hidden-page/resume behaviour; and map toggles/reload without repeat downloads. Record exact EPFL–Basel inputs/profile and full search timings. The original 6:46/7:04 pair was not reproduced exactly, though the candidate-set cause is fixed and recorded EPFL–Basel ordering passes. The static station-feed refresh remains separate.

## Immediate checks already pending

| Work | Concrete next check | Remaining uncertainty |
|---|---|---|
| Phone and desktop acceptance | Complete one journey through Plan, Map and Journey; switch Commuter/Bikepacking/Personalized; inspect reservations, incomplete prices, profiles and a familiar station transfer | Visual, keyboard and touch behaviour has not had the remaining manual acceptance pass |
| Objective usefulness | Compare a short ride and a long trip with fewer boardings; repeat with Arrive by and later departures | The 30-minute boarding value and mapped traffic weights are pilot settings, not calibrated user preferences |
| Route-quality reports | Reproduce the reported Zürich–Laax speed-dependent odd result using its exact endpoints, date/time, rider profile, mode and carriage scope; retain Baden–Witikon as another tracked case | Controlled ranking improvements do not establish the cause of the original live report; discovery is sampled |
| Food loading on phones | Verify persistent-cache reloads on a phone, then record cold-load bytes/latency and source/session errors; assess compact geographic batches if still necessary | The 6 October successful ~30-second nationwide response did not reproduce the phone failure |

Selected-service live updates and caching are implemented. Complete the familiar-journey phone/desktop release acceptance alongside that work, recording exact inputs for any failure. A reproduced blocking route, fare, permission or loading defect still takes priority. [Interface acceptance](INTERFACE_PROFILES_2026-10-02.md#manual-acceptance-pass) · [Reported failures and proposed investigation](RESULTS_REVIEW_2026-10-06.md).

## Remaining product milestones from the agreed roadmap

The agreed product order was **parking → bike services/useful stops → broader interface work**. Later owner requests brought the interface and objectives forward; those implementations are now complete, with acceptance still pending. The remaining items below are milestone goals, not claims that every detailed pilot or interaction has been approved.

| Milestone | Already available | Planned follow-through |
|---|---|---|
| Useful bicycle parking | Official + OSM records plus destination/station/map-point lists, mapped equipment preferences and entry/collection/maxstay checks | Physical entrance verification, coverage gaps and a future custody-aware parking/retrieval workflow |
| Reliable useful stops | Source/floor/direction lists, supported weekly-hour checks, explicit seasonal uncertainty and cycling-section refill gaps | Field verification, unsupported holiday/complex schedules and observed coverage defects. No renewed ETH-specific expansion |
| Facility stops in the journey | Add as stop, up to five visits, explicit visit durations, fixed-service/budget/deadline checks, map/cards/fare eligibility updates and restore | Browser/phone acceptance, saved journeys and navigation replanning that preserves unfinished visits |
| Interface completion | Profiles, three phone views, desktop Map/Journey, objective/preference separation | Fix observed usability problems while preserving selection, map state and all existing options; avoid another redesign without task evidence |

Parking suitability is the priority, not live occupancy. Map proximity does not verify an entrance or an available bicycle space. Larger pilots, sample sizes and municipality lists remain proposals. [Detailed roadmap](APP_ROADMAP.md) · [Parking](BIKE_PARKING.md) · [Useful-stop scope](CYCLING_AMENITIES.md) · [Detour boundaries](FACILITY_DETOURS_2026-09-30.md).

## Technical maintenance and data gaps already tracked

- **Scale before wider access:** verify the actual key allowance and observed peak/daily demand, then coordinate global per-key quotas across Worker isolates. Version 64 bounds work only inside each isolate; a short shared cache alone does not enforce a quota. Record full cold/warm live-search timing and obtain the original 376-station fixture if an exact reproduction is required. [Speed/scale evidence](SPEED_AND_SCALE_2026-10-10.md).

- **Station transfers:** validate a familiar station on phone/desktop; correctly match service/route/calendar exceptions; establish a maintained feed refresh before the imported feed's **12 December 2026** validity boundary. Entrances, lifts, stairs and bicycle passage remain unverified. [Current integration and remaining work](STATION_TRANSFER_RUNTIME_2026-10-06.md).
- **Fares and acquisition:** investigate demonstrated city/itinerary quote gaps, including unsupported through fares across cycling breaks. Measure bounded discovery, runtime and truncation on fixed cases; do not describe eight sampled fare queries as a global cheapest-fare search.
- **Cycling estimates:** retain elevation/road evidence and calibrate riding, pushing and carrying times against observations. No traffic-volume or safety guarantee follows from the mapped traffic proxy.

The feed-refresh item is a roadmap task; this document does not create a scheduled job or reminder.

## Discussed design items, not implemented commitments

| Item | Decision or work still needed |
|---|---|
| Discover compromises | Define a small set of useful intermediate trade-offs and test them against fixed candidates and rider choices |
| Scenic/interesting-place Bikepacking routes | Define reviewed places, access/visit evidence and a detour budget; the implemented less-traffic objective does not provide this capability |
| Prefilled SBB handoff and further fare products | Check supported parameters and exact journey/profile semantics before adding behaviour |
| Reusable investigation / implementation / review procedures | The three written workflow procedures were proposed earlier; automatic test/build CI is already implemented. Branch protection and policy changes remain separate decisions |

Further navigation features (voice/background/automatic rerouting), full parking/retrieval or rental handling, additional bikepacking stages/overnights and saved journeys remain later options. A national engine migration, live bicycle-space availability, booking/ticket sales, community features, native apps and international expansion are deferred. Keep Switzerland first and the Site owner-private; new hosting costs need the owner's approval.

## Source and decision precedence

Use [PROJECT_STATE.md](PROJECT_STATE.md) for delivered behaviour, [DECISIONS.md](DECISIONS.md) for accepted changes, and the dated reports for evidence. Preserve historical records, but do not re-promote superseded constraints or assistant suggestions into current commitments. In particular, Extended already supports up to two automatic cycling connections, the branches are merged, and the 20-minute/fixed-30-minute boarding pilot has been superseded.
