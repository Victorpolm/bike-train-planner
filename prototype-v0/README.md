# Bike + public transport prototype

A Swiss journey-planning experiment comparing cycling and scheduled public transport.

## Use the app

1. Enter a departure point and destination. Station and bus-stop names also work.
2. Choose **Baseline** (cycle before/after transit) or **Extended** (also allow at most one intermediate cycling leg).
3. Optionally open **Cycling limits & preferences** to adjust the cycling budget, separate start/arrival limits, intermediate limit, boardings, journey duration and extra arrival allowance.
4. Search. Results select **Fastest**, **Least cycling**, and **Fewest changes**. An optional fourth category prefers a shorter ride at the start or arrival. One route can win several categories.
5. Click a card to see every bike, train/bus/tram, walking and waiting leg with available timetable details.

Switching to Extended after a Baseline search keeps the same departure time and limits, expands the timetable data, then compares both models on that same graph. Once both results are available, switching is immediate. Address or budget edits invalidate the old results. Cancel stops an active search.

The search may take a minute or more because several timetable requests are serialized. The displayed departure time is the time captured when the search began; results do not continuously refresh.

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
- Endpoint search: 20-minute bands, up to 60 minutes at each end.
- Intermediate cycling: up to 20 minutes; total cycling: up to 90 minutes.
- Maximum four public-transport boardings and eight hours overall.
- Three minutes before every boarding, including after an intermediate ride.
- Alternatives arrive within 60 minutes of the fastest result by default.
- Every category requires at least one public-transport ride. Ordinary transit changes are possible in both models.

## Implementation

`src/model.ts` implements the time-dependent graph, state-compatible Pareto labels, constraints and category selection. `src/api.ts` acquires a finite timetable graph; `src/timetable.ts` normalizes sections and pass-list exits. React presents the model control, preferences, category cards and full plans; Leaflet draws schematic leg geometry.

The authoritative repository documentation is [the mathematical model](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/MATHEMATICAL_MODEL.md), [project state](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/PROJECT_STATE.md) and [experiment log](https://github.com/Victorpolm/bike-train-planner/blob/main/docs/EXPERIMENTS.md).

## Data and limits

- GeoAdmin address search, with Transport API place/stop lookup fallback.
- The community [Swiss Transport API](https://transport.opendata.ch/docs.html) for stops, scheduled connections and departure boards. Both models admit buses, trams and other returned public transport.
- Existing Swiss rail-hub seed list and OpenStreetMap map tiles.

This is a sampled experiment, not a complete national routing engine. Up to six query stops per endpoint, six connections per pair and bounded intermediate discovery can miss good routes. API failures and request/label caps produce a **Partial search** notice. A result of no journey found is not proof that no journey exists.

Cycling distances do not follow roads, and map lines are not navigation instructions. Station-level buffers do not validate platform access. The experiment assumes a bicycle is available after transit; carriage permissions, capacity and reservations are deliberately deferred. No operator permission or route-safety claim is made.
