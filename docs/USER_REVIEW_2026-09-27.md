# Journey quality review — 27 September 2026

**Follow-up:** The subsequent implementation is recorded in [terrain, fares and permission changes](SWISSTOPO_AND_FARES_2026-09-27.md). The review below preserves the pre-implementation findings.

**Status: documentation only.** Record the user's observations, inspect the existing implementation, and specify proposed corrections and validation. This review changes no application code, routing settings, deployment, access permissions or hosting. Source inspected: implementation commit cead54c468ea570eed97ae551797915f3d3fb5e9, present at repository HEAD 8b3a1d181884eff68bec53639ef4851e73692812. The last recorded publication is owner-private Site version 20, verified on 25 September; publication was not rechecked in this review.

## Reported journeys

| Journey | Observation to retain |
|---|---|
| Witikon → Uitikon | Include in fare, bicycle-permission and cycling-path comparisons. |
| Muri bei Bern → ETH Zentrum | Include in long-distance fare and station access/egress comparisons. |
| FORTYSEVEN Baden → a residential destination in Witikon | Include the reverse Baden–Zürich journey and its final cycling section. |
| Witikon → WSL Birmensdorf | User reports S12 appearing only when prohibited bicycle carriage is included, despite bicycle spaces in the train composition and no reservation requirement. |

The user also reports missing or incorrect fares, including CHF 17 for the bicycle on a Zürich–Baden journey, and cycling paths that feel unnecessarily complicated. Their exact departure times, selected trains, raw provider replies and fare profiles were not supplied. These original results have **not been reproduced**. Public documentation deliberately omits the residential address and precise private endpoints.

## 1. Passenger fares, bicycle tickets and reservations

### Confirmed implementation gap

[fares.ts](../prototype-v0/src/fares.ts) offers a date-scoped bicycle day-pass price for supported domestic rail journeys. It does not obtain the reduced point-to-point bicycle fare and does not compare that fare with the pass. Full Fare and Half Fare passenger prices are explanatory text, without a numeric quote. Unsupported operator combinations can leave the bicycle amount unknown as well.

The collapsed card can combine the pass with a reservation into one bicycle amount. Thus the existing code can produce CHF 17 as CHF 15 + CHF 2. This explains a possible mechanism, **not proof that the reported train needed a reservation**. The current subtitle acknowledges that a route ticket may cost less, but the displayed figure still fails the user's request for the cheapest valid option.

Read-only probes using synthetic domestic SBB legs on 22 September 2026 confirmed:

| Input to the current fare function | Bicycle ticket | Reservation | Bicycle total |
|---|---:|---:|---:|
| IR 35, no dated override | CHF 15 | CHF 0 | CHF 15 |
| IC 5, no dated override | CHF 15 | CHF 2 | CHF 17 |

These are function inputs, not fetched departures or verified prices for the user's journeys.

### Proposed calculation and presentation

For an adult with a standard bicycle, no existing bicycle pass, and a journey entirely covered by one valid bike day pass:

    bicycle ticket = min(valid reduced bicycle route fare, applicable bike day-pass price)
    total additional cost = passenger ticket + bicycle ticket + required bicycle reservations

Use the actual reduced bicycle tariff. Do not mechanically halve a discounted passenger offer, halve the selected Half Fare fare again, or derive a free bicycle ticket from a passenger's GA. Minimum fares, zones, through tickets and offer eligibility must be respected. ZVV specifies reduced second-class tickets for bicycles; its tickets can have their own time/zone validity [S3]. A local tariff table is a possible Swiss-first implementation where its scope and updates can be maintained; broader quotes still need a suitable fare source. This review selects no new provider or paid service.

Below the boarding count, show these separate rows:

| Row | Proposed content |
|---|---|
| Passenger | Amount and Full Fare / Half Fare / covered by valid GA; travel class and covered route. |
| Bicycle ticket | Amount and **Reduced bicycle ticket** or **Bike Day Pass**; valid route/zones or validity date. At equal prices, prefer the valid day pass. |
| Bicycle reservation | Amount, required services and reason; **Not required** where established. |
| Total | Sum only when every required component is known; otherwise identify the priced components and the missing quote. |

