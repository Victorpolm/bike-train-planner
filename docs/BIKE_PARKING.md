# Bike parking: proposed next milestone

_29 September 2026. Status: design proposal informed by current code and a fresh public-data audit. The basic official map layer exists; the improvements below are not implemented._

## Product question

Help the traveller answer: **Where can I leave this bicycle, reach my destination, and retrieve it when needed?** A useful answer needs access, suitability and conditions as well as a point on a map.

Begin with destination parking and user-selected stations/map points. Keep the current bicycle-accompanies-traveller mode. A commuter mode that deliberately leaves a bicycle at the departure station is a separate product/routing decision; see the final section.

## What we already have

[`bikeParking.ts`](../prototype-v0/src/bikeParking.ts) normalises the official combined feed and filters BIKE facilities. [`parkingHandler.ts`](../prototype-v0/server/parkingHandler.ts) serves `/api/parking`, caches a successful response for up to a day per server instance and can return stale data on refresh failure. The browser loads it when its optional layer is enabled; [`MapView.tsx`](../prototype-v0/src/MapView.tsx) displays in-view pins at zoom 10 and above.

Cards currently expose name/operator, broad type, cover indication, nominal capacity, a public-access flag, descriptive traits and a link. The app does not yet structure prices/opening hours, join local/OSM records, find entrances, recommend facilities or alter the route for parking. It does not report live free places.

## Fresh audit: what the source can and cannot supply

The [29 September audit](experiments/bike-parking-source-audit-2026-09-29.json) inspected the current official download at 08:46:49 UTC:

| Observation | Count | Interpretation |
|---|---:|---|
| Bicycle facility records | 1,608 | Facilities, not individual spaces; some coverage is outside Switzerland near borders |
| BIKE_STATION records | 139 | A category to enrich; not automatic evidence of a particular access method or staffed service |
| Bicycle records with operating-time structures | 570 | A populated structure still needs interpretation and validation |
| Bicycle records with pricing-model structures | 143 | Presence does not establish a usable tariff or free parking |
| Bicycle records with descriptive traits | 303 | Useful service/access evidence, with incomplete coverage |
| Bicycle current occupancy or forecasts | 0 | Do not promise free-space information from this feed |
| Car records with current estimated occupancy | 435 | Do not transfer these estimates to adjacent bicycle facilities |

All bicycle records carried `publicAccess: true`, including stations whose traits mention badge access. Therefore public access, required registration/badge, payment and unrestricted walk-in access must be separate concepts. A sampled pricing model had a zero-priced segment; this alone does not justify labelling the facility free. A sampled operating-time interval had identical midnight endpoints: confirm its meaning before calling it 24/7. The current app appropriately does not publish tariffs from these unvalidated fields.

The source has station-related `uic`/`didokId` properties; the current normalised model does not preserve them. Retain source identifiers for reviewed station linking; do not derive stop IDs arithmetically. A feature point or polygon is not proof of the correct entrance.

## Source strategy

