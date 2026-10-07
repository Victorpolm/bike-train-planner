# Data for wider station-transfer coverage

**Status update, 7 October:** The original ZIP was supplied, both branches merged, and its general-rule runtime lookup is deployed in version 53 and synchronized to main. Scoped exceptions remain pending. [Implementation, source provenance and checks](STATION_TRANSFER_RUNTIME_2026-10-06.md). The dated research findings below are historical.

_Research and verified data access, 3 October 2026. No application release in this update; version 50 remains live._

## Finding

The data needed to improve independently assembled connections exists at the national publisher. A city-by-city inventory and a new OJP token are not required. This investigation found both the primary timetable archives and an accessible official database copy, then read actual platform-transfer records from that copy.

| Source | Useful content | Verified access and limitation |
|---|---|---|
| [Swiss GTFS 2026](https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020) | `transfers.txt`: stop/platform pairs, minimum time, transfer type, route/trip restrictions; accompanying stop identities and calendars | Latest listed archive: `GTFS_FP2026_20260930.zip`, 275.6 MB. Catalogue information readable through search; direct archive requests from this execution environment returned HTTP 403. |
| [Swiss HRDF 2026](https://data.opentransportdata.swiss/dataset/timetable-54-2026-hrdf) | `UMSTEIGB`: station defaults; `UMSTEIGL`: category/line/direction rules; `UMSTEIGZ`: trip-pair exceptions; `UMSTEIGV`: operator-specific rules | Public format documented. The tested archive download also returned HTTP 403. Use as a cross-check or for semantics not retained in GTFS. |
| [Publisher GTFS database catalogue](https://tools.opentransportdata.swiss/gtfs-static-dbs/gtfs-static-dbs.json) | Dated database copies and table counts | HTTP 200. Live catalogue created 1 October 2026, latest snapshot 30 September: **104,297 stop/platform rows and 1,112,959 transfer rows**. These are records, not unique stations or proof of complete coverage. |
| [Publisher database, 30 September](https://tools.opentransportdata.swiss/gtfs-static-dbs/gtfs_2026-09-30.sqlite) | Actual stop/platform and transfer tables | HTTP 206 range reads succeeded. The full database is **11,918,123,008 bytes**; only a bounded sample was read. This copy omits some original columns, detailed below. |

The publisher's [GTFS query tool](https://github.com/openTdataCH/OJP-Showcase/tree/develop/apps/gtfs-query) permits selected lookup tables. Its table whitelist excludes transfers; no unsupported SQL query or whitelist bypass was attempted. The separately public downloadable SQLite file is a useful research source.

## Records actually read

The database identifies feed version `20260930`, with the timetable validity recorded in the attached audit. Exact SLOID references were matched through `stops.stop_id` / `original_stop_id`; no arithmetic conversion from a legacy station number was used.

| From | To | Generic platform-pair minimum |
|---|---|---:|
| Zürich HB `ch:1:sloid:3000:502:42` | `ch:1:sloid:3000:10:18` | 420 s / 7 min |
| Zürich HB `ch:1:sloid:3000:502:42` | `ch:1:sloid:3000:500:32` | 420 s / 7 min |
| Bern `ch:1:sloid:7000:6:32` | `ch:1:sloid:7000:1:1` | 360 s / 6 min |

These sampled rows have type 2 and empty route/trip restriction columns. They demonstrate the missing capability: a platform-pair rule can apply to a newly assembled connection even when OJP has not returned that exact pair of services. They are not station-wide constants, entrance times or evidence of bicycle-accessible paths.

[Machine-readable audit: source URLs, feed metadata, actual schema and sampled rows](experiments/station-transfer-data-audit-2026-10-03.json). The audit retains a small sample, not a downloaded bulk dataset.

## Critical import details

1. **Use the complete original schema for production.** The readable database omits `transfers.service_id` and `stops.didok`. The publisher [documents a Swiss `service_id` extension](https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/gtfs-changes-transfers-txt/) for date-restricted through-connections. Its absence particularly prevents treating through-service rows as universally valid. The accessible database is useful evidence, but does not establish a complete lossless import.
2. **Keep identifiers explicit.** Import `stop_id`, `original_stop_id`, `parent_station`, `platform_code` and `didok` from `stops.txt`. Generated platform IDs can map many-to-one; ambiguous matches must remain unresolved. Do not collapse all platforms before applying transfer rules.
3. **Retain scope and validity.** Preserve from/to stop, route and trip IDs, type, minimum seconds and any service ID. Resolve trip references through `trips.txt` and service calendars/exceptions; use stop times when daily trip matching is ambiguous. Never broaden a service-specific rule into a station-wide rule.
4. **Respect transfer meaning.** Minimum-time, forbidden, coordinated and stay-on-board rules are different. Missing minimum seconds is not zero. A coordinated connection is not a real-time waiting guarantee. Standard same-stop defaults are usable only after checking applicable published overrides.
5. **Build a compact lookup outside a journey search.** Import a pinned feed off the request path; retain its date, checksum, validity, source and scope. Serve only needed station/platform rules. Keep the full timetable outside Git and outside the browser bundle. Expired or failed refreshes must be visible and cannot silently become current evidence.

The [Swiss GTFS cookbook](https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/) is the primary specification for its local conventions. The [HRDF cookbook](https://opentransportdata.swiss/de/cookbook/timetable-cookbook/hafas-rohdaten-format-hrdf/) explains the complementary station/line/trip/operator rules.

## Integration and acceptance plan

Keep exact OJP connection/access evidence. Add a GTFS rule resolver to `transferTimes.ts` for recombined transit connections, preserving rule specificity and source provenance. Both routing solvers, cycling edits and facility detour checks already share that module. Retain incoming platform/service context during pruning.

First acceptance case: the recorded Rapperswil–Lausanne search contains a recombined Zürich HB change that uses version 50's two-minute default. Resolve its actual arrival/departure platform pair against the imported rules, then demonstrate rejection below the published minimum and acceptance at it. Add asymmetric pairs, route/trip-specific overrides, operating-day boundaries, forbidden changes, missing platforms, generated aliases and out-of-validity feeds. Compare the result against the retained OJP evidence without changing fares or bicycle-permission rules.

This source addresses **public-transport interchanges**. It does not fill all entrance-to-platform or exit-path gaps, nor verify lifts, stairs or bicycle passage. Continue using scoped OJP access durations for those queries; indoor pathway evidence is separate work.

**Status on 3 October:** source located and actual records verified; national production lookup is not yet implemented. The original archive download and lossless schema/validity validation remain the next input gate. A supported fresh archive or an original-schema extract is sufficient; users should not paste API secrets into chat.

## Extra categories: proposed simplification

The owner's suggestion is sound: put **Reduce climbing** and **Gentler slopes** with the existing endpoint alternatives under **Extra categories**. Show the uphill percentage only when Gentler slopes is selected. Keep the ordinary Fastest, Fewest boardings and Least cycling/walking results available.

This needs a behaviour change as well as rearranging labels. Version 50's Gentler slopes currently selects cycling paths globally. To make it a true extra category, retain ordinary paths and a separate gentler candidate set, and apply the hill ranking to that additional proposal. Do not quietly change all ordinary category paths merely because an extra category is enabled. Preserve existing cycling limits, bicycle-access choices and optional endpoint category.

**Proposal, not yet implemented in this research update.**

