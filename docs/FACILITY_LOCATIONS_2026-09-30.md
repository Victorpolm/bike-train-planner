# Facility floors, directions and reviewed additions

_Implemented 30 September 2026 following the owner's approval of the bounded plan. Publication details are recorded below after deployment verification._

## Delivered behaviour

- Water/toilet, food and repair imports preserve `level`, `level:ref`, `addr:floor`, building/place/unit/door descriptions, indoor setting, entrance type and available localised description/accessibility text. Floor labels take precedence for presentation; numeric levels remain retained. `layer` is not interpreted as a floor.
- Location details appear first in facility popups. Closest results show the known floor and reviewed directions prominently, with complete sources/access details available below. An indoor record with no usable floor stays unknown.
- A small reviewed inventory supports new places and location enrichment for known OSM identities. It works across the existing facility categories without a municipal connector or new database.
- **ETH HG:** one food/vending marker represents the owner's report of at least two Selecta machines on **floor F beside the Starbucks coffee machines**. The point is the centre of OSM building way `192151232` at 47.3764269, 8.5478101, explicitly labelled an approximate building reference. It is not an exact machine location or entrance. Products, stock, access and hours are unknown. Brand alone still cannot classify arbitrary OSM vending machines as food: this reviewed report is separate from the OSM import rules.
- **Zürich HB:** existing OSM toilet components `node/4424615154` and `node/4833061590` retain their identities, geometry and all original access/fare/hour/floor tags. Additional SBB evidence supplies **Zwischengeschoss (intermediate floor), grid L7**, signage guidance and an official station-plan link. The plan is dated December 2025 and was reviewed on 30 September 2026; this is not an on-site visit or a current-entrance verification.
- Source links distinguish OSM, the owner report, the building reference and the SBB document. Text remains plain text; links reject unsafe schemes and embedded credentials.
- Reviewed additions remain available while the OSM request loads or fails. The panel exposes the missing/loading source and says that closest searches only available records. Approximate locations may participate in closest results, with explicit building-point/straight-line distance limitations.
- The internal normalised-data cache keys move to v2 so a previously cached response cannot continue hiding floor fields. Public API routes and provider validation remain unchanged; network responses cannot inject locally reviewed fields.

## Inventory maintenance

Edit [`prototype-v0/src/reviewedAmenities.ts`](../prototype-v0/src/reviewedAmenities.ts). Each entry has a stable review ID, a location object and dated evidence. An `addition` contains a local facility ID, supported coordinate precision, categories, source tags and optional explicitly reported service kinds. A `location-details` entry lists exact OSM identities to enrich. Do not guess indoor machine coordinates, access permissions, stock or opening hours.

If an addition is later mapped in OSM, review the match and populate `replacesOsmIds`. The local duplicate is suppressed when that matched OSM record is loaded; it can still serve as an attributed fallback during source failure. Nearby records are not merged automatically, and facilities on different floors remain distinct. This is a maintained file, not a public submissions system or automatic OSM editor.

## Verification

- **265 application tests in 11 suites passed**, including seven new regression cases covering retained floor/descriptions, unknown floors, coincident records on different floors, HG under source failure, HB enrichment without changing restrictions/identities, explicit migration of an addition to OSM, safe source links, and refreshed cache fields.
- TypeScript and frontend/Worker production builds passed. Existing frontend bundle-size guidance remains a non-failing warning.
- Reprocessing the previously captured 29 September regional source responses produced: 16,276 quick-food records including the one HG addition (1,242 with floor information); 38,552 water/toilet records (753 with floor information); and 2,425 repair records (63 with floor information). These are snapshot/import counts, not completeness or on-site verification claims.
- On those snapshots, closest vending at the HG building reference selected the reported HG record; both intended HB records received their floor/zone/plan evidence.
- Browser interaction/visual QA was unavailable because the managed preview's required browser-control skill was not available. No alternative browser path was used. Function, build and source-data checks do not constitute browser QA.

## Scope and next check

Detailed indoor curation remains bounded to a proposed maximum of ten priority stations; only the Zürich HB example is enriched in this release. ETH HG is a separate building test. Other places still benefit immediately from retained OSM location tags.

Full indoor navigation, verified entrances, opening-at-arrival, stop insertion and city imports remain future work. Closest is straight-line proximity to a mapped point/centre, never a promise of the shortest indoor walk. Routing, fares, bicycle permissions and website audience are unchanged.

**Next user check:** refresh the app, set A to ETH HG, enable Food and the food/drink machine subtype, and inspect the reported location. For the all-area test, uncheck Along selected journey if a route is selected. Then inspect Zürich HB Hygienecenter in Toilets and open its station plan.

The separate [opendata.swiss investigation](OPENDATA_SWISS_2026-09-30.md) records the API contract, live HTTP 403 limitation, announced platform migration, lookup script and successful SBB feed with 63 station-plan references. It adds no runtime catalogue dependency.

## Publication

Owner-private **version 38** succeeded on **30 September 2026 at 08:18:00 UTC** (10:18 Europe/Zurich), environment revision **3**. Site source: `e05ca81b8c133d700bfb40b8c232939bd15fa7da`. Deployment: `appgdep_6abcc5a6453c81918b8933f2aff9a292`. Audience rechecked: owner only, zero external visitors. [Open the planner](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site).
