# Separate bicycle-permission searches and OJP evaluation

_Decision and implementation: 21 September 2026._

## The three comparisons

1. Which useful journey can I take when bicycle permission is confirmed on every public-transport service?
2. Which useful journey could I take if I also consider services whose bicycle permission remains uncertain?
3. What public-transport journeys are available if bicycle permission is ignored, with prohibitions clearly labelled as comparison-only?

All three searches use the same departure, road routes, cycling budget, requested stops and boarding limits. Each independently chooses fastest with transit, fewest boardings and least cycling or walking, plus the optional endpoint preference. Each has its own 60-minute alternative window. A quicker uncertain service cannot prune a confirmed alternative. The separate cycling-only reference does not remove any group’s transit results.

Identical journey IDs merge only after optimization. One card retains its winning categories and time comparison in each group. If all three recommendation sets match, the page says so and presents one shared result set. A route with confirmed permission can also win the permissive and unrestricted searches; “allow uncertain permission” describes the search, not necessarily that particular route.

## Evidence and current limits

| Evidence | Treatment |
|---|---|
| Positive, sourced evidence for the exact dated service and boarded segment | Eligible for the confirmed search, subject to all other constraints |
| General operator policy, including conditional PostBus/VBZ rules | Uncertain; eligible only for the permissive search |
| Missing service permission, including current train/tram data | Uncertain; never inferred to be allowed |
| Applicable explicit prohibition or matched operator prohibition | Excluded from confirmed/uncertain searches; allowed only in the labelled all-transit comparison |
| Available bicycle space or reservation availability | Explicitly deferred; not queried or integrated |

The current Transport API adapter does not supply positive service-level evidence. **The confirmed group will normally be empty.** Its message explains that available data cannot confirm a journey, rather than asserting that no bicycle-compatible service exists. This is an intentional data-quality boundary, not a completed carriage-data integration. The evidence type is ready for a trusted adapter; arbitrary upstream fields are not accepted as permission.

The check applies to every transit leg in Baseline, Extended and ordered-stop routing. Evidence must match departure timestamp, service, operator and boarding/alighting IDs, with source and review date. Explicit conditions remain visible. Confirmed permission is distinct from guaranteed boarding: tickets, required reservations and remaining space still need checking.

## Zürich discovery and comparisons

Nearby bus/tram lookup now also runs beside seeded rail hubs and selected stations with a nonzero catchment. Up to four candidates preserve local transport and rail coverage. Up to four initial pair queries reserve a local connection before rail coverage; the overall 18-request cap is unchanged. A transit result slower than the completed cycling-only estimate can trigger bounded outward discovery. Extended discovery retains reachable labels from all three searches. Ordered visits query each distinct scope arrival under the same 18-request budget. All scopes share the selected Avoid buses constraint. Unrestricted discovery must not be interpreted as bicycle feasibility.

Each transit card compares time and cycling-or-walking with the routed cycling-only reference, and displays waiting/boarding time. “Fastest with transit” is scoped to a permission group. Cycling receives “Fastest in this search” only when it is at least as fast as all recommendations and within the chosen cycling allowance. No claim of national optimality follows from this sampled graph.

## OJP findings and evaluation status

**Verified from official documentation:** [OJP 2.0 TripRequest](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/) accepts a `BikeTransport` filter and returns service attributes. The documentation warns of a limitation around services restricted at particular stops. The filter's inclusion alone is not sufficient positive evidence for our confirmed group. The response attributes must be interpreted with their service/segment scope. OJP supports one via point directly; our multiple-stop feature needs separate handling.

