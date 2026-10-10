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


## 2026-09-05 — Repair missing proposals, reduce input and add autocomplete

**User report:** Even easy searches stop before displaying proposals; the parameter form is too complicated; typing should suggest addresses.

**Diagnosis:** Read-only Transport API probes returned after 12.7 seconds for Zürich–Bern and 13.9 seconds for a Zürich location query, exceeding the old eight-second timeout. The connection probe reached a JSON body but its diagnostic printer then attempted to slice a non-array `stations` field; this was a probe logging error, not an application parsing error. Successful live application calls below verify the repaired acquisition flow. Independently, code inspection found that the old app awaited all endpoint pairs and Extended discovery before setting result state, hid all cards during loading, and discarded them on cancellation. Seven required numeric inputs were hidden in an optional details section. These are concrete usability faults; the exact user's browser/network failure is not recorded.

**Change:** Twenty-second HTTP/body deadlines; three initial endpoint-pair queries instead of up to 36; four services per pair; selected-place coordinates and IDs bypass unnecessary lookups; immediate result publication; retained cards during further acquisition and cancellation; bounded outward discovery only when needed. Extended compares the current graph immediately and then explores a smaller set of extra services. A selected stop ID implies zero endpoint cycling even when provider coordinates differ slightly. Form input is From, To and Baseline/Extended, with optional cycling presets and endpoint category. Debounced independent address/stop suggestions support selection and preserve resolved coordinates.

### Automated regression checks

**Result:** **43 tests pass**, including all previous model/decomposition checks. New regressions cover a simulated 13-second provider response, first-route publication before a deliberately stalled alternative, retaining the published snapshot after cancellation, selected-stop searches avoiding location requests, coordinate/stop-ID identity, accent-insensitive suggestions, live-address normalization, ignoring replies after cancellation, offline local suggestions, first-valid geocoding with cancellation of the slower provider, and validity of all preference combinations. No new dependency was added. TypeScript and the production build pass using the same commands recorded above.

### Live data checks

Direct calls to the app's actual `plan` adapter with selected places and default Balanced options (not a browser test):

| Journey and model | Captured departure (Europe/Zurich) | First proposals | Acquisition complete | HTTP requests / failures |
|---|---|---:|---:|---:|
| Zürich HB → Bern, Baseline | 2026-09-05 15:06:27.496 | 15.239 s | 39.032 s | 3 / 0 |
| Zürich HB → Laax GR, posta, Extended | 2026-09-05 15:07:06.529 | 11.985 s | 82.283 s | 7 / 0 |

Bern produced one distinct card winning all three categories, using IC service 000904, with total elapsed time approximately 81.54 minutes. Laax produced two distinct cards using IR 35 and bus 81: fastest/fewest changes at approximately 157.89 minutes and least cycling at 160.89 minutes. On the final shared Laax graph, Baseline has 21 journey candidates and Extended has 42 including the explicit Baseline union. Neither search reported a warning. This case again does not establish a material benefit from an intermediate bike leg; it verifies that Extended exploration no longer delays first publication.

A live `suggestPlaces` request for partial text `Stauffacherstrasse 6 Zürich` returned `Stauffacherstrasse 60 8004 Zürich` at coordinates (47.375526428222656, 8.527169227600098) in 11.290 seconds. Known rail-hub suggestions are immediate; remote address suggestions still depend on upstream latency. Selecting the suggestion avoids repeating that lookup when planning.

**Limits:** These are two current schedules and one address lookup, not a reliability guarantee or a controlled same-departure speed benchmark against the old run. Reduced sampling can miss category alternatives. Local adapter/test/build checks passed; browser layout, keyboard and touch interaction are not exercised. The app still uses straight-line cycling and defers bicycle carriage restrictions.

**Next check:** Have the user retry their failed journey in the published version, record exact endpoints and whether a suggestion was selected, and collect any displayed error if it still fails. Evaluate wider timetable coverage after responsiveness is acceptable.

## 2026-09-18 — Active travel, cycling-only comparison and station map

**User request:** Show cycling only before the fastest transit option, show stations considered in the search and pinpoint the train/bus boarding and interchange stops. Apply the preceding correction from least cycling to least cycling or walking.

**Implementation:** A separate geometric cycling reference; early endpoint publication; active-time metrics and state-compatible dominance that also retains the cycling resource; numbered boarding/alighting events; distinct explored-stop markers; stop visibility and fit controls. Full behavior and limitations are in [RESULTS_AND_MAP.md](RESULTS_AND_MAP.md).

### Regression outcomes

| Case | Verified result |
|---|---|
| Recorded Zürich HB → Chur → Laax, 2026-09-05 13:30 Swiss time | Still 138 minutes, two boardings, three minutes walking and zero cycling; active time is three minutes. |
| Map for that recorded journey | Four numbered stops: Zürich HB, Chur, Chur Postautostation and Laax. The bus boarding retains service B 81, 14:58 and platform N. Passage stops do not become change pins. |
| Repeated boarding/alighting at one station ID | One pin keeps both events and their distinct boarding numbers/platforms. Separate train and bus stop IDs remain separate. |
| Earlier interchange arrival with 15 minutes walking versus a later arrival with no walking | Both can catch the same onward ride; the desired 60-minute, zero-walking result survives pruning. |
| Lower active time but more cycling before an intermediate leg | Retaining the cycling resource preserves the feasible route with 10 minutes walking and the 10-minute cycling leg, arriving in 60 minutes. |
| Five minutes cycling versus twenty minutes walking | The five-minute active route wins least cycling or walking even when it arrives five minutes later; the earlier walking route remains fastest. |
| Walking at endpoints | Walking before the first boarding and after the last alighting enters the corresponding active-time objective; waiting does not. |
| Cycling-only reference | Uses the common departure instant, rounds cycling up, handles identical stop IDs, stays outside transit categories and persists after timetable failures. |
| Existing experiment | All previous Baseline/Extended constraints, golden journeys and the 54 exhaustive toy-graph comparisons still pass. |

**Automated verification:** `npm test` passes **53 tests**. `npm run build` passes TypeScript and the Vite production build. `git diff --check` passes. No application dependency or lockfile change was needed.

### Browser verification

**Method:** Headless Chromium against the local application at desktop 1280×1000 and mobile 390×844. Fix the browser's clock to the recorded journey's departure. Mock timetable responses with the recorded train/walk/bus sections (pass lists omitted to isolate its four main stops), plus an explicitly synthetic slower direct service to exercise a distinct fewest-boardings card. Map tiles were mocked; this is a UI check, not a new live timetable or basemap availability test.

**Verified:** The cycling card appears before releasing a pending timetable response. Card order is cycling only, fastest transit, then the other category winner. Switching cards changes map geometry and selected pins. The Chur bus popup displays the service, boarding number, scheduled time and platform. Toggling explored stops leaves selected pins intact; Fit all stops restores the explored layer. The full plan carries matching map numbers. When timetable replies return HTTP 503, the cycling reference remains and the incomplete-search notice appears. No application runtime exceptions occurred.

**Visual corrections:** Initial inspection found overlapping Chur train/bus pins and a cropped route after resizing. Pins now use screen-space separation with geographic leader lines, recomputed on zoom/resize. Resizing refits the current view with padding for controls and the legend. Subsequent browser assertions verify no marker overlap, no mobile horizontal overflow, all selected pins inside the map, and no overlap with map controls or legend; screenshots were visually inspected after the fixes.

**Remaining uncertainty:** Cycling geometry, hills and barriers are still absent; carriage/reservation/capacity data remains deferred. No OTP deployment or nationwide completeness claim is made. The next field check is the same Zürich–Laax journey in the updated app, inspecting the Chur walking connection and whether the displayed trade-offs are useful.


## 2026-09-18 — Libingen–EPFL: late departures and missed rail queries

**User report:** No result for **Populated Place Libingen (SG) - Mosnang** → **Schul Hochschulareal EPFL (VD) - Ecublens (VD)**, although a journey via Rapperswil and Renens should be considered. The user's exact search instant was not provided; the reproductions below use explicitly fixed departure times.

**Endpoints:** GeoAdmin matches the selected places to Libingen `(47.328453063964844, 9.023324966430664)` and EPFL Ecublens `(46.521400451660156, 6.566524505615234)`. Selection preserves these coordinates; the EPFL entry in Neuchâtel is a different place and was not used.

### Reproduction and diagnosis

- At **2026-09-21 08:00 Europe/Zurich**, the previous implementation already returned a journey: Libingen Dorf → Bütschwil → Wil → Zürich → Renens, followed by eight estimated cycling minutes to EPFL. Arrival is 12:26, total 266 minutes, nine cycling minutes, one walking minute and four boardings. A second category uses Wil–Renens with one boarding. First proposals took 21.658 seconds; acquisition completed in 43.454 seconds with four requests and no failures.
- At **2026-09-18 23:20 Europe/Zurich**, the old search returned **no journeys**. The three connection requests all started at adjacent Libingen bus stops and ended at Renens. Their first departure was next morning around 05:54, arriving at Renens 10:18 and EPFL about 10:26. The eight-hour arrival cutoff was 07:20, so the solver correctly rejected these edges under that implicit default. It never queried Wil directly, where earlier overnight services were available. Further location probing consumed the 90-second phase and prevented fallback connection queries.
- Rapperswil is 19.38 km from the selected Libingen point in the straight-line model: **78 estimated cycling minutes**. Balanced permits at most 60 minutes at either end; More permits 90 per end and 150 total. Under More, Rapperswil was selected as a candidate but still omitted by the old three-pair ordering. Nearby bus pairs consumed the batch.

**Repair:** A 24-hour default arrival window, including waiting; an explicit Swiss-time departure control; next-day labels; and station-pair selection that tries the nearest pair first, then prioritizes feasible rail access. Cycling and boarding limits remain unchanged. The default does not suppress waiting from elapsed time or silently alter a selected departure. Request count, HTTP deadlines, phase limit and progressive publication remain bounded.

### Live verification after the repair

Direct calls through the application's actual `plan` adapter, using the same selected coordinates and live Transport API responses:

| Departure in Switzerland | Preference | First proposals | Complete | Requests / failures | Result |
|---|---|---:|---:|---:|---|
| 18 Sep 2026, 23:20 | Balanced | 23.506 s | 49.127 s | 4 / 0 | Three category winners; fastest 426 minutes, arrival 06:26 next day. |
| 21 Sep 2026, 08:00 | More | 14.707 s | 31.384 s | 4 / 0 | Two category cards; Rapperswil–Renens explicitly queried and four connections returned. |

The late-evening fastest option cycles to Wil, uses night services through Winterthur/Bern and a bus/walking connection to Biel, then IC 5 to Renens and cycling to EPFL. It has four boardings, 68 estimated cycling minutes and 11 walking minutes. Fewest boardings arrives in 440 minutes with three boardings; least cycling or walking in 460 minutes with 68 active minutes. No acquisition or label-limit warnings occurred. These timings are small live observations, not a reliability guarantee or a claim of practical bicycle-carriage feasibility.

For the More cycling daytime search, the Rapperswil query is made at **09:21**, respecting 78 minutes access plus the three-minute boarding buffer from the chosen 08:00 departure. The recorded service via S 15 and IC 1 reaches Renens at 12:52 and EPFL at 13:00: 300 minutes elapsed, 86 cycling minutes and two boardings. It is feasible in that response's graph. In the combined graph, a Wil–Renens option has the same arrival, 68 cycling minutes and one boarding, so it dominates the Rapperswil option; this explains why querying a station does not guarantee a category card for it.

### Regression and build checks

Selected, unmodified schedule fields from three real responses and the nearby-stop result are stored in `prototype-v0/src/fixtures/libingen-epfl-2026-09-18.json`; each sample records its source request URL. The fixture includes the initial daytime route, the next-morning route and Rapperswil–Renens. No synthetic timetable is presented as a live observation.

**58 automated tests pass.** New checks cover the recorded 266-minute daytime and 666-minute overnight village routes, show that the old eight-hour window excludes the latter, preserve the Baseline routes in Extended, publish overnight results before fallback probing, and require an actual Rapperswil query under More when neighboring requests return no journeys. The Rapperswil acquisition regression uses the recorded two-boarding connection. Swiss date parsing is checked across summer/winter offsets, midnight, invalid dates, the spring skipped hour and autumn repeated hour.

