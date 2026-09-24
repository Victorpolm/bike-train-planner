# Routed cycling and road profiles

_Implemented 2026-09-20; rider profiles and timing updated 2026-09-24. Own-bicycle, Switzerland-first prototype._

## What changed

**Decision:** Use BRouter's existing cycling engine for the road layer while retaining the current experimental public-transport adapter and Baseline/Extended comparison. This is an incremental road-routing integration, not an OpenTripPlanner deployment or a claim of nationwide multimodal optimality.

**Fact:** Live journeys use directed road/path routes for station access, egress, automatic cycling transfers and requested intermediate visits. The cycling-only comparison uses those same ordered points. The exact route duration used by the solver is attached to the itinerary and its map geometry. Missing routes are excluded; there is no live straight-line fallback.

The interface shows routed distance, estimated riding time, ascent/descent, an elevation profile linked to the map, steep sections, climbing near the end of each cycling leg, surfaces, cycling infrastructure and available posted-speed groups. For a multimodal journey, choose a cycling leg to inspect; no fictitious elevation line connects separate rides through a train journey.

## Provider and profile

The browser requests `https://brouter.de/brouter` using the documented `lonlats`, `profile`, `format` and profile-override parameters. A live Renens–EPFL request returned HTTP 200 and `Access-Control-Allow-Origin: *`; no secret key or new backend is required. The API and response schema were checked against BRouter's [request handler](https://github.com/abrensch/brouter/blob/master/brouter-server/src/main/java/btools/server/request/ServerHandler.java) and [GeoJSON formatter](https://github.com/abrensch/brouter/blob/master/brouter-core/src/main/java/btools/router/FormatJson.java).

Current defaults:

- `trekking`: touring/general-purpose road selection; the app now estimates time for the chosen rider;
- profile `maxSpeed=45` km/h for configured rider profiles; geometric feasibility bounds use the same maximum;
- `allow_steps=0` and `allow_ferries=0`: avoid treating stairs or an unscheduled ferry as a cycling connection;
- `processUnusedTags=1`: retain available road attributes for analysis;
- one provider route per directed pair, not a fastest/comfort/low-climb alternatives search.

The public service is a prototype dependency, not a contracted service with a reliability guarantee. Requests reveal the selected coordinates to BRouter. No address history is persisted by this application. Before wider use, operate a suitable routing backend or agree appropriate hosted-service capacity; keep the adapter replaceable. Flat pace and electric climbing support are configurable; actual rider mass, load, wind, weather and fatigue remain uncalibrated. The engine's [trekking profile](https://github.com/abrensch/brouter/blob/master/misc/profiles2/trekking.brf) documents its travel-time model and preferences.

## Adjustable pace and elevation calculation

Preferences offers Relaxed (15 km/h), Regular (20), Strong (28), and Electric bike (23). Flat-ground speed is editable from 8 to 35 km/h in 0.5 km/h steps. Editing a preset shows Custom pace and retains its electric-assistance setting. The expandable slope table updates immediately. These are planning presets, not measurements of the user.

The app computes riding time locally from the road elevation profile. It does not multiply an entire ride by one fixed percentage. Following the constant-power resistance equation in BRouter's [StdPath implementation](https://github.com/abrensch/brouter/blob/master/brouter-core/src/main/java/btools/router/StdPath.java), calibrate power from the chosen flat speed:

`P_flat = (m × 9.81 × 0.01 + 0.225 × v_flat²) × v_flat`

For each approximately 100 m smoothed elevation interval, solve the positive speed in:

`P_flat + P_assist = (m × 9.81 × (0.01 + grade) + 0.225 × v²) × v`

Speeds in these equations are m/s; grade is vertical rise divided by horizontal distance (6% = 0.06). Mass is an assumed rider-plus-bike 90 kg, or 105 kg for Electric. Sum `distance / speed` across intervals, then add endpoint walking at 4 km/h and round the full link up to whole minutes. Descents are capped at 45 km/h. Stronger riders gain proportionally more on climbs because the chosen flat speed corresponds to substantially more power.

