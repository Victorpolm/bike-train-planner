# Useful stops along a cycling journey

_Brainstorm recorded 29 September 2026. Updated after user-authorised delivery: parking, water and toilets now have map filters, route proximity and closest-to-A actions. The richer service, detour, opening-at-arrival and stop-insertion proposals below remain future work. [Version-36 implementation and limits](WATER_AND_TOILETS_2026-09-29.md). The bicycle still accompanies the traveller._

## The need

**User evidence:** On long rides the project owner repeatedly looks for drinking fountains, snacks and vending machines, public toilets, good bicycle parking, pumps and repairs. They want these facilities on or close to the proposed path, with selectable map categories and less irrelevant map clutter. VELOVE and Züri rollt in Zürich are examples to investigate. This is a concrete first-person need, not yet evidence that every cyclist has the same priorities.

**Product proposal:** Add a small **Useful stops** control to the selected journey and map. Answer “What can I use ahead of me, what does the detour cost, and will it be accessible when I arrive?” Keep the original journey visible. The complete feature includes all five requested categories; water and toilets now have an initial OSM layer; food, repair services and richer access/detour handling remain planned work.

## Categories and useful details

| Category | First useful information | Interpretation rule |
|---|---|---|
| Water | Drinking-water evidence, bottle filling, access, seasonal/off status | A decorative fountain or unspecified spring is not automatically drinking water; a mapped source is not a live water-quality check |
| Snacks and drinks | Bakery, grocery/convenience shop, supermarket, café, farm shop or vending machine; hours, products and known payment methods | Food retail is not a stock guarantee; identify vending contents, customer-only access and machines inside closed buildings |
| Public toilets | Access, fee/payment, hours, accessibility, changing table where known | Separate public from customer/member/key access; unknown hours are not “open” |
| Parking | Wheel/frame support, shelter, access control, supervision/CCTV, capacity, fees and retrieval hours | Different features answer different needs; do not turn CCTV into a “best” or theft-proof label |
| Repair help | Stand/tools, pump and valve compatibility, spare-tube vending, assisted DIY workshop, professional repair shop | Distinguish fixing it yourself, getting guidance and paying for a mechanic; open does not mean immediate service |

**Later useful additions:** benches/picnic tables and rain shelters; documented e-bike charging with socket/charger/access details; baggage lockers; bike-friendly overnight stops for longer tours; and public-transport exit options if the ride must end early. Shade, charging compatibility and overnight bicycle storage need explicit evidence. Avoid treating every tree as reliable shade or every electrical outlet as an available charger. A compact saved list of chosen stops could help where reception is poor; offline maps require a suitable data/tile arrangement.

## Map and journey interaction

- Five independent filters: **Water · Food · Toilets · Parking · Repairs**, with repair subtypes on demand. Start with no extra clutter and preserve the user's selections. A proposed “Long ride essentials” preset could enable water, food, toilets and pumps together; test it rather than imposing it.
- Switch between **Along this ride** and **In this map area**. Offer **Near me** only after the user requests location access; live tracking/navigation is not required for planning.
- Show a short list ordered along the selected ride, plus clustered map pins. Keep stops available through keyboard/list interaction, not only icons or colour. One place can provide several services without becoming several duplicate businesses.
- Cards show the relevant service, position along the ride, estimated additional riding/walking distance or time, access/fee, expected opening at arrival and source date. Label missing information plainly. An illustrative card might read “Drinking water · 18 km into this cycling leg · +4 min riding · seasonal status unknown”; these are examples, not measured results.
- **Inspect** leaves the journey unchanged. **Add as stop** is explicit and replans after the visit duration is supplied or clearly left unresolved. The present ordered-stop feature has no stopover duration; it must be extended before promising a train connection after shopping, toilet use or repairs.
- A “Likely open at arrival” filter requires interpretable hours and dated evidence; show unknown-hours alternatives separately. Evaluate the intended visit interval, not just the instant of arrival. For parked bicycles also check collection time.

**Current map constraint:** [`MapView.tsx`](../prototype-v0/src/MapView.tsx) uses standard OSM raster PNG tiles. We can toggle our own facility overlays, but labels/icons already painted into those tiles cannot be individually hidden. A quieter basemap or suitable vector style is a separate, bounded interface task; it is not solved by the amenity filters alone. Keep roads, paths, access restrictions, attribution and useful orientation visible. Respect the provider's [tile policy](https://operations.osmfoundation.org/policies/tiles/); do not prefetch the public tile service for offline use.

## Source plan

### Parking: compare the same units

The existing [29 September audit](experiments/bike-parking-source-audit-2026-09-29.json) counted **1,608 bicycle facilities**, with no bicycle occupancy observations or forecasts. It did not count 1,608 individual or currently free spaces. The older “about 1,200” description is not a complete inventory of Swiss parking.

