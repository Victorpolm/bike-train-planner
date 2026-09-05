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
