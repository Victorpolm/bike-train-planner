# Data sources and data risks

_Consolidated 2026-09-29. Current integrations are separated from source options and historical experiments._

## Current source registry

| Information | Source and current use | Remaining limits |
|---|---|---|
| Cycling geometry and road attributes | [BRouter](https://brouter.de/) using OSM-derived data; routed access/egress and cycling alternatives | Bounded requests; partial attributes; downloaded time is not a street-survey date; no endpoint availability guarantee |
| Terrain and official path information | On-demand Swiss GeoAdmin/swisstopo checks described in [terrain implementation](SWISSTOPO_AND_FARES_2026-09-27.md) | Partial/ambiguous feature matching remains explicit; not a complete imported swissTLM3D network |
| Places and addresses | GeoAdmin, Swiss Transport API, local known places and Photon/OSM venue search | Place relevance/entrance identity may need confirmation; see [PLACE_SEARCH.md](PLACE_SEARCH.md) |
| Timetables and bicycle evidence | Active server-side OJP 2.0, paired bicycle-filtered/unfiltered searches, dated TripInfo; public search.ch and Transport API fallbacks; scoped reviewed operator rules | Exact service/segment evidence and operator policy are different; unknown permission, disruptions and capacity remain separate |
| Passenger/bicycle prices | OJP Fare test endpoint using a separate server key, with retained/assembled exact itineraries; scoped published fallbacks | Test estimates, complete-coverage checks and unknown products; no purchase/booking guarantee; [fare release](OJP_EXACT_TRIP_FARES_2026-09-28.md) |
| Bicycle parking | [Official bicycle/car feed](https://opentransportdata.swiss/en/cookbook/road-traffic-cookbook/bike-and-car-parking/), filtering BIKE records for the optional map layer | Station/partner coverage including border areas; no bicycle occupancy in the checked feed; richer hours/prices/entrances not yet normalised |
| National timetable/street data | Swiss GTFS and Geofabrik OSM were downloaded and audited; experimental local timetable service | Not the published routing backend; performance/calendars/headways/pathways/disruptions and hosting remain gates |
| Parking enrichment | Zürich and Biel/Bienne municipal data, OSM and operator sources reviewed as candidates below | Proposed, not merged into the app |
| Bike shops/repairs/pumps | OSM/service/operator information proposed for the next milestone | No dedicated integrated directory yet; named-place search does not verify services/hours |
| Water, toilets, food/vending | OSM plus municipal water/WC data and operator evidence | Next-step proposal; category filters, hours/condition handling and route detours are not implemented |

Neither access to national sources nor successful sampled queries establishes a complete verified map of all Swiss public transport or every cycle path. Transit geometry remains schematic; cycling geometry is routed. The published app does not silently activate the local national timetable pilot.

## Parking audit and proposed enrichment

A fresh official download on 29 September contained **1,608 bicycle and 1,269 car facility records**. Zero BIKE records had populated current/forecast occupancy; 435 CAR records had current estimated occupancy. Bicycle operating-time structures occurred in 570 records, pricing models in 143 and descriptive traits in 303. These are presence counts, not validated usable schedules/tariffs. [Machine-readable audit, source URL, hash and counting method](experiments/bike-parking-source-audit-2026-09-29.json).

The official cookbook advertises estimated occupancy and forecasts in the combined dataset. That does not establish bicycle coverage: the inspected categories must govern the product claim. Feed counts include border facilities and can change. Retain provider IDs and `uic`/`didokId` for reviewed station association; a point/area is not an entrance. Do not infer walk-in access or a free tariff from a general public-access flag or unexplained zero price.

| Candidate source | Contribution | Source conditions and product implication |
|---|---|---|
| [Zürich Zweiradparkierung](https://data.stadt-zuerich.ch/dataset/geo_zweiradparkierung) | Municipal racks/locations, vehicle categories and fee/capacity fields | Catalogue publishes CC0; filter motorcycle-only records. It reports no occupancy and warns about temporary removals/access gaps. Survey, publication and download dates are distinct |
| [Biel/Bienne parking](https://opendata.swiss/fr/dataset/veloparkierung) | Municipal street-rack inventory and downloadable spatial records | Check current export/terms; compare locations with locations and capacity with capacity. Do not add overlapping national/municipal totals |
| [OSM bicycle parking](https://wiki.openstreetmap.org/wiki/Tag:amenity=bicycle_parking) | Broader mapped facilities, parking form and access/cover/fee/maxstay tags | Field presence and freshness vary. Keep public/customer/member/private restrictions distinct; account for nodes/ways describing the same facility |
| [SBB parking guidance](https://www.sbb.ch/content/internet/sbb/en/support/produkte-services/services/weitere-sbb-services/veloparking-am-bahnhof.html) and individual operators | Practical entry/retrieval, badge/registration and tariff evidence | Facility-specific review; a pass/access right is not a guaranteed space. Do not assume a bulk API or scraping/reuse permission |
| [Forum Velostationen](https://www.velostation.ch/de/velostationen/) | Discovery and links for facility review | Treat as a directory until a suitable data-access/reuse arrangement is established |

[BIKE_PARKING.md](BIKE_PARKING.md) specifies deduplication, field-level provenance, uncertainty, bounded retrieval, entrance checks and proposed pilot acceptance cases. No nationwide inventory or live-space service is claimed.

## Bike-shop and repair sources

Use [OSM shop=bicycle](https://wiki.openstreetmap.org/wiki/Tag:shop=bicycle) with explicit service evidence for staffed repairs, and [amenity=bicycle_repair_station](https://wiki.openstreetmap.org/wiki/Tag:amenity=bicycle_repair_station) for self-service equipment. A shop tag alone must not promise a repair service. Pumps and their bicycle/valve suitability require their own evidence; a generic compressed-air object is insufficient.

Retain name, location, source ID, operator/business link, contact, known hours and service tags. Unknown hours, appointment needs and equipment condition stay unknown. Deduplicate services co-located with a parking facility without inventing a separate business. Treat opening-at-arrival as different from immediate mechanic availability. Reuse the parking place/evidence/card infrastructure and add explicit route actions; no bookings or outreach to shops are part of this documentation update.

## Source and licensing record

The [useful-stop data plan](CYCLING_AMENITIES.md) adds exact source links and an OSM tag-selection table for water, toilets, food/vending, parking, repair stands/pumps and shops. Zürich publishes CC0 [fountain](https://data.stadt-zuerich.ch/dataset/geo_brunnen), [WC](https://data.stadt-zuerich.ch/dataset/geo_zueri_wc) and [pump](https://data.stadt-zuerich.ch/dataset/geo_velopumpstationen) datasets. Inspect their component layers, access/closure semantics and dates before import. Operator examples VELOVE and Züri rollt require per-location service/access interpretation.

Small exploratory Overpass queries and a maintained regional extract/index are different delivery options; public Overpass is not proposed as an unrestricted production backend. Preserve full OSM tags needed for filtering and inspect extract coverage before selecting a reduced format. The current raster basemap and a structured amenity database are separate data products.

For the later safety study, [FEDRO injury-crash data](https://opendata.swiss/en/dataset/strassenverkehrsunfalle-mit-personenschaden) and infrastructure/junction records are candidates, not current integrations. [CYCLING_SAFETY_RESEARCH.md](CYCLING_SAFETY_RESEARCH.md) specifies exposure, temporal and map-matching limitations.

For every used or proposed source retain: URL/provider, fields, geography, access method, last successful fetch, provider update/version if known, independent review date, licence/attribution, update cadence, limits and known gaps. The [OSM copyright/licence page](https://www.openstreetmap.org/copyright) documents ODbL attribution and reuse terms. Check the applicable official/local dataset conditions before combining or redistributing records; a public webpage is not proof of a bulk-data licence.

Preserve conflicting values and their evidence rather than silently choosing one global provider. Separate missing, false, stale and contradictory values. An operator is generally the practical source for its access/tariffs; municipalities can establish their own facilities and OSM adds geometry/tags. No source is assumed complete merely because it is official.

Use bounded, cached requests with independent failure handling. Parking/repair requests must not exhaust timetable/road requests or delay initial journey results. A future live-data field needs its own observation timestamp, category/facility match and expiry; a daily static cache does not make occupancy live.

## Routing, carriage and fare evidence rules

- Retain directed cycling geometry and source attributes; do not turn an unroutable segment into a navigable straight line. Unknown surfaces/elevation remain unknown; speed bands are not exact posted signs or measured traffic.
- Applicable dated prohibitions take precedence over broad operator defaults. Keep permission, bicycle ticket, reservation requirement, reservation availability and remaining capacity separate.
- OJP fare requests preserve whole-trip coverage and the selected services; invalid retained evidence must not trigger a substitute route quote. Keep Full Fare/Half Fare/GA passenger handling separate from bicycle products and reservation prices.
- Fetched-at dates are not guarantee dates. Public source data and published app coverage differ. Do not advertise objective route safety, complete infrastructure coverage or a bookable fare from partial/test data.

## Dated implementation and audit references

- [Cycling geometry, profile and data limits](CYCLING_ROUTES.md)
- [Swiss national GTFS/OSM audit — 25 September](SWISS_DATA_AUDIT_2026-09-25.json) and [local/production separation](SWISS_IMPLEMENTATION.md)
- [Bicycle permission and OJP contract](BICYCLE_PERMISSION_AND_OJP.md) and [bus operator evidence](BUS_BICYCLES.md)
- [Swisstopo and fare corrections — 27 September](SWISSTOPO_AND_FARES_2026-09-27.md)
- [Exact-trip fares — 28 September](OJP_EXACT_TRIP_FARES_2026-09-28.md)
- [Parking feed audit — 29 September](experiments/bike-parking-source-audit-2026-09-29.json)

Earlier descriptions of schematic cycling, inactive OJP keys or unimported national files are historical; consult these dated reports and Git history for their original context. [PROJECT_STATE.md](PROJECT_STATE.md) and [APP_ROADMAP.md](APP_ROADMAP.md) define the current implementation and priorities.
