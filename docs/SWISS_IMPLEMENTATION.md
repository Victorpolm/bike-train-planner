# Swiss implementation — 25 September 2026

The approved direction is Switzerland first: own timetable search, bicycle rules and journey ranking; retain a specialist cycling router. Finish and validate the current bicycle-accompanies-traveller mode before Europe or additional travel modes.

## Implemented in the web application

- Separate bicycle permission, ticket and reservation requirements. Applicable dated prohibitions win. SBB domestic IC/IR/regional services and reviewed BLS/SOB and ordinary domestic RhB services have sourced defaults; regional peak-hour ambiguity remains visible. IC reservations use the Swiss date, line, season, weekday and published holiday exceptions. An unidentified international IC does not inherit a domestic exemption.
- Interpret timetable VN/VR/VB plus staff loading (VC), international-only carriage (VI), local tickets (VK) and packaged-bike restrictions (VT). VI is not blanket domestic permission. Ticket uncertainty does not downgrade independently verified permission.
- Device-local full fare / Half Fare / GA and annual bicycle-pass preferences. Show the published day-pass option and applicable reservation charges for supported Swiss rail journeys. Connecting trains in one booking are not charged CHF 2 each. A cycling break prevents us from assuming a single through-booking charge. An adult GA does not make the bike free.
- Optional map layer from the official bicycle-and-car-parking feed. Only BIKE facilities are shown. Capacity is not availability; unknown coverage/access/fees remain unknown. Parking does not change the current route into a leave-the-bike-behind mode.
- A 60-second deadline spans place lookup, cycling, timetable acquisition and ordered stages. Completed results survive timeout; cancellation remains separate. This bounds waiting but does not guarantee that external services respond or that every alternative is found.
- Walking-transfer instructions explicitly say to push the bicycle. Existing timetable duration is retained; no arbitrary discomfort multiplier is added to clock time. A bicycle-compatible station path has not been established merely because a walking transfer exists.

## Published prices and their limits

One adult with one standard unfolded bicycle, 2nd class. Sources checked 25 September 2026:

