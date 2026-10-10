# Performance steps 1–3 — 10 October 2026

The owner authorized the first three performance actions. This release measures the search, reuses unchanged result calculations and avoids expensive transfer checks for connections that already fail simple bounds. Browser Web Workers, new cloud computation and sports-route generation are not implemented in this pass. Existing cycling minimums and all feasibility/ranking rules remain.

## Behaviour

1. **Search timings:** a collapsed panel reports first calculated result, first calculated public-transport result, elapsed action time, stage calls/totals, reused refreshes and solver runs. Timed work covers places, service setup, stop discovery, timetable acquisition, transfer hydration, cycling/walking routes, HTTP response/body time, local queues, pacing/retry waits, reuse checks and solves. Stages overlap and cannot be added. HTTP time includes server/provider waits; there is no claim to isolate the provider's internal time. “Ready” is before browser painting. Find journey and Baseline-to-Extended actions report running, complete, limited, cancelled or failed; cancelled timings survive the route-update guard, and a new search clears the previous report. Later departures, navigation reroutes, fares and later live checks are not combined into this panel's main-search total. All measurements stay in page memory with no route trace, coordinates, URLs or telemetry upload.
2. **Reuse unchanged work:** each network keeps only its last result and a mutation-sensitive signature of graph/evidence, endpoints, start, complete options, waypoints, mode and alternative road-route maps. Nested values, realtime/platform/permission updates, dates, insertion order, object replacements, aliasing and geometry changes invalidate reuse. Unsupported shapes/accessors decline reuse. Published solution containers are copied so later-departure filters cannot alter the cache. Distinct permission graphs still receive independent searches before pruning. Provider requests, limits and publication callbacks are unchanged.
3. **Cheap checks first:** both ordinary and waypoint solvers prepare effective vehicle departure/arrival times once per synchronous solve. Already departed vehicles, arrivals beyond the time window and exhausted boarding allowances are rejected before station-transfer/access checks. Walking still follows its existing rescheduling semantics. Realtime estimates, inclusive boundaries, label order, dominance, objective selection and caps remain unchanged.

## Measurements

Complete pre-change Site source: `8cae50704eaedc42d4af6cdb1dee1b34c0724f8a` (version 67). The detached comparison checkout is immutable. The experiment uses the existing synthetic 24-station network hydrated through the actual bundled SBB platform-transfer rules. Node runs each condition sequentially, one warmup and three measured samples, without other CPU checks running concurrently. Full-result hashes, explored/retained labels and cap flags match before/after and across repeats.

| Condition | Before median | After median | Ratio | Label cap |
|---|---:|---:|---:|---|
| Baseline / at-most 30 min | 0.666 s | 0.254 s | 2.62× | No |
| Baseline / at-least 30 min | 1.633 s | 0.638 s | 2.56× | No |
| Extended / at-most 30 min | 1.282 s | 0.550 s | 2.33× | No |
| Extended / at-least 30 min | 8.623 s | 3.857 s | 2.24× | Yes |
| Unchanged Extended refresh / at-most 30 min | 2.701 s | 0.011 s | 244.81× | No |

The repeated-refresh case includes signature checking and result publication; it intentionally has exactly unchanged inputs and does not represent a complete acquisition. The at-least Extended case still reaches the same label allowance; it is not evidence of exhaustive routing. These figures measure CPU work, not live end-to-end speed, network latency, phone responsiveness or route quality. The new panel makes the next representative cold/warm live measurement possible.

Raw evidence: [timings](experiments/performance-pass-2026-10-10.json), [288 new comparisons](experiments/performance-pass-equivalence-2026-10-10.json), [576 existing stress comparisons](experiments/performance-pass-stress-2026-10-10.json).

## Verification