For illustration only: a valid CHF 7.50 reduced bike ticket beats a CHF 15 pass; a CHF 19 reduced bike ticket loses to that pass. A required CHF 2 reservation remains a separate row. These are examples, not Zürich–Baden quotes.

Retain these tariff boundaries:

- SBB's day pass currently costs CHF 15; the published price changes to CHF 16 on 13 December 2026. It is valid for the selected day until 05:00 the next day, not for a rolling 24 hours. Check operator coverage and the entire journey's validity interval [S2].
- SBB quotes CHF 2 for a required domestic train bicycle reservation, with connecting-train reservations included. Do not charge the fee automatically per boarding. Separate travel blocks, other operators and cycling breaks require applicability checks [S4].
- Existing valid passes affect additional cost. Verify GA coverage for the passenger and bicycle-pass coverage separately; a bicycle pass does not remove a required reservation [S4].
- A missing route fare must remain missing. A supported day-pass option may still be shown, clearly marked **Cheapest option not yet verified**, rather than presented as an exact minimum.
- Store price source, review/quote time, effective dates and covered itinerary alongside each amount. Recompute after changing the route, travel date or fare profile. Do not sum separate-leg tickets where a valid through or zone ticket covers the connection.

No fare purchase, reservation booking or remaining-space lookup is proposed here. Existing production fare-access limitations remain recorded in [Swiss implementation](SWISS_IMPLEMENTATION.md).

## 2. S12 bicycle access and inconsistent certainty

### Official guidance and current behaviour

SBB identifies prohibited departures with a crossed-out bicycle symbol. Its current guidance describes limited weekday carriage on Zürich S-Bahn services during 06:00–08:00 and 16:00–19:00, and on Ticino S/RE services during 07:00–09:00 and 16:00–19:00; the dated timetable determines the applicable restriction. This is not a blanket S12 prohibition [S1]. ZVV also describes bicycle areas on S-Bahn rolling stock [S3].

The current [operator rules](../prototype-v0/src/operatorBicycleRules.ts) return uncertain permission for SBB S/RE services overlapping weekdays 06:00–09:00 or 16:00–19:00, without distinguishing those regions. That broad uncertainty window is a confirmed limitation. It does **not** return prohibited, and therefore does not by itself explain the reported S12 ban.

Synthetic SBB S12 function probes on Tuesday 22 September, each lasting 15 minutes and containing no dated evidence, returned:

| Swiss departure time | Current permission | Current reservation requirement |
|---|---|---|
| 07:30 | Uncertain | Not required |
| 08:30 | Uncertain | Not required |
| 10:00 | Confirmed | Not required |

[bicyclePermission.ts](../prototype-v0/src/bicyclePermission.ts) gives matching dated prohibitions priority over the operator default. The [attribute interpreter](../prototype-v0/src/bicycleCarriage.ts) treats the VN symbol as prohibited. The [search.ch adapter](../prototype-v0/src/searchTimetable.ts) maps provider symbols into that interpreter. No train-composition lookup currently verifies access.

**Unresolved:** whether the user's result came from a genuine restriction on that departure, a misinterpreted or incorrectly scoped provider attribute, incorrect vehicle/service identity, or another leg in the journey. A general rules page or a synthetic S12 fixture cannot settle this. Do not replace all S-Bahn results with either allowed or prohibited.

### Proposed correction contract

