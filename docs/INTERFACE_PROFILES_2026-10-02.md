# Interface and local traveller profiles — 2 October 2026

**3 October follow-up:** [Search reliability, clickable preference help, live city fares and functional later departures](SEARCH_RELIABILITY_2026-10-03.md) supersede the earlier deferred More/past-date notes and describe the new per-action discovery budgets. This report preserves the 2 October implementation history.

## Scope and delivery

Requested branch: `feature/novice-interface-profiles`, based on main `5f179851cf0772fd8930a835f2826db330974784`. The owner approved implementing the revised novice interface with optional device-local profiles and preserving planner capabilities. This branch is not merged into main.

The desktop has planning/results on the left and the map on the right. The form presents the new introduction, traveller, locations with a circular reverse action, date/time with Leave now, trip presets, expandable personal settings/preferences, Find journeys and folded planning notes. Intermediate stops, map location selection, keyboard interaction and cancellation remain available.

On widths up to 900 px, a fixed Planning / Map switch changes visibility without unmounting either panel. Each view remembers its page scroll. Leaflet ignores hidden zero-size containers, preserves the user's center/zoom on resize and postpones explicit route framing until visible. Filters, selected journey, details and detour state remain mounted; switching views does not invoke search, reroute or reset layers. Facility controls are in Map filters, including all five existing layers, closest actions, subtypes and route-distance controls. Green solid cycling and blue dashed transit lines have a compact text/line legend; walking remains distinct and the full key is expandable.

## Profiles and trip presets

Guest remains usable without a saved profile. Create, select, rename, explicitly save and delete several profiles in this browser. Profiles contain a name, optional age, supported passenger travelcard, annual bicycle pass, riding preset, flat speed and electric assistance. A trip has one traveller. Selection prefills the current trip. Changing trip settings does not mutate a saved record; Save to profile is explicit. Returning to Guest restores that visit's Guest settings. Existing device fare preferences are read on first use. Storage errors are displayed, invalid saved records are rejected, and browser data deletion removes profiles. No server account, login or cross-device sync is added.

Age is metadata only. The current fare integration remains adult, 2nd class: full fare, Half Fare and GA. Age cannot imply an unsupported youth/child discount.

| Choice | Bicycle access | Cycling path preference | Cycling limit | Categories |
|---|---|---|---|---|
| Commuter | Allow uncertain, exclude prohibited | Simplest / fewer turns | 45 minutes **total**, each leg also bounded by that total | Existing three |
| Bikepacking | Confirmed only | Lower traffic stress | No separate cycling cap; existing 24-hour overall horizon remains | Existing three |
| Personalized | All existing choices | All existing choices | 40 / 45 / 90 / 150 minutes or no separate cap | Three, plus optional existing endpoint category |

Presets change trip preferences only. They retain the selected traveller's or current trip's fare and pace. New guests start full fare, no annual bicycle pass, Relaxed at 20 km/h, unless the previous device fare setting supplies a supported travelcard/pass. Baseline and Extended remain independently available in Preferences, with their existing meanings. Existing 40/90/150-minute per-leg limits are unchanged; the new 45-minute setting is additional. The endpoint option remains an **extra ranking category**, not a rule about leaving a bicycle before/after transit.

## Capability mapping

| Existing capability | Location after redesign |
|---|---|
| Addresses/stations, ordered intermediate stops, reversal | From/To area and circular reverse button; reverse also reverses the intermediate order |
| Scheduled future departure / now | Date/time field and clock Leave now action, Swiss local time |
| Baseline / Extended | Preferences → Journey options |
| Three bicycle permission scopes | Preferences → Public transport with my bicycle |
| Riding presets and custom speed | Profile for this trip; all five presets retained |
| Full/Half Fare/GA and annual bicycle pass | Profile for this trip, also saved in named profiles |
| Fastest / fewer turns / lower traffic stress | Preferences → Cycling path |
| Existing cycling limits and extra endpoint category | Preferences → How much cycling / Extra category |
| Fare retrieval, fare uncertainty and component breakdown | One total on collapsed cards, full existing breakdown in the opened journey |
| Timings, platforms, boarding count and category comparisons | Journey cards and expanded plan; comparison explanation behind ? |
| Bicycle prohibition, unknowns and reservation requirements | Remain visible in journey cards/details; long sources and general guidance behind ? |
| Cycling elevation, walking/carry restrictions, swisstopo evidence | Existing cycling details; path-choice/source explanations behind ? |
| Stops, parking, water, toilets, repairs, food, source retries, closest and corridor | Map filters and existing layer panels; no source removed |
| Clicked facility details and fixed-service detours | Existing persistent popups and detour panel; no timetable/fare recomputation on view switch |

Explanations use native details/summary: click, touch, Enter/Space, persistent content and Escape to close/refocus. No hover-only disclosure or nested action inside journey-card buttons. Mandatory conditions are not folded away.

## Verification and limits