| Source | Use in the proposed pilot | Boundary |
|---|---|---|
| [Official bicycle/car feed](https://opentransportdata.swiss/en/cookbook/road-traffic-cookbook/bike-and-car-parking/) | Keep the existing station/partner backbone and provider IDs | It is not an inventory of every street rack; audit attributes before using them in decisions |
| [Zürich municipal parking data](https://data.stadt-zuerich.ch/dataset/geo_zweiradparkierung) | Fill local destination gaps; inspect vehicle type, capacity and fee indication | Filter motorcycle-only records; the published CC0 dataset explicitly excludes occupancy and can miss temporary removals |
| [OpenStreetMap bicycle parking](https://wiki.openstreetmap.org/wiki/Tag:amenity=bicycle_parking) | Additional racks, parking forms and mapped access/fee/maxstay/cover details | Missing tags remain unknown; public/customer/member/private access need different treatment |
| Facility/operator pages and [SBB guidance](https://www.sbb.ch/content/internet/sbb/en/support/produkte-services/services/weitere-sbb-services/veloparking-am-bahnhof.html) | Review practical entry, retrieval, tariff and subscription requirements | Link and record a dated review; do not assume an undocumented API or bulk-reuse permission |
| [Forum Velostationen](https://www.velostation.ch/de/velostationen/) | Discover operator sources and validate pilot stations | A directory listing is not automatically a licensed bulk dataset or live availability service |

Retain source attribution/reuse conditions when enriching records; OSM's [licence and attribution requirements](https://www.openstreetmap.org/copyright) remain applicable. Prefer explicit IDs and reviewed facility identity when joining sources. Nearby points alone must not merge racks on opposite sides of a station, a paid velostation and a free rack, or multiple entrances. Store an entrance as part of its facility, not as extra parking capacity; never sum duplicate source capacities.

Use field-level evidence: operator information for its access/tariff terms, local data for municipal facilities, OSM for additional geometry/attributes. Preserve conflicts and timestamps rather than applying one universal source priority. Retain fetched-at, provider-updated-at and independently reviewed-at separately.

## Proposed user experience

1. From a destination/station or selected map point, choose **Find bike parking nearby**. Load this independently of route search.
2. Show an initial **three-option shortlist** plus Show more and the map. Describe reasons such as closest supported access, covered, or controlled-access entry. The shortlist size is a pilot default to validate, not a proven optimum.
3. Keep optional choices compact: a short visit, the day, or overnight; covered; controlled access; free where verified. Ask for a retrieval time only when hours or overnight access make it relevant. Distinguish a preference from a hard requirement.
4. A card shows name/type, distance or routed access time, cover/rack/access features, usable hours, known fee or unknown price, nominal capacity, availability unknown, operator link and evidence date.
5. **Show access** previews a path to a known entrance. **Use as destination** or **Add as stop** changes the journey only after an explicit action and re-evaluates onward timing. If access cannot be routed, retain the facility with an unverified-access label rather than drawing a straight line as a navigable route.

For a final parking choice, keep the original destination visible and distinguish arrival at the parking entrance from arrival at that destination. Show an onward walking route only when supported. Initially keep that as an access preview; incorporating park/lock/walk timing into a promised arrival requires a real parking transition in the journey model. An intermediate visit must include retrieving the bicycle before further cycling or bicycle-carrying transit.

**Example card pattern (illustrative, not a real facility):** “Station west entrance · 3 min access · covered · badge needed · tariff unknown · opening/retrieval hours checked · 80 places total · free spaces unknown.” If no path has been calculated, show approximate distance instead of invented minutes.

Use a synchronised accessible list and map, clustering where necessary, clear selected states and an explanation when the map is zoomed too far out. Offer retry/stale-data states. Absence of mapped parking must read “No suitable parking found in these sources,” not “No parking exists.”

## Suitability and ranking

**Proposal:** Apply confirmed restrictions first, then compare the remaining choices by routed access time and the user's explicit preferences. Retrieve a bounded geographic candidate set, route only shortlisted entrances and broaden the search on request. Do not let unknown information improve a score.

- Check access at arrival **and retrieval**, maximum stay and any membership/payment requirement. A facility open when the bicycle is left may be closed when it is collected.
- Distinguish shelter, frame-locking racks, individual lockers, controlled entry, staff and CCTV. Covered is not secure, CCTV is not a guarantee, and an e-bike/cargo-bike must not inherit suitability from an ordinary-rack label.
- A hard “verified free” or “verified controlled entry” filter admits only supported matches. Show unknown alternatives separately with an explicit relaxation; do not silently satisfy the requirement.
- Show the evidence behind a recommendation; avoid a single unexplained security score. No theft-risk prediction or availability guarantee is proposed.
- When two sources conflict on hours or charges, show the conflict/check link and exclude unsupported certainty. Retain price currency, time basis, validity and access product separately; zero is accepted only when the source actually establishes a free tariff for that use.

SBB's current guidance distinguishes controlled-entry and supervised facilities and notes that a Velocity subscription does not guarantee a parking space. This supports treating payment/access rights separately from occupancy or reservation [SBB guidance above].

## Data model and loading

Extend the existing facility model with source IDs, aliases, station association, geometry role (facility/entrance), parking form, cover, access requirements, verified features, capacity by supported bike type, operating/retrieval schedule, maximum stay, tariff evidence and links. Represent true/false/unknown separately. Store each material claim's source, date and status; do not invent staff, security, opening or cargo suitability from the name.

Keep the server adapter, normalisation/deduplication, suitability logic and presentation separate. Preserve the existing on-demand load and stale-data fallback. Start with bounded local/viewport queries and cached official data; do not download a national OSM extract on every map movement. The existing national OSM audit is a possible offline input, not a deployed amenity service. Confirm public-endpoint usage limits or the existing-host implementation before expanding ingestion. No new paid host or recurring job is authorised by this proposal.

A future occupancy integration would need a bicycle-specific facility match, measurement/estimate distinction, observation time, expiration rule and usable operating terms. Stale/absent data returns to unknown. Nominal capacity or a paid subscription cannot substitute for it.

## Proposed first delivery and acceptance cases

**Pilot proposal:** approximately 20 facilities in Zürich, Winterthur, Bern and Chur: ordinary/covered racks, controlled-entry stations, separate entrances, a non-station destination and sparse/contradictory data. First inspect maps and operator sources; record entrance geometry as unverified until corroborated. Physical access cannot be established by a desk review alone.

| Case | Required result |
|---|---|
| Same facility in official/local/OSM data | One facility with all relevant source references; no double-counted capacity |
| Nearby free rack and paid velostation / opposite station entrances | Preserve distinct options and the correct entrance relationship |
| Covered parking with no entry-security evidence | Covered only; no secure/guarded promise |
| Public flag plus badge/subscription requirement | Both facts displayed; do not imply immediate walk-in access |
| Capacity supplied, occupancy absent | Total spaces and availability unknown |
| Car occupancy beside a bike facility | No bicycle free-space estimate |
| Fee absent or an unexplained zero; ambiguous midnight hours | Price/hours unverified, with source link |
| Open on arrival, closed at collection / maximum stay exceeded | Explain the conflict; do not recommend as satisfying the stated stay |
| Path reaches wrong side of station / access path fails | No misleading travel time or straight-line navigation claim |
| User adds parking during a transfer | Explicit route edit; retain/retrieve bicycle, time budget and feasibility checks |
| Supplier fails or data is stale | Route search still works; stale/unknown parking state visible |
| Keyboard, small screen and dense pins | Facility can be found and selected from the list; map interaction is not mandatory |

**Completion gate:** review the pilot records and applicable reuse terms, verify these cases, and run a few end-to-end user tasks before adding bike shops. During implementation run the relevant tests/build and record what was actually verified. Pilot parameters and access-time assumptions should be calibrated from observations, not presented as fixed truths.

## Separate future mode: leave the bicycle and take public transport

Offer this only as an explicit additional choice if the user wants it. A route state must track whether the bicycle is with the traveller or stored at a specific facility. After parking, onward transit is passenger-only and onward cycling with that bicycle is impossible until retrieval. Account for the approach, entry/locking allowance, walk to boarding, accessible path, hours at both ends, parking tariff and a realistic return plan. A destination bicycle/rental requires its own explicit pickup/return model.

Compare this mode with taking the bike along using complete door-to-door time and relevant costs. Do not remove bicycle fares/requirements from today's journeys merely because a parking pin is nearby. No occupancy, space reservation, sales or automatic mode change is part of the first parking milestone.
