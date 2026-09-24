# Separate bicycle-permission searches and OJP evaluation

_Updated 24 September 2026; supersedes the earlier explicit-note-only confirmation rule._

## Current all-mode selector

The user chooses one nested scope: **verified bicycle access only**, **also allow unverified access**, or **also include services that prohibit bicycles**. It applies to every transit leg, including boats and trams, before feasibility, dominance and ranking. Only the selected scope's category winners are displayed. Baseline, Extended and ordered visits preserve that selection when evidence changes. Internal independent solves remain to prevent a permissive winner from pruning a stricter alternative. This supersedes the earlier three-groups-at-once interface and bus-only selector.

## Evidence and prerequisites

| Evidence | Treatment |
|---|---|
| Exact dated OJP bicycle-filter match or applicable positive service note | Verified access, subject to stated conditions |
| search.ch dated `VN` bicycle symbol | Prohibited; excluded unless the all-transit choice is selected |
| search.ch `VR` / `VB` bicycle symbols | Allowed with required bike reservation / space condition respectively |
| Reviewed domestic SBB InterRegio or SOB mainline rule, matching operator and service type | Published-rule confirmation, identified separately from dated provider confirmation; explicit bans override it |
| Reviewed ordinary VBZ/VBG/VZO/Stadtbus Winterthur or tpg bus/tram rule | Verified access with conditions; identified as published-rule evidence. Replacement services do not inherit it |
| Other general operator guidance or missing evidence | Unverified; never promoted by operator familiarity alone |
| Conflicting bicycle reservation conditions | Unknown requirement requiring operator confirmation; no default overrides the conflict |
| Available bicycle spaces, occupancy or booking availability | Deferred; never queried |

Ticket and reservation requirements are separate. **Allowed means verified permission even when a prerequisite is unknown.** Cards show actual journey permission, not the selected search filter. A partially verified journey names the unknown services. General PostBus guidance still needs dated permission because its published policy excludes some routes. Reviewed PostBus/SBB/SOB ticket guidance has source and review date. Ordinary passenger-seat or group-reservation notes do not establish bicycle reservation requirements. SOB's named mainline services cannot reserve bicycle spaces; domestic SBB IR has no ordinary bike reservation requirement. A dated mandatory-reservation note takes precedence. The narrow SBB IR rule requires Swiss stop IDs and does not extrapolate to S-Bahn/RE peak periods, international categories or replacement buses. Permission remains conditional on operating rules and space.

