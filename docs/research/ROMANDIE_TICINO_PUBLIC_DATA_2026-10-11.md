# Public fare and bicycle evidence: western and southern Switzerland

Checked **11 October 2026**. This is an evidence ledger, not a claim of production coverage. Scope: tickets, prices, eligibility, reservations and published carriage restrictions. Live bike-space inventory is not required for this work. Amounts are CHF. Published/effective dates below are distinct from the date checked.

Much of the necessary information **is publicly available**: regional fare tables, operator rules, timetable restrictions, and some useful stop identifiers. The work remaining is predominantly reliable journey-to-tariff matching, normalization, future-version handling and conflicting-source resolution. A regional fare alliance does not establish identical carriage rules for all its operators. No documented, unauthenticated production quotation API was established for these regional websites; that is a research finding, not proof that no commercial or partner API exists.

## Immediately useful implementation evidence

| Scope | Can be implemented from reviewed public evidence | Guard or remaining work |
|---|---|---|
| TPG lines 1, 10, 12, 14, 15, 18 | Standard Unireso Zone 10 fare using exact operator, line and official stop identifiers | Evidence artifact below; 60-minute validity; second class; reviewed service dates. Do not call it the cheapest available fare. |
| TPG ordinary/folded/special bikes | Reduced fare; explicit special-bike exclusions; free small folded **bagged** bicycle | Formal regulations require the bag although the short web summary omits it. |
| TPF, transN, BERNMOBIL, TPL, FART, FLP, TPC | Operator-specific restrictions and required ticket class/product | Retain route, time, holiday, bike-type and cross-border distinctions below. |
| MBC R56/R57 and TRAVYS Yverdon–Ste-Croix | Published free bicycle transport on identified rail corridors | Bind exact route/operator; do not extend to every Mobilis operator or bus. |
| Mobilis, Frimobil, Onde Verte, Libero, Arcobaleno | Public standard fare tables and zonal validity | Need traversed-zone assignment, boundary rules, covered subscriptions and integrated-ticket handling. Endpoint distance or canton is insufficient. |
| Arcobaleno from 13 December 2026 | Future standard table already public | Stage a separate effective version; do not replace current prices early. |

## TPG: reproducible exact Zone 10 membership proof

Evidence files:

- [TPG_ZONE10_STOP_EVIDENCE_2026-10-11.json](TPG_ZONE10_STOP_EVIDENCE_2026-10-11.json): source URLs, hashes, source update date, platform joins, exact DIDOK membership, duplicates and limitations.
- [derive_tpg_zone10_evidence.py](derive_tpg_zone10_evidence.py): standard-library extraction that fails on unmapped, inactive, non-Swiss or unreviewed-municipality platforms. It produces a review candidate and never extends fare validity automatically.

