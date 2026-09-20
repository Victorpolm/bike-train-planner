# Routed cycling and road profiles

_Implemented 2026-09-20. Own-bicycle, Switzerland-first prototype._

## What changed

**Decision:** Use BRouter's existing cycling engine for the road layer while retaining the current experimental public-transport adapter and Baseline/Extended comparison. This is an incremental road-routing integration, not an OpenTripPlanner deployment or a claim of nationwide multimodal optimality.

**Fact:** Live journeys use directed road/path routes for station access, egress, automatic cycling transfers and requested intermediate visits. The cycling-only comparison uses those same ordered points. The exact route duration used by the solver is attached to the itinerary and its map geometry. Missing routes are excluded; there is no live straight-line fallback.

The interface shows routed distance, estimated riding time, ascent/descent, an elevation profile linked to the map, steep sections, climbing near the end of each cycling leg, surfaces, cycling infrastructure and available posted-speed groups. For a multimodal journey, choose a cycling leg to inspect; no fictitious elevation line connects separate rides through a train journey.

## Provider and profile

The browser requests `https://brouter.de/brouter` using the documented `lonlats`, `profile`, `format` and profile-override parameters. A live Renens–EPFL request returned HTTP 200 and `Access-Control-Allow-Origin: *`; no secret key or new backend is required. The API and response schema were checked against BRouter's [request handler](https://github.com/abrensch/brouter/blob/master/brouter-server/src/main/java/btools/server/request/ServerHandler.java) and [GeoJSON formatter](https://github.com/abrensch/brouter/blob/master/brouter-core/src/main/java/btools/router/FormatJson.java).

Current defaults:

- `trekking`: a touring/general-purpose bicycle, using the provider's moderate-effort model;
- profile `maxSpeed=25` km/h; route duration is never accepted below distance / 25 km/h;
- `allow_steps=0` and `allow_ferries=0`: avoid treating stairs or an unscheduled ferry as a cycling connection;
- `processUnusedTags=1`: retain available road attributes for analysis;
- one provider route per directed pair, not a fastest/comfort/low-climb alternatives search.

The public service is a prototype dependency, not a contracted service with a reliability guarantee. Requests reveal the selected coordinates to BRouter. No address history is persisted by this application. Before wider use, operate a suitable routing backend or agree appropriate hosted-service capacity; keep the adapter replaceable. Bike type, fitness, load, wind, weather and user-specific pace remain uncalibrated. The engine's [trekking profile](https://github.com/abrensch/brouter/blob/master/misc/profiles2/trekking.brf) documents its travel-time model and preferences.

## Train feasibility and budgets

For a cycling link, the provider's route time replaces `haversine distance / 15 km/h`. Readiness is previous arrival + routed link duration + the existing boarding buffer. The same durations enter cumulative cycling-leg limits, elapsed time and category ranking. Outbound and inbound routes are computed independently: one-way streets and slopes can make them different.

The current cycling-leg budget conservatively includes the small walking connectors described below. The UI's separate walking total still represents timed walking transfers supplied by the transit service; the cycling details identify connector time explicitly. The active-time objective counts all elapsed cycling-leg time plus timed walking, excluding waiting. These are estimates, not guarantees that a particular rider can catch a train.

Candidate discovery may use straight-line distance at the **25 km/h upper speed** to avoid requesting clearly distant links. That is only a coarse sampling boundary: a candidate becomes feasible only after a road route is available and passes the real time limits. Both models use the same checked road-link cache and observed timetable graph. The pure solver retains an explicit legacy geometric mode for historical/synthetic tests; the production planner always installs a road-link map and cannot silently enter that mode after a service failure.

The first verified station access and egress are enough to query a first timetable connection. Proposals already supported by checked paths are published immediately; additional candidate paths and observed-stop links are checked afterwards. A long cycling-only calculation has a separate serial stream, so it does not block short station access. If the cycling-only route fails, valid mixed journeys can still appear.

Requested stops keep their existing semantics: actual ordered visits, no added stopover duration, and shared cycling/boarding/horizon budgets. No-via Extended acquisition checks routed transfers before requesting onward services. Via Extended searches can check up to four nearby directed transfer pairs already present in the sampled timetable graph; this does not add complete departure-board or nationwide transfer discovery.

## Exact points and road snapping

The selected A/B/V coordinates are preserved. BRouter may start/end on the nearest routable way. If either gap exceeds **75 m**, reject that route and invite selection of a nearby road or entrance. Smaller gaps are shown as dotted **unverified walking access** and add time at 4 km/h before the whole cycling leg is rounded upward to minutes. Their distance is reported separately from routed cycling distance; they do not enter road-surface percentages or the elevation profile.

