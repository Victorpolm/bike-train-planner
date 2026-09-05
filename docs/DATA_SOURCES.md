# Data sources and data risks

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