[Biel/Bienne's municipal catalogue](https://opendata.swiss/fr/dataset/veloparkierung) describes approximately **600 locations providing 6,400 bicycle spaces**, and offers GeoJSON, GeoPackage and tabular downloads. Those are catalogue figures, not a fresh count or occupancy measurement; the page reviewed lists a 2023 metadata date. Use this as a strong pilot for municipal enrichment, while checking the current export, attribute meanings, update dates and reuse terms. Never add municipal and national capacities before resolving overlapping facilities.

### Sources to combine

| Source | Proposed use | What still needs checking |
|---|---|---|
| Official transport parking feed | Continue the existing station/partner coverage | Already integrated; preserve IDs and avoid confusing car occupancy with bicycle capacity |
| Municipal parking, including Biel/Bienne and Zürich | Street/destination racks and locally managed facilities | Source IDs, types, units, entrances, licence and overlap with OSM/official feed |
| [Zürich fountains](https://data.stadt-zuerich.ch/dataset/geo_brunnen) | Local fountain inventory, including shutdown evidence | Includes private fountains. Fields include `ABGESTELLT`, shutdown reason/date and water type; those do not alone certify potable public access. Catalogue lists CC0 and GeoJSON/WFS downloads |
| [Zürich public WCs](https://data.stadt-zuerich.ch/dataset/geo_zueri_wc) | Municipal toilet locations | Catalogue lists CC0; building address points need entrance checking, and multiple component layers must not create duplicates |
| [Zürich pump stations](https://data.stadt-zuerich.ch/dataset/geo_velopumpstationen) | Public manual bicycle pumps | Catalogue lists free use and CC0; location does not establish current operation or all valve adapters |
| OSM | A common geographic base for all five categories, especially outside the selected cities | Uneven coverage and attributes; preserve source objects, explicit restrictions and unknowns |
| Operators and municipal service pages | Targeted review of access, opening schedules, repair model, tariffs and temporary closures | Review individual locations; do not assume a listing page is a bulk API or that every branch provides every service |

### OSM extraction starting points

These are documented selection rules to validate against Swiss records, not an exhaustive production query. Query nodes, ways and relevant relations; a way's centre is for discovery, not proof of its entrance.

| Need | Starting tags | Normalisation notes |
|---|---|---|
| Water | [`amenity=drinking_water`](https://wiki.openstreetmap.org/wiki/Tag:amenity=drinking_water); water features explicitly carrying `drinking_water=yes` | Retain `bottle`, `access`, `seasonal` and lifecycle status. Honour `drinking_water=no`; ambiguous/conflicting potability stays unconfirmed |
| Toilets | [`amenity=toilets`](https://wiki.openstreetmap.org/wiki/Tag:amenity=toilets) | Retain hours, access, fee, accessibility and changing-table evidence; toilets in another facility may be a service of that place |
| Food shops | [`shop`](https://wiki.openstreetmap.org/wiki/Key:shop) values such as `supermarket`, `convenience`, `bakery`, `farm`; cafés as a separate food-stop type | Preserve the subtype; a general farm shop may not sell ready-to-eat snacks |
| Vending | [`amenity=vending_machine`](https://wiki.openstreetmap.org/wiki/Tag:amenity=vending_machine) plus `vending` contents | Parse multi-value contents such as drinks/food/sweets/bread or `bicycle_tube`; exclude unrelated machines from food results. Stock remains unknown |
| Parking | [`amenity=bicycle_parking`](https://wiki.openstreetmap.org/wiki/Tag:amenity=bicycle_parking), [`bicycle_parking=*`](https://wiki.openstreetmap.org/wiki/Key:bicycle_parking) | Keep equipment, cover, access and monitoring independent; use the detailed [parking proposal](BIKE_PARKING.md) |
| Repairs and pumps | [`amenity=bicycle_repair_station`](https://wiki.openstreetmap.org/wiki/Tag:amenity=bicycle_repair_station); `shop=bicycle` with evidenced repair services; `service:bicycle:pump` | Preserve tools, valves, access and condition. A generic compressed-air machine is only a candidate until bicycle suitability is established |

**Operator examples checked:** [VELOVE ETH Hönggerberg](https://velovezh.ch/workshop-honggerberg/) describes volunteer-assisted DIY repair, paid spare parts and seasonal public opening hours; volunteer 24/7 access must not become public 24/7 access. [Züri rollt's workshop page](https://aoz.ch/de/aoz-betriebe/zueri-rollt-velowerkstatt) describes professional repair locations and service/appointment distinctions. Use them to test classification and per-location schedules, not as assumed partners or guaranteed same-day repair. Other commercial shops remain eligible; no ranking preference follows from being named here.

## Turning heterogeneous data into dependable information

1. **Register and ingest sources.** Keep provider, URL, licence/attribution, geographic scope, source version, fetch time and known update cadence. Retain a raw source record for reproducible normalisation; exclude bulk downloads from Git. Validate geometry/coordinate system, IDs and units before merging. Municipal LV95 coordinates must not be interpreted as longitude/latitude.
2. **Normalise places and services.** Give each facility a stable internal ID linked to external IDs (OSM includes object type and ID). Keep facility geometry, entrances and hosted services distinct. Preserve original multilingual names, raw tags and hours beside parsed values. A shop with a pump, toilet and drinking tap is one host with several service records and possibly different access hours.
3. **Resolve duplicates conservatively.** Match explicit identities, footprint, name/operator, service type and compatible location. Distance proposes a match; it does not prove it. Keep adjacent paid/free parking, opposite entrances and separate machines distinct. Maintain aliases across updates and a review queue for ambiguous pairs. Do not sum duplicate parking capacities.
4. **Attach evidence to each claim.** Track source, provider update, field/physical check date when available and fetch date separately. Use true/false/unknown plus stale/conflicting status where relevant. An OSM edit timestamp is not automatically a field inspection. Treat changed opening times, broken equipment and shutdowns as service-specific evidence, not a universal quality score.
5. **Evaluate availability carefully.** Preserve the raw [`opening_hours`](https://wiki.openstreetmap.org/wiki/Key:opening_hours) expression and use a tested parser with Europe/Zurich dates, daylight-saving time, local holiday rules and seasonal intervals. Unparseable/absent hours remain unknown. Known closure, private access or explicit non-drinking water cannot pass the corresponding positive filter. Public ownership alone does not establish public access.
6. **Serve bounded, cached results.** Load selected categories around the map or ride independently from timetable search. Cache by area/category/version, cancel obsolete requests, apply response limits and show partial coverage, errors and staleness. Amenities must not consume the existing transit/cycling search budget. The first implementation must choose its own modest amenity budget and record performance.

Use [Overpass](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) for small exploratory queries and pilot checks, not as an unbounded public-app backend. For a sustained service, evaluate a filtered [Swiss OSM extract](https://download.geofabrik.de/europe/switzerland.html) and a compact spatial index served by the existing hosting, or a suitable provider. The existing national OSM pilot is a possible input, not a deployed amenity index. Choose storage and refresh cadence after measuring the extracted data; this document does not select a new paid database or recurring job. Preserve [OSM attribution and reuse conditions](https://www.openstreetmap.org/copyright) and each municipal source's terms.

## What “along the route” must mean

**Proposal:** First find candidates within a bounded corridor of the actual selected cycling geometry; offer a wider search when requested. Attach each result to its cycling leg and distance along that leg. Do not use straight transit lines, the journey's overall bounding box or the nearest point on an unrelated alternative. Loops and repeated visits need leg/segment identity as well as a coordinate.

For a shortlist, route from a point before the facility to its usable entrance and back to an allowed point further along the same cycling leg. Compare that duration with the replaced piece of the original ride. Label additional travel separately from time spent stopping. A fountain 50 metres away across a river may require a substantial detour; an inaccessible or unverified entrance cannot receive invented minutes. Preserve one-way/access rules and pushing segments. If this computation is not available, show approximate geographic distance and “detour not checked.”

Calculate the expected visit time from preceding transit, cycling, detour and chosen stop durations. Adding a stop must refresh downstream connections and affected exact-trip fare queries. A broken-bike request must not assume cycling to the repair point; offer walking/pushing access only where supported, otherwise location/contact information with the limitation.

Later, show **gaps in mapped services** along the ride, for example the distance between known water points. Say “No mapped drinking-water source found in the searched corridor,” not “No water exists.” Automatic food/water stop insertion or optimising a route around amenities is a later decision, not part of initial referencing.

## Proposed delivery and validation

Keep parking first and the broad interface redesign after useful features. Expand the second milestone to include the long-ride essentials:

| Step | Deliverable | Evidence before moving on |
|---|---|---|
| 1 | Shared facility/service schema and improved parking; compare the Biel/Bienne export with national/OSM coverage | Existing approximately 20-parking-facility pilot, with Biel/Bienne cases added or substituted; check duplicate identity, rack type, entrances and count units |
| 2 | Pumps, repair/shop referencing, drinking water and public toilets in small category releases | Proposed mixed pilot of roughly 30 records in Zürich/Biel and one rural cycling corridor; include closed/private/seasonal/unknown cases |
| 3 | Snacks/vending, category filters and selected-ride ordering/detours; complete explicit stop insertion with visit duration | Five-category journey task works without delaying initial routes; train timing is recomputed correctly |
| 4 | Broader interface refinement from real tasks | Users can find water/food/toilets, distinguish repair types and choose parking; accessible list works without map interaction |
| Later | Rest/charging/overnight support and the separate [road-safety research track](CYCLING_SAFETY_RESEARCH.md) | Validate sources and user value before expanding |

Numbers and locations are pilot proposals, not commitments or completed work. Verify at least these failure cases: a decorative/non-potable fountain; a winter shutdown; customer-only WC; duplicate municipal/OSM parking; CCTV with only wheel support; a snack machine behind a locked door; unknown pump compatibility; volunteer-only workshop access; a facility across a river; a stop that misses a train; empty/partial provider responses; and two visits to the same place on a looping route.

Measure service classification and attribute correctness, duplicate rate, entrance/access mistakes, missing-hours/condition rates and user task success. Assess coverage against a reviewed local reference sample; a higher pin count alone is not success. Provide a source/correction link initially; moderated user reports with observation dates are a later improvement, without automatic edits to OSM or instant verified-status upgrades.
