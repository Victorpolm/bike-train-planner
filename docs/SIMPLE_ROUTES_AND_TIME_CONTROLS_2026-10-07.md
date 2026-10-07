# Simpler cycling routes and compact time controls

## Delivered behaviour

**Depart at / Arrive at** is a compact selector. The date/time field keeps a 44 px clock button immediately beside it; the button resets the mode and date to Leave now. Its accessible name and tooltip remain “Leave now”. On narrow screens the selector can wrap while the clock stays with the time field. Native date entry has no minimum tied to today.

Past departure and arrival dates were already accepted by the current planner. A new regression freezes the clock on 7 October and searches 5 October through the actual asynchronous planner and OJP adapter, without supplying an earliest departure in arrival mode. Both return the historical journey. Arrival searches retain the full configured lookback; neither mode silently substitutes today. Help now explicitly mentions past arrivals as well as departures. Historical timetable availability depends on the provider; this is not an archival timetable service, and online fare requests still require a future departure.

**Simplest · fewer turns** retains the ordinary trekking candidate and compares it with BRouter's road-oriented bicycle `fastbike` profile. The old second trekking request could repeat the same cycle-route preference and geometry. The new candidate disables steps, motorways and ferries and explicitly retains turn restrictions. Terrain checks, riding/pushing/carrying accounting, gentle-slope settings and the existing detour bound still apply. The same bicycle route is used for the cycling-only reference and ordinary access/egress links; no ETH-specific corridor is hard-coded.

Turn counting now excludes continue-straight, endpoint, off-route and beeline notices. Turns, forks/keep instructions and roundabouts count once per route point. Missing or malformed hints remain unknown, so they cannot win as a zero-turn route. The Simplest comparison gets up to 15 seconds within the existing request and phase budgets; the old first-link 2.5-second limit often discarded a live alternative. Failed or less suitable alternatives preserve the usable original. This remains a bounded comparison, not a global minimum-turn guarantee. Fewer turns can mean busier roads; Lower traffic stress remains a separate objective.

## Live ETH HG–Stadelhofen reproduction

Checked on 7 October 2026 using a representative ETH HG building pin (47.376427, 8.548112) and the existing Zürich Stadelhofen anchor (47.36661115, 8.54848502). The building pin is about 16 m from the official Rämistrasse 101 address point; it may differ from the user's exact selected entrance. Production requests use the rider-enabled 45 km/h maximum; displayed times below use the app's 15 km/h flat-ground pace model.

| Candidate | Distance | Actual turn/fork decisions | Estimated time | Mapped stair section |
| --- | --- | --- | --- | --- |
| Existing primary | 1,774 m | 16 | 8 min | Yes |
| Old client alternative | 1,774 m | 16 | 8 min | Yes; provider returned the same geometry |
| New road candidate | 1,551 m | 11 | 8 min | None |

The new candidate wins the app's actual selector. A separate OpenStreetMap API geometry check matched about 334 m of its route to named Rämistrasse road ways within 3 m, confirming that it uses the requested street. This is not a safety, access or entrance certification. Pushing sections remain visible in the analysis. The real requests took about 18.6 seconds for the primary, 10.1 seconds for the old alternative and 9.6 seconds for the new road candidate.

An earlier exploratory request using trekking alternative index 1 and a 25 km/h maximum returned 1,925 m and 15 actual turn decisions. That explains the intermediate comparison reported during investigation, but it is not the old app's result with the exact production parameters. The small raw fixtures and all request parameters are retained under `prototype-v0/src/fixtures/eth-stadelhofen-2026-10-07/`.

Primary sources inspected: [BRouter trekking profile](https://github.com/abrensch/brouter/blob/master/misc/profiles2/trekking.brf), [fastbike profile](https://github.com/abrensch/brouter/blob/master/misc/profiles2/fastbike.brf), [VoiceHint codes](https://github.com/abrensch/brouter/blob/master/brouter-core/src/main/java/btools/router/VoiceHint.java), the live profiles at brouter.de, and [OpenStreetMap's bounded map API response](https://api.openstreetmap.org/api/0.6/map?bbox=8.545,47.369,8.553,47.376). Map data © OpenStreetMap contributors, ODbL. No national download, new key or paid provider is introduced.

## Existing cycling-position controls

The user is correct that selecting cycling only at the beginning/end and explicitly including services that prohibit bicycles exposes useful passenger-only service comparisons. This is a manual workaround for leaving a bike behind or collecting another bike. The current model still treats the bicycle as accompanying the traveller, includes bicycle costs and does not track parking/collection or walking from a rack to a platform. This release does not add another mode selector. A future parking flow should reuse the existing placement control and show parking at the relevant boarding/alighting station, with the fare and bike-custody assumptions resolved together.

## Verification and next acceptance check

395 offline tests in 11 suites pass. New regressions cover historical dates in both directions, instruction semantics and unknown hints, the exact live route fixture, requested bicycle restrictions, a 12-second alternative, and fallback to the ordinary route. React formatting, Knip and TypeScript/frontend/Worker production builds pass; the existing frontend chunk-size advisory remains. Browser interaction/visual QA is unavailable in this managed environment and remains pending.

Next acceptance check: on desktop and phone, enter a past date in each time mode, use the clock reset, then compare ETH HG → Stadelhofen under Simplest and Lower traffic stress. Inspect the Rämistrasse segment, pushing/entrance details and any provider-specific historical-data gaps.

## Publication

Owner-private **version 55** published on **7 October 2026 at 10:52:25 UTC** (12:52:25 Europe/Zurich), environment revision **3**, Site source `68c182b244670c385f26b561538038f49f6c1044`. Compact time controls, historical-date regressions and a road-oriented Simplest candidate are delivered. **395 regressions** in 11 suites, formatting, Knip and TypeScript/frontend/Worker builds pass. The live ETH HG–Stadelhofen reproduction improves from 1.774 km / 16 turns to 1.551 km / 11 turns and uses Rämistrasse. Browser interaction/visual QA remains pending. Runtime keys and audience are unchanged.

- Project: `appgprj_6a9bdfc1819481918c7085729f869ca9`
- Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_8b8411d31d2c8191a9a8f1f1c43c8d41`
- Deployment: `appgdep_6ac62454a4708191a63846627c19fdc1`
- Native deployment status: `succeeded`
- URL: https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site

The Sites helper built, pushed and packaged this exact source before publication. GitHub main receives matching application files and these durable project notes. No access or environment settings were changed.