TypeScript and the production build pass; no dependency or lockfile changed. The managed browser-preview service was unavailable, so the new departure input has **not** been visually or interactively verified in this session. This is distinct from the successful live adapter checks and the previous map browser checks. No replacement preview service was started.

**Remaining limits:** Cycling still follows straight-line estimates; carriage/reservations are deferred. Only four candidate stops per side and three initial station pairs are sampled, with bounded fallback/Extended exploration. Feasible routes can be missed, and dominated journeys need not be shown as category winners. The exact cause of an unrecorded user search is not asserted beyond the reproduced case.

**Next field check:** Refresh the private website, select these two suggestions, choose the desired Swiss departure time, and use More cycling when expecting Rapperswil to be considered. Compare the returned Wil and Rapperswil trade-offs against a practical routed cycling journey.

## 2026-09-20 — Map selection and ordered intermediate stops

**Request:** Map click/tap actions for start/finish, draggable named markers, intermediate steps and a GitHub document for the remaining app work.

**Implementation:** Exact-coordinate map selections with bounded nearby-name lookup; up to four reorderable/removable requested stops; route reversal; stage-aware transit search and a cycling-only comparison through those same points. Existing no-via acquisition remains unchanged. The future work is recorded in [APP_ROADMAP.md](APP_ROADMAP.md).

### Deterministic regressions

The new `prototype-v0/src/waypoints.test.ts` uses explicitly synthetic timetables at 2026-09-20 08:00 Europe/Zurich. These are controlled correctness checks, not real offered services.

| Case | Verified result |
|---|---|
| A → B → C, with a faster A → C shortcut | The shortcut cannot skip B; arrival is 08:40, with B visited at 08:20 and two boardings. Reordering to A → C → B has no journey in this directed fixture. |
| One boarding allowed or a 39-minute overall horizon | The two-stage journey is rejected; exactly two boardings and a 40-minute horizon admit it. Budgets do not reset at B. |
| Fast first stage uses two boardings; slower first stage uses one | The slower prefix survives pruning and catches the onward ride within the two-boarding total cap. |
| Cycle from B to a requested point and back | Both legs enter total cycling and intermediate active time. Reducing the total budget by one minute rejects the trip. |
| Onward departure one second before the waypoint's readiness plus buffer | Rejected; departure exactly at readiness is accepted. |
| A requested final stage entirely by bicycle | Mixed journey remains eligible; final cycling enters the arrival active-time metric. The separate cycling-only estimate includes the requested point. |
| Request an earlier place again | A → B → A → C records both visits in order. |
| Two automatic cycling transfers, one in each stage | Extended rejects using both; the valid one-transfer alternative arrives at 09:30 instead of the invalid two-transfer 09:05. Baseline is infeasible in this fixture. |
| Actual acquisition adapter with one requested stop | Queries A → B at 08:03 and B → C at 08:23, following the reached arrival plus boarding buffer. Two requests share one client; five requested stops are rejected before acquisition. |
| Map naming with controlled GeoAdmin data | The label gains a nearby name but keeps exact latitude/longitude and no invented station ID. Network failure retains coordinates; cancellation aborts and invalid coordinates are rejected. |

**Automated verification:** 69 tests pass, including the previous recorded Libingen–EPFL, Zürich–Laax and exhaustive no-via model checks. TypeScript and the production build pass. No dependency or lockfile change was required.

**Browser/live limits:** The managed preview service failed because its request mailbox was unavailable; its status probe failed for the same reason. No replacement preview service was started. Map click, tap, dragging, keyboard selection and responsive layout have therefore **not been interactively or visually verified in this update**. Existing browser checks from 2026-09-18 do not cover these new controls. A direct naming attempt near Zürich HB did not obtain a successful live response in this environment and returned the coordinate fallback; successful response parsing is covered by controlled data, not asserted as a live result. No new live multi-stop timetable benchmark was performed.

**Remaining limits:** All cycling geometry/times remain straight-line estimates. There is no added stopover duration, road profile or carriage/availability validation. Stage acquisition samples at most two stop pairs per stage and can miss alternatives; Extended with requested stops reuses that graph without extra departure-board acquisition. See the model document for exact semantics.

**Next check:** On desktop and mobile, choose A/B and two intermediate stops on the map, drag one, reorder the stops and confirm the form and returned plan match. Check a failed naming request leaves a usable coordinate. Then implement the routed-cycling/engine pilot described in the roadmap.

## 2026-09-20 — Routed cycling controls timetable feasibility

**Implementation:** Directed BRouter road links replace geometric cycling in the production acquisition path and both solvers. The map and timing share those same links. Linked elevation inspection, ascent/descent, steep/final climbs, surface/infrastructure and approximate posted-speed bands are explained in [CYCLING_ROUTES.md](CYCLING_ROUTES.md).

### Recorded road and live multimodal observation

The raw Renens–EPFL GeoJSON response is recorded in `prototype-v0/src/fixtures/renens-epfl-cycling-2026-09-20.json` with its URL, endpoints and attribution. From `(46.537, 6.578)` to `(46.5214, 6.5665)`, the response has 120 geometry points, **2.597 km** and **401 seconds** provider riding time. The smoothed displayed profile has **3 m ascent / 23 m descent**. Roughly 3 m start and 33 m end gaps add estimated walking access; the leg rounds upward to **8 minutes**. Surface data includes unknown portions. HTTP 200 and public CORS were observed; this is not an availability guarantee. The real adapter alone completed in 15.21 seconds in one run.

A live Baseline planner run used those endpoints, Balanced budgets, no requested stops, and **21 September 2026, 08:00 Europe/Zurich**. It published its first transit proposal after **34.188 seconds** and completed after **67.875 seconds**. The selected alternatives took 31 minutes (R 2, 1 minute access and 12 minutes egress) and 41 minutes (IC 1 / R 4, 1 minute access and 8 minutes egress); the cycling-only comparison was 2.597 km / 8 minutes. Three connection queries and 16 main road requests were used, with no warnings. This short trip checks integration, not whether transit is useful here or whether the sparse search is optimal. A subsequent scheduling-only change publishes already supported paths before background road checks; these timings are not a benchmark of that final scheduling refinement.

### Deterministic regressions

**81 automated tests pass**, including 12 road-specific checks and the existing timetable/model cases. New road checks cover:

- The unmodified live geometry, provider time, smoothed elevation and distance-weighted unknown-inclusive attributes.
- Invalid geometry/time, over-75-m snapping, missing elevation and unmatched road-message intervals.
- Directional infrastructure and asymmetric route times; no fabricated surface or measured traffic speed.
- Failed/rate-limited road requests, duplicate requests and cancellation of late responses.
- A synthetic 20-minute station approach rejects an 08:10 train that the old geometric model accepted, while retaining the 08:25 departure. Missing or reverse-only cached links cannot make it reachable.
- A required visit takes 10 minutes out and 20 minutes back; both consume the shared budget and exclude an earlier onward train.
- A 10-minute automatic transfer after 08:20 arrival plus the boarding buffer rejects 08:25 and accepts 08:35; a 9-minute transfer cap rejects the link.
- The production acquisition flow with controlled road data queries the timetable at 08:23 after a 20-minute approach and three-minute buffer, and retains that approach in the final 55-minute journey.

Historical timetable tests explicitly select the old geometric experiment to preserve their recorded assumptions. In particular, the previous Libingen–Rapperswil 78-minute access and associated totals are **historical geometric observations**, not new real-road estimates. They must be remeasured before using them as cycling advice.

**Build and UI limits:** TypeScript and the production build pass, with no added dependency or lockfile change. The managed preview status still fails because its request mailbox is unavailable. No replacement preview service was started. The new profile/map pointer, touch, keyboard and responsive interactions have therefore not been visually verified in this session.

**Next practical check:** Open the private site on desktop and mobile, select the cycling-only result, inspect the elevation with the slider, then choose a transit result and its final cycling leg. Repeat with a requested stop and a hilly finish. Compare ride duration and actual road/entrance access in the field. Exact posted speed values, operator bicycle restrictions and platform access remain unresolved.

## 2026-09-20 — Endpoint tolerance and station-access error repair

**Report:** “Some station access routes could not be checked” when locations are not exactly on a road. Exact failing coordinates were not included, so this is a confirmed cutoff/error-classification defect, not a claim to reproduce that particular search.

**Fix:** Raise the local endpoint gap limit from 75 m to 250 m per end and explicitly request the same waypoint-matching range from BRouter. The user's original points remain fixed. Dotted access connectors keep their estimated walking time at 4 km/h, included in station readiness, rounded cycling-leg time and budgets. Road geometry and attribute/elevation totals exclude these unverified gaps. Separate service failures and search limits from missing/disconnected paths in the user-facing error.

**Regression verification:** All **84 tests pass**, as do TypeScript and the production build. New checks accept two 249 m connectors, retain both original points, add 7.47 walking minutes to a 10-minute ride (18 minutes after rounding), and reject 251 m at either end. The production acquisition test routes an endpoint 111 m off the path: its 20-minute ride becomes a 22-minute access leg, queries trains from 08:25 including the boarding buffer, rejects an 08:24 departure and accepts 08:25. Failure tests distinguish a 503 service response, a 400 no-path response and an excessive returned endpoint gap. No dependencies changed.

**Live checks:** An explicit 250 m provider parameter was accepted for a point near Renens `(46.5355, 6.577)` → EPFL `(46.5214, 6.5665)`, returning 2.658 km / 415 riding seconds in 15.17 seconds. The updated client also routed the previously recorded Libingen address `(47.328453063964844, 9.023324966430664)` to Libingen, Dorf `(47.329498, 9.022909)` in 10.186 seconds: 0.270 km, 2 minutes including 21.46 m / 1.43 m endpoint gaps, no warnings. These are road-service checks; no new full multimodal latency or visual browser result is claimed. The larger-gap boundary is covered by controlled geometry tests.

**Next user check:** Refresh the private site and retry the same start and finish. If it still fails, record the exact points and the new message so service availability, route connectivity and budget exclusion can be distinguished.

## 2026-09-20 — Named cycling failures and HTTP error diagnosis

**Report and scope:** The user quoted a no-connected-path warning without supplying the current endpoints or whether proposals appeared. Investigation confirms a diagnostic bug: every BRouter HTTP 400 was interpreted as no route, although the server uses that code for other engine errors. This update does not claim to identify the exact cause of the user's unseen search.

**Live reproduction attempt:** Reused the recorded Libingen address and EPFL coordinates, Balanced/Baseline, no requested stops, departure **21 September 2026 at 08:00 Europe/Zurich**. First proposals appeared in **35.890 seconds**. The run completed in **67.436 seconds** with **7 feasible journeys in the sampled graph**, a successful cycling-only comparison, **13 main cycling requests** and **no warnings**. These are graph journeys, not seven distinct displayed category winners. A temporary fetch wrapper recorded any failed HTTP response body; none occurred in this run. No general availability or completeness claim follows.

**Implementation:** Keep up to 2,048 bytes of an HTTP error response within the existing request deadline. Distinguish timeout, no-track/island, unmatched waypoint and unknown service error using the actual diagnostic. Preserve affected coordinates and labels in the search's in-memory `failedLinks` map; user-facing warnings name the two places and do not render raw provider messages. Label cycling-only comparison failures separately and distinguish usable journey results from unsuccessful alternative checks.

**Verification:** **86 tests pass**, with TypeScript and the production build passing. A production-flow fixture returns valid transit through station A while another candidate station has a no-track response and the direct cycling-only route times out. Both failures are labelled correctly and the transit results survive. Provider-response cases verify timeout and unknown 400s are not classified as disconnected paths, recognized matching/path failures remain distinct, rate limits remain service failures and diagnostic retention is bounded. No new dependency or live browser check was added.

**Next reproduction input:** Exact selected start and finish, any intermediate stops, departure/model/preset, and whether journey cards appear. The named failed-link message should make the missing check identifiable.

## 2026-09-20 — Above 150 minutes cycling

