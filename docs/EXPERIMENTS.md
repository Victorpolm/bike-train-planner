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
