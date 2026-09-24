# Data sources and data risks

**24 September current update:** Keyless connections now come directly from [search.ch](https://search.ch/timetable/api/help), preserving dated bicycle symbols. Transport API remains for nearby stops and departure boards. [Permission contract](BICYCLE_PERMISSION_AND_OJP.md) documents code meanings, scoped operator defaults and the distinction from remaining-space availability. This supersedes older statements below that no carriage attributes are interpreted.

## Principle

Data quality is likely a larger project risk than frontend architecture.

Before relying heavily on a source, record:

- what it provides
- geographic coverage
- licence and attribution
- update frequency
- reliability
- missingness
- access method
- dependency risk

## Initial source registry

| Information | Initial source | Main uncertainty |
|---|---|---|
| Roads, cycle paths, road classes | OpenStreetMap | Completeness varies locally |
| Bicycle access, surfaces, barriers | OpenStreetMap | Many attributes may be missing/inconsistent |
| Speed limits / road context | OpenStreetMap | Coverage quality varies |
| Parking, shops, pumps, repairs | OpenStreetMap | Freshness and completeness |
| Official leisure routes | SwitzerlandMobility / related data | Licence and reuse rights |
| Elevation | Swiss federal geodata | Processing, attribution, integration |
| Stops and timetables | Swiss open public-transport data / GTFS | Bicycle carriage info may be incomplete |
| Realtime delays/cancellations | GTFS Realtime / Swiss feeds | Not needed for earliest prototype |
| Bicycle carriage rules | SBB and other operators | May be human-readable rather than structured |
| Station accessibility | OSM / operator/open data | Completeness for bike-specific transfers |

## OpenStreetMap

Likely uses:

- street graph
- cycleways
- bicycle access
- surface
- barriers
- speed limits
- road types
- bicycle parking
- repair stations and shops
- pumps
- drinking water
- rentals
- charging points

### Main risk

OSM tagging is heterogeneous. Do not assume an attribute exists simply because the schema supports it.

### Required audit

For each golden journey, inspect:

- missing cycleways
- wrong/missing bicycle restrictions
- missing surface information
- barriers and stairs
- speed-limit coverage
- station entrances/access
- useful POIs

Record product-breaking failures separately from minor incompleteness.

## Swiss public-transport data

Likely uses:

- stops
- routes
- trips
- schedules
- service calendars
- transfers

National GTFS is a realistic foundation for timetable routing.

### Realtime

Useful later for:

- delays
- cancellations
- disruption-aware routing

**Decision:** Realtime is not required to validate the earliest prototype.

## Bicycle carriage rules

**Implemented pilot (2026-09-20):** The app preserves timetable category/operator and applies a separate curated bus-rule registry. [BUS_BICYCLES.md](BUS_BICYCLES.md) lists exact coverage, official PostBus/ZVV/tpg sources and review dates. Unknown rules stay unknown; known bans are excluded from bicycle-aware scopes and labelled in the all-transit reference, while conditional rules require a departure check. Reservation requirement, reservation availability, ticket requirement and live capacity are separate fields. This supersedes the earlier flat proposed representation below for the implemented bus pilot; the remaining broader sources are still prospective.

This is a distinct subsystem, not just a timetable field.

Rules may depend on:

- operator
- service/train category
- line
- vehicle
- departure
- season
- time of day
- bicycle type
- available capacity
- reservation requirements
- replacement buses
- international services

Potential representation for each transit leg:

- `allowed`
- `allowed_with_conditions`
- `reservation_required`
- `reservation_recommended`
- `not_allowed`
- `unknown`

Maintain provenance and confidence for every rule.

### Likely implementation stages

1. Manually encode rules for a small pilot set of operators/services.
2. Combine structured timetable fields with maintained rules.
3. Automate extraction only where source structure and reliability justify it.

Do not infer certainty from missing data.

## Tickets vs reservations

Keep these concepts separate:

- passenger ticket
- bicycle ticket
- bicycle reservation
- bicycle-space reservation
- carriage permission

The early product may explain them without selling them.

## Elevation

Possible use:

- slope per street segment
- total climbing
- comfort/difficulty scoring
- e-bike-specific profiles

**Decision:** Elevation is useful but lower priority than basic multimodal routing and bicycle-rule feasibility.

## Station infrastructure

Potentially useful attributes:

- stairs
- lifts
- ramps
- platform access
- station entrances
- underpasses
- bicycle restrictions

**Open question:** Is coverage complete enough to model bicycle transfer difficulty reliably?

## Data licensing checklist

Before production use of any dataset, verify:

- commercial reuse
- redistribution
- derivative database requirements
- attribution
- caching/API restrictions
- update conditions

Do not assume that publicly viewable data is freely redistributable.

## Recommended audit artifact

Eventually maintain a structured table or machine-readable registry with:

`source | fields | geography | licence | freshness | reliability | known gaps | access | notes`

The initial audit should focus on Zurich plus one nearby corridor rather than all of Switzerland.


## Prototype adapter update — 2026-09-05

The implemented experiment uses GeoAdmin address geocoding, with Transport API place/stop lookup as fallback. The public [Transport API](https://transport.opendata.ch/docs.html) supplies nearby stops, scheduled connection sections and departure-board pass lists. Requests no longer restrict transportations to trains: buses, trams and other returned public transport are considered in both models.

Only known timed sections enter the graph. Recorded pass-list exits require a valid arrival time; untimed passage points are excluded. Delay/prognosis data, carriage permissions, capacity and reservations are not interpreted. Cycling and map geometry remain schematic. See `MATHEMATICAL_MODEL.md` for sampling, rate limits and the difference between an observed schedule graph and comprehensive network coverage.

A small recorded 2026-09-05 Zürich–Laax schedule fixture is included for regression testing, with its source URL. It is an observation of scheduled data, not a promise that those services will run on another date.

## Routed cycling adapter — 2026-09-20

**Implemented:** Public [BRouter](https://brouter.de/) GeoJSON routing with the touring profile, moderate effort, steps/ferries disabled and a 25 km/h model cap. Returned OSM-derived tags and SRTM geometry support distance, time, elevation, surface and infrastructure. Requests are directional; provider errors do not fall back to geometry. Attribution and bounded in-memory caching are documented in [CYCLING_ROUTES.md](CYCLING_ROUTES.md).

BRouter's lookup table groups raw posted speed limits; the app shows approximate bands, never exact signs or measured traffic speed. Road-message matching preserves unknown intervals. Missing elevation is not filled, and surface is not inferred from road class. Data freshness is not known per segment; fetched-at time is not an OSM survey date. The community endpoint has no availability guarantee for this prototype; managed/self-hosted routing remains an engine decision before wider use.

A real 20 September 2026 Renens–EPFL response is retained with source URL and attribution in `prototype-v0/src/fixtures/renens-epfl-cycling-2026-09-20.json`. This supersedes the earlier schematic-cycling adapter description; historical timetable fixtures preserve their original assumptions.

## Current coverage and TripInfo — 2026-09-21

[TripInfo and Swiss network coverage](TRIPINFO_AND_NETWORK_COVERAGE.md) distinguishes source availability from imported data. Swiss national GTFS includes land and boat/ferry modes, but this app holds a sampled timetable graph. BRouter returns requested OSM-derived routes; no complete local cycling network or inventory of every path is verified. The map is not a national network map.

TripInfo inspection is implemented as separate evaluation tooling, not a production permission feed. Live confirmation and reviewed service/segment mapping remain pending. Remaining bicycle spaces, occupancy and reservation availability are explicitly deferred. BRouter/SRTM profiles are already implemented; the earlier elevation-priority text concerns higher-resolution terrain and future calibration.
