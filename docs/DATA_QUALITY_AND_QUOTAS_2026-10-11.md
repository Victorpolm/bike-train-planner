# Shared quotas, maintained transfer feeds and fare/data corrections

11 October 2026. Owner-requested implementation of gap-list items 4 and 6, including the Zürich–Laax bicycle-price defect. Switzerland-first; owner-private publication. Official-route suggestions remain a design proposal.

## Delivered behavior

- **Shared OJP/OJP Fare admission:** D1 transactions coordinate all Worker instances and both handlers by a SHA-256 digest of the actual upstream key. Each real upstream call consumes a permit, including itinerary fallback, filtered checks, passenger/bicycle quotes and failed attempts; local cache hits/coalesced subscribers do not. Admissions are at least 1.5 seconds apart per key (below the published 50/minute). The current and previous 24 hourly buckets conservatively cap rolling 24-hour usage at 20,000 without assuming the provider's reset timezone. Storage failure fails closed; shared provider cooldown, cancellation, bounded local queues and Retry-After remain explicit. No journey data or raw token is stored in D1. Calls made with these keys outside this app are not observable; other public map/timetable providers retain their existing provider-specific controls. The owner should confirm the issued-key allowance before widening access.
- **Maintained transfer feeds:** `.github/workflows/refresh-transfers.yml` checks the official published GTFS catalogue on Tuesdays and Fridays, plus manual/code-change runs. It downloads temporary ZIPs, compiles compact general-rule indexes, validates dates/schema/size and SHA-256, then commits only compact indexes and a manifest. A failed refresh preserves previous data and produces a failed Actions run. It retains the previous/current/next annual editions and removes superseded compact assets. No bulk CSV/ZIP is committed.
- **Runtime selection:** operating-day-aware endpoint/cache keys select a valid annual feed. The Worker checks the fixed project-owned public manifest at most every six hours per isolate, verifies index hashes and decoded structure, and retains bundled 2026 data on failure. A valid bundled lookup does not wait for manifest refresh. Missing/expired coverage is explicit; the existing exact OJP timing and labelled fallbacks still apply. Existing undated tabs keep the bundled edition. Data refreshes do not require a Site redeployment.
- **Bicycle fares:** ordinary domestic PostBus and RhB journeys now participate in the reviewed day-pass comparison. SBB/PostBus connecting services require a single CHF2 through reservation where their dated requirements establish one. Bike-pass coverage, GA coverage and reservation-price applicability are separate. Unknown requirements, other operators, special/replacement services and interrupted bookings retain explicit uncertainty.
- **Current tariff:** CHF15 day pass until 12 December 2026; CHF16 from 13 December 2026 within the reviewed tariff period. Thus a covered 2026 through journey with the CHF2 reservation has known bicycle cost CHF17. The app does not hard-code a Zürich–Laax total or claim that every departure has identical conditions. A cheaper eligible route ticket is still compared; a day pass ends at 05:00 the following day.
- **Passenger-fare reliability:** reviewed ZVV/Z-Pass standard fares take priority over experimental OJP quotes. Those covered corridors no longer spend an extra API request fetching a test quote. Other returned prices retain test-estimate provenance; missing prices are not fabricated. The documented unreliable OJP product2361 is excluded, and the `secondClass` request enum has been corrected.
- **Permission evidence:** known numeric OJP operator references are normalized at the provider boundary. An explicitly missing reservation note can use a narrowly reviewed operator default; explicit conflicts and unclassified unknown conditions remain unknown. Exact imported SLOID/DIDOK station mappings can establish the existing reviewed domestic applicability, without treating every `ch:1:sloid` as Swiss territory. Mapping changes invalidate cached permission assessments.
- **Corrections and calibration evidence:** journey details have a collapsed Data quality and corrections section. Download an allowlisted JSON report containing selected public-transport services/times, fare profile, prices/provenance, permission/transfer evidence and optional observations/actual cycling minutes. No automatic submission, raw retained XML, route geometry, GPS history or saved places. This collects useful evidence; it does not automatically recalibrate speed assumptions.

## Actual refresh evidence

