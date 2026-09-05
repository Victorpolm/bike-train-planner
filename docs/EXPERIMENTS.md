# Experiments and golden journeys

Use this file to track both product experiments and technical routing tests.

## Experiment template

### YYYY-MM-DD — Name

**Hypothesis:**

**Method:**

**Data / users:**

**Result:**

**Interpretation:**

**Decision / next step:**

## Golden journeys

Maintain a small set of representative real journeys that every routing iteration can be compared against.

### Journey A — Simple bike + train

Purpose: verify basic access → transit → egress works.

Record:
- origin/destination
- expected sensible route(s)
- current route output
- failure modes

### Journey B — Multiple plausible departure stations

Purpose: test station selection rather than nearest-station bias.

### Journey C — Fast vs comfortable cycling

Purpose: test whether route alternatives expose a meaningful time/comfort trade-off.

### Journey D — Bicycle reservation issue

Purpose: verify rule subsystem changes route feasibility or ranking correctly.

### Journey E — No feasible route in initial catchment

Purpose: test adaptive/transit-aware station search.

### Journey F — Difficult transfer

Purpose: expose cases where a pedestrian transfer is acceptable but moving a bicycle is materially harder.

## Data audit experiment

For each golden journey, inspect OSM and timetable data manually and classify problems as:

- product-breaking
- significant but recoverable
- cosmetic/minor

Record missing or inconsistent:

- cycleways
- access restrictions
- surfaces
- barriers/stairs
- station entrances
- carriage permissions
- reservations
- transfer information

## OTP baseline experiment

Before building custom multimodal routing:

1. Load Swiss OSM + GTFS into OpenTripPlanner.
2. Run every golden journey.
3. Save returned itineraries and relevant attributes.
4. Compare against cyclist-selected routes.
5. Identify precisely what OTP gets wrong.

Only then decide which custom routing logic is justified.

## Comfort model experiment

Compare candidate routes under several cost profiles:

- fastest
- balanced
- comfort-biased

Ask real cyclists which route they would take and why. Use this to calibrate whether the cost factors map to actual preferences.

## Product experiment priority

Prefer experiments that answer decision-changing questions over implementation milestones that produce no new information.

## 2026-09-05 — Journey decomposition regression cases

**Method:** Synthetic Transport API section fixtures in `prototype-v0/src/routing.test.ts`, following the provider schema at https://transport.opendata.ch/docs.html. These are deterministic display/data regressions, not recorded live services.

**Cases:** A train's service identifier, direction, stops, scheduled times and platforms; repeated line labels across two rides; bike → wait → two trains with connection time → bike across midnight; a walking transfer; absent/malformed section details; no sections at all; Unix timestamps and numeric platform values.

**Result:** All 11 tests passed, including the original four helper tests. TypeScript compilation and production build passed. Browser interaction was not tested in this session.

**User-reported regression to reproduce:** Zürich → Laax returned no proposal. Exact origin/destination geocoding, departure time and API responses were not captured. The initial hosted app and GitHub main used the same fixed-catchment implementation. Keep this as a pending real golden journey for the mathematical-model discussion; do not mark it fixed by the decomposition change.


## 2026-09-05 — Planned experiment: one intermediate cycling leg

**Status:** Comparison agreed by the user; protocol below is proposed; not implemented or run.

**Hypothesis:** Allowing one intermediate cycling leg can recover journeys or improve the frontier enough to justify its extra search cost.

### Models

Let `m(P)` count positive-duration intermediate cycling blocks, each between two public-transport rides. A block may contain many road edges; it is not counted once per edge. Initial and final cycling do not contribute to `m(P)`. Ordinary station transfers remain available in both models.

- A: `P0 = {P in Pcommon : m(P) = 0}`.
- B: `P1 = {P in Pcommon : m(P) <= 1}`.
- B includes A. Requiring exactly one intermediate leg would invalidate that comparison.
- A transit portion may contain multiple vehicle rides and ordinary transfers; A is not restricted to one train.

### Common controls — proposed protocol

Hold origin, destination, departure time, timetable snapshot, cycling network, speeds, station buffers, allowed transit modes and candidate domain identical. Include or exclude buses identically in both variants so bus inclusion is not a confounder.

