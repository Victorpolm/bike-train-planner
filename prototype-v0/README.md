# Bike + public transport prototype

**3 October update:** Click the ? icons beside bicycle access and cycling position for help. Extended now reserves work for cycling connections and can continue after Baseline uses its allowance. **More · later departures** keeps earlier cards while searching later services with the same preferences and checked cycling paths. OJP stop requests exclude route geometry so exact city itineraries retain their fare evidence; live ZVV and Libero checks succeeded. Past dates are accepted subject to timetable availability; online fares are future-only. [Implementation and evidence](https://github.com/Victorpolm/bike-train-planner/blob/feature/novice-interface-profiles/docs/SEARCH_RELIABILITY_2026-10-03.md).

A Swiss journey-planning experiment comparing cycling and scheduled public transport.

## Use the app

[**Open private website**](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site) and sign in with the owning ChatGPT account. See [website access and development](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/WEBSITE.md) for Git/local setup and publication details.

1. Type into **From** and **To**, then choose a suggestion, or click/tap the map and choose **Start here** / **Finish here**. Drag A/B to adjust the exact location. Arrow keys and Enter select text suggestions; the existing map-location controls also support keyboard selection.
2. Leave **Departure** on **Leave now**, or choose a date and time in Switzerland. Choose **Baseline** (cycle before/after transit) or **Extended** (allow up to two automatic cycling connections between services).
3. In **Preferences**, choose **Where would you like to cycle?**: at either end and between services, only at the beginning, or only at the end. A beginning/end-only choice disables intermediate cycling and switches to Baseline. Select a public-transport stop at the non-cycling end; general address-to-stop walking routes are not implemented. Existing timetable walking links remain usable, and the bicycle still accompanies you on transit. This is independent of the optional least-active-time ranking category.
4. Optionally open **Preferences** to choose Less / Balanced / More / **Above 150 minutes cycling** and an extra endpoint category. The new option allows longer rides with no separate cycling cap within the 24-hour journey window; shorter rides remain eligible. No numeric parameters are required.
5. Search. A **Cycling only · routed** card occupies the first position when its road route is ready. Its calculation runs independently from station access and timetable discovery. Transit results follow with **Fastest with transit**, **Fewest boardings**, and **Least cycling or walking**, within the selected bicycle-access scope. An optional fourth minimizes cycling plus walking at the start or arrival. One route can win several categories. The first vehicle counts as a boarding.
6. Click a card to select its map route. Transit cards also open every bike, train/bus/tram, walking and waiting leg. Numbered map pins mark boarding/alighting stops and show available services, times and platforms; those numbers also appear in the travel plan.
7. Use **Explored stops** to show/hide candidate and observed timetable stops, and **Fit all stops** to see the whole observed area. These include buses/trams and intermediate stops, not only endpoint railway stations.
8. Enable **Bike parking** to show official and OpenStreetMap facilities. Square P markers are red for mapped wheel-only equipment (including wall loops), green for preferred stands, bollards and handlebar holders, and grey for both other mapped types and unknown rack types. Explored stops use small hollow circles; the closest parking uses a larger outlined P. Click a parking marker for source, equipment and access details. With a journey selected, **Along selected journey** defaults on: only parking within the selected 100 m / 500 m / 1 km distance (100 m by default) of its cycling paths and known walking paths/endpoints, stops and requested locations is eligible. Uncheck it to explore all parking. **Find closest parking** ranks the eligible records from point A, independently of zoom; it does not use GPS.

Enable **Water** or **Toilets** independently on the map. Water uses a drop symbol and toilets a WC badge. They share the same optional **Along selected journey** corridor; each panel offers a closest-from-A button. Closest drinking water requires a positive mapped drinking-water tag and no explicit access restriction; unknown/non-drinking water stays visible with its own colour. Closest toilets exclude explicit restrictions, keys and known closures; missing access information remains unknown. Popups retain mapped fees, hours, seasonal/bottle-filling information and toilet accessibility. These are OSM records, not live opening, flow or water-quality checks. Both categories share one independently cached regional download and do not alter the journey or use GPS.

Enable **Repairs** or **Food** in the map toolbar for the new services. Repairs has separate filters for pumps, self-service stations, DIY workshops, repair workshops, bike shops and parts/tube machines. A shop is not assumed to repair bicycles; DIY and staffed-repair arrangements can overlap in OSM and remain explicitly uncertain. Food starts with bakeries, groceries/farm shops and mapped food/drink vending; cafés and restaurants/takeaway are optional. Each panel offers closest from A using its selected types. Known broken pumps and closed workshops cannot win the respective closest search. Ordinary customer access is permitted for commercial services; private/conditional access remains excluded.

All five categories share **Along selected journey** and its **100 m / 500 m / 1 km** distance control. Distances describe proximity to actual paths/known endpoints, not travel detours. Repair/food points are grouped into numbered markers below zoom 17; selecting a group zooms in. Closest calculations always use every eligible loaded record, independent of marker grouping/caps. The controls wrap above the map and the type checkboxes appear in each enabled panel.

Popups expose mapped services, tools/valves, workshop hours, machine contents, payment, address, website and phone where available. Unknown opening/access stays unknown; there is no live mechanic, stock or equipment check. Three independently cached fixed Swiss queries serve repairs, quick food and optional dining. Dining loads only when enabled, completed data is reused when filters change, and failure of one source does not block the others or journey searches. [Implementation and verification](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/REPAIRS_AND_FOOD_2026-09-29.md).

The parking filter follows the selected transit or cycling-only result, excluding unselected alternatives and parking beside rail/bus lines between boarding points. Missing walking paths and estimated connectors are searched only near known endpoints and explicitly disclosed. Colours describe equipment, not a theft guarantee or access permission. Distances are approximate straight-line proximity to mapped points/area centres; entrances are unverified; the separate detour action routes to the mapped location. The filter does not edit your journey or include a parking stop in its timetable.

**Facility details and cycling detours:** click a food, water, toilet, repair or parking marker to keep its details open while the map moves or redraws; long text scrolls inside the popup. With a calculated journey selected, choose **Preview cycling detour**. The nearest cycling section is preselected and can be changed. Only that section is routed through the facility; its endpoints, required intermediate stops and selected public-transport services stay fixed. Set **Time at the stop** (5 minutes initially), compare added distance/travel/visit time and inspect the dashed purple preview, which is framed automatically when ready. A three-minute boarding buffer and any intervening walking are included when checking the same onward connection. Cancelling or closing the preview leaves the original journey available. Journey cards and prices still describe the original route; applying/saving the stop is later work. Unknown/non-potable water and explicitly restricted/unavailable facilities cannot be suggested as stops. Entrance, indoor access, opening hours and original search-budget compliance are not verified by the preview. [Implementation and checks](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/FACILITY_DETOURS_2026-09-30.md).

**Public transport with my bicycle** applies to trains, buses, trams, boats and other returned modes. Choose verified access only, also allow unverified access (default), or also include services that prohibit bicycles. This is a routing feasibility constraint, applied before pruning and ranking. Only the selected scope's category winners are shown; prohibited legs stay prominently labelled. The public search.ch timetable supplies dated bicycle notes without a key. Reviewed domestic SBB InterRegio and SOB mainline rules fill narrowly applicable permission/prerequisite fields with separate source links; dated prohibitions override them. Reviewed ordinary ZVV-operator/tpg bus and tram rules also verify access; replacement services do not inherit them. Cards show actual permission, and unknown ticket/reservation details do not downgrade it. Other missing evidence remains unknown. Tickets and bike-space reservations are separate. OJP and scoped TripInfo add another source when the server key is configured. No remaining-space or booking transaction is queried. See [permission rules](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/BICYCLE_PERMISSION_AND_OJP.md).

Each transit card compares its total time and cycling-or-walking with the routed bicycle-only journey and shows waiting/boarding time. Cycling is marked fastest and selected by default if it is quickest in this search, within the selected cycling allowance and cycling is not restricted to one end. With beginning/end-only selected, its card is labelled as a reference outside that restriction. Transit recommendations remain available in all three comparison scopes even when cycling is faster.

Use **Add intermediate stop** in the form or map popup for up to **four requested stops**. Search or drag their V1–V4 markers, reorder with the arrows, or remove them. **Reverse route** reverses both endpoints and the stop order. Journeys visit the stops in the displayed order; no stopover duration is added yet. Cycling, boardings and total elapsed-time limits apply to the whole journey, including every stage. With requested stops, Baseline permits cycling at each stage's ends; Extended allows up to two additional automatic cycling transfers across the whole trip. Editing locations clears old results. Stop an active search before editing.

Clicked coordinates are usable immediately. A nearby place name replaces the coordinate label when available, without moving the marker or treating it as a selected station. If naming is unavailable, the coordinate label remains. Map naming has a six-second deadline and obsolete requests are cancelled when a marker is moved again.

The cycling-only comparison follows mapped roads and paths through every requested stop, using BRouter's touring road selection and the rider's selected pace. Preferences offers City (15 km/h), Relaxed (20), Regular (25, default), Sportive (30) and Electric (25 with climbing assistance) presets, editable flat speed (8–35 km/h), and a slope-speed table. Riding power and electric climbing support determine per-slope time; short marked walking connectors are added separately. The same routed durations determine station readiness, onward train catchability and cycling budgets. Unavailable paths are excluded; there is no straight-line substitute. A successful comparison stays visible after timetable failure or cancellation, is marked when above the cycling budget and stays outside transit-category ranking. Its purple line remains a faint reference behind a selected transit route.

Switching to Extended after a Baseline search keeps the same departure time and limits, expands the timetable data, then compares both models on that same graph. Once both results are available, switching is immediate. Address, departure or budget edits invalidate the old results. Stopping an active search keeps proposals already found visible. After stopping, press Find journeys for a fresh search; an incomplete Extended phase is not silently presented as complete.

Two bounded rail-exit queries at the original ready time can reveal earlier trains hidden by long onward waits. Their cycling finishes are checked promptly. Directed cycling routes survive small station-coordinate differences between providers, and later unchecked exits are considered using actual routed durations. This improves discovery without claiming a global optimum.

The arrival window is **24 hours from your chosen departure**, including waiting. Late-evening searches can therefore show next-morning services. Cards mark next-day arrivals; the full plan retains overnight waiting. A chosen date/time always means Europe/Zurich, even on a device in another timezone.

For searches with requested stops, up to two station pairs per adjacent stage are queried from reached waypoint times. Each distinct scope arrival can request onward services; the stages and scopes share the same 18-request/time budget. Switching to Extended reuses that stage graph without additional departure-board discovery; results are still a bounded sample. The cycling-only reference follows all requested stops.

For **Libingen → EPFL**, choose the real departure time and try **More cycling**, or **Above 150 minutes cycling** for longer station access and total riding. Every candidate, including Rapperswil, must now pass the actual routed time and overall journey limits. The old 78-minute Rapperswil access figure in historical experiments was geometric and is not a current riding estimate. Sampling can still omit a station, and a queried route need not win a displayed category.

Proposals appear as soon as the necessary road links and a usable timetable response are available, while alternatives continue loading. A live Renens–EPFL check on 20 September returned a 2.597 km cycling comparison with 8 minutes including connectors and its first transit proposals after 34.2 seconds; upstream latency varies. Extended exploration can take longer. The displayed departure is captured when the search starts or taken from the chosen Swiss date/time; results do not continuously refresh.

## Additional facility sources (30 September 2026)

Water now includes a small eight-location Graubünden Tourism / Flims Laax Falera pilot, using published POI coordinates and explicit drinking-water descriptions. Access, bottle filling, seasonal operation and current flow remain unknown unless separately evidenced. The optional **Show topographic fountains and springs** checkbox loads a compact prepared index of swissTLM3D February 2026 points in grey: drinkability is unknown, and these records never qualify for **closest drinking water**.

SBB public Trafimage/INSA data adds toilets and food at ten pilot stations: Zürich HB, Bern, Basel SBB, Lausanne, Genève, Luzern, Winterthur, St. Gallen, Olten and Lugano. Popups keep named floors, landmark directions, available hours, provider modification dates and official plan links. These ten stations are a bounded pilot, not a verified ranking of the ten busiest. Overlapping markers allow inspecting separate source/floor records. Proximity does not establish identity or an indoor route.

The sources use independent fixed allowlisted requests and per-feed failure/retry states; they need no keys. Rural/SBB feeds are cached independently. TLM uses a dated 84 kB derived point index so map loading never waits for the large national archive. No user route coordinates are sent to them. OSM remains the national base. SBB integration is limited to public factual service exports in the existing owner-private prototype; images, marketing descriptions and restricted API routes are excluded. Broader publication/reuse terms still need clarification before public distribution. [Implementation, source scope and roadmap audit](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/FACILITY_SOURCES_2026-09-30.md).

Run `node --use-env-proxy scripts/audit-facility-sources.mjs` with Node 24 for an optional live provider audit. It checks the 18 live rural/station feeds plus the prepared TLM endpoint, emits a compact JSON report and exits nonzero on a failed feed. `node --use-env-proxy scripts/refresh-tlm-water.mjs` explicitly rebuilds the small TLM index from bounded archive ranges; review the edition/schema before updating it. Normal `npm test` stays offline. The existing reviewed ETH entry is retained; this release adds no ETH-specific work.

## Run locally

Facility popups now retain mapped floors, building/place names, room/door references and indoor descriptions. Reviewed additions are maintained in `src/reviewedAmenities.ts`: ETH HG's Selecta machines have one approximate building marker labelled floor F, beside the Starbucks coffee machines, with the owner's report and unknown access/product details. Existing Zürich HB Hygienecenter records have floor/zone information and the official station-plan link. Source dates distinguish document review from an on-site check. A small local addition can still be shown when the OSM feed is unavailable; closest then uses only the available records. [Implementation and limits](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/FACILITY_LOCATIONS_2026-09-30.md).

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

`src/places.ts` and `src/PlaceInput.tsx` implement debounced, cancellable address/stop suggestions, with known Swiss hubs available immediately. `src/preferences.ts` maps four cycling preferences to valid budgets; `src/http.ts` handles portable cancellation and response-body deadlines. `src/model.ts` implements the time-dependent graph, state-compatible Pareto labels, constraints and category selection. `src/api.ts` orchestrates finite timetable acquisition; `src/timetableClient.ts` owns Transport API requests/cache/cooldown, and `src/searchLimits.ts` shares the acquisition limits; `src/timetable.ts` normalizes sections and pass-list exits. `src/mapData.ts` deduplicates explored stops and collects ordered boarding/alighting events. React presents the comparison, model control, preferences, category cards and full plans; Leaflet draws road-following cycling, schematic transit/walking and interactive stop markers. `src/cycling.ts` parses geometry and road/elevation attributes; `src/cyclingClient.ts` controls cycling requests; `src/CyclingDetails.tsx` links the elevation profile to the map.

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

**Above 150 minutes cycling** removes the separate total, station-access, final-leg and intermediate-cycling limits. Internally each is bounded by 1,440 minutes; the same 24-hour whole-journey window also includes public transport, walking and waiting, so cycling does not get an extra 24 hours. Requested stops share this overall budget. Shorter journeys remain eligible. Extended allows up to two automatic cycling transfers. The option broadens eligibility but cannot guarantee a journey: road connectivity, timetable availability and the bounded candidate/request search still apply.

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


## Review checks and optional local experiments

`npm run format:check` validates React TSX formatting; `npm run format` applies the pinned Prettier configuration. `npm run check:unused` checks frontend/Worker/scripts/tests with Knip. GitHub automatically runs these plus offline tests and the production build on application pushes and pull requests; live provider credentials are not required.

`node scripts/benchmark-permissions.mjs` measures a small synthetic local workload. `python scripts/motis-pilot.py --motis /absolute/path/to/motis` runs the optional pinned 2.11.3 engine comparison entirely on localhost. Neither is a full Swiss routing benchmark. See the [review report](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/REVIEW_IMPLEMENTATION_2026-09-30.md).

Map location selection supports click/tap or keyboard: focus the map, pan with arrow keys, and press Enter to open choices at its centre. A completed cycling detour is framed automatically; it does not repeatedly recenter while you pan.
