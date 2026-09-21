# Separate bicycle-permission searches and OJP evaluation

_Decision and implementation: 21 September 2026._

## The two questions

1. Which useful journey can I take when bicycle permission is confirmed on every public-transport service?
2. Which useful journey could I take if I also consider services whose bicycle permission remains uncertain?

Both searches use the same departure, road routes, cycling budget, requested stops and boarding limits. Each independently chooses fastest with transit, fewest boardings and least cycling or walking, plus the optional endpoint preference. Each has its own 60-minute alternative window. A quicker uncertain service cannot prune a confirmed alternative. The separate cycling-only reference does not remove either group's transit results.

Identical journey IDs merge only after optimization. One card retains its winning categories and time comparison in each group. If both recommendation sets match, the page says so and presents one shared result set. A route with confirmed permission can also win the permissive search; “allow uncertain permission” describes the search, not necessarily that particular route.

## Evidence and current limits

| Evidence | Treatment |
|---|---|
| Positive, sourced evidence for the exact dated service and boarded segment | Eligible for the confirmed search, subject to all other constraints |
| General operator policy, including conditional PostBus/VBZ rules | Uncertain; eligible only for the permissive search |
| Missing service permission, including current train/tram data | Uncertain; never inferred to be allowed |
| Applicable explicit prohibition or matched operator prohibition | Excluded from both searches |
| Available bicycle space or reservation availability | Unknown; the app makes no booking |

The current Transport API adapter does not supply positive service-level evidence. **The confirmed group will normally be empty.** Its message explains that available data cannot confirm a journey, rather than asserting that no bicycle-compatible service exists. This is an intentional data-quality boundary, not a completed carriage-data integration. The evidence type is ready for a trusted adapter; arbitrary upstream fields are not accepted as permission.

The check applies to every transit leg in Baseline, Extended and ordered-stop routing. Evidence must match departure timestamp, service, operator and boarding/alighting IDs, with source and review date. Explicit conditions remain visible. Confirmed permission is distinct from guaranteed boarding: tickets, required reservations and remaining space still need checking.

## Zürich discovery and comparisons

Nearby bus/tram lookup now also runs beside seeded rail hubs and selected stations with a nonzero catchment. Up to four candidates preserve local transport and rail coverage. Up to four initial pair queries reserve a local connection before rail coverage; the overall 18-request cap is unchanged. A transit result slower than the completed cycling-only estimate can trigger bounded outward discovery. Extended discovery retains reachable labels from both permission searches.

Each transit card compares time and cycling-or-walking with the routed cycling-only reference, and displays waiting/boarding time. “Fastest with transit” is scoped to a permission group. Cycling receives “Fastest in this search” only when it is at least as fast as all recommendations and within the chosen cycling allowance. No claim of national optimality follows from this sampled graph.

## OJP findings and evaluation status

**Verified from official documentation:** [OJP 2.0 TripRequest](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/) accepts a `BikeTransport` filter and returns service attributes. The documentation warns of a limitation around services restricted at particular stops. The filter's inclusion alone is not sufficient positive evidence for our confirmed group. The response attributes must be interpreted with their service/segment scope. OJP supports one via point directly; our multiple-stop feature needs separate handling.

The [official SDK](https://github.com/openTdataCH/ojp-js) identifies the OJP 2.0 endpoint. [API access](https://opentransportdata.swiss/en/cookbook/development-miscellaneous-cookbook/howto-access-apis/) requires a key sent in an authorization header. No key is configured for this project. **No live OJP benchmark or engine migration has been completed.**

`prototype-v0/scripts/ojp_benchmark.py` prepares or captures two otherwise identical requests with `BikeTransport` off/on. It retains XML plus service IDs, operating dates, stop references, scheduled times and raw attributes. Permission stays `unassessed`; empty responses and request errors are distinguished. Keys stay in a local environment variable, outside the static website and saved files.

From `prototype-v0/`, a reproducible dry run is:

```bash
python3 scripts/ojp_benchmark.py --origin 8503000 --destination 8507000 --departure 2026-09-22T08:00:00+02:00 --output evaluation-output/dry-run --dry-run
python3 -m unittest discover -s scripts -p 'test_*.py'
```

For live evaluation, configure `OJP_API_KEY` locally, use a future departure and a new output directory, and omit `--dry-run`. Origins/destinations accept a stop reference or the exact `latitude,longitude` selected in the app. Never place the key in a frontend `VITE_` variable or commit captures containing personal addresses.

## Fixed evaluation cases

| Journey | Departure cases | Evidence needed |
|---|---|---|
| Buchholzstrasse 33, Zürich → Zürich HB | Weekday 08:00 and 01:54, on explicitly recorded dates | Exact selected coordinates; local bus departures; routed cycling; all bicycle attributes |
| Küsnacht → Zürich HB | Same dated daytime/night pair | User's exact Küsnacht origin is still unspecified; record it before claiming reproduction |
| Libingen → EPFL | Existing recorded daytime/night cases, plus a future rerun | Rapperswil–Renens coverage and catchable routed access |
| Zürich HB → Laax GR, posta | Weekday daytime | Train/bus scope, reservations and bus segment attributes |

For each case capture current-app winners in both groups, all provider returns, time-to-first-result, request failures, access duration, boarding count and unresolved permissions. OJP requests currently use provider-default access, so their raw journey times are **not** equivalent to our bicycle-routing times. Recalculate directed cycling access, boarding readiness and egress before comparing feasible arrivals.

Before adopting OJP: validate the requests live, confirm the meaning/coverage of bicycle attributes against official departure details, preserve unknowns, handle restrictions at individual stops, and verify later confirmed alternatives are not lost to provider result limits. A static-site migration also needs a server-side credential boundary. These are remaining work, not implemented capabilities.
