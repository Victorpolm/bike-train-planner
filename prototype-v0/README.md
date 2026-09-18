# Bike + public transport prototype

A Swiss journey-planning experiment comparing cycling and scheduled public transport.

## Use the app

1. Type into **From** and **To**, then choose a suggested address, town or public-transport stop. Arrow keys and Enter also select suggestions; typing without selecting remains supported.
2. Choose **Baseline** (cycle before/after transit) or **Extended** (also allow at most one intermediate cycling leg).
3. Optionally open **Preferences** to choose Less / Balanced / More cycling and an extra endpoint category. No numeric parameters are required.
4. Search. A **Cycling only · estimate** card appears first as soon as the places resolve. Transit results follow with **Fastest**, **Fewest boardings**, and **Least cycling or walking**. An optional fourth minimizes cycling plus walking at the start or arrival. One route can win several categories. The first vehicle counts as a boarding.
5. Click a card to select its map route. Transit cards also open every bike, train/bus/tram, walking and waiting leg. Numbered map pins mark boarding/alighting stops and show available services, times and platforms; those numbers also appear in the travel plan.
6. Use **Explored stops** to show/hide candidate and observed timetable stops, and **Fit all stops** to see the whole observed area. These include buses/trams and intermediate stops, not only endpoint railway stations.

The cycling-only comparison uses the same departure instant and a straight-line estimate at 15 km/h. It does not follow roads or include hills/barriers. It remains visible if transit requests fail or are stopped, is explicitly marked when above the selected cycling budget, and does not compete for transit-category winners. Its purple dashed line remains a faint reference behind a selected transit route; selecting its card shows that estimate on its own.

Switching to Extended after a Baseline search keeps the same departure time and limits, expands the timetable data, then compares both models on that same graph. Once both results are available, switching is immediate. Address or budget edits invalidate the old results. Stopping an active search keeps proposals already found visible. After stopping, press Find journeys for a fresh search; an incomplete Extended phase is not silently presented as complete.

Proposals appear after the first usable response, while a small number of alternatives are checked. Easy station journeys skip address and nearby-stop lookups. A live check returned Zürich–Bern proposals in 15.2 seconds and Zürich–Laax in 12.0 seconds; upstream latency varies. Extended exploration can continue for a minute or more, but it no longer hides existing results. The displayed departure time is the time captured when the search began; results do not continuously refresh.

## Run locally

Verified with **Node.js 24**. No API keys or backend are required.

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

Tests use deterministic synthetic timetables and one small recorded Zürich–Laax fixture; they do not make network requests. `npm test` includes the routing model, category selection, timetable normalization, API adapter behavior and journey decomposition.

## Model defaults

- Cycling: straight-line estimate at 15 km/h, rounded up to minutes.
- Balanced preference: up to 60 minutes cycling at each end; additional stop discovery is a fallback in bounded 20-minute bands.
- Intermediate cycling: up to 20 minutes; total cycling: up to 90 minutes.
- Maximum four public-transport boardings and eight hours overall.
- Three minutes before every boarding, including after an intermediate ride.
- Alternatives arrive within 60 minutes of the fastest result by default.
- Every transit category requires at least one public-transport ride. The cycling-only reference is separate. Ordinary transit changes are possible in both models.
- Active time is cycling plus timed walking, excluding waiting. Walking before the first boarding and after the last alighting contributes to the corresponding endpoint preference. Existing cycling budgets remain cycling budgets; there is no separate walking cap yet beyond the overall horizon.

## Implementation

`src/places.ts` and `src/PlaceInput.tsx` implement debounced, cancellable address/stop suggestions, with known Swiss hubs available immediately. `src/preferences.ts` maps three cycling preferences to valid budgets; `src/http.ts` handles portable cancellation and response-body deadlines. `src/model.ts` implements the time-dependent graph, state-compatible Pareto labels, constraints and category selection. `src/api.ts` acquires a finite timetable graph; `src/timetable.ts` normalizes sections and pass-list exits. `src/mapData.ts` deduplicates explored stops and collects ordered boarding/alighting events. React presents the comparison, model control, preferences, category cards and full plans; Leaflet draws schematic leg geometry and interactive stop markers.

The authoritative repository documentation is [the mathematical model](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/MATHEMATICAL_MODEL.md), [project state](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/PROJECT_STATE.md) and [experiment log](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/EXPERIMENTS.md).

## Data and limits

- GeoAdmin address search and Transport API place/stop lookup run independently for suggestions. Selecting a result preserves its coordinates and stop ID, avoiding repeated geocoding.
- The community [Swiss Transport API](https://transport.opendata.ch/docs.html) for stops, scheduled connections and departure boards. Both models admit buses, trams and other returned public transport.
- Existing Swiss rail-hub seed list and OpenStreetMap map tiles.

This is a sampled experiment, not a complete national routing engine. Up to four candidate stops per endpoint, three initial endpoint-pair queries with four connections each, and limited Extended discovery can miss good routes. If the initial connections are valid but infeasible, bounded outward stop discovery permits up to three further pair queries. Requests have 20-second timeouts, a 90-second budget per acquisition phase and an 18-request overall cap. API failures and request/label caps produce an incomplete-search notice. A result of no journey found is not proof that no journey exists.

Cycling distances do not follow roads, and map lines are not navigation instructions. Station-level buffers do not validate platform access. The experiment assumes a bicycle is available after transit; carriage permissions, capacity and reservations are deliberately deferred. No operator permission or route-safety claim is made.

## Cycling preferences

| Preference | Total cycling | Each endpoint | Intermediate leg (Extended) |
|---|---:|---:|---:|
| Less | 40 min | 20 min | 10 min |
| Balanced (default) | 90 min | 60 min | 20 min |
| More | 150 min | 90 min | 30 min |

These are uncalibrated experiment presets. All other mathematical constraints remain shared between the two models. Suggestions are debounced by 350 ms, stale requests are cancelled, and successful combined lookup results are kept only in a bounded in-memory cache. Remote lookup failures do not fabricate places or timetable results.