[Refresh run 38143011011](https://github.com/Victorpolm/bike-train-planner/actions/runs/38143011011) succeeded. It committed compact data at `72f5f5eca994f153cd5d7da42082767932936853`.

| Feed | Validity | Packed bytes | Packed SHA-256 |
|---|---|---:|---|
| GTFS_FP2026_20260930 | 2025-12-14 through2026-12-12 | 1715971 | 9f5b2ecf7a071f67ee3c0aebe00b0513b608b5811d1d3620c05b80153953375f |
| GTFS_FP2027_20261007 | 2026-12-13 through2027-12-11 | 1261886 | a007eac0cc45ec1b05a501d9a838fed5965ab3ad7e46328ed68c075356c473a3 |

The first API-based metadata attempt returned403. The final implementation uses the catalogue's advertised public download links; actual archive acquisition/import then succeeded. Catalogue metadata alone was not counted as a successful import.

## Remaining data dependencies and useful owner help

Item6 is a continuing data-quality program, not a claim that incomplete upstream data has become complete. Production-grade national passenger fares require provider access: official OJP Fare documentation still describes test/integration data, and NOVA production access needs agreement with its product team. Contact `opendata@sbb.ch` about production fare access and missing dated bicycle attributes. No email was sent. Do not share API secrets in reports or screenshots.

Useful examples are the exact journey date/time/services, adult full/Half Fare/GA and annual-bike-pass settings, plus the current SBB offer/conditions. The new report makes those references easier to provide. Actual ridden time, excluding stops/waiting, helps cycling calibration; entrance/lift/stair/closure observations help field verification.

Service/route/calendar-specific GTFS exceptions remain excluded until exact service identity/date matching is implemented. The same applies to verified bicycle-accessible station pathways and field-confirmed facility availability. Importing scoped exceptions as universal minima would be incorrect. Live bicycle-space inventory and booking remain separate.

## Verification

Initial owner-private **version 70** published successfully on 11 October 2026 at 13:37:55 UTC, environment revision 3, from Site source `e9240c9079d80f8e9afa34849b4b2d2766bb5beb`. The frontend/Worker archive and schema-only D1 migrations were applied. Database overview confirms the `DB` binding and `api_quota_clock` / `api_quota_hours` tables. Live requests populated two hashed-key counters with two provider calls each.

**634 JavaScript tests in 11 suites**, **16 Python tests** and **37 rendered React panels** pass; formatting, Knip and TypeScript/frontend/Worker builds pass. The new cases cover shared SQL transactions and integration across OJP/Fare handlers, annual feeds, tariff boundaries, operator/mapping evidence and report privacy.

[Live endpoint evidence](experiments/data-quality-live-2026-10-11.json) confirms both 2026 and 2027 feed selection, including the 420-second Zürich HB platform transfer. The actual 12 October 2026 journey (Zürich HB IC3 at 08:38 UTC; PostBus B81 from Chur at 09:58 UTC to Laax GR, posta) returned a bicycle test quote of CHF 29.60. The app selected **CHF15 Bike Day Pass + CHF2 through reservation = CHF17**. IC3 required no reservation on that departure; B81 did. Passenger CHF 45.80 remains an OJP test supersaver quote, not a verified production offer. One sampled OJP connection request took 11.2 seconds and its retained fare request 3.3 seconds; these are individual endpoint observations, not a whole-search/phone benchmark.

Implementation synchronized to GitHub `ebb859b12954cf3e9f865f81a2aa93069b78823f`. All **309 application files** match the published source by Git blob hash; root documentation/workflow changes were also verified. [Implementation CI run 38144304612](https://github.com/Victorpolm/bike-train-planner/actions/runs/38144304612) completed successfully, including all test, render, formatting, unused-code and build gates. The updated maintenance workflow also passed again in [run 38144304662](https://github.com/Victorpolm/bike-train-planner/actions/runs/38144304662). No access expansion or paid-plan change was made. Browser/touch/GPS interaction cannot be exercised in this environment; no physical-phone acceptance is claimed.

## Published cycling-route proposal

Prefer useful sections of official SwitzerlandMobility/FEDRO/cantonal cycling routes displayed on swisstopo, with a small destination-oriented shortlist and legal cycling connectors to public transport. Respect current cycling limits and explain route name, followed distance, extra journey time, climb and surface. Keep MTB routes distinct; a named route does not prove traffic-free or beautiful riding. Public geometry has attribution conditions; richer text/photos have separate licences. No Komoot content is copied and no scenic-route feature is claimed as implemented.

## Primary sources reviewed 11 October 2026

- https://www.sbb.ch/en/offers/bike-day-pass
- https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html
- https://www.postauto.ch/en/travel-and-services/travel-advice-and-reservations/travelling-with-a-bike
- https://www.rhb.ch/en/transport/rail-bike/
- https://opentransportdata.swiss/en/limits-and-costs/
- https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/
- https://github.com/openTdataCH/ojp-nova
- https://data.opentransportdata.swiss/en/dataset/timetable-2027-gtfs2020
- https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/gtfs-changes-transfers-txt/
- https://images.schweizmobil.ch/files/Datenbezug%20SchweizMobil-Routen.pdf


Final review also tightened through-reservation pricing: an incomplete or unknown cycling section must not count as a stationary connection. Only explicit zero-duration, zero-distance and identical-endpoint evidence preserves the through booking. The targeted 32 fare tests pass. Final owner-private **version 71** published successfully at **13:49:25 UTC**, environment revision 3, from Site source `c4b420bf17777d70cd9c016f86f5587ffa485fba`. The final application commit is `83af0963866d473ce44aa30249e63151b60786c1`; the earlier live endpoint evidence remains labelled as the initial release check.


[Final implementation CI run 38144626264](https://github.com/Victorpolm/bike-train-planner/actions/runs/38144626264) passed after the connector guard change. All 309 application files match final version 71 by Git blob hash.
