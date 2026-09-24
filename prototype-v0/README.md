# Bike + public transport prototype

A Swiss journey-planning experiment comparing cycling and scheduled public transport.

## Use the app

[**Open private website**](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site) and sign in with the owning ChatGPT account. See [website access and development](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/WEBSITE.md) for Git/local setup and publication details.

1. Type into **From** and **To**, then choose a suggestion, or click/tap the map and choose **Start here** / **Finish here**. Drag A/B to adjust the exact location. Arrow keys and Enter select text suggestions; **Choose map centre** also supports choosing a point after panning with the keyboard.
2. Leave **Departure** on **Leave now**, or choose a date and time in Switzerland. Choose **Baseline** (cycle before/after transit) or **Extended** (also allow at most one intermediate cycling leg).
3. Optionally open **Preferences** to choose Less / Balanced / More / **Above 150 minutes cycling** and an extra endpoint category. The new option allows longer rides with no separate cycling cap within the 24-hour journey window; shorter rides remain eligible. No numeric parameters are required.
4. Search. A **Cycling only · routed** card occupies the first position when its road route is ready. Its calculation runs independently from station access and timetable discovery. Transit results follow with **Fastest with transit**, **Fewest boardings**, and **Least cycling or walking**, within the selected bicycle-access scope. An optional fourth minimizes cycling plus walking at the start or arrival. One route can win several categories. The first vehicle counts as a boarding.
5. Click a card to select its map route. Transit cards also open every bike, train/bus/tram, walking and waiting leg. Numbered map pins mark boarding/alighting stops and show available services, times and platforms; those numbers also appear in the travel plan.
6. Use **Explored stops** to show/hide candidate and observed timetable stops, and **Fit all stops** to see the whole observed area. These include buses/trams and intermediate stops, not only endpoint railway stations.

**Public transport with my bicycle** applies to trains, buses, trams, boats and other returned modes. Choose verified access only, also allow unverified access (default), or also include services that prohibit bicycles. This is a routing feasibility constraint, applied before pruning and ranking. Only the selected scope's category winners are shown; prohibited legs stay prominently labelled. The public search.ch timetable supplies dated bicycle notes without a key. Reviewed domestic SBB InterRegio and SOB mainline rules fill narrowly applicable permission/prerequisite fields with separate source links; dated prohibitions override them. Reviewed ordinary ZVV-operator/tpg bus and tram rules also verify access; replacement services do not inherit them. Cards show actual permission, and unknown ticket/reservation details do not downgrade it. Other missing evidence remains unknown. Tickets and bike-space reservations are separate. OJP and scoped TripInfo add another source when the server key is configured. No remaining-space or booking transaction is queried. See [permission rules](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/BICYCLE_PERMISSION_AND_OJP.md).

Each transit card compares its total time and cycling-or-walking with the routed bicycle-only journey and shows waiting/boarding time. Cycling is marked fastest and selected by default if it is quickest in this search and within the selected cycling allowance. Transit recommendations remain available in all three comparison scopes even when cycling is faster.

Use **Add intermediate stop** in the form or map popup for up to **four requested stops**. Search or drag their V1–V4 markers, reorder with the arrows, or remove them. **Reverse route** reverses both endpoints and the stop order. Journeys visit the stops in the displayed order; no stopover duration is added yet. Cycling, boardings and total elapsed-time limits apply to the whole journey, including every stage. With requested stops, Baseline permits cycling at each stage's ends; Extended allows one additional automatic cycling transfer across the whole trip. Editing locations clears old results. Stop an active search before editing.

Clicked coordinates are usable immediately. A nearby place name replaces the coordinate label when available, without moving the marker or treating it as a selected station. If naming is unavailable, the coordinate label remains. Map naming has a six-second deadline and obsolete requests are cancelled when a marker is moved again.

The cycling-only comparison follows mapped roads and paths through every requested stop, using BRouter's touring road selection and the rider's selected pace. Preferences offers Relaxed, Regular, Strong and Electric presets, editable flat speed (8–35 km/h), and a slope-speed table. Riding power and electric climbing support determine per-slope time; short marked walking connectors are added separately. The same routed durations determine station readiness, onward train catchability and cycling budgets. Unavailable paths are excluded; there is no straight-line substitute. A successful comparison stays visible after timetable failure or cancellation, is marked when above the cycling budget and stays outside transit-category ranking. Its purple line remains a faint reference behind a selected transit route.

