# Facility stops, parking choices and synchronization

_10 October 2026. Owner-authorized implementation; Switzerland-first, owner-private Re.route._

## Delivered behaviour

1. **Synchronization:** the owner's explicit request resolved the previous main-update approval block. GitHub main was fast-forwarded through the prepared rename/performance work to `d1241db0937a9d81d5d2343521ba9324b80c544b`. [Test and build passed](https://github.com/Victorpolm/bike-train-planner/actions/runs/38059847074). This release's publication and final source audit are recorded below.
2. **Facility stops:** select a cycling section, preview two routed links through a water/toilet/repair/food/parking facility, enter 0–180 minutes and choose **Add as stop**. Up to five visits can be added, including repeat visits. The original selected public-transport objects and services are retained. Cards, map F markers, itinerary, departure/arrival and transport-price eligibility update together. Restore returns to the original journey.
3. **Useful information:** parking shortlists near the destination, start, journey stations or a map point; mapped equipment preferences; access, arrival/collection time and maximum-stay checks; floor/entrance/source details; facility lists and cycling-section refill gaps. Existing source/corridor/type choices remain applicable.

## Journey contract

- Visit duration is a distinct stop, not cycling/walking. Ordinary route edits preserve existing visits and recheck their hours. Cycling-only trips maintain each visit's route boundary; required waypoints remain distinct.
- Recheck per-section/whole-trip cycling limits, transfer/boarding allowances, the search horizon and any arrival deadline. A flexible departure can use time the user already made available. Trains are fixed; a missed service blocks Apply instead of silently finding another one.
- Checks preserve exact source fare evidence. Endpoint visits retain the same transport quote identity; stops between services invalidate unsupported through queries and connecting-reservation assumptions. Valid bounded published zone fares still use unchanged service continuity and ticket duration. Facility purchases and parking fees are not included in transport totals.
- GPS following exposes a manual facility-stop stage. Live delays move the visit and can warn that mapped opening no longer fits. Replanning with unfinished visits is blocked with an explanation, because the route search cannot yet preserve their visit durations. No silent omission.
- Visits survive selection changes and later edits within this search; they are not persisted across reloads. Saved journeys remain separate work.
- Parking is an explicit visit while continuing with the bicycle. This does not implement rack selection plus locking, onward walking, stored-bike custody and retrieval. Existing beginning/end-only bicycle placement remains unchanged.

## Parking and facility evidence

- Shortlists use 2/5/10 km approximate distance from the chosen point plus the existing optional journey corridor. Mapped frame-support stands and cover receive explicit preference credit; unknown attributes receive none. Distance breaks ties; this is not a routed-access optimum or a security rating.
- Private/no access is excluded. Membership, customer/permit access, locks and conditional entry require the user's explicit include-conditions choice. Mapped closed arrival or collection is excluded. A garage may close during the stay if entry and collection both fit.
- Supported explicit-unit maximum stays are checked. Unknown syntax stays visible. Requiring free parking excludes unknown/conflicting/conditional fees. Requiring mapped opening excludes unknown and seasonal schedules.
- OSM maxstay, access/fee conditions, entry method, indoor/floor, supervision and monitoring tags are retained. Official UIC/DIDOK identifiers are preserved verbatim without invented conversion. Source download timestamps are not physical verification dates.
- Stable source identity or an explicit cross-source object link permits merging; proximity alone does not. Capacity is never summed across duplicate records. Contradictory access remains conservative and conflicts stay visible.
- Facility lists expose source floors/directions and direct map/detail/detour actions. Selected repair types respect equipment-specific unavailable states. Optional public/open filters require positive mapped evidence.
- Refill coverage only counts positively identified drinking water without explicit access restrictions and excludes known closure at the approximate passage time. It follows the actual cycling geometry, orders candidates along the ride and computes the largest uncovered interval separately for each cycling section. It never bridges a public-transport gap. A wider 1 km search is explicit.
- Missing/partial sources and empty lists mean incomplete data, not absence of facilities. Seasonal water, current flow/quality, physical entrances, bicycle passage, indoor travel, queue time, available spaces, stock and staffing remain unverified.

## Opening-hour boundary