| Item | Current treatment | Primary source |
| --- | --- | --- |
| Bike Day Pass | CHF 15 through 12 December 2026; CHF 16 from 13 December 2026, bounded to the next timetable year in code. Route-specific bike tickets may be cheaper. | [SBB Bike Day Pass](https://www.sbb.ch/en/offers/bike-day-pass) |
| Required Swiss rail bike reservation | CHF 2 for the connection, including connecting trains booked together; unknown for operators/itineraries not covered by that rule. | [SBB bicycle help](https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html) |
| Passenger full / Half Fare | Profile guides the quote; no invented distance-based fare or automatic 50% calculation. | [OJP Fare cookbook](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/) |
| Passenger GA | Covered only for the supported domestic rail operators/routes, assuming a valid GA in the selected class. Other coverage needs confirmation. | Operator guidance below |
| Annual bike pass | Existing-pass incremental bike-ticket cost is zero only where coverage is established; reservation remains separate. | SBB Bike Day Pass / bicycle help |

OJP Fare is currently described by its publisher as a **test integration environment**. It requires its own API product, supports full/Half Fare quotations and does not implement GA as a normal traveller reduction. A general OJP timetable key must not be presumed sufficient. A production passenger-plus-bicycle total remains pending verified product access, exact-trip matching and tariff validation. The app labels published bicycle costs separately and links to SBB for the current offer; it does not sell or reserve anything.

Rules: [SBB carriage/reservation calendar](https://www.sbb.ch/en/travel-information/individual-needs/travelling-with-bikes/carriage-bikes-train.html), [BLS](https://www.bls.ch/en/fahren/fahrgastinformation/velofahrende/velomitnahme), and the existing SOB/PostBus/ZVV/tpg rules documented in the repository. No live remaining-space integration.

## Official bicycle parking

[The official feed](https://opentransportdata.swiss/en/cookbook/road-traffic-cookbook/bike-and-car-parking/) is downloadable without a key and includes station and partner facilities in Switzerland and some nearby border areas. The 25 September download contained **1,608 bicycle facilities**, among 2,877 total bicycle/car records. This is not every Swiss rack or a guarantee of access, payment, opening hours or free places.

The server refreshes at most daily per running instance, deduplicates simultaneous requests and can retain its last successful response when refresh fails. A restarted instance must download again; this is not durable offline storage. The browser loads the layer only when selected. Markers appear at zoom 10 and above. Text is inserted safely; only HTTPS operator links are accepted. Unreliable default-zero feed prices are not advertised as free parking.

## National timetable pilot — implemented locally, not enabled in production

`tools/import_swiss_gtfs.py` streams the official ZIP into an atomic dated SQLite index. It imports service calendars/exceptions, stops/platforms/UIC identifiers, agencies, all route categories including boats, trips, bicycle hints, pickup/drop-off restrictions, transfers and frequency metadata. It includes the previous and next day for overnight searches. Files stay outside Git.

Actual import: feed version 20260923, valid 14 December 2025–12 December 2026; 474 agencies, 5,172 routes, 104,279 stop/platform records. Six indexed dates around 25 September and 2 November contain 634,409 trips, 10,002,822 stop events and 1,104,046 transfer records. Index size: 1.63 GB. Import took 191.2 seconds here. These are feed records, not unique physical stops or a guarantee of all real-world services.

`tools/swiss_timetable.ts` is a read-only local Node 24 service. It uses bounded boarding rounds, maintains raw platform states, applies the three bicycle scopes independently **before pruning**, retains fewer-boardings and faster-transfer results, respects GTFS pickup/drop-off and explicit forbidden/minimum transfers, and handles GTFS times after 24:00 and DST. Shared bicycle rules are reused rather than copied into Python. The app's optional private server bridge augments the live timetable when configured.

It remains a pilot. Frequency services are explicitly excluded from exact departures; station pathways, chained walking transfers, realtime disruptions and complete connection coverage are not solved. National queries can exceed the preferred latency before a synchronous SQL operation returns. Local tests found the direct Zürich–Baden/Baden–Zürich services and the late IR35 to Chur; some queries reached the search limit. The measured process peaked around 538 MiB, exceeding the existing small web runtime's memory budget. This is **not** ready to replace the live provider.

Run without purchasing hosting:

```bash
python3 tools/import_swiss_gtfs.py /data/gtfs.zip /data/swiss.sqlite --date 2026-09-25 --date 2026-11-02
node tools/swiss_timetable.ts /data/swiss.sqlite
```

The process listens on loopback port 8788 only. Optional `SWISS_TIMETABLE_TOKEN` protects the service; the web server uses the matching server-side token and `SWISS_TIMETABLE_URL=http://127.0.0.1:8788` in local development. Never use a VITE-prefixed secret. Production is disabled when no URL is configured. No national data host, paid plan, public tunnel or recurring job has been created. Any hosting spend needs the user's approval first.

## OSM, station movement and GPX

`tools/audit_swiss_osm.py` streams a Geofabrik Switzerland PBF and reports highway/infrastructure tag coverage and a 600 m inventory around Zürich HB, Baden and Chur. The nationwide extract was downloaded; it is **mapped OSM coverage**, not all physical cycle paths. Node/way counts are not kilometres or objective safety ratings. OSM attribution and ODbL requirements remain attached to derived-data work.

The station inventory is evidence for a pathway audit, not a connected transfer graph: nearby streets, entrances, steps and lifts must be checked for connectivity and bicycle pushing/carrying rules. Missing tags remain unknown. The app still uses BRouter/validated OSRM road routing; the new PBF has not silently replaced that service.

`tools/analyse_gpx.py` produces private slope-bin summaries without uploading coordinates. See [GPX recording instructions](GPX_RECORDING.md). No user rides were supplied, so no empirical profile calibration is claimed.

## Remaining release gates

1. Benchmark/index the national timetable more efficiently; handle frequencies, transfer pathways and disruptions before making it authoritative. Prepare a concrete hosting choice and cost before asking for approval.
2. Validate connected bicycle-compatible station paths at the three pilots; keep physical transfer time separate from ranking penalties.
3. Verify production fare access and exact-trip passenger quotes; preserve sourced bike charges and uncertain cases.
4. Use supplied GPX rides to calibrate and evaluate the existing profiles on held-out rides.
5. Keep rerunning the reported Baden, one-train-plus-cycle and late-Chur journeys, plus failure/cancellation tests. Only then design additional modes and richer preference profiles; Europe follows later.

The deployed Site remains owner-only. GitHub repository visibility is separately **public**, as checked on 25 September; do not describe it as a private repository or commit personal recordings, secrets or private journey details there.
