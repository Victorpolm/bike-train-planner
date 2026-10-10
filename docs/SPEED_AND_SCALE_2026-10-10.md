# Speed and scale review — 10 October 2026

The owner's attached *Bike + Train Planner — Speed and Scale* review was checked against the current Re.route source. Confirmed local performance and OJP queue findings are addressed. The supplied review's original 376-station, 35,432-edge Uster–Baden fixture was not supplied; its 18.685 s → 7.206 s measurement is not claimed as reproduced.

## Implemented changes

- Store each inserted label's resource vector on the label and compact surviving dominance buckets in place. Always recompute a derived label's vector, including labels created by spreading a parent. Queue order, dominance semantics, objectives, budgets and label caps are preserved.
- Cache bicycle-carriage evaluation by leg identity with value guards. The guard covers permission inputs, dated/operator/segment evidence, nested requirement changes and source/booking fields. In-place evidence mutations invalidate the cached result; missing evidence still means unknown.
- Cache Europe/Zurich operator-rule date parts and transfer service dates by UTC hour, in bounded 4,096-entry maps. Explicit OJP operating days retain precedence. Pre-epoch instants use exact timestamps to retain historical fractional-hour offsets.
- Avoid repeated JSON/ISO conversion in internal transfer-context keys using length-prefixed fields and numeric instants. Keep the station endpoint key's exact existing JSON wire representation, with an escaping fallback. Older open tabs remain compatible with the updated server.
- Admit at most four distinct outstanding OJP checks per Worker isolate, shared by connections and TripInfo. Identical requests coalesce, and fresh cache hits remain available when all slots are occupied. Excess work and cooldown return HTTP 429 with Retry-After; the client shows an actionable busy message alongside its existing uncertainty warning.
- Bound each admitted connections check to 30 seconds and each TripInfo check to 18 seconds, including queue/pacing time. These finish before the client's 35/20-second deadlines. Provider calls retain a 15-second timeout. Expired work returns 504 and cannot later issue a stale queued call. Cancellation propagates while waiting, pacing or reading streams. One cancelled subscriber does not cancel the other subscribers; when none remain, provider work is aborted. Key rotation discards old work/cache and rejects an old request body that finishes after the rotation.

The provider pace remains 1,500 ms between call starts. The fare queue was already bounded; no new fare behavior, hosting service or global infrastructure was introduced. The review's slower lazy-getter and transfer-pair-cache experiments were not adopted.

## Measurements

Measurements compare a complete pre-change version-63 checkout (`36ee02bb319083bd6ccde70d7855b0b102ea5e0c`) with the changed source, using Node 24. GitHub main at `fbcf0f9fa9db5e635e556fe11dcc42da3db37b3a` has the same pre-change routing implementation; its application differs from version 63 only in branding.

The committed fixture uses synthetic timetable/geometry and actual station/platform IDs from the bundled SBB transfer index. Hydration runs through the real StationTransferClient and server lookup handler in process. Timings measure `solve` only, after fixture creation/hydration. One warmup precedes measured runs; cases run sequentially without concurrent CPU benchmarks. Full sorted journey objects, category selection, explored/retained counts and the limited flag are hashed and compared across every run and both source trees.

| Stations / measured runs | Transfer data | Mode | Before median | After median | Speedup |
|---|---|---|---:|---:|---:|
| 32 / 5 | Unhydrated | Baseline | 0.103 s | 0.026 s | 3.91× |
| 32 / 5 | Unhydrated | Extended | 0.482 s | 0.064 s | 7.53× |
| 32 / 5 | Hydrated | Baseline | 2.653 s | 0.750 s | 3.54× |
| 32 / 5 | Hydrated | Extended | 8.932 s | 2.485 s | 3.59× |
| 24 / 3 | Unhydrated | Baseline | 0.091 s | 0.060 s | 1.52× |
| 24 / 3 | Unhydrated | Extended | 0.325 s | 0.037 s | 8.66× |
| 24 / 3 | Hydrated | Baseline | 2.006 s | 0.541 s | 3.71× |
| 24 / 3 | Hydrated | Extended | 5.848 s | 1.530 s | 3.82× |

All result hashes matched; no benchmark case hit its label cap. The 32-station hydrated Extended case returned 820 journeys and retained 10,682 labels. This does not establish end-to-end search, phone, network or production throughput, and is not the reviewer's larger fixture. No fragile wall-clock performance threshold was added to CI.

Raw results: [32 stations](experiments/speed-32-2026-10-10.json), [24 stations](experiments/speed-24-2026-10-10.json), [solver equivalence](experiments/solver-equivalence-2026-10-10.json).

## Verification