**Electric model assumption:** add climbing power up to 250 W, increasing linearly from zero on flat terrain to full assistance at 3% grade, with assistance fading linearly between 20 and 25 km/h. This is a heuristic for a typical assisted ride, not a calibrated motor specification. Flat pace remains exactly the chosen speed. Battery range, assistance settings, rider weight, wind, stops, surface-dependent resistance, posted limits and fatigue are not modelled by this timing calculation. Route selection still uses BRouter's touring preferences.

| Preset | Flat | Sustained 6% climb | Sustained 10% climb |
|---|---:|---:|---:|
| Relaxed | 15 km/h | 3.1 km/h | 2.0 km/h |
| Regular | 20 km/h | 5.1 km/h | 3.2 km/h |
| Strong | 28 km/h | 9.9 km/h | 6.4 km/h |
| Electric | 23 km/h | 17.4 km/h | 11.7 km/h |

These are model outputs, not validated riding measurements. Missing elevation intervals use flat speed and are explicitly flagged; OSRM fallback has no elevation adjustment. Cached timings include both flat pace and assistance, preventing reuse across different riders. Every station link, intermediate transfer, ordered visit and independent cycling-only comparison uses the selected pace. The optional low-level no-pace API retains legacy provider timing for historical fixtures; the app always supplies a pace.

### Backup for temporary service failures

