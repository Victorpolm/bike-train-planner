# Journey continuity — 11 October 2026

The owner requested item 5 from the latest gap list: saved journeys, unfinished facility visits during replanning, and a park/return/collect workflow. Items 4 (wider-access readiness) and 6 (data quality) were requests for explanation. This is not authorization for the older performance item 5 (Web Worker), paid compute, global quota infrastructure, sports routes or Europe.

## Delivered behaviour

- **Saved journeys:** up to 12 named snapshots on the same device/browser. Save captures the exact selected itinerary, scheduled Dates, routing preferences, path geometry, facility visits and current explicitly selected navigation stage. Open itinerary shows its timetable date; Plan again loads the endpoints and ordered stops, including added facilities, for a fresh search. Rename/delete are explicit. Current passenger profile controls fare quotes. No GPS history, network client or active location watch is saved. Reopening does not request GPS; Start is still explicit and boarding is never presumed.
- **Storage:** versioned, bounded and validated local storage; Date-safe serialization; snapshots are copied rather than tied to later live updates or edits. Failed saves/rename/delete preserve the visible saved list and report failure. Clearing browser data removes the copies; another phone/browser does not receive them. Physical bicycle custody still updates in memory if storage fails, with a warning that reload will lose the change.
- **Unfinished visits:** recalculation merges ordinary waypoints and applied facilities in actual itinerary order. A visit is complete only after its stage is confirmed, not when GPS is nearby. Current unfinished visits retain their full requested duration; partial elapsed dwell is not inferred. The real route search includes visit time, opening-hours eligibility and onward boarding allowances, retaining cycling/boarding limits and arrival deadlines. Up to four ordinary places and five facility visits are supported. Walking, waiting and visits do not satisfy a cycling minimum.
- **Park and retrieve:** “I’ve parked here” on a mapped parking card records actual parking; the Plan panel also offers an explicit one-shot GPS record. The record retains the location, available facility information, intended collection time and cycling preferences. Searches while parked use checked walking routes and passenger transit, with zero cycling and no bicycle carriage charges. A nearby direct checked walk is also eligible. “Plan return to bicycle” requests the current departure point and sets the recorded bike point as the destination; the user reviews the time and presses Find journey. “I have collected my bicycle” clears the parked state and restores cycling preferences. Opening a saved bicycle route while parked permits inspection but blocks Start until collection is confirmed.
- **Collection information:** mapped entry/collection closure and maximum-stay warnings remain visible. Unknown parking prices remain unknown and mapped parking fees are not included in transport ticket totals. GPS/map points do not verify an entrance, space or physical access. Parking is an explicit real-world record; the planner does not choose an optimal future parking site or infer collection from proximity.

Remaining deliberate constraints: one recorded bicycle on this device, no cloud synchronization or cross-tab transaction system, no rental pickup or multi-bicycle itinerary. General end-only journeys with an unrecorded bicycle pickup still require a new explicit Plan selection; navigation does not invent a pickup position. Replanning remains blocked while boarded, with stale/imprecise GPS, after an expired arrival deadline or when the existing boarding allowance is exhausted. A saved route is a dated snapshot, not a reservation or an offline map download.

## Verification

- 614 JavaScript tests in 11 suites pass, with zero failures/skips/cancellations; 13 Python tests pass.
- 21 additional continuity regressions cover Date/path/visit/stage round-trips, snapshot isolation, malformed/blocked storage, count and geometry/option limits, explicit custody, complete-vs-unfinished visit ordering, checked walking without bicycle requests, both solver modes, visit closures, cycling budgets, arrive-by limits and departure seeds.
- Golden journey: train A–B arrives at minute 20; a required 7-minute visit and 3-minute boarding allowance rule out B–C at minute 23 and retain departure 30 / arrival 50. An arrival deadline at minute 45 fails. Another golden case correctly leaves minute 10 for a 10-minute ride plus 7-minute visit plus 3-minute boarding before the minute-30 train.
- 32 actual React server-rendered panels: 7 new continuity/live-status panels, 19 preferences/timing panels and 6 facility panels. New checks cover escaping, dated snapshots, explicit actions, blocked state, park/collect controls, closure/max-stay warnings, delay text and cancellation text. These are not browser interaction tests.
- 288 complete-output comparisons against Site v68 source `b133828038eba6bdce4b17ede3dc1ae61764b5d3` match, covering both solvers/modes, all permission scopes, minimum durations, arrival deadlines, realtime cancellation/delay/platform evidence and missing/hydrated transfers. 204 nonempty cases and 42 capped cases retain their previous results and search counts. [Raw evidence](experiments/journey-continuity-equivalence-2026-10-11.json).
- TypeScript, frontend/server-Worker production builds, TSX formatting and unused-code checks are release gates. The existing frontend bundle-size warning remains. CI now also runs the continuity render script.