Public [search.ch route data](https://search.ch/timetable/api/help) is now used for keyless connections with `show_attributes=1` and `show_coordinates=1`. The current responses expose these fields and permit browser CORS. Transport API still supplies nearby stops/departure boards. Its connection schema drops the underlying bicycle attributes; treating those dropped fields as evidence that all information is unavailable caused many avoidable unknowns. OJP remains preferred when configured. The Site's empty OJP runtime environment does not prevent the new public-feed details.

Exact dated evidence still matches service, operator, departure and boarding/alighting IDs. Timed exit prefixes receive their own segment identity; untimed passage points never become exits. General disruption notices are not interpreted as bans on unrelated trains. Original bike notes remain available; operator guidance is expanded as readable text.

## Discovery and ranking

The same road, boarding and 24-hour constraints apply to the selected scope. Two bounded additional queries probe useful rail exits at the original ready time: an end-to-end Laax timetable can omit a late train to Chur when onward buses run only later. Cycle finishes from these exits are checked promptly. Other unchecked exits are prioritized using arrival/boarding lower bounds; only actual routed cycling durations enter feasibility and ranking. Directed route reuse by station identity prevents a small coordinate change from discarding a checked road link.

The timetable cap remains 18 physical requests, with cooldown/retry limits and short-lived caching. This is sampled discovery, not a complete Swiss graph or a guarantee of global optimality. Categories retain the selected scope's 60-minute alternative window. Cycling only remains a separate comparison.

## OJP findings and evaluation status

**Verified from official documentation:** [OJP 2.0 TripRequest](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/) accepts a `BikeTransport` filter and returns service attributes. The documentation warns of a limitation around services restricted at particular stops. A successful filter result now counts as provider-assessed permission for its exact returned segment, subject to explicit prohibitions. This is a documented change from the earlier stricter rule. The response attributes must be interpreted with their service/segment scope. OJP supports one via point directly; our multiple-stop feature needs separate handling.

The [official SDK](https://github.com/openTdataCH/ojp-js) identifies the OJP 2.0 endpoint. [API access](https://opentransportdata.swiss/en/cookbook/development-miscellaneous-cookbook/howto-access-apis/) requires a key sent in an authorization header. The repository Actions secret `OJP_API_KEY` has now been validated: **all 16 live benchmark requests succeeded on 21 September 2026**. OJP returned useful reservation/conditional-carriage notes, but incomplete positive evidence across complete journeys. See [the recorded findings](OJP_BENCHMARK_2026-09-21.md). No routing-engine migration is implemented. The server-only OJP backend is implemented; hosted activation needs the Site runtime secret. [New live findings](OJP_PERMISSION_2026-09-24.md).

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

All requests use scheduled times (`UseRealtimeData=none`) and provider-default access. Results therefore measure service discovery and returned evidence; they do not yet compare the app's routed bicycle access or establish that a particular bicycle connection is catchable. The evaluation scripts retain raw service/stop attributes without classification; the reviewed app adapter separately interprets dated filter matches and known codes.

## Fixed evaluation cases

| Journey | Departure cases | Evidence needed |
|---|---|---|
| Zürich local origin → Zürich HB | Weekday 08:00 and 01:54, on explicitly recorded dates | Record exact inputs privately; use a public stop for shared regressions; local departures and bicycle attributes |
| Küsnacht → Zürich HB | Same dated daytime/night pair | User's exact Küsnacht origin is still unspecified; record it before claiming reproduction |
| Libingen → EPFL | Existing recorded daytime/night cases, plus a future rerun | Rapperswil–Renens coverage and catchable routed access |
| Zürich HB → Laax GR, posta | Weekday daytime | Train/bus scope, reservations and bus segment attributes |

For each case capture current-app winners in all three groups, all provider returns, time-to-first-result, request failures, access duration, boarding count and unresolved permissions. OJP requests currently use provider-default access, so their raw journey times are **not** equivalent to our bicycle-routing times. Recalculate directed cycling access, boarding readiness and egress before comparing feasible arrivals.

The initial matrix and the three-mode TripInfo follow-up are complete. The app now retains exact service/stop scope, checks TripInfo on opened journeys and recomputes all comparisons after new evidence. Provider result limits still make discovery incomplete. OJP access walks are replaced by the app's road-routed cycling; confirmed evidence is never expanded to an unreturned boarding/alighting segment.

## Ticket and reservation prerequisites

Every transit leg displays permission, bike ticket/pass and bike-space reservation independently. Reviewed codes are `A__VN` (ban), `A__VR` (bike reservation required) and `A__VB` (limited bicycle carriage). The observed explicit no-reservation sentence is recognized; its dynamic `I_*` code alone has no meaning. Passenger/group reservation codes are not bicycle requirements. Unknown and conflicting notes stay explicit. Original provider text remains available.

SBB and recognized bus ticket guidance is sourced separately from dated permission. Operator links lead to their ticket/reservation services; the app makes no purchase or reservation and checks no remaining places.

## TripInfo follow-up and coverage

Nine live calls succeeded: paired TripRequests and one TripInfo each for train, bus and boat. Details must match JourneyRef, operating day, boarding/alighting stop references and times. Only calls inside the boarded interval are considered. Missing detail notes do not erase valid filter evidence. [Live results and remaining activation step](OJP_PERMISSION_2026-09-24.md) · [Network coverage](TRIPINFO_AND_NETWORK_COVERAGE.md).