Switching to Extended after a Baseline search keeps the same departure time and limits, expands the timetable data, then compares both models on that same graph. Once both results are available, switching is immediate. Address, departure or budget edits invalidate the old results. Stopping an active search keeps proposals already found visible. After stopping, press Find journeys for a fresh search; an incomplete Extended phase is not silently presented as complete.

Two bounded rail-exit queries at the original ready time can reveal earlier trains hidden by long onward waits. Their cycling finishes are checked promptly. Directed cycling routes survive small station-coordinate differences between providers, and later unchecked exits are considered using actual routed durations. This improves discovery without claiming a global optimum.

The arrival window is **24 hours from your chosen departure**, including waiting. Late-evening searches can therefore show next-morning services. Cards mark next-day arrivals; the full plan retains overnight waiting. A chosen date/time always means Europe/Zurich, even on a device in another timezone.

For searches with requested stops, up to two station pairs per adjacent stage are queried from reached waypoint times. Each distinct scope arrival can request onward services; the stages and scopes share the same 18-request/time budget. Switching to Extended reuses that stage graph without additional departure-board discovery; results are still a bounded sample. The cycling-only reference follows all requested stops.

For **Libingen → EPFL**, choose the real departure time and try **More cycling**, or **Above 150 minutes cycling** for longer station access and total riding. Every candidate, including Rapperswil, must now pass the actual routed time and overall journey limits. The old 78-minute Rapperswil access figure in historical experiments was geometric and is not a current riding estimate. Sampling can still omit a station, and a queried route need not win a displayed category.

Proposals appear as soon as the necessary road links and a usable timetable response are available, while alternatives continue loading. A live Renens–EPFL check on 20 September returned a 2.597 km cycling comparison with 8 minutes including connectors and its first transit proposals after 34.2 seconds; upstream latency varies. Extended exploration can take longer. The displayed departure is captured when the search starts or taken from the chosen Swiss date/time; results do not continuously refresh.

## Run locally

Verified with **Node.js 24**. Basic timetable/cycling searches work without a key. For the additional OJP bicycle-filter and TripInfo source, copy `.env.example` to `.env` and set `OJP_API_KEY` locally. Never use a `VITE_` variable. Vite runs the server-only proxy during development; production uses the Worker in `dist/server/index.js`.

The hosted Site requires its own secret `OJP_API_KEY`. The validated GitHub Actions secret is separate and cannot be read back through GitHub. Without the Site secret, public search.ch connections still provide dated bicycle notes. Missing evidence remains unknown unless a reviewed operator/service rule applies. `npm run preview` serves frontend assets only; use `npm run dev` for local OJP checks.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To validate and preview the production build:

```bash
npm test
npm run build
npm run preview
```

Tests use deterministic synthetic timetables and recorded Zürich–Laax, Libingen–EPFL and Renens–EPFL road fixtures; they do not make network requests. `npm test` includes ordered stopovers and shared budgets, map naming/failure handling, the routing model, category selection, timetable normalization, API adapter behavior and journey decomposition.

## Model defaults

- Cycling: BRouter touring road selection; configurable flat pace and per-slope power timing, with a 45 km/h downhill cap and whole-leg rounding after walking access. Missing elevation uses flat speed and is explicitly flagged. See [the model and assumptions](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/CYCLING_ROUTES.md).
- Balanced preference: up to 60 minutes cycling at each end; additional stop discovery is a fallback in bounded 20-minute bands.
- Intermediate cycling: up to 20 minutes; total cycling: up to 90 minutes.
- Maximum four public-transport boardings and 24 hours overall, including overnight waiting.
- Three minutes before every boarding, including after an intermediate ride.
- Alternatives arrive within 60 minutes of the fastest transit result in their own permission group.
- Every transit category requires at least one public-transport ride. The cycling-only reference is separate. Ordinary transit changes are possible in both models.
- Active time is cycling plus timed walking, excluding waiting. Walking before the first boarding and after the last alighting contributes to the corresponding endpoint preference. Existing cycling budgets remain cycling budgets; there is no separate walking cap yet beyond the overall horizon.

