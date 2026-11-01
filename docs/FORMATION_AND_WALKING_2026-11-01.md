# Formation evidence and independent walking budgets — 1 November 2026

## Delivered

Owner-private Re.route **version 79** was published at **14:17:29 UTC** from Site source `b44060286ceb57a39df9ebce59a93a6f95bd134a`, deployment `appgdep_6ae749e9c2ec8191bac526589f010378`, environment revision **4**. The existing audience, URL, other runtime keys and paused automations are unchanged.

The new formation key works. The Site stores it as `OJP_FORMATION_KEY`; the server accepts both that existing name and the owner's requested `API_FORMATION_KEY` (preferred if both exist). No key value was read, copied, logged or committed. Production requests returned HTTP200 and matched bicycle coaches for **IC 904 Zürich HB–Bern** and **RE37 / train 4826 Zürich HB–Aarau** on 1 November.

## Bike permission and reservation decisions

Trusted OJP `TrainNumber`, operator, operating day and journey reference identify the formation request. They are read from provider data, never guessed from opaque journey IDs. Exact station names and scheduled times identify the boarded interval; internal formation UICs establish vehicle boundaries.

- Today: `formations_full`; when that endpoint cannot serve the train (including the observed HTTP400), try `formations_stop_based`.
- Next three days: `formations_vehicle_based`. Other dates and unsupported/absent operator/train identities get specific explanations.
- Explicit bicycle pictograms, hooks/platforms and CUS `VH`/`VR` symbols can confirm a usable through coach. Closed, detached and stabled coaches do not authorize carriage. Evidence must cover the whole selected section using vehicle boundaries, explicit vehicle destinations, or a consistent numbered coach.
- Grouped CUS offers are parsed, with explicit position mapping to through vehicles. **Observed RE37 data contains VH symbols while the FOS equipment booleans/counters are false/zero.** False equipment defaults are not a bicycle prohibition.
- `VR` establishes a reservation requirement for the usable bicycle choices on the section. Ordinary bike provision alone does not establish an exemption. Dated OJP conditions and reviewed operator/calendar rules remain separate inputs.
- Explicit prohibitions, international-only conditions, conflicting requirements and bike-type/packing/trailer restrictions retain priority. A passenger-seat R is not a bicycle R. Formation-only conclusions expire after two minutes instead of becoming permanent timetable evidence.
- Up to three services per connection response are enriched before permission filtering; selected TripInfo and visible realtime refresh perform further checks. Remaining candidate services are not claimed to have been formation-checked.

The UI retains bicycle/crossed-bike/bicycle-R indicators, explains why a formation check is missing or failed, links its source and shows available bicycle coach numbers. No available-capacity claim or booking is made.

The server uses fixed provider URLs, server-only Authorization, manual redirect rejection, a two-megabyte body cap, bounded request/stream deadlines, 30-second bounded response caching and the existing shared D1 per-key quota gate (at most 40/minute, conservative 20,000 rolling daily cap). Auth/provider errors never expose response diagnostics or keys. Full/stop fallback uses the same metering. The source register now has 18 sources.

## Cycling and walking accounting

A cycling path's elapsed time previously included riding, walking connectors, pushing and carrying, and was all charged as cycling. This rejected **five riding + three walking minutes** under a five-minute cycling cap and incorrectly let it meet an eight-minute cycling minimum.

Shared accounting now separates riding and walking while retaining the complete elapsed duration. Cycling minima/maxima and access/egress/intermediate cycling caps consume riding only; mixed-path walking uses the independent walking allowance. Timetable queries, boarding, visits, arrival deadlines and horizons still include all elapsed time. The correction covers ordinary and waypoint solvers, geographic acquisition bounds, pair filtering, metrics/ranking, reference warnings, manual and official-route edits, and navigation budgets. Routes without a usable walking breakdown retain conservative legacy cycling accounting.

Fixed provider station transfers remain governed by their own timing/platform evidence. Explicit pedestrian endpoints remain independent of cycling. This change does not expand the ordinary anywhere-cycling search into optional pedestrian alternatives.

## Verification and observed boundaries

- **719 JavaScript tests** in 11 suites: zero failures (`node --test --test-concurrency=4 src/*.test.ts`).
- **16 Python tests**, TypeScript/frontend/Worker builds, formatting, unused-code analysis and whitespace validation pass.
- **64 actual React panels**: preferences19, facilities6, continuity7, quality/formation26 and sources6. These are rendering/content checks, not browser/phone acceptance.
- Golden cases: five riding + three walking fits cycling cap 5 and walking cap 3, fails walking cap 2 and cycling minimum 8, and still misses a train one minute too early; baseline/extended, ordered visits/arrive-by, pushing/carrying, an intermediate connection, edited-route catchability and navigation budget deductions.
- The existing real-parser111 m access-gap regression now enforces cycling cap 20 with22 elapsed access minutes; it retains the query at08:25 and the correct55-minute journey.
- Formation regressions cover exact identity/date/section, closure/detachment/stabling, partial coach journeys, passenger R, group offers, observed RE37 tokens, vehicle destinations, stale evidence, conflict/prohibition precedence, secret aliases, metering/cache, redirects, unresolved providers, and full→stop fallback.
- Hosted14:17:59 connection search: eight service legs, no OJP warnings; IC904 and RE37 matched formation provision (HTTP200), S26 had no usable bike-coach evidence. The selected IC904 TripInfo also matched the formation. Its published14:32/15:28 UTC timings carried estimates+30/+48seconds.

**Reservation limitation:** the IC904 live sample still labels the service only “IC”; its ordinary VH formation does not identify a reservation exemption. The app keeps that reservation question unresolved. Bicycle-R handling is regression-tested; a new production VR sample is not claimed. Operators/modes outside the rail formation feed continue to use dated OJP and reviewed operator rules. S26's absence of formation bike evidence is not treated as a ban.

**Verification limitation:** the supported browser preview infrastructure was unavailable, so interactive browser/phone checks remain unverified. The existing private deployment itself succeeded. No claim of perfect national coverage, physical space availability, booking or public launch is made.

**Next concrete check:** compare a known reservation-compulsory live train's bicycle-R/coach display against SBB, and resolve services that publish an incomplete line label without guessing.

Primary sources: [Formation cookbook](https://opentransportdata.swiss/en/cookbook/realtime-prediction-cookbook/formationsdaten/), [official OpenAPI schema](https://github.com/openTdataCH/api-explorer/blob/main/public/openapi/formation/openapi.template.yaml), [official formation viewer/parser](https://github.com/openTdataCH/train-formation-view/blob/main/src/app/services/formation.service.ts), [API limits](https://opentransportdata.swiss/en/limits-and-costs/). [Sanitized production evidence](evidence/formation-walking-2026-11-01.json).