| Check | Result and coverage |
|---|---|
| Full JavaScript suite | 515 passed, 11 suites, zero failed/cancelled/skipped; 8.03 seconds in the final TAP run. Includes existing routing, objectives, fares, live updates, transfers, GPS and interface regressions. |
| Python suite | 13 passed using unittest discovery in scripts. |
| Differential solver stress | 576 complete-result comparisons over 96 seeds; 574 nonempty and 46 label-capped cases. Both modes, three permission scopes, arrival deadlines, boarding/cycling/time budgets, reservation uncertainty, hydrated/missing platforms, DST/midnight and expired transfer feeds. |
| Transfer-key compatibility | 3,993 combinations match the previous exact JSON wire key, including control characters, quotes, backslashes and Unicode/surrogate inputs; separate internal-key collision/mutation checks. |
| Carriage evaluation | 1,024 generated combinations checked twice against the uncached evaluator, plus nested source/requirement/evidence/date mutation regressions. |
| Date caches | 35,040 instants spanning the starts/ends of all hours in 2025–2026, checked against independent Intl results; midnight, both DST changes, eviction, season/peak windows, historic offsets and explicit operating-day precedence. |
| Mocked OJP load | Bursts of 1, 4, 8, 16, 32 and 64 distinct checks; at most four admitted, overflow explicit. 32 identical subscribers share one pair of provider requests. Provider serialization and pacing are verified. |
| OJP lifecycle | Queued/running deadlines, cancellation with surviving subscribers, total cancellation/retry, stalled response/input streams, cache hits under saturation, credential rotation, combined connections/TripInfo capacity and client warning handling. |
| Build/static checks | TypeScript, Vite frontend and Worker production builds, TSX Prettier check and Knip pass. Vite retains its existing large frontend chunk warning. |

The generated cases are assertions inside tests or separate differential experiments, not additional top-level test counts. All load experiments use stub providers; no burst traffic was sent to OJP.

After publication, a bounded service-access smoke check completed at **13:23:40 UTC**. The home page returned 200 with the Re.route title; both integration status endpoints returned 200/configured. One live Zürich HB → Bern connections request (departure 13:43:26 UTC) returned **six legs, zero warnings**, HTTP 200 in **8.789 s**. The selected service's TripInfo returned rule, checked timestamp and realtime fields, HTTP 200 in **4.875 s**. These single observed response times include network/runtime/provider work; they are not a before/after speed comparison, a full UI search, a fare quote or a production load test. [Sanitized observations](experiments/live-smoke-2026-10-10.json).

Reproduce from `prototype-v0/`, with Node 24 and dependencies installed in both the current app and a separate full pre-change app checkout:

```bash
npm test
python -m unittest discover -s scripts -p 'test_*.py'
npm run build
npm run format:check
npm run check:unused
node scripts/benchmark-speed.mjs /absolute/pre-change-app 32 5
node scripts/stress-solver.mjs /absolute/pre-change-app 96
```

Run the two experiments sequentially and keep the baseline immutable. They require no live provider key. The diagnostic scripts validate result equivalence and expose raw timings; they are not a national route-completeness proof.

## Quotas and remaining scale work

The official [limits and costs](https://opentransportdata.swiss/en/limits-and-costs/) page, checked 10 October 2026, lists OJP/OJPFare standard limits of **50 requests per minute per API key** and **20,000 per day per API key**. Standard allowance is free; the review's blanket description as paid providers and its proposed unknown default quota are not established. Account-specific exceptions were not inspected. At 1,500 ms, one isolate can start at most about 40 calls/minute during sustained demand, not 1.5% of a hypothetical 10/s allowance. Continuous traffic can still exceed the daily allowance.

The queue, pace, cache and cooldown remain **per isolate**. They do not enforce a global per-key quota across isolates, nor guarantee capacity for many simultaneous users. The existing private pilot can use the bounded behavior now. Before expanding its audience, agree the key's allowance, measure observed 429s and peak/daily demand, and design a globally coordinated quota/budget with deployment support. Do not merely increase pacing or deploy paid infrastructure without approval.

The existing in-memory responses already share work within one isolate. Cloudflare's [Cache API](https://developers.cloudflare.com/workers/reference/how-the-cache-works/) is local to a data center, not globally replicated. A correctly keyed short cache can reduce repeat requests, but cannot replace a global quota. Cache keys would need secret-free account/credential-version isolation and careful preservation of the existing retained fare evidence; this was not added speculatively.

Remaining acceptance: real-phone navigation and desktop/touch interaction; full cold/warm end-to-end timings on fixed live inputs; original large fixture if supplied; cross-isolate load before broader access. Existing incomplete-search notices and unknown-permission semantics remain. No browser visual pass is claimed because the required browser-control capability was unavailable.

## Publication and source

Owner-private **version 64** published successfully on **10 October 2026 at 13:21:58 UTC** (15:21:58 Europe/Zurich), environment revision **3**, from Site source `0d53a951686e563ad7c96957aa28fb90b6c19ee6`. The exact tested source was pushed before its matching frontend/Worker archive was deployed. Title **Re.route**, URL, runtime secret bindings and owner-only audience are preserved. The access check confirms one owner, no groups and no external visitors.

Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_56dcae37804c8191874a8ec3ada9ff54`. Deployment: `appgdep_6aca3be390148191a217d0dc38b1348e` (`succeeded`).

GitHub main was last verified at `fbcf0f9fa9db5e635e556fe11dcc42da3db37b3a`. The app and documentation changes, including the pending rename, are prepared for review; the earlier automatic approval rejection of the main ref update still requires the owner's explicit approval. No new GitHub branch or CI success for this revision is claimed.


**10 October synchronization follow-up:** The owner explicitly authorized finishing synchronization. GitHub main was fast-forwarded to `d1241db0937a9d81d5d2343521ba9324b80c544b` and [Test and build passed](https://github.com/Victorpolm/bike-train-planner/actions/runs/38059847074). This resolves the historical approval block above. The subsequent [facility release](FACILITY_STOPS_AND_CHOICES_2026-10-10.md) records the newer publication and source state.
