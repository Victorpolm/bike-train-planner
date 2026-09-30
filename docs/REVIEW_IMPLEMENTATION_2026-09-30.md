# Review implementation — 30 September 2026

## Scope and decisions

The owner approved the nine recommendations from the review of `Untitled-3.pdf`. This release implements the application/tooling changes and completes a bounded local MOTIS comparison. It does not migrate the routing engine.

| Approved change | Implementation |
|---|---|
| Display new detours automatically | A completed preview draws and frames its cycling links once. Pointer movement and panning do not retrigger the fit. The redundant **Show detour on map** button is removed. |
| Remove **Choose map centre** | Click/tap and marker dragging remain. A focused map supports arrow-key panning and Enter to open location choices at its centre. |
| Shared normalization | `normalization.ts` centralises Unicode/whitespace/case handling and exact reviewed operator aliases, including SOB's parenthetical names. Opaque stop/trip references remain untouched; no fuzzy permission promotion. |
| Safe permission cache | A WeakMap retains permission results only while every rule/evidence input matches its primitive snapshot. Date, point, source and conditions-array mutations invalidate it, as does replacing evidence. Scope/bus-preference filtering remains independent. |
| Stronger verification | Automatic GitHub push/PR CI runs formatting, Knip, 300 offline tests and the TypeScript/frontend/Worker build. New parameter sweeps use mixed train/bus services, non-station endpoints and parsed cycling durations. |
| Conservative dead-code cleanup | Delete the unreferenced `BusCarriageDetails.tsx` and `mergePlaces`; narrow 31 unused value exports and six type exports. Active rule/fare implementations remain. Knip covers frontend, Worker, scripts and tests. |
| Timetable separation | Move `TimetableClient`, request cooldown/cache and Swiss time formatting to `timetableClient.ts`; share unchanged limits through `searchLimits.ts`. Existing adapter tests exercise the extracted implementation. |
| Readable React source | Pinned Prettier formats React TSX in a separate formatting commit; `format:check` guards it. |
| Bounded engine comparison | Reproducible local MOTIS 2.11.3 fixture demonstrates correct strict filtering and a concrete middle-scope integration gap. No public routing service, national import or app migration. |

**Retained/rejected changes:** keep `STATION_BUFFER_MINUTES`, BLS/RhB/regional bicycle rules and fallback fare tables. Do not adopt an identity-only stale cache, replace journey IDs with counters, lower the search label cap, claim a 27× website speedup or migrate directly to MOTIS. Unknown bicycle access remains unknown. Passenger fares and active tariff values are not changed.

## Verification

- **300 application tests in 11 suites pass**, up from 290; TypeScript, frontend and Worker builds pass.
- Cache tests compare cached/uncached results across operator/category/evidence combinations and exercise in-place evidence/source/conditions/date/geography changes.
- Routing sweeps check **84 individual monotonic comparisons**, plus Baseline inclusion, cycling pace and re-solving after new prohibitions. Unreachable cases remain infinity; truncated searches fail the check; averages cannot hide individual regressions.
- Knip reports no unused files, exports or dependencies under its configuration. Prettier checks React TSX only.
- Browser interaction/visual QA remains unavailable in this environment. No new live Swiss timetable, fare, facility or cycling-provider check is claimed. Existing chunk-size build warnings remain; code splitting is separate work.

The permission snapshot must be extended whenever a new permission rule begins reading another input. The equivalence tests and mutation regressions help detect omissions; this is still a maintenance requirement.

## Local performance observation

[Machine-readable measurement](experiments/review-permission-benchmark-2026-09-30.json). Node 24.19.0; seven samples; 280 synthetic mixed-mode legs; ten permission passes per sample:

| Measurement | Median |
|---|---:|
| Uncached permission passes | 5.59 ms |
| Cached permission passes | 1.41 ms |
| Cold permission-cache Baseline + Extended comparison | 1.90 ms |
| Warm permission-cache Baseline + Extended comparison | 0.71 ms |

These are local diagnostic observations, not a CI threshold or a complete online-search benchmark. The cold/warm comparison also includes JIT and other warm-up effects; it cannot isolate the cache's end-to-end benefit. Provider acquisition and real-world latency are not measured. Reproduce with `node scripts/benchmark-permissions.mjs` from `prototype-v0`.

## MOTIS pilot result

[Machine-readable result](experiments/motis-permission-pilot-2026-09-30.json). A tiny synthetic GTFS contains three services departing together: allowed train arriving 08:40, unknown-permission bus 08:30, prohibited bus 08:20, on 1 October in Europe/Zurich. The same fixture is passed to the current solver and a local MOTIS **v2.11.3** instance. MOTIS uses `default_bikes_allowed: false`, three stops, a two-day import and no street network.

| Requested behaviour | Current solver | MOTIS observation |
|---|---|---|
| Confirmed bicycle access | Allowed train, 08:40 | `requireBikeTransport=true`: same train |
| Include unknown, exclude prohibited | Unknown bus, 08:30 | No equivalent result from simply filtering the unrestricted response |
| Include prohibited for comparison | Prohibited bus, 08:20 | `requireBikeTransport=false`: same bus; only this itinerary returned despite requesting ten |
| Visit transit stop B | Existing ordered-stop regressions remain | A local `via=fixture_B` query returns the train through B |

Removing the prohibited bus from the unrestricted answer leaves **zero itineraries**: the useful unknown-permission bus was already pruned. This demonstrates why permission constraints must affect routing before pruning. It does not establish that MOTIS cannot be adapted. A future adapter must preserve original three-state evidence and investigate per-scope preprocessing/query constraints or engine changes; changing unknown evidence to “allowed” would mislabel the result.

The pinned [MOTIS API specification](https://github.com/motis-project/motis/blob/v2.11.3/openapi.yaml) accepts at most **two transit-stop via IDs**, whereas this app supports four arbitrary coordinate/place stops. Intermediate cycling, coordinate waypoints, all category winners, Swiss coverage, fares and national performance were **not tested** by this small fixture. They remain acceptance gates before a migration decision. The [Transitous policy](https://transitous.org/api/) asks developers to make contact before routing/isochrone use; this pilot queries only localhost and makes no such service requests.

Reproduce after downloading the official [v2.11.3 release](https://github.com/motis-project/motis/releases/tag/v2.11.3):

```bash
cd prototype-v0
python scripts/motis-pilot.py --motis /absolute/path/to/motis
```

The harness requires Node 24/Python 3, pins the binary version, bounds import/request times, removes its temporary GTFS/index and stops its server. The binary and downloaded datasets are not repository content.

## Next acceptance check

On the published app, select a journey, preview a water/food detour and confirm it is framed automatically; move the pointer away, pan the map and change visit time while checking that the details remain readable and the selected transit stays fixed. Check keyboard location selection with Tab, arrow keys and Enter. Then continue the existing rural-water precision and entrance/access priorities. Engine evaluation stays separate.

## Confirmed publication

Owner-private **version 42** succeeded on **30 September 2026 at 21:58:44 UTC**, environment revision **3**. Site source `c5ed6f1a3cdf392c727ad64492a6e43368eae4e6` matches all **182 current application files** in GitHub implementation `a97c872af7b55543221781fde4bca30d2ccaa923`. Historical Site documentation snapshots are excluded. [Automatic CI](https://github.com/Victorpolm/bike-train-planner/actions/runs/36782578264) completed successfully. Functional changes are commit `8033785761aec2f0e88b3c1e3e41466ef5b48407`; React formatting is the separate following commit `a97c872af7b55543221781fde4bca30d2ccaa923`. Access remains owner-only; browser interaction QA is still outstanding.
