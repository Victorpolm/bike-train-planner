# Swiss public fare data and operator coverage audit

Reviewed 11 October 2026. This research supports Re.route's **information-only** scope: explain necessary passenger/bicycle tickets, applicable requirements and the fare where it can be determined. It does not add ticket sales, reserve capacity, promise a space, or activate the experimental data below.

## Conclusions for implementation

1. **Published standard fares can be shown without selling tickets.** A sales integration is not a prerequisite for a reliable, correctly scoped published-tariff calculation. The remaining engineering work is binding the actual journey, ticket product, zones/path, date, class and traveller/bicycle eligibility to that tariff.
2. Public information is substantial: national rules, participation matrices, local tariff publications, an operator inventory, real-time coverage declarations and a NOVA linked-data pilot are available. “We need a separate commercial agreement with every operator before informing users” would be too strong.
3. **The public sources examined do not yet establish a complete, current, automatically executable national fare engine.** The OJP Fare cookbook still labels its backend as integration/test. Offline OSDM has restricted route coverage. The live NOVA linked-data audit found a specific missing relationship between zone-price records and their tariffs/pay levels.
4. Use public tariffs for verified standard products, report their dates and conditions, and retain unknown for unbound components. A current published standard fare is useful even when saver availability is unavailable; do not call it a live sales quote or guarantee that it is the cheapest offer.
5. Request a narrow clarification about **read-only production price information** and the linked-data defects before assuming that the full SMAPI ticket-sales onboarding is necessary. No provider has been contacted in this work.

## National source ledger

