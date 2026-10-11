# Data-source register

_Reviewed 2026-10-11._

Re.route private Swiss beta. API access, data licences and software licences are separate. Unknown rights are not permission. This register is an engineering audit, not legal clearance.

The application serves the same register as [HTML](../prototype-v0/public/data-source-register.html) and [JSON](../prototype-v0/public/data-source-register.json). Update the JSON and regenerate its HTML when a source or policy changes. Software component notices are separate.

## SwitzerlandMobility / FEDRO / cantons — cycling routes and closures via geo.admin.ch

- **Licence:** Open Government Data, open use with source attribution (BY); GeoIV Article 21. Applies to the Veloland geometry and closure data. Texts/photos/logos have separate conditions.
- **Attribution:** Bundesamt für Strassen, Kanton, Stiftung SchweizMobil; official route name/number and link retained.
- **Caching:** App: route lookups 24 hours, closure lookups 15 minutes in bounded server memory. No browser bulk download. Source geometries update periodically; request time is not an edition or field-observation date.
- **Redistribution:** Open-use geometry under attribution. Re.route alterations/connectors are explicitly identified. No marketing descriptions, photographs, logos, partner iframe or Komoot tours copied.
- **Limits:** Explicit request only; three candidate sections; capped identify responses marked partial; 120 km search-area diagonal, 80 km selected official section, 4 MB response, 30,000 route vertices. Closure errors/caps prevent applying.
- **Status:** Enabled for attributed geometry; service availability and physical conditions not guaranteed.

