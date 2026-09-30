# Facility precision: rural water first, indoor locations second

_Historical research recorded 30 September 2026. The subsequent user-authorised implementation, source scope and remaining gaps are in [FACILITY_SOURCES_2026-09-30.md](FACILITY_SOURCES_2026-09-30.md). ETH is excluded from that follow-up scope; earlier proposed gates below preserve the research-stage decision._

## User decision

Prioritise actionable precision over increasing the number of facilities. Water matters especially where alternatives are scarce. Within the useful-stop milestone, address rural refill reliability first and exact locations in large buildings second. Retain the earlier limit of about ten priority stations and avoid a separate maintenance project for every municipality.

Precision has several independent parts: finding the actual outlet/entrance, knowing whether the water is reported drinkable, knowing public access and seasonal/opening conditions, and knowing how recently each claim was checked. A more precise coordinate does not establish that water is flowing today.

## Sources inspected and live checks

### 1. Graubünden Tourism / Flims Laax Falera: useful rural evidence

The destination publisher explicitly describes the fountains at [Sagogn Planezzas](https://www.graubuenden.ch/de/ausflugsziele/wasserbrunnen-sagogn-planezzas) and [Crestasee](https://www.graubuenden.ch/de/ausflugsziele/wasserbrunnen-crestasee) as drinking-water refill points. Both pages identify Flims Laax Falera Management AG as responsible for the content. The publicly served page data includes POI coordinates, independently of the contact address shown on the page.

**Observed comparisons:**

- Sagogn Planezzas: the publisher's map position is about 1.3 m from OSM node `2462013850` in our retained national extract. This is a candidate identity match, not an automatic merge or proof of independently surveyed geometry. The provider adds a named source and explicit refill description to a sparsely tagged OSM point.
- Crestasee: no candidate was found within 500 m in that extract. A fresh, successful Swiss Overpass query covering drinking-water/fountain/water-point tags, taps/wells, explicit drinking-water attributes and natural springs within 600 m returned **zero records**. This is a source-response gap around the publisher's coordinate, not proof about the physical site or a complete global OSM audit.

**Limitations:** the pages do not provide a recent on-site observation date, current flow or a reliable winter/shutdown schedule. Their common contact street address must not be geocoded as the fountain location. Public web visibility does not establish bulk-import or photo-republication rights. These are strong candidates for a small reviewed pilot; no machine-readable tourism feed was authenticated or integrated.

### 2. SBB Trafimage / INSA: actual indoor service data is available

This is a more detailed source than the **63 station-plan links** investigated earlier. The [Trafimage developer portal](https://doc.trafimage.ch/) links to the [INSA Export API documentation](https://api.insa.geops.ch/docs/). Its documented public GeoJSON endpoints succeeded **without a key**:

| Request | Observed result for Zürich HB |
|---|---|
| `/export/geo/stations/8503000/services` | HTTP 200; 219 service features |
| `/export/geo/floors?didok=8503000` | HTTP 200; 5 named floor records |
| `/export/geo/accesses?didok=8503000` | HTTP 200; 737 access-point features |

Base URL: `https://api.insa.geops.ch`. These are service/geometry counts, not counts of unique cycling amenities or verified accessible routes. The API's parameter is called `didok`, but Zürich HB required the full identifier `8503000`; requests with the earlier plan feed's `didok_nr=3000` returned HTTP 200 and empty collections. Preserve provider identifiers explicitly instead of silently deriving or conflating them.

The service records include coordinates, category, multilingual descriptions, `floor.level`, named floors, `location_details_*`, structured opening hours, `modified`, and `url_identifier`. A toilet entry supplies **Passage Sihlquai**; the Hygienecenter entry supplies **Mezzanine level**. These details can make an existing pin substantially more useful.

**Semantic checks still needed:** the Hygienecenter's general floor label is the first basement while its location text specifies the mezzanine. Another service has a ground-floor map label but a third-floor location description. A map floor could describe an access/representation level; that interpretation is not established. Retain both fields and review conflicts, rather than replacing precise directions with one numeric level. Several close toilet entries may represent components or overlapping records. Access-point geometry alone is not a connected bicycle/pedestrian indoor routing graph.

**Reuse remains an open question:** the portal describes much station data as open, and these routes are labelled OpenAccess, but its linked [January 2024 terms](https://doc.trafimage.ch/Bestimmung_Datenabgabe_v1_2024_DE.pdf) contain purpose/publication/redistribution restrictions. Establish which licence applies specifically to the public exports before production ingestion. Technical access is demonstrated; unrestricted republication is not. No request was sent to SBB and no restricted endpoint was accessed.

### 3. swissTLM3D: candidate geometry, not drinking-water confirmation

The official [swissTLM3D 2.4 object catalogue](https://www.swisstopo.admin.ch/dam/de/sd-web/A3kQ2dAgenqG/2025-03), whose fetched cover says February 2026, contains `TLM_EINZELOBJEKT` types **Brunnen** and **Quelle**. Both are marked as not systematically collected. The class does not provide a potability/operational-status field.

Use it selectively to flag possible location gaps for review. Do not promote a mapped spring, fountain, reservoir or other water structure into a recommended refill stop without separate drinking-water and access evidence. No national TLM fountain import was run in this investigation.

The [swisstopo app's data attribution](https://www.swisstopo.admin.ch/en/terms-of-use-swisstopo-app) identifies **OpenStreetMap** as its drinking-water-fountain and public-toilet source. Seeing the same place in that app does not add an independent confirmation to our OSM record.

### 4. Building plans and a shared tourism interface

- ETH publishes an [HG F-floor gallery plan, June 2026](https://ethz.ch/content/dam/ethz/associates/services/Service/veranstaltungen/raumlichkeiten/nutzungsinfo-galerie-f-stock-de.pdf). This is a building-orientation source; it does not confirm the Selecta positions. The owner's floor F / beside Starbucks report remains the evidence for those machines, with an approximate building pin.
- [discover.swiss Infocenter Open](https://docs.discover.swiss/business/Business-Service-Katalog/infocenter-services/infocenter-open/) provides a shared interface with per-object data-governance information. Its listed open connectors include the Swiss Parks Network and Zürich Tourism. This could reduce separate publisher integrations, but the specific rural fountain coverage has **not** been demonstrated. Do not assume all Graubünden/Outdooractive records belong to its open product.
- The [access guide](https://docs.discover.swiss/dev/quickstarts/how-to-get-access/) requires a developer account and subscription key; the OpenData product does not require manual subscription approval. General production onboarding and project/data scopes are separate considerations. Check a sample for useful fields and rights before requesting access. No account, paid plan or key is required to reproduce the public SBB and tourism checks above.

## Proposed bounded next work

1. **Rural-water pilot:** review roughly 15–20 refill points along a selected cycling corridor in Flims–Laax–Sagogn–Trin. Include the Crestasee gap and the Sagogn overlap. Use the existing reviewed-inventory format, explicit source identities and field-level evidence. Obtain current access/seasonality observations or leave them unknown. Retain negative and conflicting evidence.
2. **Make sparse-route gaps visible:** show distance along the actual cycling route to the next eligible refill opportunity, with checked detour/access distance for a small shortlist. Offer an explicit wider search where the current 100 m corridor finds little. Never silently change the user's filter. Describe missing information as “No verified refill point in our data for this section,” not as proof that no water exists.
3. **Indoor pilot:** first Zürich HB and ETH HG, then extend to the previously proposed ten stations only if useful. Show the entrance where evidenced, named floor, short landmark directions and official plan link. Resolve SBB licence and floor/identity ambiguities before automatic import; full indoor navigation remains deferred.

**Acceptance measures:** Can someone find the outlet without searching the building/site? Is drinking-water evidence explicit? Are access and seasonality known or clearly unknown? Does a listed stop turn out to be private, dry, closed or on another floor? How long is the cycling section without a supported refill option? Track correction rate and missing critical fields, not total marker count. A reviewed web source, a provider's modification time, our fetch time and an on-site observation date must remain separate.

**Engineering constraints:** keep OSM as the national base; preserve raw source evidence and conflicts; never merge different floors by proximity alone. Use bounded, independent amenity requests/caches so this work does not consume journey-search time. A field/report sample is not evidence that every Swiss fountain is covered or currently available. No stop insertion or onward timetable promise without visit duration and access-time handling.

## Verification and handoff

The [compact source audit](experiments/facility-precision-source-audit-2026-09-30.json) records response sizes/counts, source URLs, the bounded Overpass query and the specific limitations. Bulk responses are excluded from Git. This change records research and updates project priorities only; application tests/builds were not rerun because application code was unchanged. The previous 265-test/build release gate remains dated to version 38.