| Public source | Verified content | Usable now / remaining boundary |
|---|---|---|
| [OJP Fare cookbook](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/) and [dataset](https://data.opentransportdata.swiss/dataset/ojpfare) | Currently describes NOVA integration/test data, not production. Supports future Swiss trips and Half Fare queries; prices are non-binding. | Useful for development, not an authoritative passenger price source under the current documentation. |
| [OJP Fare 1.4.0 release, 23 July 2026](https://opentransportdata.swiss/de/neue-version-1-4-0-von-ojpfare-produktiv-gesetzt/) | Service release improves SLOID handling, train numbers and NOVA field mapping. | “Service deployed” does not itself confirm a switch to production fare data. The cookbook's contrary environment description remains unresolved. |
| [Official OJP–NOVA implementation](https://github.com/openTdataCH/ojp-nova/blob/master/README.md) | NOVA team agreement and channel credentials are required; INT/PROD configurations differ. Tariff codes must be passed through. Commercial stops should be taken from place context, not guessed from SLOID; the pricing trip should use scheduled service identity. | A concrete future adapter path. Do not infer permission to call production from the public source code. |
| [SBB NOVA production API listing](https://developer.sbb.ch/apis/nova/information) and [API hub](https://api-hub.nova.sbb.ch/) | Production API and technical documentation are publicly discoverable. | Listing/documentation availability is not evidence of granted, anonymous or free production access. No new registration or subscription was attempted. |
| [SBB Swiss Mobility APIs](https://company.sbb.ch/en/offers/services/swiss-mobility-solutions/api.html) | Describes broad national/local product coverage and an approved integration route. Published standard conditions concern distribution, including contracts, acceptance and sales obligations. | This is one option for future sales. Those sales conditions must not be imposed on our information-only MVP without checking a more suitable arrangement. |
| [OSDM offline dataset](https://data.opentransportdata.swiss/en/dataset/osdm-offline) and [cookbook](https://opentransportdata.swiss/de/cookbook/open-sales-and-distribution-model/) | Precomputed NOVA routes primarily relevant to international distribution. Local transport is absent or very limited. It is not sufficient authority for third-party ticket sales. | A possible bounded standard-fare import, not a nationwide local-fare solution. Validate the actual embedded calendars/currencies/conditions before use. |
| [OSDM resource metadata](https://data.opentransportdata.swiss/en/dataset/osdm-offline/resource/f58119bb-6d19-4619-ab8f-e6a0bf250667) | Last-data-update metadata is 23 June 2023; update interval is irregular. | No 2026 prices activated. The ZIP could not be downloaded in this audit, so its current embedded validity was not verified. Metadata alone does not prove every file record is expired. |
| [NOVA linked-data cookbook](https://opentransportdata.swiss/de/cookbook/alpha-linked-open-data-versuch-mit-nova-daten-und-haltestellen/) | Describes daily transformation of selected NOVA data, zone models and some direct-traffic information. The project is a completed experiment operated on a best-effort basis. | Endpoint was queried successfully; detailed findings below. A reachable endpoint is not a contractual freshness/coverage guarantee. |
| [Swiss GTFS documentation](https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/) | Documents the delivered timetable files and provider identifiers. No fare-price files appear in the enumerated delivery. Tariff-code hints distinguish some products. | Do not infer that GTFS supports our fare calculation merely because the general standard has fare extensions. Tariff codes are not numeric prices or complete zone bindings. |
| [Open-data terms](https://opentransportdata.swiss/en/terms-of-use/) | Open datasets may be processed and published; source attribution and regular updates matching underlying data are required. File downloads do not require paid registration. | Applicable to these explicitly open datasets. Does not automatically grant access to every SBB API or reuse rights for every linked operator website. |

## Actual NOVA linked-data investigation

Endpoint: <https://lindas.admin.ch/query>. The inspected NOVA graph is `https://lindas.admin.ch/sbb/nova`. Queries succeeded on 11 October 2026 without an API key. Results and per-query retrieval timestamps are in [NOVA_LOD_PUBLIC_FARE_AUDIT_2026-10-11.json](NOVA_LOD_PUBLIC_FARE_AUDIT_2026-10-11.json).

Observed results, not an assumed nationwide coverage claim:

- 25 precomputed direct-traffic price tables returned by the unbounded table query. Their labels cover TILO, Léman Express, TER, Alpbus and related cross-border products.
- 6,131 `Tarifwertpreisauspraegung` objects with prices, and **23,812 `ZoningPriceCharacteristic` objects with prices**. The zone-price model is much broader than the 25 direct-traffic tables.
- The zone-price objects have amounts and currency; many have class/frequency code, and some have a customer-segment link. **No inbound relationship to any of those 23,812 price objects was returned.** A named-graph check for a sample also found no inbound relationship. It is therefore not safe to assign a floating price to a tariff by matching its amount or guessing its numeric object ID.
- Enumerating predicates on the price, tariff, zoning-plan and pay-level object types found no effective-from/effective-through fields. Ticket duration exists on pay levels; that is distinct from the dates on which a tariff price is effective.
- ZVV `490_EB` and `490_EB_VELO` are present, with pay levels including 1–2 zones. That level records one hour; zone 110 records a price factor of two. The same graph contains Mobilis and Unireso product descriptions. **The missing price relationship prevented a meaningful numeric comparison with their official price tables.** Presence of a familiar amount somewhere in the graph would not be a validation.
- Exact transport-edge-to-zone associations exist. For example, the graph connects the Zürich HB–Winterthur SBB rail edge to ZVV zones 110, 121, 130 and 131. This is useful input for candidate topology imports. It still needs selected path, operator, mode, service applicability and validity checks; it must not become a cheapest-path zone guess for any journey with the same endpoints.

The schema and examples linked by the publisher are [here](https://github.com/zazuko/opentransportdata-swiss/blob/main/nova.sparqlbook.md). These observations justify investigating a repaired public standard-fare pipeline; they do not justify activating raw pilot prices today.

Reproduce the decisive price-link check:

```sparql
PREFIX otd: <https://lod.opentransportdata.swiss/vocab/>
PREFIX schema: <http://schema.org/>
SELECT (COUNT(DISTINCT ?price) AS ?priceRecords)
       (COUNT(?inbound) AS ?inboundLinks)
WHERE {
  ?price a otd:ZoningPriceCharacteristic ; schema:price ?amount .
  OPTIONAL { ?inbound ?predicate ?price }
}
# Observed: priceRecords=23812, inboundLinks=0
```

Reproduce effective-date/schema inspection:

```sparql
PREFIX otd: <https://lod.opentransportdata.swiss/vocab/>
SELECT DISTINCT ?p WHERE {
  VALUES ?type {
    otd:ZoningPriceCharacteristic otd:Tarif otd:ZoningPlan otd:PayLevel
  }
  ?s a ?type ; ?p ?o .
}
```

Useful future engineering sequence: fetch candidate graph → validate tariff/price join → map profile segments → bind actual service path → verify against current public tariff → record source hash and effective dates → publish a versioned standard-fare table. Stop at the first missing binding. Never silently convert a daily successful fetch into a renewed tariff validity date.

## National rules and coverage are public

[T600, edition 1 June 2026](https://www.allianceswisspass.ch/de/asp/Downloads?download=2666), chapter 7, provides the national bicycle framework: accepted configurations, exclusions, operator-defined special-bike conditions, child concessions, bike products and reservation obligations. It also contains a short-term Rent a Bike concession subject to its conditions. A product price is not proof that every service can carry the bike. The current rule must be matched to the participating network and any service restriction.

[T601, edition 1 June 2026](https://www.allianceswisspass.ch/fr/asp/Telechargements?download=16350) describes national passenger price construction, regional-fare precedence and ticket validity. A route distance from the map is not the tariff distance. Mixed operators may use different price/distance combination rules. Local journeys inside an integral fare network use that network's products; an arbitrary national distance calculation is not a substitute.

[T603](https://www.allianceswisspass.ch/de/asp/Downloads?download=2700), section 2.1, and [T604, edition 1 June 2026](https://www.allianceswisspass.ch/de/asp/Downloads?download=2669), section 2.1, state that the applicable prices are those calculated by NOVA. Their public route/exception information is useful, but these documents are not complete executable origin–destination price tables.

The [official participation matrix, edition 1 June 2026](https://www.allianceswisspass.ch/de/asp/Downloads?download=21132), has separate columns for T600 bicycle self-service, T601, T604, GA and Half Fare. Examples show why mode-wide assumptions fail: CGN and SGZ participate in T600 bicycle self-service, while SGV and several other boat operators do not; Aletsch feeder lines differ from other Aletsch services. A `no` in the T600 column means national scheme nonparticipation, **not automatically a bicycle ban**. Consult the operator's own tariff/rules. Regional-network rows may explicitly defer to the individual transport company.

The [PostBus bicycle page](https://www.postauto.ch/en/travel-and-services/travel-advice-and-reservations/travelling-with-a-bike) confirms published carriage/reservation guidance, CHF 2 reservations, selected seasonal tourist-route requirements, and national bike day/annual pass acceptance. It also contains inconsistent special-bike statements: a prohibited-types section coexists with a special-bike fare paragraph. Some child/trailer wording differs from the current national text. Preserve that as a targeted clarification gap; do not infer permission from the presence of a price.

## Inventory to audit every relevant company systematically

Files produced:

- [SWISS_OPERATOR_COVERAGE_INVENTORY_2026-10-11.csv](SWISS_OPERATOR_COVERAGE_INVENTORY_2026-10-11.csv): joined audit inventory.
- [SWISS_OPERATOR_COVERAGE_INVENTORY_2026-10-11.json](SWISS_OPERATOR_COVERAGE_INVENTORY_2026-10-11.json): exact retrieval-completion timestamps, hashes, counts, scope and join method.
- [SWISS_REALTIME_DECLARATIONS_2026-10-11.csv](SWISS_REALTIME_DECLARATIONS_2026-10-11.csv): preserved publisher real-time declarations.

Inputs: [Atlas current-day business organisations](https://data.opentransportdata.swiss/dataset/business-organisation-v2/permalink), and [real-time coverage declarations](https://data.opentransportdata.swiss/dataset/go-realtime/permalink), from **opentransportdata.swiss**. The [real-time cookbook](https://opentransportdata.swiss/de/cookbook/realtime-prediction-cookbook/go-realtime/) defines `etAUS`, `ptREFAUS`, `complete` and the comment exceptions, including future integration projects and conditional replacement services.

The 1,286 current-day Atlas business-organisation records are **not 1,286 distinct Swiss transport companies**: they include operating divisions, foreign entities, tariff organisations and internal accounting entries. The real-time source contains 181 declaration rows for 179 identifiers. The join preserves all three PostBus delivery-partner rows and adds 20 real-time-only identifiers, yielding 1,308 rows for 1,306 distinct identifiers. It does not discard those extra declarations or treat planned projects as operational feeds.

| Derived declaration category | Rows |
|---|---:|
| Estimates declared complete | 98 |
| Estimates declared complete with notes | 2 |
| Estimates declared partial/qualified | 49 |
| Future integration project: not live | 2 |
| No estimates declared | 3 |
| Conditional replacement services | 27 |
| Not listed in the real-time inventory | 1,127 |

These counts are catalogue evidence, not observed service uptime or accuracy. All live-estimate, bicycle-rule and fare audit fields deliberately remain unverified in this inventory. “Not listed” does not prove no real-time data anywhere. The publisher's real-time resource was last updated **9 July 2026**; use its declarations to choose live checks, not to bypass them.

To complete the national audit: filter to operating business types and relevant services → map exact OJP operator identifiers → attach primary bike-rule and tariff sources → validate regional/line exceptions → measure sample real-time journeys → record failures and owners → add updates to monitoring. This supports whole-country tracking without claiming every operator website was individually reviewed in this research.

## Identifier mapping verified against the downloaded Atlas export

OJP's ordinary operator references use the **organisation number**, not SAID. A bare number, `ojp:` reference and SBOID are different identifier representations; only normalize after checking the representation. This table does not authorize blanket matching of every alias.

| Business organisation | Organisation number | SAID | SBOID |
|---|---:|---:|---|
| TPG | 881 | 100680 | ch:1:sboid:100680 |
| TPF rail | 53 | 100034 | ch:1:sboid:100034 |
| TPF Auto | 834 | 100633 | ch:1:sboid:100633 |
| TPF/tf | 791 | 100593 | ch:1:sboid:100593 |
| SVB Auto / BERNMOBIL | 827 | 100626 | ch:1:sboid:100626 |
| VBL | 820 | 100619 | ch:1:sboid:100619 |
| Engadin Bus / BuS/eb | 815 | 101712 | ch:1:sboid:101712 |
| AAGS | 841 | 100640 | ch:1:sboid:100640 |
| ZVB | 839 | 100638 | ch:1:sboid:100638 |
| ZBB | 158 | 100129 | ch:1:sboid:100129 |
| SGZ | 186 | 100145 | ch:1:sboid:100145 |
| AeS | 179 | 100138 | ch:1:sboid:100138 |
| THURBO | 65 | 100046 | ch:1:sboid:100046 |
| transN / TRN-cmn | 44 | 100025 | ch:1:sboid:100025 |
| transN / TRN-rvt | 73 | 100054 | ch:1:sboid:100054 |
| transN / TRN-tn | 153 | 100124 | ch:1:sboid:100124 |
| transN / TRN/tc | 792 | 100594 | ch:1:sboid:100594 |

The current-day Atlas export contained only the `SVB Auto` BERNMOBIL organisation above, not a separate current BERNMOBIL tram record. Do not invent a tram alias; verify a current tram OJP response or the dated historical/full register before adding another number.

## Remaining concrete data questions

- Does the deployed OJP Fare 1.4.0 endpoint still use integration data, as its current cookbook says? Is read-only production pricing available to an information service?
- Can the NOVA LOD publisher restore tariff/pay-level links to zone prices and expose effective dates, delivery version, customer-segment semantics and refresh guarantees?
- Can the offline OSDM export be supplied as a current, dated release, and exactly which origin–destination pairs/products does it cover?
- Which operator or regional publications resolve the identified PostBus contradictions and local T600 deviations?
- Which currently unsupported service paths can be bound to reviewed local zone tables, including short-distance rules and regional-pass extensions?

No application code, access subscriptions, reservations or provider messages were changed by this research. The parent implementation must separately document which resulting guidance or source-monitor additions were actually enabled.
