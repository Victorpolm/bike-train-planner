# TripInfo and Swiss network coverage

_Reviewed 21 September 2026. Documentation research and a tested evaluation tool; no live TripInfo result or production OJP integration is claimed._

## Current decision

**Decision:** Compare three independently optimized sets under the same cycling, boarding, departure and arrival limits:

| Comparison | Transit eligibility | Product meaning |
|---|---|---|
| Confirmed permission only | Positive applicable evidence on every boarded service/segment | Bicycle permission established; no space guarantee |
| Allow uncertain permission | Confirmed or unknown; exclude known prohibitions | Potential bicycle journey requiring verification |
| All public transport | Ignore bicycle permission; retain the explicit Avoid buses preference | Reference comparison; label any bicycle prohibition clearly |

These sets are nested, not three mutually exclusive permission labels. A confirmed journey may win all three searches. Merge identical journeys after optimization, retaining each comparison's categories and time allowance. The third comparison does not turn a prohibited bicycle journey into a recommendation to take the bicycle. It also does not mean that all Swiss services have been downloaded.

**Parked by user instruction:** Remaining bicycle spaces, occupancy, reservation availability and booking integration. Published reservation requirements can remain explanatory conditions; their availability is not queried.

## What TripInfo provides

**Fact from the Swiss documentation:** `OJPTripInfoRequest` uses a `JourneyRef` obtained from TripRequest or StopEventRequest and its `OperatingDayRef`. `IncludeService=true` and `IncludeCalls=true` request dated service details and stop calls. It returns the whole vehicle journey, which can extend beyond the traveller's boarded segment. Geographic track/projection parameters are optional. This is a lookup for one service, not a national network download. [Swiss TripInfo 2.0 documentation](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptripinforequest-2-0/).

**Fact from the OJP specification:** Service and call structures support attributes. Codes, text, dated service identity and stop scope must remain available for interpretation. The schema supporting a field does not establish that Switzerland supplies it for each departure. [OJP 2.0 schema documentation](https://vdvde.github.io/OJP/release/2.0/documentation-tables/ojp.html).

**Hypothesis to test:** TripInfo may add useful bicycle restrictions or conditions beyond the same service in a TripRequest. It may also return the same incomplete information. Neither successful lookup nor absence of a prohibition proves positive permission. Compare both responses for the exact dated service and boarded segment before changing evidence classification.

## Reproducible inspection

`prototype-v0/scripts/ojp_tripinfo.py` prepares or captures one request. It preserves service conditions and stop-call conditions separately, rejects mismatched dated services, and keeps permission `unassessed`. Empty/error deliveries are failures, not evidence that there are no restrictions. It does not request formation or interpret capacity.

From `prototype-v0/`, use the real references from a TripRequest capture:

```bash
python3 scripts/ojp_tripinfo.py \
  --journey-ref "$OJP_JOURNEY_REF" \
  --operating-day "$OJP_OPERATING_DAY" \
  --output evaluation-output/tripinfo-review --dry-run
```

For one live call, configure `OJP_API_KEY` in the environment, choose a new output directory and omit `--dry-run`. The manual **OJP TripInfo permission inspection** Actions workflow uses the existing repository secret and accepts those two references. It makes at most one call, with no retry; captures expire after seven days. It is not triggered by pushes or pull requests. Never put the token in the browser or a committed file.

**Verification status:** Five controlled TripInfo tests pass, alongside the eight existing benchmark tests. Request construction, stop/service scope, identity mismatch, empty delivery, credential redaction and offline dry run are covered. A real TripInfo call still needs to be run and its returned notes reviewed; this document is not a live benchmark.

## Do we have all Swiss public transport and cycle paths?

**Answer: no complete, verified local inventory is implemented.** Distinguish the available upstream data from the graph actually held by this app.

| Layer | Available source | What the app currently has |
|---|---|---|
| Scheduled land and boat transport | Swiss national GTFS, including boat/ferry categories | Sampled Transport API stops, connections and departure boards; no national GTFS import |
| Transit geography | Stop coordinates; provider route geometry where available | Observed stops and schematic transit lines, not a full Swiss line map |
| Cycling network | OpenStreetMap-derived BRouter routing data | Requested road routes and their returned attributes; no full local OSM graph or audited inventory of every cycle path |
| Bicycle carriage | Curated operator rules and incomplete OJP notes in evaluation | Uncertainty retained; no production service-level confirmation feed |

**Source coverage:** The Swiss platform describes its GTFS as the national scheduled public-transport timetable. Its mode table explicitly includes ship/boat, steam boat, ferry and catamaran (extended `route_type=1000`), alongside land modes. This makes it a candidate for a national scheduled graph, but our repository has not imported or audited that feed. A timetable graph and exact line geometry are separate data requirements. [Swiss GTFS documentation](https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/).

**Cycling coverage:** BRouter uses collaboratively maintained OpenStreetMap data and offers worldwide routing data. That does not prove every real cycle path or access restriction is mapped. The current cycling profile also disables ferries: a boat must be represented as an explicit transit leg, not hidden inside a cycling leg. [BRouter documentation](https://brouter.de/brouter/index.html); [implemented cycling profile](CYCLING_ROUTES.md).

**Next evidence:** Inspect dated train, local bus/tram and boat TripInfo results against their TripRequest legs. Separately, inventory national GTFS modes/operators/calendars and an appropriately dated OSM extract before claiming national coverage. These are distinct from remaining bicycle-space availability, which stays outside scope.