Reproduction from `prototype-v0/`, with Node 24:

```bash
npm test
python3 -m unittest discover -s scripts -p 'test_*.py'
node scripts/check-continuity-presentation.mjs
node scripts/check-preferences-presentation.mjs
node scripts/check-facility-presentation.mjs
npm run format:check
npm run check:unused
npm run build
node scripts/stress-performance-pass.mjs /absolute/v68-app
```

The Sites browser-control capability is unavailable in this environment, so interactive desktop/phone checks were not performed. No live-provider load burst or field trip was run. Next acceptance: a short familiar park/onward/return/collect journey, a reload/open saved itinerary, GPS denial, and a recalculation before/after a facility visit.

## Item 4 — wider-access readiness

The existing per-instance request queues/caches limit work in one server copy. Wider usage can create multiple copies that each independently admit work against the same provider key. A shared per-key minute/day allowance, bounded waiting, cancellation and clear busy responses must coordinate them before expanding access. This does not automatically imply buying more computation. Separately, the pinned station-transfer data is valid through **12 December 2026**; refresh, validate and monitor that dataset before its boundary, while retaining explicit fallback behaviour. This is a project task, not an automation or reminder created by this release.

## Item 6 — data quality and live train status

Remaining evidence gaps are partial passenger/bicycle fare coverage, service/route/calendar-specific transfer exceptions, uncertain bicycle permission/reservation requirements, actual entrances/lifts/stairs and bicycle passage, unsupported facility schedules and calibration of cycling/pushing estimates against real rides. Unknowns must remain visible; live train status does not resolve them or guarantee bicycle space.

Live status is already implemented: the selected journey's Journey view and Follow your journey show available estimated times/delays, cancellation or skipped-stop flags, platform changes and connection warnings. Today's supported services with OJP trip identity refresh every **30 seconds while the page is visible**, including a visibility-resume check; a manual Refresh is available in the Journey view. Other result cards are not all polled continuously. Missing/stale data and failed checks are disclosed and do not confirm punctuality. Scheduled identity is retained alongside estimates. Recalculation is explicit and a cancelled train is not silently replaced. This release verifies actual delay/cancellation markup and existing regression tests; it does not claim a new live service observation.

Discover/scenic sports routes and community rides remain proposals. Global API quotas and the December transfer-data refresh remain prerequisites for wider access. Europe remains a separately scoped future expansion.

## Publication and synchronization

Owner-private **version 69** published successfully on **10 October 2026 at 22:16:11 UTC** (11 October 00:16:11 Europe/Zurich), environment revision **3**, from Site source `1ed8d30fc77ff1d024df9617d77df2ee7132a658`. The exact pushed source and matching frontend/server-Worker archive were deployed. **614 JavaScript tests in 11 suites**, **13 Python tests**, **32 rendered panels** and **288 previous-release comparisons** pass, together with formatting, unused-code analysis and production builds. Device-local saved itineraries, unfinished-visit replanning and explicit park/return/collect are delivered. Re.route, the existing URL, runtime bindings and owner-only audience are preserved. Interactive browser/physical-phone acceptance remains unverified.

Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_2d7d095d35708191a3369d87af7589ad`; deployment: `appgdep_6acab916a364819189e38b5971319399` (`succeeded`). Access was rechecked: one owner, no groups or external visitors.

GitHub main contains implementation commit `126b583bb9d32bd21a664210e9b6f797cae92213`. All **297 application files** match the published Site source by Git blob hash. [Implementation CI run 38090968005](https://github.com/Victorpolm/bike-train-planner/actions/runs/38090968005) completed successfully, including JavaScript/Python tests, all three React render scripts, formatting, unused-code analysis and production builds. The subsequent confirmation commit changes documentation only.