Primary references: [1](https://images.schweizmobil.ch/files/Datenbezug%20SchweizMobil-Routen.pdf) · [2](https://docs.geo.admin.ch/access-data/identify-features.html) · [3](https://opendata.swiss/en/dataset/langsamverkehr-veloland-schweiz)

## OpenStreetMap data — Overpass parking/amenities; routing and place data

- **Licence:** Open Database Licence 1.0 (ODbL); individual contents may carry separate rights.
- **Attribution:** © OpenStreetMap contributors, linked to copyright/licence. Routing views include a map-correction link.
- **Caching:** App: public facility records generally reused for 24 hours; browser stale display capped at seven days. Persisted records can remain until replaced/deleted. Service limits are separate.
- **Redistribution:** Preserve source identities and provenance. Substantial publicly used extracted/modified databases can require an ODbL machine-readable database or alteration offer. Sources remain separate; merged display is not a declaration that all input data is ODbL. Review any public composite database before launch.
- **Limits:** Bounded queries/coalescing to overpass.osm.ch; no bulk scraping beyond approved dataset queries. No availability guarantee. Public-scale service arrangements remain to be reviewed.
- **Status:** Enabled. ODbL obligations apply independently of app software licensing.

Primary references: [1](https://www.openstreetmap.org/copyright) · [2](https://opendatacommons.org/licenses/odbl/1-0/) · [3](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines) · [4](https://overpass.osm.ch/)

## OpenStreetMap standard raster tile service

- **Licence:** Map data is ODbL; hosted tile service has separate usage policy.
- **Attribution:** Visible linked © OpenStreetMap attribution on the map.
- **Caching:** Normal browser HTTP cache; respect upstream cache headers. No offline download, prefetch or tile archive.
- **Redistribution:** Do not treat free tile access as a bulk redistribution or guaranteed hosting entitlement.
- **Limits:** Canonical tile.openstreetmap.org URL; valid browser Referer and User-Agent. Service can block heavy/inappropriate use. Choose an appropriate provider before wider usage.
- **Status:** Canonical hostname and origin-only cross-site Referer configured; owner-private usage retained.

Primary references: [1](https://operations.osmfoundation.org/policies/tiles/) · [2](https://www.openstreetmap.org/copyright)

## swisstopo swissTLM3D terrain and fountain/spring points; GeoAdmin places

- **Licence:** swisstopo free-geodata/geoservices terms (OGD), with dataset-specific source conditions.
- **Attribution:** © swisstopo; swissTLM3D edition/import date retained.
- **Caching:** Compact February 2026 water edition bundled; refresh explicitly when a new edition is reviewed. Terrain responses reused in bounded route checks; geocoding session caches. API availability is separate from data rights.
- **Redistribution:** Attributed use, modification and redistribution permitted under relevant OGD terms. The same grant does not cover every third-party layer visible on geo.admin.ch.
- **Limits:** Bounded geometry/response sizes and deadlines. Topographic fountains/springs do not establish drinkability or access; no national completeness claim.
- **Status:** Enabled with attribution and unknown water suitability.

Primary references: [1](https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices) · [2](https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d)

## opentransportdata.swiss GTFS timetable and station-transfer data

- **Licence:** Open data platform mobility Switzerland (ODMCH) terms, as linked by dataset catalogue.
- **Attribution:** opentransportdata.swiss; publisher/feed dates and processed Re.route index identified.
- **Caching:** Compact current/next-year indexes, source archive hash and validity dates. GitHub refresh twice weekly; Worker manifest cache six hours. Feed validity does not replace ongoing refresh.
- **Redistribution:** Processing/publication allowed under ODMCH terms with source attribution; Re.route owns responsibility for derived indexes and refreshes. General transfer rules only; service-specific exceptions remain excluded.
- **Limits:** 2026 feed valid through 12 December 2026; next-year feed already maintained. No bulk ZIP in app repository. Download/schema/size/hash checks fail closed to a still-valid fallback.
- **Status:** Enabled; twice-weekly maintenance implemented.

Primary references: [1](https://opentransportdata.swiss/en/terms-of-use/) · [2](https://data.opentransportdata.swiss/en/dataset/timetable-2026-gtfs2020)

## Open transport bike/car parking feed (including SBB facilities)

- **Licence:** ODMCH terms; publisher cookbook expressly allows publication. This is separate from Trafimage/INSA.
- **Attribution:** opentransportdata.swiss and original facility/operator provenance where supplied.
- **Caching:** Official parking refreshes after 30 minutes in server/browser caches and periodically while its map layer is visible. Cookbook says every 30 minutes, catalogue daily; the stricter interval is used. Failed refresh can display explicitly labelled older data up to seven days. No occupancy claim.
- **Redistribution:** Publication/processing under ODMCH terms, retaining source and update information.
- **Limits:** Use provider download, deadlines and schema validation. Capacity is not available spaces; no bicycle occupancy evidence is inferred.
- **Status:** Enabled; unrelated to the disabled INSA enrichment.

Primary references: [1](https://opentransportdata.swiss/en/cookbook/road-traffic-cookbook/bike-and-car-parking/) · [2](https://opentransportdata.swiss/en/terms-of-use/)

## SBB / ODMCH OJP 2 timetable, transfers, realtime and bicycle-condition evidence

- **Licence:** ODMCH terms plus registered API access and QoS conditions.
- **Attribution:** OJP / opentransportdata.swiss source and check time retained in evidence.
- **Caching:** Short bounded memory caches, request coalescing; selected journey realtime refresh while visible. Unknown/stale data is labelled.
- **Redistribution:** Processed journey presentation under ODMCH terms. API key is server-only and never redistributed. Permission does not imply bicycle-space availability or booking.
- **Limits:** Published free allowance 50 requests/minute and 20,000/day per key; app shared D1 pacing is at most 40/minute with a conservative rolling daily limit. Other applications using the key remain outside this app’s accounting.
- **Status:** Enabled with shared quota control; access agreement remains separate from source rights.

Primary references: [1](https://opentransportdata.swiss/en/terms-of-use/) · [2](https://opentransportdata.swiss/en/limits-and-costs/) · [3](https://data.opentransportdata.swiss/en/dataset/ojp2-0)

## OJP Fare integration/test system

- **Licence:** ODMCH/API conditions; integration access does not establish production ticket/fare access.
- **Attribution:** Provider/test-system source retained in test tooling; reviewed published tariffs use their own citations.
- **Caching:** Production endpoint disabled; no new test-fare requests from cards or price comparison.
- **Redistribution:** Integration quotations are not a confirmed production offer or sale. Production arrangements and wording must be resolved before re-enabling.
- **Limits:** No test quotes shown in the app. Unknown passenger fares stay unknown; reviewed published bicycle/day-pass and limited local tariffs remain.
- **Status:** Disabled in shipped client and server; parser/integration tests retained.

Primary references: [1](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/)

## SBB Trafimage / INSA station facilities and plan-derived floor details

- **Licence:** Exact endpoint-specific republication permission unverified. General Trafimage terms include agreed-purpose, publication-consent and onward-transfer restrictions.
- **Attribution:** © SBB CFF FFS would remain necessary if a suitable permission is obtained.
- **Caching:** Client acquisition disabled; stored provider records purged on next app load. Server blocks before cache/upstream access. Old code/historical records are not evidence of permission.
- **Redistribution:** Disabled pending written clarification for precise API, fields, audience, caching, derived display and exports. Ordinary external links to official plans do not republish the plans.
- **Limits:** No live facility enrichments or reviewed plan-derived floor/grid entries displayed. Do not extend this restriction to every SBB-origin dataset.
- **Status:** Disabled by default, including old-client endpoint calls. Provider not contacted.

Primary references: [1](https://doc.trafimage.ch/) · [2](https://doc.trafimage.ch/Bestimmung_Datenabgabe_v1_2024_DE.pdf) · [3](https://api.insa.geops.ch/docs/)

## Graubünden Tourism / Flims Laax Falera / Outdooractive POI pages

- **Licence:** No clear permission for automated extraction, caching and republication was verified. A public page is not an open-data grant.
- **Attribution:** Original publisher and content-owner links retained in research documentation.
- **Caching:** Page-derived enrichment disabled; existing provider cache records purged on next app load.
- **Redistribution:** No automatic page-derived POI display pending permission or an independently licensed replacement. Isolated facts and protected presentation/database rights must not be conflated.
- **Limits:** The earlier eight-page pilot is retired from the active UI; OSM and topographic water layers remain.
- **Status:** Disabled pending reuse clarification.

Primary references: [1](https://www.graubuenden.ch/de/ausflugsziele/wasserbrunnen-crestasee)

## transport.opendata.ch public transport and places API

- **Licence:** ODMCH terms for timetables; OSM ODbL for addresses/places/walking data. MIT covers API software, not all returned data.
- **Attribution:** transport.opendata.ch, underlying timetable/OSM attribution.
- **Caching:** Provider encourages caching; app uses bounded short memory caches. Privacy notice says Swiss hosting and request URL/IP logs retained 30 days.
- **Redistribution:** Apply the relevant underlying source licence to the response content.
- **Limits:** Current docs give no fixed per-client quota but throttle repetitive polling. Since 5 October 2026 provider runs its own GTFS/GTFS-RT/MOTIS backend; old search.ch-forwarding descriptions are stale.
- **Status:** Enabled; provider-specific access and privacy terms apply.

Primary references: [1](https://transport.opendata.ch/docs.html) · [2](https://transport.opendata.ch/licenses.html) · [3](https://transport.opendata.ch/privacy.html)

## search.ch timetable API fallback

- **Licence:** API terms grant own-purpose nontransferable service use, prohibit sublicensing and permit fees/blocks/changes. No blanket open-data licence verified.
- **Attribution:** search.ch timetable source and original evidence URL retained.
- **Caching:** App short memory reuse; permissible shared-cache duration and downstream reuse scope require clarification before expansion.
- **Redistribution:** Do not describe API responses as openly licensed or assume a commercial-beta grant. Dedicated API/general terms need reconciliation for intended launch.
- **Limits:** Published 1,000 route requests/day and 10,080 departure/arrival-table requests/day. Existing bounded per-search pacing is not global multi-user control for this provider.
- **Status:** Private-beta fallback only; public/commercial expansion gate.

Primary references: [1](https://search.ch/timetable/api/terms) · [2](https://search.ch/timetable/api/help) · [3](https://search.ch/terms)

## BRouter hosted cycling routing and elevation

- **Licence:** MIT routing software; OSM ODbL road data; separate elevation data conditions. Hosted-service rights are not granted by MIT.
- **Attribution:** BRouter, © OpenStreetMap contributors and elevation-source acknowledgements.
- **Caching:** App uses bounded 30-minute memory reuse. BRouter privacy notice states route-coordinate/IP logs for two weeks plus ten days in backups; processing location not confirmed here.
- **Redistribution:** Public-server commercial entitlement, route-output redistribution and exact elevation provenance remain unverified. CGIAR-CSI elevation terms can impose separate commercial/redistribution requirements; do not mark all output unrestricted.
- **Limits:** Serial bounded requests, timeout/cancellation, no bulk touring-data scrape. No numerical provider quota/SLA verified. Clarify entitlement or use an appropriately licensed hosted/self-hosted alternative for expansion.
- **Status:** Enabled for private testing; commercial/public service and elevation-rights review pending.

Primary references: [1](https://brouter.de/) · [2](https://brouter.de/privacypolicy.html) · [3](https://github.com/abrensch/brouter) · [4](https://srtm.csi.cgiar.org/disclaimer/)

## FOSSGIS routing.openstreetmap.de bicycle backup and walking routes

- **Licence:** OSM ODbL data; separate FOSSGIS hosted-service policy.
- **Attribution:** routing.openstreetmap.de, OpenStreetMap, and fix-the-map link.
- **Caching:** App bounded memory reuse. Additional caching/redistribution conditions in full policy were not verified because its page was inaccessible.
- **Redistribution:** OSM obligations apply to data; no service availability or unlimited commercial hosting entitlement assumed.
- **Limits:** Maximum one request/second, valid User-Agent/Referer, no scraping/heavy use. Current queue is shared within one browser; aggregate public-scale control is a remaining gate.
- **Status:** Private-beta use only pending scale/policy review.

Primary references: [1](https://routing.openstreetmap.de/about.html) · [2](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/)

## Photon public geocoder at photon.komoot.io

- **Licence:** OSM ODbL underlying place data; Apache 2.0 Photon software. Public demo service has separate fair-use limits.
- **Attribution:** Photon and © OpenStreetMap contributors in place search.
- **Caching:** Debounced/bounded place lookup and session reuse; no numerical cache TTL or retention established by this audit.
- **Redistribution:** Apply OSM terms to geocoded data; no Komoot tour descriptions, photos or scenic-route recommendations are used.
- **Limits:** Reasonable request volume only, throttling/bans possible, no uptime guarantee. Review dedicated hosting before larger scale.
- **Status:** Enabled for bounded private use; hosted-service conditions remain distinct.

Primary references: [1](https://photon.komoot.io/) · [2](https://github.com/komoot/photon/blob/master/README.md)

## SBB / PostBus / RhB / other operators and fare associations — reviewed fares and bicycle rules

- **Licence:** Short factual tariff/policy summaries with links. No blanket licence to copy websites, images or tariff publications asserted.
- **Attribution:** Per-rule original publisher URL, checked date and validity dates.
- **Caching:** Reviewed dated constants/catalogues; changes require source review. Future or unsupported tariff coverage stays unknown.
- **Redistribution:** No full tariff documents, photographs or website prose redistributed. App estimates and operator purchase offers are distinguished.
- **Limits:** Bicycle permissions, ticket entitlement, reservation requirement and available space are separate. Normal day-pass prices do not establish every operator/reservation charge.
- **Status:** Enabled within reviewed scope; future tariff changes need review.

Primary references: [1](https://www.sbb.ch/en/offers/bike-day-pass) · [2](https://www.postauto.ch/en/travel-and-services/travel-advice-and-reservations/travelling-with-a-bike)