1. Retain the three nested routing scopes: verified access only; also allow unverified access; also include prohibited services as clearly marked comparisons. Classify each boarded segment before routing/pruning.
2. Establish verified access from applicable permission evidence or a reviewed operator rule covering that service, date and segment. Missing ticket/reservation details must not downgrade established permission. Missing permission must not become a ban.
3. Apply regional and time restrictions only within their reviewed scope. During a potentially restricted period, obtain the dated rule; unresolved eligibility remains uncertain. Preserve an applicable explicit ban unless evidence shows that it was misidentified or does not cover the boarded segment.
4. Investigate exact-day train composition as supporting equipment evidence. SBB uses composition to locate bicycle spaces [S1]. Bicycle equipment alone neither overrides a dated restriction nor establishes whether reservation is required or space remains. Keep permission, reservation and capacity as separate facts.
5. Use the same resolved evidence for search eligibility, the collapsed journey summary and the expanded leg. Display the affected service, scope, source and reason when these facts conflict. An itinerary with one uncertain leg should name that leg.

The Uitikon regression must also respect the specific SZU prohibition between **Uitikon Waldegg and Uetliberg** [S3]. Do not propagate that segment restriction to S12, every SZU journey, or all journeys ending in Uitikon.

The next diagnostic capture should retain departure date/time in Europe/Zurich, exact train identity, boarding/alighting stops, selected scope, raw bicycle attributes and their provenance, composition if available, and the card/leg messages. Keep personal endpoints outside this public repository. This is a future reproduction requirement, not a claim that the user's original payload was available.

## 3. How cycling paths are computed today

[CyclingClient](../prototype-v0/src/cyclingClient.ts) requests one directed route from BRouter using its **trekking** profile and alternative index 0. It requests avoidance of steps and ferries and retains available road tags. The profile's touring preferences select the geometry; the app does not currently evaluate three alternative objectives. See [the existing routing explanation](CYCLING_ROUTES.md) and the upstream profile [S5].

The app then estimates duration using the selected rider's flat speed and the route's elevation, including its electric-assistance model. Thus pace changes train readiness, but selecting a faster rider does not trigger a search for the fastest geometry under that rider's local timing model. Surface-specific resistance, turns and traffic-light delay are not represented in that local timing calculation.

Temporary failures can use the OSRM bicycle fallback. That route can differ from BRouter and lacks the same elevation and surface detail. Accepted endpoint gaps up to 250 m add estimated walking time; this does not prove that the connector is physically walkable. Missing data remains a limitation.

These mechanisms can explain why a result differs from an intuitive route, but no exact unwanted cycling geometry from these new reports has been captured. Do not label one mechanism as the proven cause of all reported paths.

### Proposed route preference selector — not implemented

| User's requested option | Proposed objective | Comparison to show |
|---|---|---|
| **Fastest** | Minimize estimated feasible cycling plus pushing/carrying time for the selected pace, with elevation and usable surface information. | Time, distance, ascent, non-riding sections and uncertainty. |
| **Simplest** | Prefer fewer meaningful turns, crossings and navigation decisions, subject to a bounded extra-time/distance allowance. | Turns avoided and extra minutes compared with fastest. |
| **Safest** | Prefer separated cycling infrastructure and lower traffic exposure; account for junctions, posted speeds, surface suitability and data gaps. Suggested UI wording: **Lower traffic stress**. | Infrastructure, exposure, difficult sections and extra minutes; no guarantee of safety. |

Count meaningful navigation decisions, not every geometry vertex or bend in the same road. A quiet forest trail may be technically difficult; surface suitability and traffic exposure need separate explanations. Missing traffic or infrastructure data cannot earn a route a low-risk score. The final labels, detour allowance and scoring weights remain proposals to calibrate, not accepted numerical thresholds.

Generate or request genuinely different candidate paths before comparing objectives. Keep this preference separate from rider pace, public-transport bicycle eligibility, and whole-journey categories such as fewest boardings. Apply it consistently to cycling-only, station access/egress, intermediate cycling and ordered visits. Recompute train catchability and cycling budgets, and distinguish preference/version in caches. A fallback must disclose unsupported objectives rather than silently claim it optimized them. Candidate work must fit the existing search deadline and provider limits.

### Preserve previously requested terrain distinctions

The user already requested separate **cycling, pushing and carrying** sections, their distances/times, surface and path type, and the reason riding is impossible. This remains proposed work:

- Stairs are walking/pushing or carrying, explicitly flagged. Prefer a rideable detour when its cost is reasonable; the detour threshold still needs definition. The current blanket request to avoid steps is not this complete policy.
- Climbing or technical hiking passages are non-cycling and flagged. Distinguish pushable, carryable and unsuitable-with-bicycle passages; do not imply that every pedestrian climbing route is traversable with a bicycle. Never silently discard or park the bicycle in this mode.
- Show asphalt, compacted/loose gravel, earth, rock or unknown, and road, cycleway, forest track, narrow trail or mapped MTB route where supported. Preserve access restrictions and source uncertainty.
- Faster/electric rider settings must not turn an unsuitable trail into a rideable one. More detailed Swiss/OSM path data and connected access checks remain prerequisites for credible classification; this review performs no new bulk download or data integration.

## 4. Acceptance checks for the later implementation

These are planned checks, **not tests passed by the current app**.

| Area | Cases and expected outcome |
|---|---|
| Bicycle minimum | Reduced fare below, equal to and above the applicable pass price; select and label the cheapest valid product. Missing reduced fare must not imply a verified minimum. |
| Breakdown | Passenger, bicycle and reservation visible below boardings; required vs unnecessary reservation; known subtotal when any component is missing. |
| Profiles and coverage | Full Fare, Half Fare, GA, bicycle pass, through/zone fares, unsupported operators and prohibited legs; no invented free travel or double discount. |
| Validity and changes | Next-day 05:00 boundary, overnight journeys, 13 December price change, connecting reservations and intermediate cycling; no duplicate pass or reservation charges. |
| S12 evidence | Off-peak, regional peak windows, explicit allowed/prohibited, missing and conflicting evidence, different boarded segments and composition-only evidence. Scope, card and leg must agree. |
| Specific restriction | Uitikon Waldegg–Uetliberg restriction applies only to its covered segment. |
| Cycling objectives | Replay the reported journey families with captured geometry; compare valid alternatives, turns, detour, infrastructure and pace-dependent timing. Shared geometry is acceptable when it scores best for multiple objectives; relabelling one unassessed path as three optimized alternatives is not. |
| Terrain and fallback | Steps with short/long rideable detours, pushing/carrying, technical climbing, unknown surface, endpoint access gaps and missing fallback attributes; no silent ordinary-cycling classification. |
| Multimodal consistency | Changed cycle paths alter reachable trains and budgets correctly across all routing phases; partial results and existing deadlines remain functional. |

**Verification performed for this review:** inspected source and existing tests, ran the five read-only synthetic function probes listed above, and checked the official sources below on 27 September 2026. No live replay of the reported journeys, browser check, application test-suite rerun or deployment is claimed.

**Next implementation step:** capture the exact S12 evidence and the CHF 17 itinerary, then address fare components/minimum selection and permission provenance before tuning cycling preferences. Maintain the private app and existing requirement to ask before hosting costs.

## Sources

- **S1:** [SBB/CFF — Transport de vélo dans le train](https://www.sbb.ch/fr/informations-voyages/besoins-individuels/voyager-avec-velo/transport-velo-train.html): dated restrictions, regional windows and composition guidance.
- **S2:** [SBB — Velo-Tageskarte](https://www.sbb.ch/de/angebote/velo-tageskarte) and [English version](https://www.sbb.ch/en/offers/bike-day-pass): price, announced change, time and operator validity.
- **S3:** [ZVV — Self-service bicycle transport](https://www.zvv.ch/en/travelcards-and-tickets/tickets/self-service-bicycle-transport.html): reduced tickets, S-Bahn equipment and the specific Uetliberg segment restriction.
- **S4:** [SBB — Help with bike reservations and transport](https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html): reservation charges, connecting trains, ticket coverage and bicycle passes.
- **S5:** [BRouter trekking profile](https://github.com/abrensch/brouter/blob/master/misc/profiles2/trekking.brf), linked by the existing cycling documentation. Current app request parameters were inspected locally; the public routing server's deployed profile version was not established in this review.