**Change:** Add the fourth cycling preset, permitting longer and shorter rides without separate cycling caps inside the existing 24-hour journey window. Raise total, access, egress and intermediate validation bounds together. The three previous presets and finite discovery/request limits are unchanged.

**Controlled acquisition regression:** Start at 08:00 Swiss time; the cycling provider fixture returns 180 minutes to station A and 120 minutes from B to the destination. The real acquisition path queries A–B from 11:03, including the boarding buffer. The solver excludes an 11:02 train, accepts 11:03, and returns a 333-minute journey with 300 cycling minutes. It rejects a later service whose final cycling leg would arrive after 24 hours. More cycling rejects this same graph; a shorter, zero-cycling station-to-station journey remains eligible under the new preset.

**Transfer and requested-stop regressions:** Extended permits a 180-minute directed cycling transfer and selects the first onward train reachable after the boarding buffer; Baseline and More cycling reject that transfer. A separate requested-stop case accumulates 360 cycling minutes across the outward and return legs, visits the stop at minute 200 and completes at minute 420. An earlier onward departure is excluded, and an arrival past the original 24-hour window remains infeasible.

**Verification:** All **89 automated tests**, TypeScript and the production build pass. The tests use controlled provider responses and exact timestamps, without live service calls. The new UI choice uses the existing preferences select and displays the overall time limit; no browser interaction check is claimed for this change. No dependencies changed.

**Next user check:** Open Preferences → How much cycling? → Above 150 minutes cycling and repeat the original journey. A more generous allowance cannot guarantee a path when routing/timetable data or candidate coverage is insufficient; retain the exact failed-link message and selected coordinates if no route appears.

## 2026-09-20 — Bus bicycle-policy feasibility

**Scope:** Preserve operator/category from connection sections and departure boards. Match the dated [bus policy registry](BUS_BICYCLES.md), filter before routing dominance, and show the same conditional/unknown status in cards, per-leg instructions and map pins. No claim of live bicycle-space or reservation availability is introduced.

**Controlled route:** Four services leave the same stop after the boarding buffer: a prohibited operator arrives at minute 20, an unverified bus at 25, a conditional PostBus at 40, and a train at 60. Both models select minute 40 by default, minute 25 after opting into unverified buses, and minute 60 when buses are avoided. The prohibited bus never enters a result. This detects the important failure where filtering after dominance would lose the slower eligible alternative.

**Ordered stop:** The same bus preference is enforced before a required visit. Catchable onward trains produce arrival minutes 70, 50 and 90 respectively. No forbidden bus bypasses the rule through a stage boundary. A production acquisition test repeats the direct case for all three preferences; timetable observations remain available to explain exclusions.

**Metadata and coverage:** Tests keep missing/numeric/unmatched operators unknown, prevent replacement services inheriting normal operator permission, preserve categories/operators on station-board exit prefixes and deduplicate excluded departures. The recorded Zürich–Chur–Laax fixture retains its 138-minute journey, `PAG` / `B 81` bus, conditional policy, source link and map status. The older reduced Libingen fixture omitted operator fields: its original day/night timing regression explicitly enables unverified buses, rather than adding invented policy metadata. All cycling presets accept all three bus preferences.

**Verification:** **97 automated tests**, TypeScript and the production build pass. Tests use controlled and existing recorded responses; no new live timetable performance or actual bicycle acceptance is claimed. Official policy pages were reviewed on 20 September. Browser preview could not start because the managed preview service was unavailable; no replacement server was started. No dependencies changed.

**Next user check:** Refresh the private site, search Zürich HB → Laax GR, posta and expand a bus leg. Check the bicycle guidance, source and boarding pin. Compare with “Avoid buses”; use “Also include unverified buses” to explore operators outside the initial registry. The source timetable may return different journeys on another date.

## 2026-09-21 — Independent permission searches, Zürich comparisons and OJP preparation

**User correction:** Present confirmed bicycle-compatible transit separately from optimization that allows uncertain permission. Merge identical results. Do not let uncertain shortcuts eliminate confirmed routes.

**Controlled regression:** An uncertain service reaches the destination at minute 20; a confirmed service reaches it at minute 200. Permissive label pruning removes the latter, but the separate strict solve retains it as its own fastest winner, outside the other scope's 60-minute window. Both Baseline and Extended pass. Ordered-stop cases require positive matching evidence on every leg, including an onward tram; removing that evidence empties only the strict result. Segment, service, operator and date mismatches stay uncertain. Known prohibitions never qualify.

**Deduplication:** Identical recommendations produce one card with both memberships. A shared journey can be fastest in the confirmed group and least-active in the permissive group; those different categories and time references survive merging.

**Reported Zürich totals:** A controlled comparison uses the user's 14-minute cycling estimate, 183-minute rail journey with 33 active minutes, and 214-minute bus journey with 11 active minutes. The comparisons are respectively 169 minutes longer / 19 more active minutes and 200 minutes longer / 3 fewer active minutes. A separate illustrative Küsnacht-style case checks that a slower journey with more cycling is described accurately. These are arithmetic/ranking regressions, not live timetable reproductions; the exact dates and Küsnacht origin were not supplied.

**Acquisition regressions:** A location beside Zürich rail hubs now requests nearby stops and retains local buses alongside rail candidates. A controlled road/timetable flow initially finds a 183-minute transit trip beside a 14-minute bicycle route, continues outward discovery, and finds a 25-minute local service. Both results remain uncertain. A second production-flow fixture checks 08:00 and 01:00 departures, publishing permissive results and an honestly empty confirmed group. Existing recorded Libingen–EPFL and Zürich–Laax cases remain covered.

**Verification:** 105 app tests pass, plus two Python request/parsing tests for the OJP evaluation harness. TypeScript and the production build pass; no dependencies changed. OJP XML dry-run requests were generated without network access. No live OJP calls or new live timetable benchmark were run because no OJP API key is configured. The supervised preview service was unavailable, so this update has no new desktop/mobile visual verification.

**Next:** Configure OJP access, select exact dated Zürich/Küsnacht inputs, and run the paired filter-on/filter-off captures before judging timetable coverage or importing permission evidence. The [evaluation document](BICYCLE_PERMISSION_AND_OJP.md) specifies the matrix, commands and acceptance criteria.

## 2026-09-21 — Three comparisons and bounded TripInfo inspection

**Controlled graph regression:** A prohibited bus arrives at minute 10, an uncertain boat at 100 and a confirmed train at 200. Baseline and Extended retain the independent winners 200/100/10, each with zero extra time in its own category window. Avoid buses removes the bus from the unrestricted comparison too. A dated ferry prohibition is treated consistently with other modes and its evidence remains prohibited after unrestricted inclusion.

**Ordered visit:** A prohibited onward leg empties only the two bicycle-aware scopes. The unrestricted solve still visits the requested point and completes the journey. In the production acquisition flow, separate uncertain/unrestricted arrivals at minutes 40/20 query onward services at 08:43/08:23 with the same three-minute boarding buffer and shared request cap, producing 50/30-minute journeys. Confirmed remains empty because the live-adapter fixture supplies no positive evidence. This runs in both models.

**TripInfo tool:** Five controlled tests cover dated request construction without formation/capacity, separate service/stop conditions, mismatched dates/invalid response rejection, one-call authentication failure with credential redaction, empty delivery failure, and a keyless/no-network dry run. Permission remains unassessed. The existing eight OJP benchmark tests also pass. No new live OJP requests were made.

**Verification:** 108 app tests, 13 Python tests, TypeScript and production build pass. No dependency or lockfile change. New desktop/mobile visual interactions have not been browser-verified.

**Delivery limitation:** Repository reads were recovered through Git. Native GitHub and Sites calls fail with HTTP 400 `Invalid MCP request metadata`; direct Git has no configured write credential. This records verified local work only, not a successful GitHub push or Site publication. Recheck the remote revision before pushing the prepared change and publish the exact tested application source afterward.

## 2026-09-24 — Dated permission, prerequisites and TripInfo rerouting