Use the same absolute planning horizon `H`, total cycling budget `Bmax`, any per-cycling-leg limits, and maximum boardings `Kmax` (at least two to permit the proposed intermediate transfer). Do not independently tighten each model's horizon relative to its own fastest result.

Require at least one transit boarding for the mixed-journey comparison. Pure cycling can be recorded separately as a reference.

The preceding mathematical discussion provisionally idealizes the bicycle as available after each transit ride and postpones carriage restrictions. This is a modeling assumption, not evidence of real-world bicycle permission. Physical carriage and reservation feasibility must be validated later.

### Quantities to retain and compare

- `T(P)`: total elapsed time, including waiting and station transfers.
- `B(P)`: total cycling across initial, intermediate and final legs.
- `k(P)`: actual transit boardings; for these mixed journeys, changes are `k(P)-1`.
- Initial, intermediate and final cycling durations separately, plus the full leg sequence.
- Non-dominated objective vectors `(T,B,k)` under componentwise minimization.
- Number of cases made feasible by B; fastest-arrival improvement when both models are feasible; new non-dominated trade-offs and their cycling/boarding costs.
- For a subsequent computational experiment: runtime, labels explored/retained and peak memory under the same solver settings.

**Mathematical check:** `P0 subseteq P1`. Consequently `min(P1,T) <= min(P0,T)`, with an empty minimum interpreted as infinity. B must preserve every feasible A journey as a candidate. The two Pareto frontiers need not be nested: B may dominate and replace A's frontier points.

### Cases and outstanding choices

First specify a small deterministic timetable and cycling graph with an exact answer: a case where intermediate cycling provides no improvement, one where it improves the journey, and one where it exceeds the shared cycling or time budget. Then select representative real journeys and departure times.

Keep the user-reported Zurich–Laax failure as a candidate real case, with exact endpoints, geocoding and timetable responses still to capture. Do not assume an intermediate cycling leg fixes it; the endpoint catchment may be the relevant limitation.

**Open:** numerical budgets, exact cases and dates, criterion for a materially useful improvement, and which existing engine/method to use. Inspect existing-engine support before custom implementation.

**Result:** Not run. No feasibility, speedup or route-quality claim yet.


## 2026-09-05 — Implemented comparison and regression results

**Status:** The later user request authorized implementation and the app changes. This supersedes the earlier “planned / not run” status above for the deterministic model experiment. The complete mathematical definition and defaults are now in [MATHEMATICAL_MODEL.md](MATHEMATICAL_MODEL.md).

**Method:** A pure multi-label solver on finite synthetic timed graphs, an independent exhaustive path enumerator, mocked API responses for data/control behavior, and one small timetable response retrieved from the live Transport API. No browser interaction or visual QA was performed.

### Deterministic outcomes

| Case | Baseline | Extended | Verified implication |
|---|---|---|---|
| Useful cycling transfer | 80 min, 0 cycling, 2 boardings | 50 min, 10 cycling, 2 boardings | 30-minute gain at a cycling cost |
| Earlier direct service added | 25 min | 25 min | No intermediate benefit; a bike leg is optional |
| Baseline onward rides removed | No journey | 50 min | Intermediate cycling can rescue feasibility |
| Total or intermediate cycling limit below 10 min | No intermediate route | No intermediate route | Shared cycling budgets are enforced |
| 49-minute horizon | No journey | No journey | Absolute horizon excludes the 50-minute route |
| 50-minute horizon | No journey | 50 min | Equality at a hard limit is accepted |
| Two separate intermediate legs required | No journey | No journey | Extended is bounded to one intermediate block |
| Later interchange arrival with fewer boardings | Useful label retained | Same state discipline | Earliest-arrival-only station pruning is invalid |
| Resource cap | Explicit truncation | Baseline candidates retained | No silent completeness claim |

The independent enumerator matches the solver's non-dominated `(time, cycling, boardings)` vectors for **54 combinations** of model, cycling budget, boarding limit and horizon. Further cases verify boarding exactly at bike arrival plus buffer, rejecting one second too early, adding access and egress into the cycling sum, and not accepting final arrival immediately after an intermediate ride without further transit.