- 593 JavaScript tests in 11 suites, zero failures/skips/cancellations; 13 Python tests.
- 19 preference/timing React panels and callback checks, plus six facility panels. Includes no-report rendering, all timing statuses, collapsed details, missing milestones and overlap/painting disclosures.
- Actual asynchronous acquisition is compared with reuse enabled/disabled: complete results, every result publication and provider request count match while fewer solves run. In-place cancellation invalidates reuse. Published-array mutation cannot corrupt cached results.
- Timing tests cover overlapping spans, repeated/late closures, frozen cancellation, failure, deadlines, fetch/body work, queueing, pacing and late reports.
- Golden boundary: a service scheduled ten minutes before the start but estimated three minutes after it remains boardable at the exact three-minute allowance; estimated departure at minute two is rejected. Arrival exactly at the horizon remains accepted. Departed/out-of-window services cannot reach expensive access checks, in both solvers and modes.
- 288 differential cases include ordered waypoints, cycling minimums, deadlines, realtime delays/cancellations/platform changes, all permission scopes and missing/hydrated transfers. 204 are nonempty; 42 hit a cap.
- The established 576-case stress experiment adds midnight/DST, expired feeds, reservation uncertainty and objective/category equivalence. 574 are nonempty; 46 hit a cap. These comparisons are separate experiments, not inflated top-level unit-test counts.
- TypeScript, Vite frontend and server-Worker production builds, TSX formatting and unused-code checks pass. Vite retains the existing large frontend chunk warning.

No interactive browser or physical-phone pass was possible: the Sites workflow's browser-control capability is unavailable. Server rendering is not acceptance on an actual phone. No live provider burst/load test was performed.

Reproduce from `prototype-v0/` with Node 24 and the dependencies available in both complete checkouts:

```bash
npm test
python -m unittest discover -s scripts -p 'test_*.py'
node scripts/check-preferences-presentation.mjs
node scripts/check-facility-presentation.mjs
npm run format:check
npm run check:unused
npm run build
node scripts/stress-performance-pass.mjs /absolute/pre-change-app
node scripts/stress-solver.mjs /absolute/pre-change-app 96
node scripts/benchmark-performance-pass.mjs /absolute/pre-change-app 3
```

Run the benchmark alone. No wall-clock performance assertion is added to CI.

## Sports goal — design discussion only

The owner's goal is a pleasant continuous exercise section between a departure and arrival, with a target riding time and preference for paths away from motor traffic, forest and marked routes. A bounded candidate search is feasible to investigate: select a small set of nearby published cycling/mountain-bike corridors; join feasible entry/exit points to the endpoints or stations; sample a finite number of route sections close to the target duration; then rank continuous cycling, mapped road/forest exposure, climb/surface suitability and overall detour. A target with tolerance and a detour ceiling is more useful than rewarding unlimited extra cycling or repeated loops. Quiet paved cycleways can remain useful even when the user says “not on roads”. Dataset availability and routing/reuse rights must be checked before implementation.

The federal geoportal already displays SwitzerlandMobility's national, regional and local cycling routes, compiled with FEDRO and cantons, and a separate mountain-bike layer. These are marked route networks, not community popularity ratings; a highlighted hiking trail alone is insufficient evidence of cycling suitability. Begin a future prototype with a small curated route collection, then target-duration matching. Saved/shared rides and user feedback could follow before a broader social network. None of this removes At least or authorizes sports-route implementation now.

Primary sources checked 10 October 2026: [official cycling dataset](https://www.geo.admin.ch/en/dataset-22082024), [cycling and mountain-bike layers](https://www.geo.admin.ch/en/dataset-15062026), [browser Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). Step 5's Web Worker means a background thread in the user's browser, without purchasing remote computing; its main purpose would be responsiveness.

## Remaining work

Use the timing panel on a representative slow journey, cold and warm, then prioritize its largest stage. Browser-worker execution remains a proposed responsiveness improvement. Discover/scenic routes remain proposals; global per-key quotas and refreshing the transfer feed before **12 December 2026** remain required before wider access. Europe remains a separately scoped later expansion.

## Publication and synchronization

Owner-private **version 68** published successfully on **10 October 2026 at 21:06:33 UTC** (23:06:33 Europe/Zurich), environment revision **3**, from Site source `b133828038eba6bdce4b17ede3dc1ae61764b5d3`. The exact pushed source and matching frontend/server-Worker archive were deployed. **593 JavaScript tests in 11 suites**, **13 Python tests**, **25 rendered panels** and **864 previous-release comparisons** pass, together with TypeScript/frontend/Worker builds, formatting and unused-code analysis. Stage timings, guarded result reuse and early connection rejection are delivered. The controlled CPU benchmark is 2.2–2.6× faster per solve; live whole-search and phone timing remain unmeasured. Re.route, the existing URL, runtime bindings and owner-only audience are preserved.

Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_39321d1839308191be712e43e657b457`; deployment: `appgdep_6acaa8c3fcdc81919767fc85717de8f1` (`succeeded`). Access was rechecked: one owner, no groups or external visitors.

GitHub synchronization and implementation CI are the remaining release-record checks.