The [TPG stops dataset](https://opendata.tpg.ch/explore/dataset/arrets/) provides `arretcodelong`, `codedidoc`, municipality, country, coordinates and active status. Its metadata defines `codedidoc` as the unique OFT public-transport stop identifier. [JSON export](https://opendata.tpg.ch/api/explore/v2.1/catalog/datasets/arrets/exports/json), [metadata](https://opendata.tpg.ch/api/explore/v2.1/catalog/datasets/arrets). Data updated **4 October 2026, 22:30:36 UTC**; 4,659 platform records. The catalogue includes inactive historical stops and Swiss stops outside Geneva, so neither dataset membership nor `pays=CH` proves Zone 10.

Each official line page embeds `ligneArrets` JSON with direction-specific platform codes. Joining **all 329 entries** from the following pages to the stop dataset produced active Swiss platforms in explicitly reviewed Geneva municipalities:

| Line | Official page | Published validity | Platforms aller / retour |
|---|---|---|---|
| 1 | [TPG 1](https://www.tpg.ch/fr/lignes/1) | 30 April–12 December 2026 | 37 / 41 |
| 10 | [TPG 10](https://www.tpg.ch/fr/lignes/10) | 14 December 2025–12 December 2026 | 18 / 19 |
| 12 | [TPG 12](https://www.tpg.ch/fr/lignes/12) | 14 December 2025–12 December 2026 | 25 / 25 |
| 14 | [TPG 14](https://www.tpg.ch/fr/lignes/14) | 14 December 2025–12 December 2026 | 30 / 30 |
| 15 | [TPG 15](https://www.tpg.ch/fr/lignes/15) | 14 December 2025–12 December 2026 | 21 / 21 |
| 18 | [TPG 18](https://www.tpg.ch/fr/lignes/18) | 14 December 2025–12 December 2026 | 31 / 31 |

**Implementation inference:** combine this complete reviewed line scope with the Unireso geographic rule. Require operator **881/TPG**, one of the six lines, and exact boarding/alighting DIDOK membership in the same reviewed direction. For a multi-leg quote, validate every public-transport leg, continuity and total validity; reject unmatched legs. Do not infer arbitrary TPG, French, Vaud, Céligny, rail or boat coverage. OJP platform identifiers require an established official mapping to DIDOK; fuzzy stop-name matching is unsuitable.

These are **membership lists, not trip-specific ordered stop sequences**. Line 1 repeats Petit-Bel-Air and Jardin Botanique across platforms, contains null times, and exposes older/current PDF validity keys. Line 10 also repeats one DIDOK. Numeric JavaScript object-key order is not reliable route order. This proof cannot alone determine a three-stop short-trip fare. Line 12 announces an **18 October 2026 timetable update**, which merits an immediate source refresh. The 12 December boundary is a reviewed timetable boundary, not a published assertion that Unireso fares expire then.

TPG [open-data terms](https://opendata.tpg.ch/terms/terms-and-conditions/) permit derivatives and commercial reuse subject to attribution, data-update date and identification of independent changes; they prohibit implied TPG branding/endorsement and specify a 10,000-call daily limit. Metadata has no separate licence value. Production ingestion should retain and comply with the applicable terms.

## Unireso / TPG

**Formal tariff:** [T651.11, effective 1 June 2026](https://www.unireso.com/wp-content/uploads/2026/06/CGV-unireso-Juin-2026-1.pdf), §§1.1, 2.1.1, 6.1–6.7, 10.1. Zone 10 covers Geneva except Céligny. Only CFF offers first class. Passenger GA is recognized. Where carriage is permitted, national annual, day and multi-day bicycle products are recognized throughout Unireso. This does not override the bicycle prohibitions on **Mouettes, Alpbus and Autocars Jacquet**. One bicycle per traveler. Children's bicycles: under six free; ages 6–15 accompanied free; unaccompanied need a reduced ticket/day product unless an eligible child/family GA or bike pass covers them. The tariff refers to T600 for supplementary child rules. Separate Swiss/French zonal tickets do not necessarily cover the boundary crossing; the tariff identifies a common-stop exception at Moillesulaz. Do not extrapolate this six-line catalog to Léman Pass journeys.

**Prices and validity:** [TPG ticket prices](https://www.tpg.ch/en/ticket-fares) and [Unireso tickets](https://www.unireso.com/titres-de-transport/).

| Second-class product | Full / reduced | Scope |
|---|---|---|
| Standard Zone 10 | 3.00 / 2.00 | 60 minutes, transfers permitted |
| Saut de puce | 2.00 / 1.80 | Three stops excluding departure, no transfer/return, complete within ten minutes |
| Day | 10.00 / 7.30 | Through 05:00 next day |
| Day from 09:00 | 8.00 / 5.60 | 09:00–05:00 next day |

Reduced fare is a published category, not always 50% of full fare. Besides children and Half Fare holders, local senior/AI entitlements matter. A standard CHF 3/2 quote can be valid without being the cheapest; short-trip and already-held local products must not be silently claimed optimized.

**Carriage:** [TPG cyclists](https://www.tpg.ch/en/travel/helpful-tips/cyclists) permits ordinary/electric bikes subject to space; bans tandems, recumbents, attached trailers and other bulky two-wheelers; requires the cyclist to remain beside the bicycle. French-sector rules must be reviewed separately.

**Controlling detail:** [DRT, effective 1 August 2024](https://www.tpg.ch/sites/default/files/2024-08/Drt-tpg_adaptations-etat_au_1er_aout_2024.pdf), still linked by [current practical documents](https://www.tpg.ch/fr/nous-connaitre/publications/documents-pratiques), art. 54.3 requires a small folded bike **in a bag** for free carriage. Art. 53 treats a bicycle trailer as luggage when its traveler is **not traveling with a bicycle**. The short cyclist webpage omits the bag; use the explicit formal rule. No ordinary-bike reservation requirement was identified in these regulations or cyclist guidance; this is an inference from the reviewed regular-service rules, not a statement about space availability or special/group services.

**Passenger children:** [TPG family-card guidance](https://www.tpg.ch/en/purchase/our-offers-and-good-deals/junior-and-accompanied-children-cards) distinguishes Junior Card with a parent from a Child Co-travelcard with the designated companion aged 16+. The companion must have a valid ticket and travel in the same class. Record relationship, accompaniment and actual held product, not merely a generic “child discount” checkbox.

## Mobilis / TL / MBC / TRAVYS / VMCV

[Mobilis public table](https://www.mobilis-vaud.ch/tarifs/) explicitly applies through **12 December 2026**. Standard second-class full/reduced singles:

| Zones | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Full | 3.20 | 3.90 | 5.80 | 7.80 | 9.60 | 11.60 | 13.60 | 15.40 | 17.40 | 19.20 | 21.20 | 23.20 | 25.00 | 27.00 | 28.80 |
| Reduced | 2.40 | 2.40 | 2.90 | 3.90 | 4.80 | 5.80 | 6.80 | 7.70 | 8.70 | 9.60 | 10.60 | 11.60 | 12.50 | 13.50 | 14.40 |

Validity: 1–2 zones 60 minutes; 3–7 120; 8–10 180; 11+ 240. Fifteen-plus covers the whole network. First-class and day tables are also public. [13 December 2026 successor landing page](https://www.mobilis-vaud.ch/tarifs-a-compter-du-13-decembre-2026/) exists, but a complete successor grid was **not extracted and verified** in this audit.

[Formal T651.22 landing page](https://www.mobilis-vaud.ch/reglement-tarifaire-t651-22/) links the [tariff effective 1 June 2025](https://mobilis.paperturn-view.com/t651-22?p=12&pid=ODg8889160&v=4.1). Bicycle clause: reduced second-class ticket; folded bikes free without a bag; dismantled-front-wheel bikes require a bag; under-six bikes free and ages 6–15 free when accompanied by someone 16+. It explicitly provides free bicycles on TRAVYS **Yverdon–Ste-Croix** and MBC **Bière–Apples–Morges / Apples–L'Isle**. National bike-product acceptance remains subject to its specific validity domain.

[MBC operator rules](https://www.mbc.ch/transport-velos) identify free rail routes **R56 and R57**. Buses/funicular use reduced fares; bike trailers on those modes need an additional reduced ticket. Special bicycles over two metres need a full ticket. Folding/bagged treatment is free. Peak restrictions are stated without a clock window: do not invent hours. Vehicle admission remains separate from the tariff.

[TRAVYS bicycle FAQ](https://www.travys.ch/faq/comment-voyager-avec-son-velo-sur-le-reseau-travys/) search text corroborates the free Yverdon–Ste-Croix offer and mentions replacement buses, but direct retrieval returned 403. Rail scope is corroborated by the formal Mobilis tariff; replacement-bus scope requires full-source review before automation.

[TL tickets](https://www.t-l.ch/abos_et_billets/) exposes bicycle-ticket guidance in search, but direct full-page access was blocked during this audit. Current TL-specific vehicle, metro, special-type and reservation rules remain unverified here. [VMCV tickets](https://www.vmcv.ch/en/page/tickets-and-subscriptions/) confirms Mobilis zonal/time fares; it does not resolve every bike-type condition. These access/scope gaps do not mean Mobilis prices are unavailable.

## Frimobil / TPF

[Frimobil singles](https://frimobil.ch/de/billett/einzelbillett) says prices apply through **12 December 2026** and links the [current fare grid](https://frimobil.ch/fileadmin/user_upload/public/Abonnement/GRILLE_TARIFAIRE_FRIMOBIL_2024.pdf). The “2024” filename does not make the grid obsolete when the current official page explicitly identifies its validity.

| Zones | 1 | 2 | 3 | 4 | 5 | 6 | 7+ |
|---|---|---|---|---|---|---|---|
| Full / reduced, second class | 3/2.30 | 5.40/3.20 | 7.80/3.90 | 10.40/5.20 | 12.80/6.40 | 15.20/7.60 | 17.40/8.70 |
| Minutes | 60 | 120 | 120 | 120 | 120 | 120 | 180 |

[Frimobil bike overview](https://frimobil.ch/de/frimobil/bon-a-savoir/voyager-avec-un-velo-ou-une-trottinette) provides reduced zonal fares and refers admission to each operator. The alliance includes operators other than TPF.

[TPF operator bicycle rules](https://www.tpf.ch/fr/abos-et-billets/mobilite-combinee/velos): ordinary/electric bikes, recumbents and foldable tandems below two metres use reduced fares. It excludes listed oversized/multiperson/three-wheel types. Folded bikes and properly bagged dismantled bikes are free. National bike products are expressly recognized. Under-six and accompanied 6–15 bicycle rules are stated. Bus groups of at least five must reserve 48 working hours ahead; rail self-loading is unavailable for groups of ten or more. Ordinary and group rules must remain separate. Peak carriage is restricted without published clock hours on this page. **Internal inconsistency:** detachable trailers are called free in one section and included among reduced-fare items elsewhere; the special-bike fare footer also needs reconciliation with size/admission prohibitions. Do not automatically resolve that inconsistency in favor of an exact trailer fare.

## Onde Verte / transN

[Onde Verte singles](https://www.ondeverte.ch/billets/billets-individuels-et-court-parcours) publishes:

| Product/zones | Urban 10 or 20 | 1–2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|
| Full / reduced, second class | 2.40/2.20 | 4.40/2.30 | 6.60/3.30 | 8.80/4.40 | 11/5.50 | 13.20/6.60 |
| Minutes | 45 | 60 | 90 | 120 | 120 | 120 |

Short-trip eligibility is a specific tariff route/distance rule, not straight-line distance between endpoints. [Bicycle overview](https://www.ondeverte.ch/informations-tarifaires/velos-et-animaux/?L=0) specifies reduced second-class tickets and free folding bikes. Its child-bike wording appears to retain older Junior/companion-bike-product conditions; reconcile against current T600 and T651.3 before applying that exception alliance-wide.

[transN operator rules](https://www.transn.ch/serviceclients/mon-voyage/) exclude tandems, recumbents, attached trailers and bulky bikes. They exclude bicycles from reservation journeys on **590**, all **591**, and **MobiCité Le Locle/La Chaux-de-Fonds**. Ordinary bicycles use Onde Verte reduced second-class tickets and are restricted during peaks; this page does not provide an exact peak clock window. Reservation of a demand-responsive passenger service is not automatically a bicycle reservation.

## Libero / BERNMOBIL

[Libero singles](https://www.mylibero.ch/de/tickets/einzelbillette) exposes a complete standard table. Examples, full/reduced second class: urban 300/700/750 **4.00/2.40, 45 minutes**; 1–2 zones **5.20/3.00, 60 minutes**; 3 **8.00/4.20, 90 minutes**; 4 **10.40/5.20, 90 minutes**; 5 **13.20/6.60, 120 minutes**. Zone/time validity allows transfers and directions inside the purchased scope. Green zones and excluded mountain/local services require explicit handling. Do not reverse the full/reduced table columns.

[Libero bicycle guidance](https://www.mylibero.ch/de/tickets/velo), [December 2025 formal tariff](https://www.mylibero.ch/sites/default/files/2025-12/Tarif-651.10-FR-2025-12.pdf), and [2026 brochure](https://www.mylibero.ch/sites/default/files/2025-12/Libero-Prospekt-2026.pdf) are public. The last two were located, not comprehensively normalized in this audit.

[BERNMOBIL FAQ](https://www.bernmobil.ch/de/unternehmen/faq) explicitly accepts national annual/day bike products on **all its lines**. Ordinary bikes are banned Monday–Friday **07:00–09:00 and 16:00–19:00**. Tandem, recumbent and cargo bicycles are prohibited. Bagged TranZbag transport is free **outside the prohibited hours**; do not let a generic bag flag bypass this local condition. Detached trailers are free. It states free accompanied child-bike transport and recognizes child GA for unaccompanied children. This operator-specific acceptance contradicts the SBB overview's “SVB: no” entry; record the conflict and use the directly applicable local evidence for the reviewed scope.

## Arcobaleno / TPL / FART / FLP / TILO

[Arcobaleno current singles](https://arcobaleno.ch/it/home/biglietti/biglietto-singolo), effective **15 December 2024**, and [future tariffs](https://arcobaleno.ch/en/tariffe27), effective **13 December 2026**, make automatic advance collection possible:

| Zones | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8+ |
|---|---|---|---|---|---|---|---|---|
| Current full / reduced, second class | 2.60/2 | 5.20/2.60 | 7.80/3.90 | 10.40/5.20 | 13/6.50 | 15.60/7.80 | 18.20/9.10 | 20.80/10.40 |
| From 13 December full / reduced | 2.80/2.20 | 5.60/2.80 | 8.40/4.20 | 11.20/5.60 | 14/7 | 16.80/8.40 | 19.60/9.80 | 22.40/11.20 |

Ordinary validity: 1–3 zones 90 minutes, 4–5 120, 6–7 150, 8+ 210. Current urban single-zone 10/20/30/40 has a distinct **60-minute** row. Do not lose this distinction when normalizing the table or infer its future abolition from an omitted summary row. Eight-plus covers the Ticino/Moesano network. The future page also announces train-bound saver products; those cannot be calculated as ordinary zone tickets.

[Arcobaleno bicycle guidance](https://arcobaleno.ch/it/home/biglietti/bicicletta) uses the reduced route fare where carriage is admitted and compares it with national bike-day products. National price references must be selected by travel date, not copied forever from an unchanged local page. The [public calculator](https://calcolatore.arcobaleno.ch/en/) is a user interface; a supported production API was not established here.

**TPL:** [operator page](https://www.tplsa.ch/14/39/viaggiare-in-bus-in-bici-e-monopattino.html) and [formal rules effective December 2024](https://www.tplsa.ch/repository/pdf/1379919422-Trasportobiciclette_Monopattini_DIC_2024.pdf). No bicycle reservations. Folded **or** bagged bikes are free luggage. Prohibited types: tandems, recumbents, tricycles, cargo bikes and registered electric bicycles. Bus lines **9, 10, 17, 18** exclude bikes. Peak ban is stated as indicative Monday–Friday **non-holidays 07:00–09:00 / 16:00–19:00**, with event restrictions also possible. Bus bicycle fares are reduced Arcobaleno; the station funicular cites its specific TPL tariff. The older child exception requires Junior/Family GA and adult accompaniment; reconcile it before substituting a broader national child rule.

**FART:** [operator bicycle page](https://fartiamo.ch/en/bicycle/) allows domestic buses/R70 Locarno–Camedo on weekdays **08:00–16:00 and 19:00–06:00**, and without clock bans on Saturdays, Sundays and public holidays. Thus the published weekday ban is **06:00–08:00 / 16:00–19:00**, different from the SBB summary. Domestic tickets are reduced second class; national day/multi-day/annual bike products are recognized. International **PE72/RE73** uses a special bicycle product and a two-metre maximum; domestic products must not be extrapolated across that boundary. No exact international product price was established here.

**FLP:** [current operator regulation](https://flpsa.ch/index/regolamento/), page timestamp **5 March 2025**, applies to S60. Weekday bike bans are **06:30–08:30 and 16:00–19:30**; no public-holiday exception is stated. It explicitly says reservations are unnecessary. Folded or bagged bikes are free luggage; parents may carry small children's bikes free. Ordinary bikes use reduced Arcobaleno route fares. Its evening endpoint differs from the SBB summary's 19:00. [Current timetable/tickets](https://flpsa.ch/index/orari-e-biglietti/) links this regulation and a public line/zone map, useful for subsequent exact-route mapping.

**TILO:** [operator conditions](https://www.tilo.ch/servizi/bici/) apply SBB rules in Ticino. Folded traditional/electric bikes are free there; service-specific prohibition pictograms remain relevant. Cross-border Ticino–Lombardy bikes require a **reduced youth Arcobaleno cross-border ticket** from origin to destination. Wholly Lombardy carriage follows Trenord and is described as free. Peak capacity restrictions are possible; the page does not establish an unconditional fixed ban on every TILO trip. These geographic distinctions prevent a single blanket Swiss/Italian bike-fare rule.

## Valais, Chablais, resort and lake services

| Operator/source | Verified usable information | Remaining limit |
|---|---|---|
| [TPC bicycle rules](https://tpc.ch/service-clients/voyager-avec-un-velo/) | Trains and most buses admit bikes. Buses **144, 61, 175** require rear racks and exclude bikes **15 December–15 April** when ski racks replace them. Remove an e-bike battery if possible for rack use. Reduced second-class short ticket and national day/multi-day/annual products are described. Properly bagged dismantled bikes travel free; occupying a seat changes the ticket requirement. | No universal special-bike rack-fit dimensions provided. The local page covers buses whereas SBB's summary excludes bus acceptance; reconcile product-domain conflict rather than assuming identical operators. |
| [TMR reservation notice](https://www.tmrsa.ch/reservation-velo/) | Since **1 April 2026**, advertises a **CHF 2** bike reservation for the journey, bought via SBB. | It calls reservation obligatory but also permits unreserved boarding when room remains. Confirm route/service scope before marking every TMR service mandatory. |
| [TMR tickets](https://www.tmrsa.ch/billet/) | Reduced route bike ticket; local **CHF 10** bike day; national day also offered; replacement buses exclude bikes. | Verify local-day validity by rail/bus and date. Do not silently compare unlike coverage. |
| [RegionAlps old page](https://www.regionalps.ch/zug-wallis/supplement-velo-2024.html) | Public information exists. | **Reject as a current price source:** it still shows older national bike-product amounts. Fresh retrieval does not make its contents current. |
| [MOB bicycle help](https://support.mob.ch/hc/fr-ch/sections/13507527868829-V%C3%A9lo) | Folded bikes, bike trailers, young-child bikes, and front-wheel-removed bagged bikes are listed as luggage; ordinary route/day/annual bike products described. One self-loaded bike per person; timetable may exclude bikes on particular trains. | Do not generalize every named scenic product/train or MVR connection without service matching. |
| [CGN bicycles](https://www.cgn.ch/fr/velos) | Bikes accepted unless prohibited in timetable; national bike day sold on board; folded/dismantled **bagged** bikes up to **1.20 × 0.80 × 1.00 m** free. | Day-product evidence does not establish annual-pass acceptance. SBB overview differs; use product-specific evidence. |
| [MGB Zermatt bike offer](https://www.matterhorngotthardbahn.ch/fr/products/faire-du-velo-dans-la-vallee-de-zermatt), [Andermatt offer](https://www.matterhorngotthardbahn.ch/fr/products/faire-du-velo-a-andermatt-dans-la-region-du-saint-gothard) | Public destination-specific combined offers located. | Prices and exact route/season scope not fully normalized here. |
| [Zermatt mountain bike tickets](https://www.matterhornparadise.ch/fr/information/billets-tarifs/billets-vtt), [LNM conditions](https://www.lnm.ch/Utilities/CGV) | Primary resort/boat sources located. | A discovery is not verification of all prices or national-pass acceptance; targeted follow-up needed. |

The [SBB other-operator overview](https://www.sbb.ch/fr/informations-voyages/besoins-individuels/voyager-avec-velo/transport-velo-train/conditions-chargement-velos-voyageurs.html) is useful for discovery and comparison. Its yes/no column describes **national bicycle-product acceptance**, not whether bicycles can board at all. Direct local sources materially differ for TPG, BERNMOBIL, FART, FLP, TPC and CGN. Keep these conflicts visible in the source register instead of treating the summary as a universal rule engine.

## Automatic collection before expiry

1. Monitor stable tariff landing pages **and their linked documents**, plus source metadata. A landing page can replace a PDF URL while the old PDF remains reachable. TPG line pages and stop metadata need their own route-data monitor.
2. Persist source URL, content hash, fetched time, source publication/update time, effective-from/to, reviewed time, scope and parser version separately. A successful HTTP response or unchanged hash must not extend semantic validity.
3. Detect future schedules and tariffs in advance. Mobilis and Frimobil explicitly identify the current **12 December 2026** boundary; Arcobaleno already publishes its **13 December** successor. Stage current and future versions side by side and select by the user's travel date.
4. Parse into candidate tables/rules. Structural changes, removed links, missing route/platform matches, changed prices, unknown municipalities and conflicting effective dates should produce a review item. Preserve last verified evidence but stop claiming exact coverage after its reviewed boundary.
5. Run practical source checks daily; alert before known boundaries (for example 60/30/14/7 days) and on material changes. TPG line 12's 18 October change is a nearer review trigger than the annual timetable change. These frequencies are proposed operating policy, not an operator data guarantee.

The regional extraction script here is a reproducible evidence tool, **not a deployed scheduler**. Deployment status belongs in the main launch/readiness document.

## Precise remaining questions for operator cooperation

Begin by implementing public evidence; contact is needed for focused unresolved questions, not to ask operators to recreate their published tables. No operator was contacted during this audit.

- Ask TPG to resolve the short webpage's omitted folded-bike bag condition, and obtain a supported line/stop/zone feed with change notifications and identifier guarantees. Confirm standard-service reservation absence explicitly if the product promises a definitive reservation state.
- Ask TPF about detachable-trailer fares and exact peak/service restrictions. Ask transN for precise peak applicability. Request machine-readable service exceptions where available.
- Reconcile TPL/Onde Verte child wording with current national tariff revisions; obtain current formal local exceptions instead of silently choosing whichever rule is cheaper.
- Resolve SBB-summary versus operator-source differences for BERNMOBIL/TPG product acceptance, FART/FLP time windows, TPC buses and CGN products.
- Confirm TMR reservation and local bike-day scope. Obtain resort seasonal calendars and route-specific products for services outside ordinary alliance coverage.
- Establish journey-level traversed zones, boundary stops, transfer validity, existing-pass coverage and cross-border integration before advertising exact regional fares beyond the audited TPG scope. An official production fare quotation service can remove much of this reconstruction work; a human-readable public price table alone does not remove route-matching obligations.