Category tests select the 50-minute fastest route, the 80-minute least-cycling route and the 90-minute one-boarding/fewest-changes route in the toy network. Duplicate winners merge; zero extra-time allowance collapses to the fastest option. Pure cycling cannot win a mixed category. Optional endpoint preferences retain candidates that would be dominated under only the three main objectives.

### Recorded Zürich–Laax journey

**Source:** [Transport API connection request](https://transport.opendata.ch/v1/connections?from=Z%C3%BCrich%20HB&to=Laax%2C%20Posta&limit=1), retrieved 2026-09-05. Selected schedule fields are preserved in `prototype-v0/src/fixtures/zurich-laax-2026-09-05.json`.

**Exact endpoints:** Zürich HB (47.377847, 8.540502) → Laax GR, posta (46.806492, 9.258086). The deterministic test uses a 2026-09-05 13:30 Europe/Zurich departure, zero endpoint cycling limits and a four-hour horizon.

The recorded connection is:

- IC 3, service 000571: Zürich HB 13:38 → Chur 14:52.
- Walking transfer: Chur 14:52 → Chur, Postautostation 14:55.
- Bus 81, service 881061: Chur, Postautostation 14:58, platform N → Laax GR, posta 15:48.

**Result:** Both models find the 138-minute journey with two vehicle boardings in this recorded graph. It does not need an intermediate cycling transfer. The platform and service details survive normalization and the full decomposition. Untimed passage points are not treated as alighting stops, and pass-list exits do not add boardings.

**Interpretation:** Bus inclusion addresses a concrete limitation of the earlier rail-only adapter. This does not establish the exact cause of the user's original failed search, whose endpoints, date and API responses were not recorded.

### Live adapter checks and remaining uncertainty

Direct live requests returned a Zürich–Laax train-and-bus connection. GeoAdmin requests later timed out; the new timetable place/stop fallback successfully resolved Zürich HB and Laax GR, posta to the coordinates above. The fallback retains a resolved stop ID as a candidate if nearby-stop lookup fails.

A full live comparison encountered slow or timed-out nearby-stop and connection requests and reached a 240-second diagnostic timeout before completion. This exposed a usability issue in sequential discovery. The adapter was then bounded to at most two additional geographic probes per endpoint, prioritizes shorter endpoint cycling pairs, applies eight-second request timeouts and a 90-second budget to each Baseline/Extended acquisition phase. Exhausting a time budget gives an incomplete-search notice. These changes bound waiting; they do not make the upstream service reliable.

**Follow-up live result after adding the bounds:** A Zürich HB → Laax GR, posta search completed for a captured departure of **2026-09-05 13:35:55.670 Europe/Zurich**. It took about **194 seconds** including geocoding and both acquisition phases. Of 34 timetable requests, 16 failed or timed out; the interface correctly receives both incomplete-request and time-limit warnings. The observed graph contained 41 stops and 221 timed edges.

On that shared graph, Baseline retained 24 journey candidates and Extended 48 (including the Baseline union). Baseline explored/retained 34 labels; Extended explored/retained 80. Neither hit its label cap. Both produced the same two distinct category cards: fastest/fewest changes at about **159 minutes, 18 minutes cycling, two boardings**, and least cycling at about **162 minutes, zero cycling, two boardings**. Both use IC 3 and bus 81; no intermediate-cycling improvement is established by this case.

This verifies that the live adapter can produce proposals and the paired model/category flow runs end to end, **with partial upstream data**. It does not establish complete timetable coverage, the cause of the user's original failed search, practical bicycle feasibility, or a real-world quality/speed benefit from Extended. The final implementation also retains geocoded stop IDs against subsequent nearby-lookup failures. Search latency across representative journeys and peak memory remain unbenchmarked.

### Verification

**Result:** All **35 automated tests** pass on Node.js 24, including the original decomposition checks. TypeScript compilation and the Vite production build pass. Equivalent offline commands were used in this environment:

```bash
node --test src/*.test.ts
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
```

The repository's `npm test` and `npm run build` scripts invoke these same checks. Dependency versions and the existing lockfile are preserved; no new package is required.

**Next experiment:** Fix 3–6 Swiss endpoint/time pairs, compare the category trade-offs with actual traveler choices, and compare candidate coverage with OpenTripPlanner using complete schedule and street data. Introduce routed cycling before claiming practical transfer feasibility, then add bicycle-carriage constraints as a separate experiment.