Temporary BRouter timeouts, network errors and transient server responses can use the independent [FOSSGIS OSRM bicycle service](https://routing.openstreetmap.de/about.html). Calls use its `routed-bike` endpoint, preserve directed road geometry and use the selected flat pace where elevation is unavailable, and pass the same distance/speed/endpoint checks. Only replies with all steps explicitly in cycling mode are accepted: ferries, trains and pushing-bike sections are excluded. The backup does not provide elevation or surface/infrastructure tags; these remain unknown and the interface identifies OSRM. The primary touring model and the backup bicycle profile can yield different paths and time estimates.

The [provider usage policy](https://routing.openstreetmap.de/about.html) requires attribution, a fix-the-map link and at most one request per second. One browser-wide serialized queue covers both cycling streams. The browser supplies its normal user agent/referrer. No bulk downloading is performed. Requested coordinates are sent to this service when it is used; see its linked privacy policy. A conclusive no-route or off-network result does not trigger fallback. Wider or multi-user deployment still needs an appropriately provisioned road service.

## Train feasibility and budgets

For a cycling link, the selected rider's time along the actual road geometry replaces `haversine distance / 15 km/h`. Readiness is previous arrival + routed link duration + the existing boarding buffer. The same durations enter cumulative cycling-leg limits, elapsed time and category ranking. Outbound and inbound routes are computed independently: one-way streets and slopes can make them different.

The current cycling-leg budget conservatively includes the small walking connectors described below. The UI's separate walking total still represents timed walking transfers supplied by the transit service; the cycling details identify connector time explicitly. The active-time objective counts all elapsed cycling-leg time plus timed walking, excluding waiting. These are estimates, not guarantees that a particular rider can catch a train.

Candidate discovery may use straight-line distance at the **25 km/h upper speed** to avoid requesting clearly distant links. That is only a coarse sampling boundary: a candidate becomes feasible only after a road route is available and passes the real time limits. Both models use the same checked road-link cache and observed timetable graph. The pure solver retains an explicit legacy geometric mode for historical/synthetic tests; the production planner always installs a road-link map and cannot silently enter that mode after a service failure.

The first verified station access and egress are enough to query a first timetable connection. Proposals already supported by checked paths are published immediately; additional candidate paths and observed-stop links are checked afterwards. A long cycling-only calculation has a separate serial stream, so it does not block short station access. If the cycling-only route fails, valid mixed journeys can still appear. Conversely, a successful independent cycling-only route is returned even if the nearby station-access checks all fail. Observed exits now reserve checks for reachable fewest-boardings and earliest-arrival candidates; several nearby bus stops cannot consume every slot before a useful rail exit.

Requested stops keep their existing semantics: actual ordered visits, no added stopover duration, and shared cycling/boarding/horizon budgets. No-via Extended acquisition checks routed transfers before requesting onward services. Via Extended searches can check up to four nearby directed transfer pairs already present in the sampled timetable graph; this does not add complete departure-board or nationwide transfer discovery.

## Exact points and road snapping

The selected A/B/V coordinates are preserved. BRouter may start/end on the nearest routable way. Allow a gap of up to **250 m at each end**, using the same explicit `profile:waypointCatchingRange=250` in the provider request and the local response validator. This replaces the initial 75 m local cutoff, which rejected otherwise usable routes for building/stop centroids. Reject a larger gap and explain which location needs adjustment. Smaller gaps are shown as dotted **unverified walking access** and add time at 4 km/h before the whole cycling leg is rounded upward to minutes. Their distance is reported separately from routed cycling distance; they do not enter road-surface percentages or the elevation profile.

The 250 m margin follows BRouter's default waypoint-matching range, verified in its [RoutingContext implementation](https://github.com/abrensch/brouter/blob/master/brouter-core/src/main/java/btools/router/RoutingContext.java). The UI distinguishes provider/network failure, exhausted search budgets and unavailable/disconnected paths; a service failure does not ask the user to place their pin exactly on a road. Warnings name the affected points/stations, label cycling-only comparison failures separately and explain that other results retain their calculated cycling paths. HTTP 400 alone does not establish a missing path: BRouter also uses it for routing-engine errors such as timeout, as shown by its [server response handling](https://github.com/abrensch/brouter/blob/master/brouter-server/src/main/java/btools/server/RouteServer.java). The client retains at most 2,048 bytes of the provider error body in memory for classification; raw provider text is not rendered. Unknown errors remain service failures.

This does not verify the presence of a gate, a crossing or an accessible station entrance. Two selections with the same public-transport stop ID still have zero endpoint cycling under the station-level model; platform access remains unverified and the boarding buffer still applies.

## Attribute meanings and uncertainty

| Display | Calculation / source | Important limit |
|---|---|---|
| Distance | Provider's `track-length`, in metres | Excludes the separately reported endpoint gaps. |
| Estimated ride | Selected rider power integrated over the elevation profile, with a 45 km/h downhill cap | A planning estimate, not a promised arrival; connector walking is additional. Missing elevations use flat pace. |
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

- Main cycling client: at most 32 physical requests including recovery/fallback, serialized, normally at least 500 ms between primary starts, a 25-second response/body deadline and 150 seconds of cycling work per phase. Time waiting for timetable/geocoding data does not consume that budget. Extended can start a new phase without resetting the request count.
- Cycling-only comparison: a separate stream covering up to five ordered stages with bounded recovery. Backup calls share one queue at no more than one per second across both streams.
- Deduplicate concurrent same-pair requests in each client. Successful directed routes use a bounded 100-entry in-memory cache for 30 minutes. Conclusive failures stay unusable within the search; transient failures allow a bounded recheck and their stale warnings clear after recovery. No persistent browser cache is added.
- Abort active/queued work when stopped. A late response cannot publish or cache a route after cancellation. Transient errors receive one immediate primary retry when backup is disabled, or one backup attempt when available. Respect Retry-After; repeated rate limits suspend further provider calls. Never retry a conclusive no-route/off-network response.
- Timetable queries retain their 18-request cap and 20-second request timeout. Their 90-second phase budget charges timetable work rather than cycling waits. One transient retry counts toward the cap; long Retry-After periods are reported without blocking for minutes. Successful replies are reusable for 30 seconds.
- Coarse geographic sampling, finite candidate/pair counts and service windows can still omit useful journeys. Exhausting a road budget or either provider's outage is not proof that no path exists.

## Verification and next work

See [EXPERIMENTS.md](EXPERIMENTS.md) for the live observation and regressions. The real Renens–EPFL response is retained with its source URL and attribution. Historical timetable tests explicitly opt into the old geometric experiment so their recorded assumptions remain reproducible; new tests exercise strict road links and the production acquisition path.

Next: validate rider pace and climbing estimates on real trips, obtain exact road-speed/conditional-access attributes, validate road and station access, and compare the multimodal engine against an OTP deployment. Bicycle carriage, repair/parking, full bikepacking presets and community features remain separate work in [APP_ROADMAP.md](APP_ROADMAP.md).

Attribution: routing by [BRouter](https://brouter.de/) or [OSRM / FOSSGIS](https://routing.openstreetmap.de/about.html), [fix the map](https://www.openstreetmap.org/fixthemap), map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) under ODbL, and [CGIAR-CSI SRTM elevation](https://srtm.csi.cgiar.org/). The [BRouter web client credits](https://brouter.de/brouter-web/) identify these data sources.