The dependency-free evaluator supports 24/7, a single weekly day or day range, daily time ranges, split intervals, overnight ranges and later weekday overrides/closures. It uses Europe/Zurich, checks every minute boundary of the visit and permits leaving exactly at closing. Unsupported syntax—including public holidays, dates, seasons and complex selectors—returns unknown rather than a fabricated open/closed result. A seasonal tag also prevents a positive opening assertion. The UI consistently says **mapped**, with exceptions and actual entry unverified.

Primary tagging references: [OSM bicycle parking](https://wiki.openstreetmap.org/wiki/Tag:amenity=bicycle_parking), [maxstay](https://wiki.openstreetmap.org/wiki/Key:maxstay), [opening_hours](https://wiki.openstreetmap.org/wiki/Key:opening_hours). This implementation is a bounded subset, not a full opening_hours parser.

## Verification

- `npm test`: **552 tests in 11 suites, all pass** (37 newly added cases plus existing regressions).
- The fixed-train golden fixture independently checks **1,372 combinations**: 378 accepted and 994 rejected according to riding-budget and boarding-window constraints. This is included in one regression test, not 1,372 extra test-runner cases.
- Regression cases cover endpoint/intermediate visits, repeated and same-facility visits, the five-stop cap, original-object preservation, subsequent shaping, arrival deadlines, cycling-only timing, fare identity, required waypoints and live delay/opening changes.
- Hours include overnight, split-minute closure, later rule overrides, spring-forward and both fall-back wall-clock occurrences; unknown/seasonal/holiday syntax stays conservative.
- Parking covers access conditions, collection while closed, overstay, free-price uncertainty, preference ranking, source conflicts, identity-only merging and unverified entrances. Refill checks cover riding order, gaps, radius, invalid geometry, potability and separate cycling sections.
- `python3 -m unittest discover -s scripts -p 'test_*.py'`: **13 pass**.
- `node scripts/check-facility-presentation.mjs`: **six actual React panels rendered and checked** for restrictions, escaping, service filters, directions, visit times, restore, incomplete coverage and explicit stop totals. This is server rendering, not browser interaction.
- TypeScript/frontend/Worker production build, React formatting, Knip and whitespace checks pass. The existing frontend chunk-size advisory remains; no new dependency was added.
- Browser/phone interaction and visual acceptance were unavailable in this environment. Physical field verification was not performed. Existing version-64 solver differential results remain earlier evidence; they are not claimed as newly rerun here.

## Owner's next three priorities

1. **Design proposals:** Discover compromises, scenic Bikepacking routes and custom cycling minimum/maximum stay outside the immediate implementation queue.
2. **Before expanding access:** global API quota control across isolates and a transfer-data refresh before the current feed expires on **12 December 2026**. This document creates no scheduled reminder or refresh job.
3. **Europe:** scope country/provider coverage, bicycle-carriage rules, tariffs, transfer data and licensing before committing to expansion. Current delivery remains Switzerland-first.

## Publication and final synchronization

Owner-private **version 65** published successfully on **10 October 2026 at 15:03:12 UTC** (17:03:12 Europe/Zurich), environment revision **3**, from Site source `d10c8af18f011c104756035d8a07f3d174236a82`. The exact pushed source and matching frontend/Worker archive were deployed. **552 JavaScript tests in 11 suites**, **13 Python tests**, 1,372 fixed-connection combinations and six actual React panel render checks pass, together with builds, formatting and Knip. Browser/phone interaction and physical field acceptance remain pending. Title Re.route, the existing URL, runtime secret bindings and owner-only audience are preserved.

Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_858617b53c1c81919f438089281b85e0`; deployment: `appgdep_6aca5399ca648191aadfa04f50d271ad` (`succeeded`).

**Deployed source check at 15:04 UTC:** title and updated JavaScript bundle verified; official parking returned 1,608 facilities (1,356 with original station identifiers); OSM returned 20,778 records with the new retained fields, including 32 maxstay, 43 surveillance and 166 floor tags. Neither source reported stale data. Zürich HB returned 76 records with floor/direction information; the Dorfplatz Trin pilot returned one refill record. These counts measure returned data, not completeness or on-site correctness. [Sanitized observations](experiments/facility-live-2026-10-10.json).

Final GitHub source and CI verification follows this publication.
