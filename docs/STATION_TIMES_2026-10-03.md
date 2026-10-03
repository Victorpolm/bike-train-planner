# Climbing alternatives and station times

_Implemented 3 October 2026 on `feature/novice-interface-profiles`; main remains unchanged._

## Traveller controls

**Reduce climbing** is an optional journey proposition alongside Fastest, Fewest boardings and Least cycling/walking. Enable **Offer a Reduce climbing alternative** in Personalized → Preferences. It compares cycling ascent within 60 extra journey minutes and the original cycling/bicycle-access constraints. It does not change the three main ranking functions or impose an ascent preference on every cycling section. A single result can satisfy several categories; incomplete elevation cannot win the climbing category.

The **Climbing** heading and global **Less climbing** cycling preference are removed. **Cycling hills** has its own adjacent clickable question mark. **No hill preference** and **Gentler slopes** remain, including the 1–20% uphill preference and 0–60 extra minutes per cycling section. The percentage remains a soft preference, not a maximum-gradient guarantee. Bounded acquisition may explore additional low-ascent candidates when the optional proposition is requested.

## Public station data and source priority

The planner previously discarded same-station OJP transfers when collapsing platforms into a station node, then applied a generic three-minute boarding allowance. The adapter now preserves the provider's connection-specific evidence; the solver inserts mandatory timed station steps.

| Situation | Time used | Scope and limitation |
|---|---|---|
| Connection with OJP transfer evidence | OJP `TransferLeg.Duration` | Incoming service/day/arrival platform/time and outgoing day/platform/departure must match. Includes provider buffer; do not add three minutes again. |
| First boarding or boarding after cycling, with OJP access evidence | Leading foot `ContinuousLeg.Duration` | Queried coordinate must match the actual arrival point within 10 m, as well as the dated boarding platform/departure. No reuse at another entrance. |
| Same Swiss stop, without matching connection evidence | Published Swiss timetable default: two minutes | Explicit fallback; the app has not established that a platform-specific override is absent. This may underestimate a real transfer. |
| Other boarding without matching access evidence | Configured app boarding allowance, currently three minutes | Explicit estimate, not public station-specific evidence. |
| Matching evidence with missing/invalid duration or unsupported transfer type | Unusable connection | Unknown does not become zero. Conflicting evidence is retained and checked conservatively. |

Sources checked on 3 October: [Swiss GTFS cookbook](https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/), [GTFS transfer/pathway specification](https://gtfs.org/documentation/schedule/reference/), [OJP 2.0 schema](https://vdvde.github.io/OJP/release/2.0/documentation-tables/ojp.html), [Swiss OJP TripRequest](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/).

Swiss GTFS `transfers.txt` contains stop/platform transfer rules and minimum times in seconds; the two-minute within-stop default is omitted from the file. This release uses the OJP evidence already available with the existing runtime key. It does **not** import a new nationwide transfer table: the official dataset API/permalink returned HTTP 403 in this execution environment. No new key is required for the delivered OJP integration.

## Routing and display

- Baseline, Extended and ordered-waypoint routing use the same boarding check. Arrival-service/platform context survives dominance pruning, so a later arrival with a quicker platform change is not discarded.
- Existing walking steps are counted once. Mandatory access/transfer durations contribute to elapsed and active time; when the provider does not split walking from its buffer, the whole duration is conservatively counted as walking.
- OJP searches start at arrival at the station because OJP adds its access allowance. Public/national fallback queries retain the app buffer. This avoids silently missing an earlier usable service by adding both allowances before querying.
- Cycling edits and facility-detour previews check their fixed departures with the same rules. Exact transit objects and fare provenance remain unchanged.
- Journey details expose **Station transfer and boarding time**, with a clickable explanation, source and check date. Station steps do not invent indoor map geometry.

## Verification and publication

**360 regression cases in 11 suites pass**, including 17 added cases: category independence, source scoping, seven-minute acceptance versus six-minute rejection, later-arriving feasible platforms, overnight operating days, missing durations, repeated response merging, station access, editing/fare preservation, and acquisition without a duplicate buffer. `npm test` passes all 41 test files. React formatting, Knip and TypeScript/frontend/Worker production builds pass.

Recorded 24 September responses establish seven-minute Zürich HB and five-minute Biel/Bienne transfers. Fresh production API checks on **3 October at 16:41 UTC**, for departure **5 October at 08:00 Swiss time**, returned HTTP 200 and no provider warnings:

| Requested journey | Provider access examples | Provider transfer examples | Feasible graph journeys |
|---|---|---|---:|
| Rapperswil SG → Lausanne | Rapperswil 4 or 6 min, depending on boarding | Zürich HB 7, Bern 6, Pfäffikon SZ 3, Olten 5 min | 6 |
| Zürich Oerlikon → Bern | Oerlikon 4 or 5 min | Zürich HB 7, Aarau 3, Olten 5 min | 4 |

These are dated observations for specific connections, **not station-wide constants**. Recombined journeys without an exact matching transfer still use the labelled default. All inspected example departures satisfy their selected allowance; this does not independently validate missing platform-specific times. [Sanitized live evidence](experiments/station-times-2026-10-03.json).

Owner-private **version 50** published on **3 October 2026 at 16:40:52 UTC**, environment revision **3**, Site source `f3ae94634aacdf402bed6f17c641540adb5815f6`. The GitHub feature branch contains the same application files and remains unmerged. Browser interaction/visual QA remains pending because browser automation was unavailable in this session.

## Remaining work

This is passenger-timetable timing, not verified bicycle accessibility. Lifts, ramps, stairs, crowding, disruption, exact entrances and trailing station-exit paths are not established. Coordinated connections are not a real-time waiting guarantee. Coverage follows the queried provider journeys; the app does not yet have complete platform-pair timings for every Swiss station.

Next: test a familiar large-station interchange on desktop/phone, then integrate a regularly updated official transfer table with explicit SLOID/parent-station mapping to replace the default in recombined connections. Treat entrance/platform pathways and bicycle suitability as separate evidence.

**Later source investigation:** [National transfer data found and verified](STATION_TRANSFER_DATA_2026-10-03.md). The publisher's separate database is accessible; the original archives remain blocked in this execution environment. This research does not change version 50's runtime coverage.
