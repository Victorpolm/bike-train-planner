# Route-to-fare correction — 28 September 2026

The reported Zürich–Bern and Zürich–Laax passenger-price failures were reproduced through `plan()`, using the app's default Baseline, balanced cycling and uncertain-permission settings. The resulting `fareQuery()` requests both returned HTTP 200 with `status: unavailable` and “No exact itinerary match”. The keys were valid; the failure was inside itinerary matching.

## Cause and correction

The fallback timetable places Zürich HB at 47.377847, 8.540502. OJP's station location varies with the platforms in its response; the observed coordinates were more than 300 m away. The fare matcher required cross-provider coordinates within 150 m even when station names and all scheduled train times agreed. Replacing only coordinates in the failing Zürich–Bern request returned CHF 36.20, isolating this cause without changing the selected train.

- Match different provider stop IDs only when normalized station names agree, coordinates are within 500 m, and every leg's scheduled departure/arrival agrees. An available OJP journey reference must still match. Different stations, distant points, changed times and changed services remain rejected. No legacy-ID-to-SLOID arithmetic is used.
- Reuse an existing station node in the OJP routing adapter under the same 500 m station-identity bound. A fresh search exposed the old 250 m bound creating a second, disconnected Zürich HB node at an unroutable platform centroid. Exact OJP platform/service references remain on the leg. This does not increase the separate 250 m road connector limit or change boarding buffers.
- Increase the OJP configuration check from five to fifteen seconds. Actual hosted status replies took approximately 7–8 seconds in these probes. Before the change, the planner silently selected the fallback timetable.
- Send fare requests directly; their endpoint already reports missing configuration. Remove the additional five-second fare-status gate. Use the existing AbortController-based HTTP helper for POST requests and OJP calls, preserving body-read deadlines without depending on newer `AbortSignal.any/timeout` browser APIs.
- Serialize only latitude and longitude from graph stop objects. Complete cycling geometry and volatile access-cache timestamps do not belong in an 8 KB fare request or its cache identity. Retain successful quotes for five minutes and unsuccessful checks for thirty seconds, measured after completion.

Fare matching still requires the complete transit itinerary. Intermediate cycling interruptions are not silently priced as another all-transit journey. No change to fare eligibility, reservation rules, purchase functionality or secret handling is included.

## Live route and price checks

Travel date **29 September 2026**, requested departure **10:00 Europe/Zurich**, one adult, full fare, 2nd class, bicycle accompanying the traveller. These are **OJP test estimates**, including named supersaver offers, not verified production purchase prices.

| Flow | Exact selected transit | Passenger | Provider bicycle ticket |
|---|---|---:|---:|
| Original failing fallback query, replayed unchanged after correction | Zürich HB 10:31 → Bern 11:28, IC1 | CHF 36.20 | CHF 26.50 |
| Original failing fallback query, replayed unchanged after correction | Zürich HB 10:07 → Chur 11:22; bus 81 11:28 → Laax GR, posta 12:18 | CHF 45.40 | CHF 29.60 |
| Fresh `plan()` search with OJP active and corrected station identity | Zürich HB 10:31 → Bern 11:28, IC1 | CHF 36.20 | CHF 26.50 |
| Fresh `plan()` search with OJP active and corrected station identity | Zürich HB 10:38 → Chur 11:52; bus 81 11:58 → Laax GR, posta 12:48 | CHF 44.60 | CHF 29.60 |

Both fresh searches used live nearby-stop, road/terrain and timetable acquisition, the actual solver, category selection, `fareQuery()` and `fareRows()` presentation model. Both produced a numeric Passenger row. The final compact requests were also replayed against the final publication. For Bern, the existing fare presentation selects the reviewed CHF 15 bike day pass instead of the more expensive provider bike ticket. Laax's reservation amount remains unconfirmed and is not included in a fabricated total.

The two Laax amounts concern different departures. Neither is a permanent tariff. [Sanitized exact requests and responses](experiments/route-fares-2026-09-28.json) preserve the distinction.

The searches reached their existing 90-second exploration deadline while retaining a valid priced route. The Laax search encountered a later OJP rail-exit query timeout after its useful IC3/bus result had been acquired. This correction does **not** establish complete alternative coverage or optimal routes. Browser interaction was not verified: the available cloud browser reached the private Site's sign-in form without an authenticated owner session. The checks above exercised the real application modules and hosted endpoints, not a browser-rendered screen.

## Other approved review corrections

`addStationboard` now chooses the last stop with both a usable station and a valid arrival. Missing final-station metadata or coordinates no longer discard valid earlier exits. The regression verifies retained B/C exits and one boarding when D is malformed.

The least-cycling/walking category now states its additional-travel allowance on the card, using the search's actual value (normally 60 minutes). Its existing optimization rule is preserved. The four-versus-eight-pair sampling experiment remains unperformed; no sampling cap or upstream request budget was increased.

## Verification and publication

- **195 application tests pass**; TypeScript, frontend and Worker production builds pass.
- Seven new regressions cover malformed stationboard tails, large-station fare matching and refusal boundaries, graph station identity, slow OJP status, compact/stable fare payloads, browser-compatible POST requests and response-body deadlines.
- Existing owner-private Site **version 28** succeeded at **08:55:11 UTC**, environment revision **3**.
- Site source: `070488a6cfb740b72e120950e1c411088d40bde3`.
- Version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_7d1918de83c48191963091cfaa72612b`.
- Deployment: `appgdep_6aba2b5cb7a081919886527f5ce7aafa`.
- Owner-only access rechecked; no public access, new hosting, spend, recurring job or credential extraction.

Next: check the same routes with the user's exact date/profile in the browser, then address exploration latency separately from pricing.