The [official SDK](https://github.com/openTdataCH/ojp-js) identifies the OJP 2.0 endpoint. [API access](https://opentransportdata.swiss/en/cookbook/development-miscellaneous-cookbook/howto-access-apis/) requires a key sent in an authorization header. The repository Actions secret `OJP_API_KEY` has now been validated: **all 16 live benchmark requests succeeded on 21 September 2026**. OJP returned useful reservation/conditional-carriage notes, but incomplete positive evidence across complete journeys. See [the recorded findings](OJP_BENCHMARK_2026-09-21.md). No engine migration or website backend has been completed.

`prototype-v0/scripts/ojp_benchmark.py` prepares or captures two otherwise identical requests with `BikeTransport` off/on. It retains XML plus service IDs, operating dates, stop references, scheduled times and raw attributes. Permission stays `unassessed`; empty responses and request errors are distinguished. Keys stay in a local environment variable, outside the static website and saved files.

From `prototype-v0/`, a reproducible dry run is:

```bash
python3 scripts/ojp_benchmark.py --origin ch:1:sloid:3000 --destination ch:1:sloid:7000 --departure 2026-09-22T08:00:00+02:00 --output evaluation-output/dry-run --dry-run
python3 -m unittest discover -s scripts -p 'test_*.py'
```

For live evaluation, configure `OJP_API_KEY` locally, use a future departure and a new output directory, and omit `--dry-run`. Origins/destinations accept a stop reference or the exact `latitude,longitude` selected in the app. Never place the key in a frontend `VITE_` variable or commit captures containing personal addresses.

### GitHub Actions benchmark

Open [Actions → OJP bicycle evidence benchmark](https://github.com/Victorpolm/bike-train-planner/actions/workflows/ojp-benchmark.yml), choose **Run workflow**, keep branch **main**, and enter a future Swiss departure date (`YYYY-MM-DD`). Blank uses `.github/ojp-benchmark-run.json`. Subsequent runs are manual only; source/doc changes and pull requests do not trigger calls. The initial run used Tuesday **22 September 2026**.

The eight cases make at most 16 OJP calls (six requested results each), with 1.3 seconds between requests and no automatic retries. Authentication or quota errors stop further OJP calls. The workflow has read-only repository permissions, pinned actions and a step-scoped secret. It writes a readable summary and a seven-day artifact containing requests, bounded response XML and normalized service evidence. Headers and credentials are never printed or uploaded. Captures are excluded from git. Repository Actions visibility applies to reports/artifacts. Use public stops and places in this public workflow; do not add personal addresses to the manifest or reports.

`ojp_matrix.py` requires unambiguous endpoint matches. The current Zürich reference origin is the public Waserstrasse stop. Personal addresses belong in a private evaluation environment. Küsnacht uses the exact railway-station match, explicitly **not** a reproduction of the user's unspecified origin. Resolved coordinates, provider URLs, local departure offsets and UTC capture times are retained. Other coordinates come from the existing app/recorded fixtures. OJP 2.0's documented Swiss stop references are SLOIDs, not the Transport API's UIC IDs; the matrix uses coordinates and the standalone example above uses SLOIDs.

All requests use scheduled times (`UseRealtimeData=none`) and provider-default access. Results therefore measure service discovery and returned evidence; they do not yet compare the app's routed bicycle access or establish that a particular bicycle connection is catchable. Raw service/stop attributes are retained without promoting filter inclusion to confirmed permission.

## Fixed evaluation cases

| Journey | Departure cases | Evidence needed |
|---|---|---|
| Zürich local origin → Zürich HB | Weekday 08:00 and 01:54, on explicitly recorded dates | Record exact inputs privately; use a public stop for shared regressions; local departures and bicycle attributes |
| Küsnacht → Zürich HB | Same dated daytime/night pair | User's exact Küsnacht origin is still unspecified; record it before claiming reproduction |
| Libingen → EPFL | Existing recorded daytime/night cases, plus a future rerun | Rapperswil–Renens coverage and catchable routed access |
| Zürich HB → Laax GR, posta | Weekday daytime | Train/bus scope, reservations and bus segment attributes |

For each case capture current-app winners in all three groups, all provider returns, time-to-first-result, request failures, access duration, boarding count and unresolved permissions. OJP requests currently use provider-default access, so their raw journey times are **not** equivalent to our bicycle-routing times. Recalculate directed cycling access, boarding readiness and egress before comparing feasible arrivals.

The initial live matrix is complete. Before adopting OJP: confirm the meaning/coverage of bicycle attributes against official departure details, preserve unknowns, handle restrictions at individual stops, and verify later confirmed alternatives are not lost to provider result limits. A static-site migration also needs a server-side credential boundary. These are remaining work, not implemented capabilities.

## TripInfo follow-up and coverage

The user requests TripInfo investigation without remaining-space integration. A single-service evaluation command and manual workflow are now available, with controlled tests but no live TripInfo result yet. Keep raw service/stop evidence separate and permission unassessed until reviewed. [Research, commands, three-set semantics and actual network coverage](TRIPINFO_AND_NETWORK_COVERAGE.md).