Live [Actions run 36034855752](https://github.com/Victorpolm/bike-train-planner/actions/runs/36034855752): nine of nine calls succeeded (three public pairs, bicycle filter off/on, one matched TripInfo per mode). [Detailed findings](OJP_PERMISSION_2026-09-24.md).

The offline regression uses an actually returned bicycle-compatible boat leg, acquires it through the production `plan` flow with both paired calls charged to the existing budget, then injects a matching TripInfo prohibition. Confirmed and uncertain solutions become empty while the all-transit reference remains. Other regressions cover all three real TripInfo identities, notes outside the boarded interval, missing reservation information, passenger-vs-bike reservation codes, conflicts and server-only credential/error boundaries. Existing 108 regressions remain: total 120 pass. Python evaluation tests: 13 pass. TypeScript, Vite frontend and Worker builds pass; Worker smoke checks return HTML, status JSON and a real 404. Browser visual QA was unavailable because the preview service was absent.


## 2026-09-24 — Baden train exits, short cycling and temporary failures

**Report:** The fewest-boardings journey to FORTYSEVEN added bus B5 after a Zürich–Baden train even though cycling from Baden was preferable. A short Baden map-point pair failed its cycling checks. Another pair north of Baden to central Zürich produced only a timetable-busy note. Original departure/settings and error bodies were not available; these checks do not reconstruct the historical provider outage.

**Confirmed implementation causes:** Four-nearest-stop truncation hid useful rail exits behind local bus stops. Wall-clock phase deadlines included waits for the other provider. A single 429 disabled the client, temporary cycling failures were cached as unusable, and station-access failure could reject the search before its independent bike result completed. The repair preserves road feasibility and the existing independent permission scopes.

**Controlled regressions (nine new):** A train-plus-bus graph with five closer bus stops and a constrained cycling budget yields the one-train exit in Fewest boardings, arriving at minute 45. A valid 10-minute cycling-only journey survives failure of every station link. Recovery covers temporary 429/503/network errors, short and long Retry-After, later station-pair requests, clearing recovered cycling warnings, provider-specific time budgets and a validated OSRM backup. Ferry/train/pushing-bike steps are rejected; absent elevation/road tags stay unknown. Conclusive disconnected/off-network errors do not trigger backup. Existing provider-budget and rate-limit tests were updated to assert the new bounded behaviour.

**Live checks:** Ran the production `plan` flow against live Transport API/BRouter responses using **25 September 2026 at 08:00 Europe/Zurich**, Baseline and Balanced limits, without OJP. The precise user-supplied origin/map-point captures remain outside Git. The 54/59-minute mixed results below have unconfirmed bicycle permission; they are not promoted to the confirmed scope.

| Case | Checked outcome | Acquisition time / limits |
|---|---|---|
| Zürich address → FORTYSEVEN Baden | Fewest boardings: cycle to Zürich HB, **IR36 to Baden**, cycle directly to the bath; **54 min, one boarding**. Cycling-only **94 min / 32.338 km**. The chosen date returns IR36 rather than the previously reported IR35. | Completed in **92 s**, 6 timetable + 14 station-cycling requests; no warnings. |
| Short Baden map-point pair | Routed cycling-only **15 min / 2.029 km**, available independently of transit exploration. The touring estimate differs from the user's approximate 10 minutes. A sampled bus alternative takes 27 min. | Completed in **184 s**, 15 timetable + 22 station-cycling requests. One late timetable check timed out; it did not remove either valid result. A transient 502 during stop discovery recovered on retry. |
| North of Baden → central Zürich | Cycle to **Baden**, **IR36 to Zürich HB**, cycle to the selected destination: **59 min, one boarding**, versus cycling-only **98 min / 29.438 km**. | Completed in **76 s**, 6 timetable + 14 station-cycling requests; no warnings. |

**Independent road-provider check:** The backup bicycle endpoint also returned a road route for the short Baden pair (2.053 km / 710.4 riding seconds before endpoint connectors). This verifies a real backup response, not a live BRouter-outage claim. Controlled tests exercise the actual fallback path when the primary request fails.

**Verification:** **129 application tests** pass. TypeScript, frontend and Worker builds pass; Worker smoke checks return the app HTML, OJP status JSON and a genuine 404. The Python evaluation code is unchanged (13 tests last verified). The managed preview daemon was unavailable; no new browser visual QA is claimed. Public-provider outages and sampled coverage can still leave a search incomplete. No nationwide GTFS/OSM import, remaining-bike-space lookup or booking transaction was added.


## 2026-09-24 — All-mode access and Zürich–Chur–Laax overnight

**Public feed:** Direct search.ch requests with bicycle attributes returned HTTP 200 and browser CORS support. Recorded reduced public-station fixtures preserve reservation-required PostBus 81, bicycle-prohibited replacement buses, and overnight Zürich/Chur/Laax trips. Untimed tunnels are excluded; timed prefixes retain exact evidence. Ordinary passenger/group reservation attributes are never bicycle reservations. The source API's documented daily limit is 1,000 route queries; the app retains its smaller per-search cap and respects rate limiting.

**Omitted train:** Queried 2 November 2026 at 23:00 Europe/Zurich. The whole Zürich HB–Laax GR, posta response begins with a 00:23 train and long overnight wait, or later morning trains. A direct Zürich–Chur request returns IR35 23:12–00:49. Thus end-to-end transit optimization omits a useful earlier cycling exit.

**Recorded/live-source verification:** Before the full repair, the new public-feed search still chose Flums and 272 min cycling, arriving 04:50 (350 min elapsed). After prompt hub-cycle checks and station-identity route reuse, replaying the same captured timetable/location/road responses, with fresh BRouter requests for newly checked links, yields **IR35 to Chur, 151 min / approximately 26.7 km cycling, arrival 03:20** (260 min elapsed, one boarding). The separate full cycling comparison is 542 min. This uses Above 150, Baseline, and allows unverified access; the later added narrow domestic SBB IR rule also establishes published-rule access. Eight timetable requests and 16 station-cycling requests stay below the caps. A Sargans road check returned a genuine no-route result and remains an explicit search note; it did not suppress Chur.

**Date dependence:** On 24 September, the late Chur corridor includes EV replacement buses marked `VN` (bicycles prohibited). On 26 September, late trains and a night bus to Laax exist. The user's precise travel date was not supplied, so these are dated reproductions rather than a claim to reconstruct the exact historical 07:25 itinerary.

**Controlled regressions:** All three selected scopes change both feasible routes and visible winners for train, tram, boat and bus, including after evidence refresh. PostBus ticket/reservation details, source attribution, SOB/SBB scope boundaries, explicit prohibitions, conflicts, Swiss wall times and untimed passages are checked. A recorded overnight acquisition with controlled road times confirms the original 23:03 query readiness, one boarding via Chur and arrival at minute 219; its 110-minute cycling fixture is deliberately synthetic. A separate cache regression checks small station-coordinate changes and directionality.

**Verification:** 137 application tests pass, plus TypeScript/frontend/Worker builds. A React server-render check confirms the PostBus card contains permission, ticket, required reservation and readable nonempty operator instructions. Browser preview infrastructure is unavailable, so no desktop/mobile visual check is claimed. The Python evaluation code is unchanged (13 tests last verified). No national dataset, capacity or booking integration is added.


## 2026-09-24 — Permission display and rider-dependent cycling times

**Permission regression:** Allowed train, bus, tram and boat evidence stays verified with unknown ticket/reservation requirements. Published ordinary ZVV-operator/tpg policies verify access, while dated bans override them; replacements, unmatched operators and PostBus without specific evidence remain unverified. Mixed journeys identify the unknown leg. Production VBZ daytime/night acquisition now populates the verified solve.

**Rider regressions:** Flat calibration, disproportionate climbing gain, electric fade, downhill cap, up/down integration with zero net ascent, validation, walking connectors, cache isolation and missing-elevation backup timing. A controlled 4 km access ride catches a 08:12 train with Strong (9 min riding + 3 min boarding); Relaxed needs 17 min and catches the later 08:40 train. The 9-minute cycling budget admits only the Strong case. Production acquisition sends readiness 08:12 versus 08:20 and uses the same profile in independent cycling comparison. Existing Baden, overnight-exit, waypoint and recovery cases continue passing.

**Recorded real-road replay (no new timetable claim):** The Chur–Laax BRouter response captured earlier on 24 September contains 26.734 km of road geometry and 98.1% usable elevation coverage. Recomputing exactly that path yields Relaxed 262 min, Regular 168 min, Strong 97 min, Electric 75 min, including walking connectors and rounding. Missing elevation uses flat pace. The earlier 151-minute provider-time result remains a historical observation; these new times depend on the chosen rider and are not ride-validated. They do not prove the same departure is available on another date.

**Gate:** 145 app tests pass; frontend and Worker production builds pass. React server rendering verifies speed controls, the slope table, the chosen pace in cycling details and nonempty verified PostBus ticket/reservation guidance. Browser preview is unavailable because its supervised infrastructure is absent.


## 2026-09-24 — Five-pace preset revision

The presets are now City 15, Relaxed 20, Regular 25, Sportive 30 and Electric 25 km/h. Regular is the default; all remain editable. The existing regression suite covers every preset's flat calibration, climbing and descending behavior. Controlled station-readiness checks use City (17 min access, ready 08:20) and Sportive (9 min access, ready 08:12). Both primary and independent cycling clients preserve the selected pace. The 9-minute bike budget admits the Sportive case. Earlier recorded-path replay values above belong to the prior presets and remain historical observations.

All 145 tests pass after updating existing fixtures. The calculation and current slope-speed table are documented in CYCLING_ROUTES.md. Browser interaction was not rechecked for this small preset/copy update.


## 2026-09-25 — Prerequisites, prices, data imports and end-to-end checks

Verification: **157 application tests**, **5 local timetable tests**, **5 import/GPX tests**, and **13 existing OJP Python tests** passed. New cases cover the IC reservation season/calendar/Swiss date, peak-hour uncertainty, ban/VI precedence, independent staff/ticket attributes, connecting reservations, GA/Half Fare bike costs, tariff validity, parking parsing/failure isolation, deadline/cancellation and completed cycling results. The separate national fixture covers scope-specific pruning, pickup/drop-off, frequency exclusion, transfers, 25:00 departures and DST.

React server rendering verifies verified IR permission, no reservation, required bike ticket, the GA passenger explanation and the CHF 15 bicycle option with no empty bullets. Browser preview is unavailable. A local browser installation could not complete; no desktop/mobile interaction or visual pass is claimed.

Two fresh live checks ran on 25 September against public timetable/road services using the existing Regular 25 km/h profile:
- Baden short bicycle case, departing 26 September at 10:00 Swiss time: cycling comparison **13 minutes**, plus **5 transit journeys**. Search ended at **60.006 seconds**, keeping results and marking remaining alternatives incomplete.
- Zürich HB → Laax GR, posta, departing 2 November at 23:00 Swiss time with unrestricted cycling: the **IR35 → Chur → cycle** alternative is present, one boarding, estimated arrival **02:46 Swiss time**. Cycling-only comparison first appeared after **11.768 seconds**; the first transit result after **25.265 seconds**. Whole search ended at **60.022 seconds** with useful results and an incomplete-search warning. These are planning estimates, not measured ride times or universal guarantees; the initial 10–15 second transit target is not consistently met.

The existing relocated golden regressions for HB–IR35–Baden–direct cycling, a short bike trip during provider failure and bus/rail alternatives still pass. Private home addresses are not added to this report.

National import: **474 agencies, 5,172 routes, 104,279 stop/platform records, 634,409 selected trips, 10,002,822 stop events**, six service dates including adjacent days. SQLite **1,631,551,488 bytes**, import **191.2 seconds**. Boat route categories are included. The national pilot finds direct Zürich–Baden, Baden–Zürich and late IR35 to Chur. Query elapsed times were **9.778 s / 0.164 s / 8.011 s**; first/third searches were incomplete, with synchronous query work exceeding the preferred budget. Peak RSS across the process was **550,744 KiB**. This demonstrates a working pilot, not production readiness or complete optimal routing.

The Swiss OSM extract (**546,983,197 bytes**) was streamed successfully: **57,322,045 nodes**, **6,366,660 ways**, including **15,515 highway=cycleway ways**. There are **9,950 bicycle-parking nodes and 6,915 bicycle-parking ways**, which are not deduplicated facilities or necessarily public parking. These have not been merged with the official layer. Station-area inventories for Zürich HB/Baden/Chur identify mapped entrances, elevators, steps and missing bicycle tags; they do not establish connected accessible transfer paths.

The official parking download parsed **1,608 bicycle facilities**; car records are excluded. No occupancy or default-zero price is treated as availability/free parking. Raw GTFS/PBF/parking files and personal GPX are not committed. Source hashes, dates, aggregate counts and public-route benchmark outputs are in [the audit record](SWISS_DATA_AUDIT_2026-09-25.json).

Repeat checks from repository root:

~~~bash
(cd prototype-v0 && npm test && npm run build)
node --test tools/swiss_timetable.test.ts
python3 -m unittest discover -s tools -p 'test_*.py'
python3 -m unittest discover -s prototype-v0/scripts -p 'test_*.py'
~~~

Use a writable TMPDIR if the execution environment has no writable system temporary directory. See SWISS_IMPLEMENTATION.md for production gates.


## 2026-09-25 — Card prices and FORTYSEVEN destination regression

Cause: bicycle prices were inside the expanded itinerary only. The collapsed card now includes them immediately after boardings and responds to the existing fare profile. Regression cases cover Full Fare/Half Fare passenger-price separation, GA and annual-pass additional costs, required and unknown reservations, unsupported dates/operators and prohibited carriage.

The live Transport API returned the FORTYSEVEN venue name with null coordinates; GeoAdmin returned Baden municipality/geographic names. The former first-response geocoder could choose that partial town result. A captured public Photon fixture returns the bath and two car parks. Tests verify coordinate order/validity, Swiss-country filtering, no fake transit stop identity, ranking a delayed venue above eight early station/town results, whole-query geocoding, and HTTP 429 cooldown. Existing cancellation and immediate-station/address cases still pass.

Final live lookup: station/geographic suggestions arrived at 8.396 and 8.933 seconds; the bath became the first suggestion at 8.937 seconds. Submitting the same typed query selected latitude 47.4813202, longitude 8.3128908, with label Fortyseven Baden and Bath / spa · Grosse Bäder 1 · 5400 Baden. These are external service observations, not a latency guarantee. A separate response-header check confirmed browser cross-origin access. The initial six-second Photon deadline was too short for the observed service latency; the final independent deadline is 20 seconds, matching existing place providers.

All 163 application tests pass. TypeScript and frontend/Worker production builds pass. React server-render checks on the actual collapsed JourneyCard verify that prices follow boardings and precede arrival details, for full fare, Half Fare, GA, annual bike pass and cycling-only states. Browser interaction/visual verification was not available; no visual pass is claimed. The unrelated national-import and Python suites were not rerun for this UI/geocoding change.

## 2026-09-27 — Terrain, fare components and regional access regression

**Implementation:** [Swisstopo and fare release notes](SWISSTOPO_AND_FARES_2026-09-27.md). The private Site is version 21, published at 09:48 UTC from Site source `d2e3935c9197ac258338c33b7faab4331748f311`. All 105 tracked application files match the validated checkout. Owner-only access was rechecked.

**Automated checks:** 177 application tests pass; TypeScript, browser bundle and Worker builds pass. Server-rendered Zürich–Baden fare card contains passenger CHF 14.20, bicycle CHF 7.10 and reservation CHF 0.00 separately, total CHF 21.30. Tests cover below/equal/above day-pass selection, expiry, GA/Halbtax/annual bike pass, connected versus disconnected zone fares, unknown prices, scoped S12/S10 rules, stairs, technical terrain, official matching, partial service results and station-centroid recovery. The Renens–EPFL fixture now explicitly times its short pedestrian section rather than treating it all as riding.

**Live terrain probes:** The previously reported short Baden cycling pair produced a 2.029 km, estimated 13-minute stair-free candidate after comparing two paths; 1.834 km matched returned official features, with partial coverage explicitly retained. A first 5.5-second official-service timeout proved too short for measured 6–9-second responses, so the server bound is nine seconds and matching features are reused for nearby alternatives. The reported alpine pair was rejected for mapped alpine walking/climbing unsuitability in 8.1 seconds. Personal input coordinates and raw trace geometry remain outside the public repository.

**Dated S12 evidence:** On Monday 28 September 2026, the public timetable marks Zürich Stadelhofen–Zürich Altstetten S12 at 07:39 with `0_1.6_VN` / no bicycle carriage. The 10:09 S12 has no such note. This supports keeping explicit peak-period restrictions while applying reviewed off-peak permission; it does not identify the user's original unspecified departure.

**Whole-search probes:** Public approximate endpoints, Regular pace, unverified carriage included, 40-minute access/egress and 60-minute total bicycle budget, departure Monday 28 September at 10:00 Swiss time. These are analogous journey families, not a replay of private residential endpoints.

| Probe | Result and remaining gap |
|---|---|
| Witikon centre–Uitikon Waldegg area | Under the earlier 60-second limit, first transit result at 51.2 s (67 min via B31/T6/B236), cycling estimate 47 min; search incomplete. This case was not rerun after the final 90-second limit change. |
| Muri bei Bern–ETH Zentrum | Endpoint overlap reduced time to the first timetable query from 51.6 to 40.8 s. The 60-second search still stopped while checking the useful Zürich HB cycling exit. With final 90-second allowance, first transit proposals appeared at 71.1 s: 122/128-minute mixed journeys. Full search remained incomplete; these are not proven optimal. |
| FORTYSEVEN area–Witikon centre | Final 90-second search returned the cycling comparison (100 min) but no mixed journey before timeout. No permanent cycling-link errors remained after centroid recovery. **Unresolved: acquisition/scheduling still misses a useful rail option within the bounded search.** |

A direct Zürich HB endpoint probe also reproduced a provider-centroid `no track found` response, while the existing nearby station anchor returned a 10-minute route to ETH. The bounded same-station retry preserves the original endpoint and adds walking time rather than pretending the points coincide.

**Limits / next step:** The requested terrain/rule/fare features are implemented; these experiments do not establish that every earlier journey-quality problem is solved. Prioritize acquisition of useful rail access/egress before optional path refinements, especially the remaining Baden–Witikon case. Broader fares still need a validated tariff source. Browser preview infrastructure was unavailable, so no new browser visual QA is claimed. The existing large-bundle warning remains nonfatal. No new paid host or recurring job was created.

## 2026-09-28 — Zürich–Bern/Laax route-to-fare and malformed-tail regressions

**Reproduction:** Run `plan()` for Zürich HB–Bern and Zürich HB–Laax GR, posta, Baseline, balanced cycling, uncertain permission allowed, start 29 September at 10:00 Swiss time. Both fallback-timetable results produced “No exact itinerary match” from `/api/fares/quote`. Replacing only the Zürich/Bern coordinate evidence with OJP's returned centroids priced the same IC1 at CHF 36.20, isolating the cross-provider station-location bound. OJP configuration requests also exceeded their old five-second limit.

**Correction and checks:** A 500 m same-name station-identity bound fixes fare matching and prevents an OJP platform centroid becoming a disconnected duplicate station. Changed names, distant coordinates, times and journey references are rejected. Real road connector limits remain 250 m. Direct fare requests avoid a separate short status gate and contain only required stop/time/reference/coordinate fields. A regression with 500 cycling points verifies that incidental graph metadata never enters the request or changes its cache identity.

**Fresh live results:** Actual acquisition, solver, recommendation, fare-query and fare-row functions now return passenger CHF 36.20 for Zürich HB 10:31–Bern 11:28 and CHF 44.60 for Zürich HB 10:38–Chur–Laax 12:48. Both are full-fare adult OJP test supersaver estimates on 29 September. The original 10:07–12:18 Laax itinerary separately quotes CHF 45.40. Both searches retain these results when exploration reaches 90 seconds; a later Laax rail-exit query times out. These observations do not establish complete alternative coverage.

**Stationboard regression:** For A–B–C–D, malformed final station metadata, missing coordinates or missing arrival now retain usable B/C exits and one-boarding reachability. The last valid stop bounds the section instead of discarding all earlier stops. The category card now states the existing additional-time allowance dynamically; ranking remains unchanged.

**Release gate:** 195 app tests, TypeScript and frontend/Worker builds pass. Private version 28 published at 08:55:11 UTC, environment revision 3, source `070488a6cfb740b72e120950e1c411088d40bde3`. Browser sign-in was unavailable in the current browser session, so no browser interaction pass is claimed. The four-versus-eight-pair sampling comparison remains pending. [Full evidence and limits](OJP_ROUTE_FARES_2026-09-28.md).


## 2026-09-28 — Exact selected-trip fare reuse and assembled journeys

**Regression:** Re-searching the origin/destination for a selected itinerary can return a different set of alternatives, losing a valid priceable trip. Preserve complete OJP source trips during acquisition, retain provenance across graph merges and send only required unique sources to the fare handler. Unchanged trips require no new trip search. Combined journeys copy their exact service legs and validate connecting walks, including a connector from a third independent provider response.

**Automated gate:** 203 tests and TypeScript/frontend/Worker builds pass. Eight new regression cases exercise the full acquisition-to-fare path, separate server instances, exact raw trip/service preservation, subtrip coverage, different namespace prefixes, assembled leg IDs, transfer evidence/time limits, signatures/size/duplicate validation and changed service identity/time rejection. Mocked upstream requests assert zero OJPTripRequests for retained and assembled fares.

**Fresh live planner cases:** Baseline, balanced options, full-fare adult, second class, 29 September from 10:00 Swiss time. Zürich HB 10:31–Bern 11:28 returned CHF 36.20 with `retained`. Zürich HB 10:12–Chur 11:48 (IR35), then Chur Postautostation 11:58–Laax 12:48 (bus 81), returned CHF 45.80 with `assembled` from two retained source trips. Fare rows displayed the numeric passenger amounts. The bus reservation amount remains unknown. The first Laax harness run was interrupted by the execution environment; a fresh run completed its route-to-fare check. Both searches retained results when the 90-second exploration limit was reached, so complete alternative coverage is not claimed.

[Detailed implementation, final publication and live evidence](OJP_EXACT_TRIP_FARES_2026-09-28.md).

**Final-version targeted checks:** Version 30 priced the same IR35 plus the later 12:28–13:18 bus using three source trips at passenger CHF 45.80; a selected bus-only subtrip returned CHF 17.20. Both used `assembled`. The targeted combination explicitly supplied the existing walk source to the saved version-29 graph; the 203-test gate separately validates automatic walking provenance in current acquisition. [Sanitized evidence](experiments/exact-trip-fares-2026-09-28.json).


## 2026-09-29 — Parking-source audit and documentation refresh

**Question:** What can the current official parking source support for the next product milestone? Inspected the existing parser, server cache, map display and parking regressions. Performed one unauthenticated fetch of the official bicycle/car permalink at 08:46:49 UTC. The response contained 2,877 facilities: 1,608 BIKE and 1,269 CAR, without filtering out nearby-border coverage. No bicycle record had populated current or forecast occupancy; 435 car records had current estimated occupancy and 443 had forecasts. Bicycle operating-time structures occurred in 570 records, pricing models in 143 and traits in 303; presence is not validation. All bicycle records reported publicAccess=true, including a sampled badge-access station. Sampled zero tariff and midnight-to-midnight values require interpretation; no free/24-hour claim follows from them alone.

**Source review:** Verified the official combined-feed documentation, Zürich's municipal parking catalogue, OSM parking/shop/repair tagging and SBB access/subscription guidance. Municipal data supplies complementary destination coverage but explicitly lacks occupancy and can miss temporary closures. An available subscription does not guarantee a parking place. Directory pages are reference sources, not assumed bulk APIs.

**Outcome:** Documented a suitability/access-focused parking proposal and the requested order parking → shops/repairs → broader UI. Retained the separate-mode boundary for leaving a bicycle at a station and the outstanding routing reliability work. [Small audit artifact with method/source/hash](experiments/bike-parking-source-audit-2026-09-29.json) · [Parking proposal](BIKE_PARKING.md).

**Verification scope:** Documentation-only change. Check changed Markdown links, JSON consistency, current/historical status and the Git diff. No new application test/build result, feature implementation, data import into production or website deployment is claimed; the previous 203-test release gate remains dated 28 September.

## 2026-09-29 — Closest bicycle parking from the selected starting point

Implemented the requested small map-filter/closest action. Geographic ranking uses A across the whole loaded dataset, with a labelled straight-line result and no GPS request. 206 application tests and frontend/Worker builds passed, including three new ranking/input/tie cases. The hosted parking API returned 1,608 fresh facilities; the new calculation returned facilities 51 m from the stated Zürich HB start, 115 m from Bern and 51 m from Biel/Bienne. These are point distances, not navigable access or occupancy checks. Direct development-environment download timed out; hosted-source verification succeeded. Browser interaction QA was unavailable. [Exact inputs, results, limitations and publication](PARKING_FIRST_TRIAL_2026-09-29.md).

**Publication:** Private version 31 succeeded on 29 September at 12:50:32 UTC, environment revision 3, Site source `8161807bb274bfcbe4951d66156c87e56999299a`. All 133 application files match GitHub implementation `12e5a17034f6382032e8e3e82b8688775ef35e35`; later release-note edits do not change app source.

## 2026-09-29 — OSM parking and the ETH acceptance checks

The new Swiss OSM adapter imports 20,728 of 20,729 returned objects, excluding one disused record. It joins the official feed for map display and closest-to-A calculation. Seven new regressions cover the ETH points/areas and changed campus/start, unknown/restricted access, source identities/conflicts, Overpass partial responses, source isolation, stale expiry/cooldown and edge-cache reuse. **213 tests, 11 suites, zero failures/skips/cancellations**, plus frontend/Worker builds pass.

Owner-private version **32** succeeded at **14:28:31 UTC**, Site source `caf56444e9fb7af9e1e8f9a2ca074624f4357cbe`, environment revision 3. At 14:30:38 UTC, deployed endpoints returned fresh OSM (20,728) and official (1,608) records. Closest results: ETH Zentrum 42 m (OSM), ETH Hönggerberg 38 m (OSM), Zürich HB 51 m (official), Bern station 87 m (OSM), Biel/Bienne 51 m (official). These are straight-line distances from the exact documented public test points, not entry routes or available spaces. Browser visual/interaction QA is unavailable. [Inputs, object IDs, source hash and limits](PARKING_OSM_2026-09-29.md) · [Endpoint evidence](experiments/parking-osm-live-2026-09-29.json).

## 2026-09-29 — Parking browser-load failure diagnostics and cache correction

The owner's both-sources-unavailable report was not reproduced through authenticated API access: both endpoints returned fresh records at 15:05:06 UTC. The browser loader previously hid authentication, network, malformed-data and provider errors. Version 33 uses separate versioned paths, avoids browser response caching, validates shared cache records and displays specific errors with a deadline and bounded retry.

**220 tests, 11 suites, zero failures/skips/cancellations** and production builds pass. Seven new tests cover authentication/HTML, wrong-source recovery, incomplete JSON, HTTP Retry-After, body timeout/cancellation and legacy/mis-keyed cache rejection. Private version 33 succeeded at 15:11:50 UTC, Site source `774b1eff9a53e2d46f595181f277f2262bc633b1`, environment revision 3. [Live-loader verification and explicit browser-session limitation](PARKING_LOADING_2026-09-29.md).


## 2026-09-29 — Equipment colours and parking on the selected journey

**230 tests, 11 suites, zero failures/skips/cancellations**; TypeScript/frontend/Worker builds and whitespace checks pass. Ten new tests cover real ETH rack types and unknown/restricted/mixed data; point-to-segment and 100 m boundary checks; baseline access/egress and intermediate cycling; selected-result and cycling-only changes; rail/bus and unselected-alternative exclusion; missing/schematic walking paths, connector gaps and invalid points; closest-to-A within the filtered records. Journey timing and fare behaviour are unchanged.

The same downloaded Swiss OSM snapshot yields 4,351 wheel-only, 7,354 frame-support, 4,237 other and 4,786 unknown records, total 20,728. A synthetic 1,000-segment local Node scale check took 5.89 ms to index and 2.80 ms to filter; it is neither a real journey nor browser performance evidence. [Data](experiments/parking-colours-route-2026-09-29.json).

Private version **34** succeeded at **15:51:24 UTC**, Site source `b74ad2037d5d59ebe5fe621995b3e54856a33953`, environment revision 3. Browser visual/interaction QA remains unavailable. The next owner trial is a familiar ETH journey: compare rack colours, select another result, toggle the corridor and verify the closest label still references A. [Full behaviour and limits](PARKING_COLOURS_AND_ROUTE_2026-09-29.md).


## 2026-09-29 — Parking marker readability refinement

Following owner feedback, version 35 combines other/unknown equipment into grey and uses square P parking badges versus hollow-circle explored stops. Closest parking retains its equipment colour with a larger outlined P. **230 tests, 11 suites, zero failures/skips/cancellations**, TypeScript/frontend/Worker builds and whitespace checks pass. No additional unit tests were added for these display-only changes. Published at **17:03:36 UTC**, Site source `2a8cc24a9582d090f89489f88c1e6e8e62d754e3`, environment revision 3. Browser interaction/visual QA remains unavailable. [Details and next visual check](PARKING_COLOURS_AND_ROUTE_2026-09-29.md#version-35-marker-refinement).


## 2026-09-29 — Water/toilet map filters, source semantics and hosted loader

**245 tests, 11 suites, zero failures/skips/cancellations** plus TypeScript/frontend/Worker builds and whitespace checks pass. Fifteen new regressions cover real Swiss OSM fixtures, ambiguous/negative potability, inactive and invalid data, shared services, access/fees/seasonality, corridor/closest selection, caching/stale bounds, source/schema validation, sign-in/HTTP failures, retry/cancellation and body timeout. Parking classification cases include green bollards and handlebar holders.

Private version **36** succeeded at **18:02:13 UTC**, Site source `a0ac4ff86a2427387060adc0c1dbebe156015884`, environment revision 3. At 18:03:05 UTC the exact client loader accepted the deployed endpoint's fresh 38,552 records: 30,686 water and 8,216 toilet records, with 350 shared places. The uncached request took 32.55 seconds; no retry. Closest water/toilet distances from documented public starts: ETH Zentrum 40/32 m, Bern 159/38 m, Biel/Bienne 309/47 m. All are straight-line/area-centre distances, not entrances or current availability. [Live evidence](experiments/water-toilets-live-2026-09-29.json) · [Source audit](experiments/water-toilets-source-2026-09-29.json).

Browser visual/interaction QA remains unavailable; the authenticated Node check does not test the owner's browser session. Next owner task: enable Water and Toilets on a familiar journey, switch results, inspect water/access details and try each closest button. [Implementation and limits](WATER_AND_TOILETS_2026-09-29.md).


## 2026-09-29 — Repair/food data, subtype eligibility and adjustable distance

**258 tests, 11 suites; zero failures/skips/cancellations**, plus TypeScript/frontend/Worker builds. Thirteen new tests cover real Swiss records, strict service/vending rules, access and subtype-specific availability, all three corridor widths, clustering/ranking independence, food identity merge, safe contacts, fixed queries, cache isolation, bounded stale data and client validation.

The source audit found 2,425 repair records, 16,275 quick-food records and 32,196 dining records; the food sets overlap. Production handlers accepted the captured bodies under a 96 MiB Node old-space cap, which is not a Cloudflare memory guarantee. Browser interaction/visual QA remains unavailable. [Repair/food implementation and checks](REPAIRS_AND_FOOD_2026-09-29.md).


The post-publication exact-client checks returned HTTP 200 for repairs, quick food, optional dining and water/toilets. All were fresh, with no retries; the three new first-load durations were 24.01 / 18.44 / 18.29 seconds. [Hosted evidence](experiments/repairs-food-live-2026-09-29.json). This is authenticated endpoint validation, not browser UI testing.

## 2026-09-30 — Floor retention, reviewed additions and catalogue discovery

**Result:** Seven new facility-location regressions pass; full gate is 265 tests in 11 suites, with TypeScript and frontend/Worker production builds passing. Reprocessed captured Swiss regional data confirms retained floors, the single approximate HG report winning the closest-vending check at its building reference, and two intended Zürich HB OSM components receiving the SBB plan evidence. Local additions stay available when no OSM response exists. The normalised edge-cache version changes to prevent old stripped data from being reused.

**Source experiment:** Public CKAN searches/status requests returned HTTP 403; the cause is unknown. Directly following the catalogue’s SBB publisher resource succeeded: 63 station-plan features, 56,105 bytes, HTTP 200. The read-only catalogue helper passes offline smoke checks; successful live CKAN metadata retrieval is not claimed. The portal announces CKAN replacement around late 2026 / early 2027.

**Release and limits:** Private version 38 published at 08:18:00 UTC. Browser QA remains unavailable; no live entrance, indoor-route, stock or access-hour verification. [Facility report](FACILITY_LOCATIONS_2026-09-30.md) · [API investigation](OPENDATA_SWISS_2026-09-30.md).


## 2026-09-30 — Three independent facility sources

**Result:** 277 application tests in 11 suites pass, with TypeScript/frontend/Worker production builds. Twelve new regressions cover source coordinates, negative evidence, floors/identity, validity, conservative merges, malformed data, bounded TLM extraction, independent failures/stale data and client cancellation/concurrency. A live adapter audit returned **19/19 valid HTTP 200 results**: eight rural water pages, ten SBB station feeds (21 toilet + 234 food records) and 601 unconfirmed TLM water points. Counts do not establish uniqueness, physical availability or complete coverage. [Evidence](experiments/facility-sources-live-2026-09-30.json) · [implementation and missing work](FACILITY_SOURCES_2026-09-30.md).

No browser interaction or field test is claimed. No new fare/routing benchmark was run: journey calculation and OJP integrations were not changed. Live source checks are optional and separate from offline unit tests; no recurring workflow was created.

**Publication:** Owner-private version 39 succeeded at 13:22:19 UTC, environment revision 3, Site source `348a87e8d859d1d7df40b3ef818609cb6d0aab23`. All 163 current application files match GitHub implementation `becab48`; historical Site documentation snapshots are excluded.

**Hosted follow-up:** The version-39 checks passed 18 rural/station feeds but TLM archive loading timed out at 80 seconds. Version 40 replaces runtime archive extraction with a compact dated 601-point application index, preserves the import/edition dates and keeps all points excluded from closest drinking water. The maintenance importer remains bounded and was checked again successfully. **278 tests in 11 suites and production builds pass.** Owner-private version 40 succeeded at **13:34:20 UTC**, environment revision 3, Site source `73aa9b1dfbd4ee989e17b3d77824279287e53d23`; all **166 current application files** match GitHub implementation `53ef965e0e20a437431912042f8083ee7d823ad4`.

**Final hosted check:** Version 40 returned valid HTTP 200 data for all 19 endpoints, including 601 TLM points in 698 ms; root/new frontend control and rejection guards passed. [Dated hosted evidence](experiments/facility-sources-hosted-v40-2026-09-30.json).


## 2026-09-30 — Stable facility popups and fixed-transit detour previews

**Gate:** 290 tests in 11 suites pass; TypeScript/frontend/Worker builds pass. Twelve new deterministic tests use synthetic cycling sections and fixed service times. No live timetable, fare or route-provider request is made by the tests.

| Golden case (Europe/Zurich) | Expected result |
|---|---|
| Start 08:00; original bike 10 min; selected train 08:25; new bike links 8 + 7 min; visit 5 min | 08:20 ready, 3 min boarding buffer, 2 min spare; same services and original 09:10 destination arrival |
| Same section, visit 8 min | 1 min short after buffer; no substitute train and no promised new arrival |
| Intermediate bike starts 08:30; new cycling 15 min, visit 5, onward walking 5; train 08:55 | 3 min short after buffer; setting visit to 0 leaves 2 min spare |
| Egress after arrival 09:00; original bike 10 min; new cycling 15 + visit 5 | Destination 09:20 instead of 09:10; original transit untouched |
| Cycling-only ordered stages 20 + 30 min; replace first with 15 + visit 10 | Preserve required waypoint and second section; arrival shifts from 08:50 to 08:55 |
| Clicked popup; marker removed/redrawn; pointer leaves; viewport events fire | Independent popup stays open, explicit close control retained, long text height bounded |

Other checks preserve exact transit objects and original journey JSON, select a cycling section by full geometry, keep unknown onward details unknown, reject unavailable/blocked partial paths, abort between or during links, retain endpoint-gap disclosure and reject non-potable/restricted stops. Editing visit duration reuses the two route results.

**Release:** private version 41 succeeded on 30 September 2026 at 17:12:53 UTC, environment revision 3, Site source `c68854db9e257e97b6e9f891f01ab18283d234fd`. Browser interaction/visual checks are not claimed: the managed browser-control skill is unavailable. Live cycling-provider detours were not exercised. [Implementation and manual acceptance check](FACILITY_DETOURS_2026-09-30.md).


## 2026-09-30 — Review regression sweep, permission cache and engine fixture

**Offline gate:** 300 tests in 11 suites and TypeScript/frontend/Worker builds pass. Mixed rail/bus fixtures use non-station endpoints and parsed cycling durations; 84 per-case monotonic comparisons retain unreachable cases and reject truncated searches. Separate checks exercise pace changes, Baseline inclusion and replacing evidence with a prohibition after warming the cache. Mutation tests include nested source/conditions edits, `Date.setTime` and changed geographic rules. Knip is clean.

**Local diagnostics:** seven samples of 280 mixed-mode legs show median permission passes 5.59 ms uncached / 1.41 ms cached and cold/warm model comparisons 1.90 / 0.71 ms. These are synthetic local observations, not full-search speedups. [Raw measurements](experiments/review-permission-benchmark-2026-09-30.json).

**Local engine comparison:** MOTIS 2.11.3 and the current solver share a synthetic three-service fixture. Strict allowed and unrestricted prohibited winners agree; an unknown-permission winner disappears from MOTIS's unrestricted Pareto result, so postfiltering cannot implement our middle scope. One transit-stop via passes. Other migration criteria remain untested. [Raw result](experiments/motis-permission-pilot-2026-09-30.json) · [reproduction and limitations](REVIEW_IMPLEMENTATION_2026-09-30.md). No public routing API requests or Swiss live-provider retests were made.

**Publication confirmed:** Owner-private version 42 succeeded at 21:58:44 UTC, environment revision 3, Site source `c5ed6f1a3cdf392c727ad64492a6e43368eae4e6`. All 182 application files match GitHub `a97c872`; [automatic CI](https://github.com/Victorpolm/bike-train-planner/actions/runs/36782578264) passed. Browser QA remains outstanding.


## 2026-10-02 — Preset/profile compatibility and the Commuter boundary

Golden offline fixture in `prototype-v0/src/travellerProfiles.test.ts`: one routed bicycle access leg followed by a timed service. Both Baseline and Extended admit 45 minutes of access and reject 46 under the new Commuter total budget. The original 40/90/150 presets retain their limits; Bikepacking preserves the 24-hour horizon and confirmed scope. Multiple profiles roundtrip, trip edits do not mutate a saved profile, invalid data/storage errors are surfaced, and age does not imply fare discounts.

**Result:** 309 cases in 11 suites pass using `node --test --test-isolation=none src/*.test.ts` (sandbox child-process reporting returned file-level results under ordinary `npm test`). Build, format and unused-code gates pass. These are deterministic regressions, not 250 new live route queries. [UI manual checks and limits](INTERFACE_PROFILES_2026-10-02.md).

## 2026-10-02 — Two automatic cycling connections and placement constraints

**Authorised change:** Baseline 0 / Extended up to 2, plus beginning-only and end-only cycling. Tests in `prototype-v0/src/multipleCycling.test.ts` use synthetic services at Swiss coordinates and directed parsed road-route fixtures; they are not real timetable or price observations.

**Golden route:** service A–B, 5-minute cycle B–C, service C–D, 5-minute cycle D–E, service E–F. With a common 08:00 departure, zero transfers arrives after 130 minutes, at most one after 110, and two after 70. The complete chain uses 3 boardings and 10 cycling minutes. Baseline and one-transfer alternatives remain in the paired Extended result. A third transfer is rejected in both solvers. The second boarding after cycling accepts readiness exactly at 53 minutes and rejects a departure one second earlier. Cycling, per-leg, boarding and horizon budgets remain binding.

**Discovery regression:** the first onward through-journey query returns empty. A departure-board query at its cycling target discovers the middle ride, then a second round discovers the final transfer and service. This passes both without requested stops and with a stop at D; repeated Extended selection performs no extra requests and each case remains within 18 timetable calls. Separate tests cover all three permission scopes on all three rides, hard start/end restrictions independently of the ranking category, waypoint bypass attempts, walking at the restricted end and walking after final cycling without another boarding. A two-gap fare query is explicitly refused rather than quoting an unrelated transit trip.

**Verification:** 322 offline tests in 11 suites pass (`node --test --test-isolation=none src/*.test.ts`), with formatting, Knip and TypeScript checks. Existing one-transfer expectations and exhaustive-enumeration counts are updated to the new two-transfer model. Production build/publication evidence is recorded in [MULTIPLE_CYCLING_TRANSFERS.md](MULTIPLE_CYCLING_TRANSFERS.md). Browser interaction QA and live national performance/coverage tests remain pending; no performance multiplier, comprehensive coverage or live fare success is claimed.


## 2026-10-03 — Extended request recovery, later departures and city tariffs

**327 tests in 11 suites pass.** `searchReliability.test.ts` sends large enriched station geometry through the real OJP HTTP boundary: minimal stop serialization stays under 512 bytes and retains fare sources. A synthetic sparse-area case rejects the first four road paths over the five-minute budget, finds a fifth two-minute access path in the expanded pool and returns Extended transit. A timetable with departures +10/+40/+70/+100 verifies two More pages advance to +40/+70 without replacing earlier results or changing constraints. A separate prefix case includes five cycling plus two walking minutes and the boarding buffer exactly once. The existing two-transfer discovery case succeeds even after Baseline has consumed 18 calls; the new explicit action remains capped at 18. Stationary-connector fare tests accept only proven zero time/distance at the same stop and retain all positive/unknown-gap rejections.

Live 5 October departures checked on 3 October: Zürich–Laax Extended completed, More advanced 10:38→11:02 Swiss time, and all three Kunsthaus–Zoo category itineraries received ZVV quotes. ZVV full/Half Fare and a selected Libero bus segment also returned prices. One independent long cycling-only BRouter request failed; transit results survived. [Sanitized evidence](experiments/ui-routing-city-fares-2026-10-03.json) and [diagnosis/limits](SEARCH_RELIABILITY_2026-10-03.md). Exact user empty-stop input was not supplied; that specific case remains unconfirmed.

## 2026-10-03 — Hill-aware pruning, transit ascent optimization and applicable cycling edits

**Hypothesis:** carrying elevation resources through acquisition and label pruning retains useful lower-climb/gentler journeys; fixed-service cycling edits can be applied safely without another timetable query.

**Deterministic regressions:** slower low-ascent and gentler-but-higher-total-ascent paths survive a common-stop dominance test in both ordinary and ordered-waypoint solvers; a complete-elevation winner is selected without relaxing bicycle permission. Unknown terrain cannot masquerade as zero climb. Threshold-specific BRouter parameters/cache keys and a reserved low-ascent station query are verified. Editor cases preserve original transit object/fare-query identity and original route immutability; reject missed trains including walking/buffer, disconnected/stale routes, repeated split-section budget evasion and forbidden cycling ends; preserve ordered/repeated waypoint visits and cancel stale requests.

**Live golden journey:** Zürich HB (47.378177, 8.540192) → Zoo entrance (47.3841, 8.5738), 5 October 2026 at 08:00 Europe/Zurich, checked 3 October. Cycling-only: 45 min / 207 m ascent. Gentle 5%: 46 min / 207 m ascent, sampled maximum reduced about 14.2%→10.2%; still above the threshold. Least cycling ascent: tram 6, 26 min / 3 m ascent, three feasible journeys in the completed search. A real access-path edit applied in two pieces with unchanged transit object/fare identity and the same 26 min total. All 69 HTTP calls succeeded.

**Result:** 343 regression cases in 11 suites pass; `npm test` passes 40 test files. This bounded live case demonstrates functionality, not nationwide completeness or a hard slope limit. Browser drag/touch/keyboard acceptance remains pending. [Full report](HILLS_AND_CYCLING_EDITOR_2026-10-03.md) · [sanitized evidence](experiments/hills-and-editing-2026-10-03.json).

## 2026-10-03 — Station transfers and independent climbing propositions

**Golden regressions:** preserve the three main category winners when Reduce climbing is toggled for a fixed candidate set. A seven-minute sourced interchange accepts an onward departure after seven minutes, rejects six, and does not add three more. A later incoming service with a five-minute platform change survives pruning against an earlier service needing ten minutes. Exact operating-day/platform/time/coordinate scope, unknown durations, existing walks, first boarding, cycling editing and unchanged fare evidence are covered. OJP acquisition uses station arrival while fallback requests keep their buffer.

**Result:** 360 cases/11 suites, all 41 test files, formatting, Knip and production builds pass. Two live version-50 requests for 5 October 08:00 Swiss time returned access/interchange evidence and 6/4 feasible journeys: Rapperswil SG–Lausanne and Zürich Oerlikon–Bern. Actual platform times varied by connection; recombined unmatched pairs still used the labelled two-minute default. These checks establish parsing/application of available evidence, not complete station coverage or real-world bicycle accessibility. [Dated report](STATION_TIMES_2026-10-03.md) and [sanitized output](experiments/station-times-2026-10-03.json).

**Next:** desktop/phone familiar-station acceptance; import maintained platform-specific transfer rules before claiming exhaustive station timing.


## 2026-10-04 — Less cycling shares one total time budget

**Problem:** The UI promised up to 40 minutes total, but the preset also imposed 20 minutes per endpoint and 10 minutes per automatic cycling connection, excluding trips comfortably within the total.

**Method:** Three deterministic regressions in `prototype-v0/src/multipleCycling.test.ts` use synthetic services at Swiss coordinates and cached cycling paths. They run through the real preset and routing solvers. All three failed before the fix.

- Ordinary Baseline and Extended accept 30 + 5, 5 + 30, 35 + 5 and 5 + 35 minutes; reject 36 + 5 and 5 + 36.
- Extended accepts 5 minutes at the start, 25 between services and 10 at the end, but rejects a 26-minute middle ride because the total becomes 41. Baseline still excludes automatic cycling connections.
- Ordered-stop searches in both modes accept 30 + 5 and 30 + 10 across the visit, but reject 30 + 11. The total cannot reset at a requested stop.

**Result:** `npm test` passes 363 cases in 11 suites across 41 files. TypeScript, frontend and Worker production builds pass. The changed React component was formatted with the repository formatter. This focused change updates the Less preset and its inline explanation; existing budget enforcement and category ranking stay in place.

**Publication:** Owner-private **version 51** published on **4 October 2026 at 08:54:26 UTC**, environment revision **3**, Site source `4abecf29a21d8815bf01b53ecad5e72507e2553e`. All **208 current application files** match `feature/novice-interface-profiles`, which remains unmerged. **363 regressions** and TypeScript/frontend/Worker builds pass. Less cycling now shares its 40-minute total across all cycling sections, without the former 20-minute endpoint and 10-minute intermediate limits. Browser interaction QA remains pending.

**Limit / next step:** These are deterministic routing checks, not new live-provider coverage tests. Browser QA was unavailable. Try a familiar journey with an uneven cycling split under Personalized → Preferences → How much cycling → Less. Nationwide station-transfer coverage still awaits the separate lossless GTFS integration.


## 2026-10-07 — Verify the deployed station-transfer integration before synchronizing main

**Question:** Does the source deployed in version 53 preserve the approved UI and enforce imported platform minimums when exact OJP evidence is absent, and can it be copied back without unrelated changes?

**Source comparison:** All 208 existing application paths are present in Site commit `619bc7bb6814d69054e582b632a152a437adeba4`; nine are modified and six application files are added, yielding 214. Fifteen changed files are synchronized exactly. Site-only historical documentation snapshots and `SOURCE.md` are excluded. Base GitHub main is `ef18c8571cedfc67de272dfaf6c2c1688b9c0ea1`.

**Golden transfer regression:** In the deterministic A → Zürich HB → D graph, arrival at platform 41/42 at 08:10 Swiss time on 6 October and departure from platform 18 at 08:16 is rejected. Departure at 08:17 is accepted in both ordinary and waypoint solvers, with exactly seven walking minutes and unchanged fare identity. The shipped data resolves the exact Zürich pair to 420 seconds and the checked Bern 32 → 1 pair to 360 seconds. A later-arriving service with a shorter platform change survives dominance and catches an onward ride that the earlier arrival cannot.

**Additional retained regressions:** generated platform sectors and unknown/contradictory IDs; scoped importer exclusions and repeatability; walking counted once; exact OJP priority and unknown-duration rejection; context reset after cycling; Swiss-date expiry and changed-platform rejection; batches of at most 24 endpoints, cached successes and retry on a later action; hydration of the asynchronous planner before transit proposals are published. These nine cases are in `prototype-v0/src/staticTransfers.test.ts`.

**Verification on 7 October:** `npm test` passes **372 tests in 11 suites** across 42 test files (0 failed/skipped/cancelled). `npm run format:check`, `npm run check:unused` and `npm run build` pass. The build includes TypeScript and frontend/Worker production bundles. Vite reports its existing >500 kB frontend chunk advisory; it is not a build failure. No new browser interaction or live-provider route check is claimed.

**Deployment evidence:** Sites reports version 52 succeeded on 6 October at 21:00:13 UTC and version 53 at 21:04:31 UTC, environment revision 3. The synchronized app is the exact already deployed version-53 source; no new publication is needed. [Identifiers, data contract and limits](STATION_TRANSFER_RUNTIME_2026-10-06.md).

**Next:** complete the familiar-station desktop/phone acceptance pass, then resolve scoped service exceptions and maintain the dated feed. Offline passenger-minimum checks do not verify station pathways with a bicycle.


## 2026-10-07 — Arrive at and worthwhile climbing alternatives

**Implemented and verified offline:** 388 tests in 11 suites pass, including 16 new cases; React formatting, Knip and TypeScript/frontend/Worker production builds pass. Browser interaction and a new live-provider route check remain pending.

**Golden arrival case:** On 5 October, A → X → D → destination leaves A at 08:40, reaches X at 09:00, leaves X at 09:10, reaches D at 09:30, then cycles ten minutes. Latest origin departure is 08:37 and destination arrival is exactly 09:40 Europe/Zurich. An alternative reaching D at 09:31 is too late. Both ordinary and ordered-visit solvers retain the later-origin state at X. Exhaustive forward searches at every minute agree across Baseline/Extended, with/without a required visit, and three cycling budgets.

**Golden climbing case:** A = 120 min / 600 m, B = 130 min / 300 m, C = 149 min / 0 m. A retains Fastest and B wins Reduce climbing: scores are -5 and -1 minutes for B/C. A 30 → 10 m saving cannot create the category. Absolute, percentage, time, score-tie and unknown-elevation boundaries are covered.

**Other regressions:** exact platform seconds; final-cycle deadline; first-bike prefix through a waypoint; earliest departure/horizon/placement/boarding caps; OJP Destination time and direction-separated caches; both public fallback parameters; reverse stage acquisition; Swiss rounding; cycling-only reference timing; cycling edits rejected when late. The received provider graph is still bounded and sampled. [Complete contract and remaining limits](ARRIVAL_AND_CLIMBING_2026-10-07.md).


## 2026-10-07 — ETH HG–Stadelhofen simplicity and historical time controls

**Hypothesis:** Comparing two similarly biased trekking routes and counting continue-straight notices makes Simplest miss an obvious street route.

**Live method/result:** BRouter 1.7.10, representative ETH HG building point → existing Stadelhofen anchor, production query settings. Both old client requests return the same 1,774 m geometry with 16 actual turn/fork decisions and a mapped stair segment. The new road-oriented bicycle candidate is 1,551 m with 11 decisions and no mapped stairs; both estimate eight minutes at a 15 km/h flat-ground pace. The actual selector chooses it. A bounded OSM map read matches about 334 m to named Rämistrasse road ways. This is a corridor reproduction, not the user's exact entrance pin or a globally optimal route.

**Regression evidence:** 395 cases in 11 suites pass, including seven added cases. Fixtures preserve raw responses and request parameters. Tests distinguish turns from continue/off-route/endpoints, keep bad hints unknown, check restricted-road flags, allow a 12-second candidate, and preserve the primary on failure or a worse alternative. With the clock frozen on 7 October, both departure and arrival searches for 5 October return the historical journey and retain the selected time. The arrival test omits an injected earliest start, exercising the real historical lookback.

**Interpretation:** Candidate diversity fixes the reported corridor; the ordinary path remains a fallback. Historical date entry already worked and is now explicitly covered in both directions. Browser QA is still pending. [Full evidence, source references and release](SIMPLE_ROUTES_AND_TIME_CONTROLS_2026-10-07.md).

**Next:** verify the compact controls on a phone and inspect the selected Rämistrasse/pushing/station-access sections in the owner's browser.

## 2026-10-07 — Walking endpoints and independent city passenger fares

**Golden journey:** Cycle 5 minutes to A, board at minute 10, alight at B at minute 30, walk 12 minutes to an address: arrival 42, cycling 5, walking 12. A five-minute cycling budget remains valid. Arrive-by 42 permits latest start 2 with the boarding allowance; arrive-by 41 rejects it. The reverse placement walks 6 minutes to A, then cycles 5 after transit and arrives at 35; latest origin start is 1. A bicycle-prohibited tram is eligible only when the bicycle stays off or the user explicitly requests the comparison scope.

**Ordered case:** After transit, walk 4 minutes to a requested visit, 3 minutes to another stop, take the next service, then walk 5 minutes to the destination. The actual query uses the walking state's reached time. A tempting one-minute bike link after leaving the bicycle is rejected. End-only walking prefixes and arrival seeds also retain ordered visits.

**Observed:** OJP test quotes independently returned CHF 4.70 for Zürich Platte–Zoo on Tram 6 and CHF 5.20 for Bern Markuskirche–Länggasse on B 20 for 8 October. Both retained exact selected-leg evidence and omitted a bicycle product. The 661.1 m Stadelhofen pedestrian fixture produces a ten-minute application estimate including connectors. See [exact services, timestamps, source links and limitations](WALKING_ENDPOINTS_AND_CITY_FARES_2026-10-07.md).

**Verification:** 409 tests in 11 suites pass, including 14 new cases. TypeScript/frontend/Worker builds, Knip and React formatting pass. Browser QA is pending. Next manually check both placement modes, bicycle checkbox, address walking and arrival deadline on a phone, then inspect the actual station parking/access.

## 2026-10-08 — Journey views and origin waiting

**Implemented:** Three phone views and a desktop Map / Journey switch; clear origin departure, final arrival and duration. [Detailed contract](JOURNEY_VIEW_AND_TIMING_2026-10-08.md).

**Golden regression:** Ready at 09:00 Swiss time, 10-minute cycle, train 09:30–10:00, 5-minute final cycle, 3-minute boarding allowance. Suggested departure 09:17; arrival 10:05; on-journey duration 48 minutes; origin waiting 17 minutes; request-to-arrival 65 minutes. A later service's shorter duration cannot beat the earlier arrival in category selection.

Nine new regressions cover this case, preserved connection waits and time decomposition, exact 241-second OJP access (materialized/unmaterialized), fixed provider walks, prefix waypoint retiming, pedestrian access, unknown readiness, historical/overnight times and an access edit using available origin slack. Fixed service object/fare identity and raw search immutability are asserted. Existing arrival-search editing remains unchanged.

**Gate:** 418 tests in 11 suites; TypeScript/frontend/Worker builds, formatting, Knip and whitespace checks pass. Browser/phone interaction QA and new live timetable observations are not claimed. The site preview's required control-browser capability is unavailable in this session. This is an interface and checked scheduling release, not a new provider or objective-ranking release.

## 2026-10-08 — Objective-aware routes and proportional boarding compromises

**Golden ranking fixture:** 120 minutes / 3 boardings, 134 / 2 and 178 / 1 yield weighted scores 180, 174 and 198 with 20 minutes per boarding. The cap is min(30, 0.25 × 120) = 30 extra minutes; 134 / 2 wins. A 40-minute reference permits 10 extra minutes; the exact boundary qualifies and a one-second excess does not. Long trips retain the 30-minute ceiling. Arrive-by regressions rank earlier-departure loss, not a misleadingly short displayed duration. These are controlled fixtures, not live Zürich–Laax reproductions.

**Routing/dominance evidence:** Reservation-free and unpriced cheaper prefixes survive a common onward service in Baseline/Extended and ordered visits. Least cycling can preserve a route with more walking. Traffic resources survive convergence; unknown coverage cannot win. The actual API refresh keeps a five-minute ordinary access that catches a service and rechecks a six-minute lower-traffic alternative against the three-minute boarding allowance; the latter must catch a later service (45 versus 40 total minutes). Normal routes and permission scopes survive the optional comparison. Exact-edge reuse protection bounds zero-time cycles when fare histories are retained.

**Fare/evidence fixtures:** Partial or missing fares never win; complete passenger+bicycle+reservation totals, profile and bicycle-custody differences are respected. Up to eight distinct queries are acquired from the retained pool, including routes that are not ordinary card winners. Card and objective requests share one cache/serialized request. Unknown/prohibited reservation requirements cannot become zero; passenger-only journeys need no bike reservation. A mixed fixture exercises all six objectives within the existing label/resource limits.

**Verified gate:** 437 tests in 11 suites pass (19 new objective regressions), plus TypeScript/frontend/Worker builds, Knip and React formatting. The same tested source was packaged and published as owner-private version 58. No fresh provider call or browser/phone interaction is claimed. [Detailed contract, release IDs and manual next checks](JOURNEY_OBJECTIVES_2026-10-08.md).

## 2026-10-08 — Five-hour boarding trade-offs at 30 minutes each

**Golden cases:** Against 300 minutes / 4 boardings, 329 / 3 and 359 / 2 win; 330 / 3 and 360 / 2 tie the weighted score and retain the faster reference. 375 / 1 wins despite being outside the unrelated +60-minute window. 375 minutes + 1 second / 1 fails the 25% ceiling. A 40-minute reference still permits only ten extra minutes. The earlier 120/134/178 fixture still selects 134 / 2 with the updated 30-minute penalty.

**Routing:** A synthetic four-service five-hour path and one-service 375-minute path are solved in both Baseline and Extended under confirmed, allow-uncertain and all-transit scopes. The direct long compromise survives and wins with +75 minutes. Arrival-mode fixtures permit leaving 75 minutes earlier, reject 76 minutes earlier, and reject a superficially attractive alternative that misses the arrival deadline.

**Isolation:** The long candidate gains only the Fewer boardings category. Least cycling and complete checked-price comparison keep their general window; fare sampling does not acquire the out-of-window candidate. These cases protect against accidentally broadening other preferences while removing the fixed boarding cap.

**Verification:** 441 tests in 11 suites pass, including four added objective regressions; TypeScript/frontend/Worker builds, Knip and React formatting pass. The exact tested source was published as owner-private version 59. No new live-provider, browser or phone result is claimed. Next compare the trade-off on a familiar long trip. [Implementation and release](JOURNEY_OBJECTIVES_2026-10-08.md).

## 2026-10-09 — Update-review regression cases

**Reservation golden cases:** Required bicycle reservations followed by VB/VC/VI/VK/VT/VN remain required; a prohibition still wins permission. Summaries and fewer-reservation ranking retain the requirement. Contradictions within one response or across successive responses remain unknown, keep a conflict notice and cannot qualify as complete checked-price or known-reservation winners. Published operator reservation defaults apply only when the dated reservation field is absent, not explicitly unknown.

**Transfers:** The bundled feed gives missing-platform station maxima of 180 seconds at DIDOK 8503001 and 240 seconds at 8502113. A two-minute change at Zürich Altstetten fails both solvers; three minutes succeeds and is counted once. Existing walking is subtracted. Tests reject conflicting stations, unknown references, unmatched/changed platforms and expired editions; existing exact Zürich/Bern and OJP-priority cases still pass.

**Recommendations and pace:** A gentle-slopes search with incomplete elevation and no priced alternative produces zero cards but an explanatory notice; a later eligible batch clears it. A 75-minute boarding window is disclosed alongside the other categories' 60-minute window. Offline 10 versus 30 km/h changes train-catching feasibility in both solvers; a missing routed path remains unavailable at either pace.

**Fares:** Four distinct pending visitors and one duplicate complete with one upstream call at a time; a fifth distinct quote receives bounded overflow. Cached reuse makes no new calls. Queue cancellation, the total deadline and provider cooldown are covered.

**Verification:** 452 tests in 11 suites pass, including eleven new cases; TypeScript/frontend/Worker production builds, formatting and Knip pass. Published as owner-private version 60. The supplied review's independent corridor/stress figures were not rerun without its external harness; no new live-provider/browser validation is claimed. [Fixes and next realtime contract](UPDATE_REVIEW_FIXES_2026-10-09.md).


## 2026-10-09 — Realtime, persistent maps and EPFL–Basel ordering

**Hypothesis:** Different cycling candidate acquisition explains Fastest losing to Simplest; repeated downloads and repeated option metrics contribute to latency.

**Method/result:** Common route candidates now satisfy Fastest ≤ Simplest at 15/20/25 km/h on recorded EPFL–Basel BRouter data. A 240-candidate ranking benchmark using 2,033 elevation samples per endpoint improved median 216.1 → 172.9 ms over seven measured runs, identical proposals. The small solver fixture was already a few milliseconds and showed noise; no general end-to-end improvement is inferred. Cache tests prove reload/pref-switch reuse, invalid/expired-data rejection, coalescing and independent cancellation.

**Realtime:** Both solvers reject missed delayed connections and cancellations while exact scheduled identities survive. Deployed Zürich–Bern IC1 on 9 October returned scheduled 16:32:00–17:28:00 UTC and estimates 16:32:30–17:28:48 in connections and TripInfo, with 12 retained fare sources. Platform/cancellation scenarios are regressions rather than observed live disruptions.

**Gate/limits:** 468 tests, TypeScript/frontend/Worker builds, formatting and Knip pass; private version 61. Exact original 6:46/7:04 profile/coordinates and browser/phone acceptance remain pending. Cold upstream work is still bounded, sampled and potentially slow. [Fixtures, reproducible benchmark, protocol and release evidence](REALTIME_AND_SPEED_2026-10-09.md).


## 2026-10-10 — Foreground GPS lifecycle, progress and constrained replanning

**Method:** Inject deterministic location callbacks, browser errors and wake-lock promises. Use straight, looped, crossing and mixed bike–transit fixtures with requested visits, live delay/platform updates and newly inserted platform walking. Check Stop/hide/restart races and long-gap reacquisition.

**Result:** Twenty new navigation regressions pass. The full suite passes **488 tests in 11 suites**. A halfway access fix halves the routed portion's remaining time; an extra live five-minute platform walk remains in readiness. Instant position jumps do not skip ahead, while plausible travel during a 20-minute hidden interval can reacquire on the same stage. An unmapped 100 m endpoint retains 1.5 minutes of conservative access allowance. Recalculation keeps an unconfirmed visit even when GPS is at it, subtracts prior cycling/boarding usage, rejects stale data and blocks unsupported bicycle-custody changes. Scheduled service identity remains intact.

**Interpretation / limits:** Pure model and lifecycle correctness is checked; physical GPS, real battery use, phone layout and browser permission/embedding behaviours still require acceptance. No full live-search or on-device speed benchmark is claimed. Complete the [short ride acceptance](GPS_JOURNEY_FOLLOWING_2026-10-10.md) next.