This does not verify the presence of a gate, a crossing or an accessible station entrance. Two selections with the same public-transport stop ID still have zero endpoint cycling under the station-level model; platform access remains unverified and the boarding buffer still applies.

## Attribute meanings and uncertainty

| Display | Calculation / source | Important limit |
|---|---|---|
| Distance | Provider's `track-length`, in metres | Excludes the separately reported endpoint gaps. |
| Estimated ride | Provider `total-time`, with the 25 km/h lower-duration bound | An estimated riding/pushing model, not a promised arrival; connector time is additional. |
| Elevation | Route geometry altitude; approximately 100 m sampling with short symmetric smoothing | Missing samples stay missing. Short ramps, bridges and tunnels may be inaccurate. |
| Ascent/descent | Sum positive/negative differences on the same smoothed profile | Both are unknown if the profile is incomplete; never mistake BRouter `plain-ascend` (net change) for cumulative ascent. |
| Steep sections | At least 6% uphill or −6% downhill on roughly 100 m samples; merge consecutive same-sign sections | Very short slopes may be missed. The map/profile use the same section positions. |
| Climb near the finish | Sum positive rises in the final 2 km of the selected cycling leg (or its whole length when shorter) | A descent does not cancel a preceding climb. Select the last cycling leg to inspect the final destination approach. |
| Surface | Mapped surface tags: paved, compacted, gravel, other unpaved, unknown | Road class does not imply a paved surface. Missing/unsupported tags stay unknown. |
| Infrastructure | Mapped separated cycleways/tracks, painted lanes, shared roads and shared paths | Side-specific tags follow travel direction in Swiss right-hand traffic. `cycleway=separate` does not mean the road currently travelled is protected. Unmapped lanes/protection can be missed. |
| Posted road speed | Available directional/general `maxspeed` groups | BRouter normalizes several raw OSM values into each group. Display a band, never an exact sign or measured traffic speed. Missing/unrecognized or supplied conditional limits are unknown. |

Road-message intervals are matched to the returned geometry in traversal order. Raw retained tags remain attached to sections. Breakdown percentages cover the routed length, including unknown portions; they are not percentages of only the known data. No objective safety score is assigned.

**Speed precision:** Exact posted signs cannot be recovered reliably from BRouter's grouped lookup values. A future raw-road-attribute source or a richer engine response is needed for exact numerical limits and fuller conditional restrictions. The current ranges are deliberate uncertainty, not measured traffic-speed ranges. This limitation follows the provider's [lookup table](https://github.com/abrensch/brouter/blob/master/misc/profiles2/lookups.dat).

## Interaction

Select cycling only or a mixed journey, then inspect **Your cycling route**. Choose the leg when there is more than one. Hover the elevation chart or the cycling line; the corresponding map marker/profile position updates. A labelled slider supports touch and keyboard use. Clicking a steep-section entry selects its location. Orange marks climbs and blue marks descents. Start/finish/intermediate markers remain draggable when a search is not running.

A pending or unavailable cycling-only route has its own state. An unavailable road route never becomes a straight connector presented as a real cycling trip. Existing valid proposals remain available after stopping a search.

## Bounded requests and freshness

- Main cycling client: at most 32 requests, serialized, at least 500 ms between starts, 25-second response/body deadline, 150-second phase budget. Extended can start a new phase without resetting the request cap or a rate-limit stop.
- Cycling-only comparison: a separate serialized stream with at most one request per requested stage (up to five). At most two cycling requests are in flight across the streams.
- Deduplicate concurrent same-pair requests in each client. Successful directional routes use a bounded 100-entry in-memory cache for 30 minutes; failures are not cached across searches. No persistent browser cache is added.
- Abort active/queued work when stopped. A late response cannot publish or cache a route after cancellation. HTTP 429 stops that client; warnings identify incomplete checks.
- Existing timetable request limits remain bounded. Coarse geographic sampling, finite candidate/pair counts and service windows can still omit useful journeys. Exhausting a road budget is not proof that no path exists.

## Verification and next work

See [EXPERIMENTS.md](EXPERIMENTS.md) for the live observation and regressions. The real Renens–EPFL response is retained with its source URL and attribution. Historical timetable tests explicitly opt into the old geometric experiment so their recorded assumptions remain reproducible; new tests exercise strict road links and the production acquisition path.

Next: validate rider pace and climbing estimates on real trips, obtain exact road-speed/conditional-access attributes, validate road and station access, and compare the multimodal engine against an OTP deployment. Bicycle carriage, repair/parking, full bikepacking presets and community features remain separate work in [APP_ROADMAP.md](APP_ROADMAP.md).

Attribution: routing by [BRouter](https://brouter.de/), map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under ODbL, and [CGIAR-CSI SRTM elevation](https://srtm.csi.cgiar.org/). The [BRouter web client credits](https://brouter.de/brouter-web/) identify these data sources.