## Implementation

`src/places.ts` and `src/PlaceInput.tsx` implement debounced, cancellable address/stop suggestions, with known Swiss hubs available immediately. `src/preferences.ts` maps four cycling preferences to valid budgets; `src/http.ts` handles portable cancellation and response-body deadlines. `src/model.ts` implements the time-dependent graph, state-compatible Pareto labels, constraints and category selection. `src/api.ts` acquires a finite timetable graph; `src/timetable.ts` normalizes sections and pass-list exits. `src/mapData.ts` deduplicates explored stops and collects ordered boarding/alighting events. React presents the comparison, model control, preferences, category cards and full plans; Leaflet draws road-following cycling, schematic transit/walking and interactive stop markers. `src/cycling.ts` parses geometry and road/elevation attributes; `src/cyclingClient.ts` controls cycling requests; `src/CyclingDetails.tsx` links the elevation profile to the map.

The authoritative repository documentation is [the mathematical model](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/MATHEMATICAL_MODEL.md), [project state](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/PROJECT_STATE.md) and [experiment log](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/EXPERIMENTS.md).

The [app roadmap](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/APP_ROADMAP.md) tracks remaining carriage guidance, repair/parking, commuting/bikepacking/expert modes and community work. [Cycling routes and data limits](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/CYCLING_ROUTES.md) documents the implemented provider, calculations and known gaps.

## Data and limits

