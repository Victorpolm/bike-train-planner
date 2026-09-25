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
