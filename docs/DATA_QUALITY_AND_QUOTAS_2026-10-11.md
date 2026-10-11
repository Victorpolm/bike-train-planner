# Shared quotas, maintained transfer feeds and fare/data corrections

11 October 2026. Owner-requested implementation of gap-list items 4 and 6, including the Zürich–Laax bicycle-price defect. Switzerland-first; owner-private publication. Official-route suggestions remain a design proposal.

## Delivered behavior

- **Shared OJP/OJP Fare admission:** D1 transactions coordinate all Worker instances and both handlers by a SHA-256 digest of the actual upstream key. Each real upstream call consumes a permit, including itinerary fallback, filtered checks, passenger/bicycle quotes and failed attempts; local cache hits/coalesced subscribers do not. Admissions are at least 1.5 seconds apart per key (below the published 50/minute). The current and previous 24 hourly buckets conservatively cap rolling 24-hour usage at 20,000 without assuming the provider's reset timezone. Storage failure fails closed; shared provider cooldown, cancellation, bounded local queues and Retry-After remain explicit. No journey data or raw token is stored in D1. Calls made with these keys outside this app are not observable; other public map/timetable providers retain their existing provider-specific controls. The owner should confirm the issued-key allowance before widening access.
- **Maintained transfer feeds:** `.github/workflows/refresh-transfers.yml` checks the official published GTFS catalogue on Tuesdays and Fridays, plus manual/code-change runs. It downloads temporary ZIPs, compiles compact general-rule indexes, validates dates/schema/size and SHA-256, then commits only compact indexes and a manifest. A failed refresh preserves previous data and produces a failed Actions run. It retains the previous/current/next annual editions and removes superseded compact assets. No bulk CSV/ZIP is committed.
- **Runtime selection:** operating-day-aware endpoint/cache keys select a valid annual feed. The Worker checks the fixed project-owned public manifest at most every six hours per isolate, verifies index hashes and decoded structure, and retains bundled 2026 data on failure. A valid bundled lookup does not wait for manifest refresh. Missing/expired coverage is explicit; the existing exact OJP timing and labelled fallbacks still apply. Existing undated tabs keep the bundled edition. Data refreshes do not require a Site redeployment.
- **Bicycle fares:** ordinary domestic PostBus and RhB journeys now participate in the reviewed day-pass comparison. SBB/PostBus connecting services require a single CHF2 through reservation where their dated requirements establish one. Bike-pass coverage, GA coverage and reservation-price applicability are separate. Unknown requirements, other operators, special/replacement services and interrupted bookings retain explicit uncertainty.
- **Current tariff:** CHF15 day pass until 12 December 2026; CHF16 from 13 December 2026 within the reviewed tariff period. Thus a covered 2026 through journey with the CHF2 reservation has known bicycle cost CHF17. The app does not hard-code a Zürich–Laax total or claim that every departure has identical conditions. A cheaper eligible route ticket is still compared; a day pass ends at05:00 the following day.
- **Passenger-fare reliability:** reviewed ZVV/Z-Pass standard fares take priority over experimental OJP quotes. Those covered corridors no longer spend an extra API request fetching a test quote. Other returned prices retain test-estimate provenance; missing prices are not fabricated. The documented unreliable OJP product2361 is excluded, and the `secondClass` request enum has been corrected.
- **Permission evidence:** known numeric OJP operator references are normalized at the provider boundary. An explicitly missing reservation note can use a narrowly reviewed operator default; explicit conflicts and unclassified unknown conditions remain unknown. Exact imported SLOID/DIDOK station mappings can establish the existing reviewed domestic applicability, without treating every `ch:1:sloid` as Swiss territory. Mapping changes invalidate cached permission assessments.
- **Corrections and calibration evidence:** journey details have a collapsed Data quality and corrections section. Download an allowlisted JSON report containing selected public-transport services/times, fare profile, prices/provenance, permission/transfer evidence and optional observations/actual cycling minutes. No automatic submission, raw retained XML, route geometry, GPS history or saved places. This collects useful evidence; it does not automatically recalibrate speed assumptions.

## Actual refresh evidence

[Refresh run38143011011](https://github.com/Victorpolm/bike-train-planner/actions/runs/38143011011) succeeded. It committed compact data at `72f5f5eca994f153cd5d7da42082767932936853`.

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

Final gate and publication results are recorded below after completion. Browser/touch/GPS interaction cannot be exercised in this environment; no physical-phone acceptance is claimed.

## Published cycling-route proposal

Prefer useful sections of official SwitzerlandMobility/FEDRO/cantonal cycling routes displayed on swisstopo, with a small destination-oriented shortlist and legal cycling connectors to public transport. Respect current cycling limits and explain route name, followed distance, extra journey time, climb and surface. Keep MTB routes distinct; a named route does not prove traffic-free or beautiful riding. Public geometry has attribution conditions; richer text/photos have separate licences. No Komoot content is copied and no scenic-route feature is claimed as implemented.

## Primary sources reviewed11October2026

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