- **309 offline tests in 11 suites pass**, including nine new tests for legacy fare migration, isolated trip edits, multiple-profile roundtrip, age neutrality, invalid/duplicate data, storage failure and preset compatibility. The golden boundary admits a 45-minute routed access leg and rejects 46 in both Baseline and Extended.
- TypeScript, frontend and Worker production builds pass; React formatting and Knip pass. Vite's existing large-bundle warning remains non-blocking.
- In this sandbox `npm test` reported only file-level results. `node --test --test-isolation=none src/*.test.ts` produced the complete 309-case result; the test-runner failure path was checked separately. The regular GitHub workflow remains unchanged.
- Browser interaction/visual QA is unavailable in this session. Phone/desktop layout, keyboard disclosures, profile create/edit/delete and map-view persistence require the manual acceptance pass below. Offline tests do not establish live provider availability or actual fares; no new live Swiss route/fare results are claimed.
- Owner-private **version 43** published successfully on **2 October 2026 at 19:34:27 UTC**, environment revision **3**, from Site source `79394f5eb992779f1d48048fb5d4f1abf9ec3bf4`. All **188 current application files** match this branch; historical Site documentation snapshots are excluded. **GitHub Test and build passed** on the exact implementation commit `dee7dbea498bf85d018164ecc4f5eea220c6ebf3`: [run 37055416724](https://github.com/Victorpolm/bike-train-planner/actions/runs/37055416724). [Draft PR #1](https://github.com/Victorpolm/bike-train-planner/pull/1) is open for review; main is unchanged.

## Manual acceptance pass

1. Guest: reverse Zürich–Laax including two intermediate stops; check order and controls at desktop, phone and 200% zoom.
2. Create a Half Fare/electric profile; edit only this trip, switch Commuter/Bikepacking, verify fare/pace stay; reload without Save to profile and verify saved values. Save, rename, delete; try blocked browser storage.
3. Compare Baseline and Extended; confirm all scopes, existing 40/90/150 limits and endpoint extra categories remain selectable.
4. Plan Zürich–Bern, open a result, check one collapsed total versus expanded breakdown, and unknown totals when a quote fails. Required bicycle/reservation warnings remain visible.
5. Open a ? by keyboard/touch and follow its sources. Move the pointer away; the text remains readable. Escape closes and returns focus.
6. On phone, pan/zoom, enable all useful-stop categories, open a detour, then switch Planning / Map and rotate the device. Check state, map center and service selection; no new route/timetable/fare requests should be caused by the switch.

## Remaining work, not implied by this redesign

- Historical departures need provider/horizon/cache validation before removing the existing future-departure guard.
- Next/later departures within each category require actual additional timetable search and deduplication; no nonfunctional More button is added.
- Youth/child and other fare products require supported quote semantics and eligibility handling. Saved age does not add them.
- GPS and navigation/Start require permission, location lifecycle, route progress and reroute handling.
- An arbitrary cycling-minute slider and before/after/both bicycle-availability modes are separate functionality. Existing endpoint ranking is preserved, not relabelled as those modes.
- Cross-device profiles/accounts, indoor routing, parking retrieval modes, applying a detour to a journey and richer facility precision remain separate work.


## Follow-up — compact header profile and modular editing

The owner asked to reduce profile/route spacing and make interface editing modular. Profile selection and all personal fields now open from a circular person icon at the top right. The search form no longer repeats profile controls. A compact side-mounted reverse action removes its empty row. The form is split into header, profile, locations, departure, presets and preferences components, with a central module-order/text file and a dedicated stylesheet with named spacing/width settings. Routing and the local-profile data format remain unchanged; 309 regressions and format/unused-code gates pass. Extended has an inline explanation. [Editing guide, component map, future visual-editor proposal and manual checks](INTERFACE_EDITING.md).

**Follow-up publication:** owner-private version 44 at 20:32:54 UTC, Site source `fc0591d62b03d959c210e687289d43538e7d2c07`, environment revision 3. All 197 current application files match the feature branch.

## Follow-up — profiles in Your trip

Version 45 adds cards for saved profiles below the trip styles. Selection applies saved rider/ticket settings and keeps the current trip style and route preferences. Creation, rename and deletion update the cards immediately; trip-only edits are identified and can be restored by selecting the card. Both controls share state and handle storage failure consistently. 312 offline tests, formatting/Knip and builds pass. Browser interaction checks remain pending. [Editing and acceptance guide](INTERFACE_EDITING.md).

Owner-private version **45** succeeded on **2 October 2026 at 21:09:11 UTC**, environment revision **3**, from Site source `f8dfcb0e46ac945f8c1b52fb12f284ed0d02315d`. All **197 current application files** match the feature branch. The existing [draft PR #1](https://github.com/Victorpolm/bike-train-planner/pull/1) remains unmerged; sharing and main are unchanged.

The question of multiple automatic cycling connections is investigated separately. Version 45 kept the one-transfer cap. The following release supersedes that investigation.

## Follow-up — two connections and cycling position

The owner requested Baseline 0 / Extended up to 2 plus beginning-only/end-only cycling. Both solvers and discovery implement this; the position restriction applies across the complete journey and stays independent of the optional least-active endpoint category. The non-cycling end must match a public-transport stop; existing walking transfers remain possible. Exact scope, through-fare limitations, regression evidence and manual checks are in [MULTIPLE_CYCLING_TRANSFERS.md](MULTIPLE_CYCLING_TRANSFERS.md). 322 regressions and production builds pass; browser QA remains pending.

Owner-private **version 46** published on **2 October 2026 at 21:45:56 UTC**, environment revision **3**, Site source `043d35340c35317a2c54b3f473e3bf0a85d30125`. All **198 current application files** match `feature/novice-interface-profiles`; the branch and [draft PR #1](https://github.com/Victorpolm/bike-train-planner/pull/1) remain unmerged. Sharing and runtime secrets are unchanged.