- GeoAdmin address search and Transport API place/stop lookup run independently for suggestions. Selecting a result preserves its coordinates and stop ID, avoiding repeated geocoding.
- OJP paired unfiltered/bicycle-filtered connections when the server secret is configured, with on-demand TripInfo checks. Both physical calls count against the existing 18-request acquisition budget.
- Public [search.ch](https://search.ch/timetable/api/help) connections include bicycle prohibition/reservation/limited-space symbols for dated legs. No API key is needed. All modes are requested; 429/backoff, caching and the shared 18-call cap remain in force.
- The community [Swiss Transport API](https://transport.opendata.ch/docs.html) supplies stop discovery and departure boards. The legacy connection adapter remains available for recorded regression fixtures.
- Existing Swiss rail-hub seed list and OpenStreetMap map tiles.
- [BRouter](https://brouter.de/) for directed cycling geometry, riding time, OSM-derived road tags and SRTM elevation. Temporary outages can use the [FOSSGIS OSRM bicycle service](https://routing.openstreetmap.de/about.html); its geometry and time are checked, and unavailable elevation/surface details remain unknown. Both public services are prototype dependencies without an availability guarantee.

This is a sampled experiment, not a complete national routing engine. Up to four candidate stops per endpoint, four initial endpoint-pair queries with four connections each, and limited Extended discovery can miss good routes. A first pair with verified routed access is queried before completing candidate road checks; remaining slots reserve local bus/tram and railway coverage. Nearby local stops are checked even beside seeded rail hubs. Observed exits are checked for fewest boardings and earliest potential arrival as well as proximity, so a rail exit cannot be hidden by several closer bus stops. If the initial connections are infeasible or slower than the completed cycling reference, bounded outward discovery permits up to four further pair queries. Requests have 20-second timeouts, 90 seconds of timetable work per acquisition phase (cycling time does not consume it) and an 18-request overall cap. Temporary network/server errors receive bounded recovery. Retry-After is respected; persistent rate limits suspend requests rather than hammering the provider. Successful fallback-timetable replies are reused for 30 seconds. API failures and request/label caps produce an incomplete-search notice. A result of no journey found is not proof that no journey exists.

Cycling follows the returned road network; transit/walking lines remain schematic. Points are automatically connected to a routable path within 250 m at each end, preserving the selected pins. These dotted endpoint gaps add walking time at 4 km/h to station readiness and journey budgets; their physical access is unverified. Station-level buffers do not validate platform access. Permission uses dated service evidence and narrowly reviewed operator rules across transit modes. Applicable published permission counts as verified; unknown ticket or reservation details remain separate. Live capacity and reservation availability are not queried. No objective route-safety claim is made.

## Cycling preferences

| Preference | Total cycling | Each endpoint | Intermediate leg (Extended) |
|---|---:|---:|---:|
| Less | 40 min | 20 min | 10 min |
| Balanced (default) | 90 min | 60 min | 20 min |
| More | 150 min | 90 min | 30 min |
| Above 150 minutes cycling | Within 24 h overall | Within 24 h overall | Within 24 h overall |

**Above 150 minutes cycling** removes the separate total, station-access, final-leg and intermediate-cycling limits. Internally each is bounded by 1,440 minutes; the same 24-hour whole-journey window also includes public transport, walking and waiting, so cycling does not get an extra 24 hours. Requested stops share this overall budget. Shorter journeys remain eligible. Extended still allows only one automatic cycling transfer. The option broadens eligibility but cannot guarantee a journey: road connectivity, timetable availability and the bounded candidate/request search still apply.

These are uncalibrated experiment presets. All other mathematical constraints remain shared between the two models. Suggestions are debounced by 350 ms, stale requests are cancelled, and successful combined lookup results are kept only in a bounded in-memory cache. Remote lookup failures do not fabricate places or timetable results.

## Inspect a cycling route

Select a result and open **Your cycling route**. Choose a cycling leg to see routed distance, estimated riding time, ascent/descent, steep sections and climbing in its final two kilometres. Hover the profile or cycling line to highlight the corresponding point; use the labelled slider on touch or keyboard. Orange marks steep climbs, blue steep descents.

Surface and infrastructure breakdowns include unknown portions. Separated tracks, painted lanes and shared roads/paths are distinguished from an objective safety assessment. Posted road speeds are approximate **bands** because BRouter groups raw OSM limits; they are never measured traffic speeds. Missing elevation stays missing, and cumulative ascent/descent remain unknown when the profile is incomplete.

Cycling requests have a 25-second timeout, a 150-second budget for cycling work per phase and a 32-request main cap, including retries and fallback calls. Time spent waiting on timetables does not consume that budget. The separate comparison covers up to five stages, with bounded recovery. Successes use a 100-entry, 30-minute memory cache. Failure/cancellation preserves valid results and reports incomplete checks. The backup bicycle service is serialized across both streams at no more than one request per second; ferry, train and pushing-bike sections are rejected. A valid cycling-only result remains usable even when all station-access checks fail. Exact posted speed values, richer access data and rider-specific profiles remain follow-up work.

## Understand search notes

A failed candidate cycling link does not invalidate another result that uses successfully calculated paths. **Journey options found · see search notes** explains this when proposals are available. With no proposals, notes open automatically. Cycling warnings name both endpoints; failures of the independent cycling-only comparison are labelled separately.

The routing service uses HTTP 400 for several causes, including timeouts. The app reads a bounded diagnostic to distinguish timeout, unmatched point, no usable connection and unknown service failure. It no longer assumes every 400 response proves that no connected path exists. Raw provider messages are kept only in the in-memory failed-link diagnostics and are not rendered in the page. Report the exact start/finish and named failed link when a problem persists.

## TripInfo and network coverage

The TripInfo script and manual workflow inspect one dated service; they do not configure a website backend or query remaining bicycle spaces. See [TripInfo and Swiss network coverage](../docs/TRIPINFO_AND_NETWORK_COVERAGE.md). No complete national GTFS or OSM graph has been imported; the map contains observed stops and requested routes. See [publication status](../docs/WEBSITE.md) before assuming this source revision is live.

## OJP implementation and verification

`src/ojp.ts` parses dated service/segment evidence and preserves original notes. `src/ojpClient.ts` adds exact returned segments to the graph. `src/bicycleCarriage.ts` interprets reviewed bicycle codes, while `src/BicycleCarriageDetails.tsx` presents permission, tickets and reservations separately for all modes. `server/ojpHandler.ts` keeps credentials in runtime configuration, bounds input/output, paces upstream calls and returns generic errors. Source changes never contain the token.

120 app tests and 13 Python tests pass. Nine live train/bus/boat calls succeeded on 24 September 2026 using the repository secret; public-stop regression responses are in `src/fixtures/ojp-2026-09-24/`. Browser visual verification was unavailable because the managed preview service was absent. This is scheduled data and a sampled graph, not a guarantee of carriage or complete Swiss coverage.
