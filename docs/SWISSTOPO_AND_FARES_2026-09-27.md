# Terrain checks, cycling preferences and fares — 27 September 2026

This implements the approved follow-up to [the user review](USER_REVIEW_2026-09-27.md). It does not introduce hosting services, bookings or bicycle-space availability.

## Swisstopo: no upload required

The existing private application's `/api/terrain` function queries the public GeoAdmin identify service for swissTLM3D roads and hiking routes along a proposed cycling geometry. No API key or national download is needed for this bounded check. Keep code, reviewed mappings and synthetic tests in GitHub. Do not upload the multi-gigabyte national dataset, personal GPX recordings or private endpoints to this public repository.

The server validates Swiss bounds and route size, simplifies geometry while retaining bends, and limits each check to three chunks / nine seconds. Successful replies have a bounded one-hour in-memory cache. Query truncation, outages and uncovered sections remain explicit. The client shares returned features between nearby alternatives only where geometric matching covers at least 85% of the alternative, and labels that reuse partial. Matching requires aligned segments and three-point overlap within six metres; ambiguous parallel ways and crossings cannot borrow a restriction. These tolerances are heuristics, not a survey-grade access guarantee.

OSM/BRouter attributes remain intact, with namespaced official attributes added. Public road responses expose object type, broad paved/unpaved surface and traffic restrictions; hiking routes add their classification. The full downloadable model has additional fields, including structures/stairs, which the public road response may omit. OSM stair tags therefore remain necessary. `BEFAHRBARKEIT` is about motor-vehicle access on specified roads, not a bicycle-permission flag. A mapped hiking route does not itself prove riding is permitted.

| Evidence | Routing and display |
|---|---|
| Ordinary riding path | Cycling; selected pace, elevation and supported surface caps affect time. |
| Dismount restriction, ordinary pedestrian path, rough mountain path | Walking while pushing; estimated 4 km/h before gradient adjustment. |
| Steps without a mapped bicycle ramp, difficult technical trail | Walking while carrying; estimated 2 km/h before gradient adjustment, with reason and distance. |
| Alpine/climbing route, very difficult MTB passage, incompatible access restrictions | Exclude this checked candidate from bicycle-accompanies-traveller routing. Never silently discard the bicycle. |
| Unknown or conditional restrictions | State the gap; no claim that access is certified. |

The map distinguishes pushing and carrying; itinerary details show distances, durations, surface, path type and restriction reasons. Known restrictions affect train readiness and cycling budgets before routing. A failed station centroid can retry once at the same station's existing public anchor, within 250 m; the original endpoint and timed connector remain. Endpoint connectors remain estimated walking with unverified physical access. Walking/carrying assumptions are not field-calibrated.

## Cycling preferences

Fastest, Simplest (fewer navigation instructions) and Lower traffic stress compare actual BRouter candidates. Fastest uses the selected rider's cycling plus walking time; Simplest counts provider navigation instructions rather than geometry vertices; Lower traffic stress weights mapped infrastructure, road class, speed bands, surface gaps and non-riding sections. Unknown infrastructure does not get a low score. Junction exposure is not fully modelled, and this is not a safety guarantee.

Prefer a stair-free alternative within `min(15, max(5, 20% of fastest minutes))` extra minutes. Other objectives use the same detour bound. These are explicit initial heuristics for later calibration. Primary terrain lookup overlaps the alternative request; an alternative receives another terrain check only if it could be selected. Requests remain bounded: up to six alternative requests and twelve terrain calls per cycling client, within existing provider request budgets. Searches using terrain checks now have a 90-second whole-search deadline (legacy low-level searches retain 60 seconds); options publish progressively and cancellation remains available. Discovery at both endpoints overlaps, and ordinary initial links get a 2.5-second alternative window to leave time for the timetable. A failed alternative retains an already usable primary path. OSRM fallback discloses that it cannot compare turns or traffic preferences. The app does not guarantee a global optimum.

## Passenger, bicycle and reservation prices

Cards display three separate rows below boardings, shared with expanded fare details. A total appears only when all components are known. The bicycle calculation compares the actual reduced tariff with the valid Bike Day Pass, preferring the pass on equality. Annual bicycle passes and passenger GA coverage are separate. A passenger's Halbtax does not halve the bicycle price again.

An audited local tariff catalogue now covers supported SBB/SOB services on the Zürich–Dietikon–Baden rail corridor and Zürich–Urdorf–Birmensdorf branch. It uses station IDs, line identity, traversed zones, city-zone weighting, connection continuity and ticket time validity. Unsupported lines (including other routes to the same endpoint), buses and cross-region connections require a quote. It is intentionally not a nationwide price engine. Prices expire with the reviewed tariff period on 12 December 2026.

| Reviewed standard connection | Passenger full / Half Fare | Bicycle | Reservation |
|---|---|---|---|
| Zürich HB–Baden via Dietikon, IR35 | CHF 14.20 / 7.10 | CHF 7.10 reduced bicycle ticket | Not required, unless a dated override applies. |
| Same tariff corridor, IC5 in the reviewed reservation season | CHF 14.20 / 7.10 | CHF 7.10 | CHF 2 separately. |
| Zürich HB–Birmensdorf ZH, S5/S14 | CHF 7.20 / 3.60 | CHF 3.60 | No ordinary reservation; dated permission restrictions remain separate. |

ZVV's short-zone reduced fare can differ from half the full fare (CHF 3.30 versus CHF 4.70). We store the actual published reduced price. The current Bike Day Pass is CHF 15, rising to CHF 16 on 13 December 2026; its day ends at 05:00 the next morning, not after a rolling 24 hours. A pass option outside the local catalogue says **cheapest option not verified**. The CHF 2 domestic reservation rule is scoped to a connection booked together; cycling breaks and unsupported operators remain unquoted. Standard fares do not include supersaver offers.

The open OJP fare endpoint is still documented as a test integration system. This release does not present its nonbinding results as production quotes or claim that ordinary timetable access provides a complete fare source. Nationwide passenger/bicycle quotations remain unfinished.

## Bicycle-permission corrections

Zürich S-Bahn's morning uncertainty window is now 06:00–08:00; Ticino S/RE uses 07:00–09:00. Weekday evening and dated timetable rules remain. Missing permission is uncertain, never prohibited. The specific SZU upper-Uetliberg segment restriction does not propagate to lower S10 or S12.

Live public timetable checks for Monday 28 September found the 07:39 S12 from Zürich Stadelhofen to Zürich Altstetten marked `VN`, while the 10:09 departure had no such restriction. A bicycle compartment does not override a dated ban. These establish useful dated regression cases; they do not reproduce the user's original unspecified departure.

## Verification and limits

The 177-test application suite and production build passed. New tests cover terrain modes/timing, alpine rejection, crossing/parallel matching, outages, query truncation, detour choices, fare minima, through-zone validity, fare profiles, regional permission windows and segment-scoped restrictions. [Experiments](EXPERIMENTS.md) records live probes and remaining performance limitations. Browser preview infrastructure was unavailable; no new visual browser check is claimed. Version 21 was published owner-private at 09:48 UTC. The final Muri–ETH probe returned transit options, while Baden–Witikon still timed out without a mixed result; the earlier journey issues are not all resolved. Keep publication owner-private and obtain approval before new hosting costs.

## Primary sources reviewed on 27 September

- [swissTLM3D product and object catalogue](https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d)
- [GeoAdmin feature identification](https://docs.geo.admin.ch/access-data/identify-features.html)
- [BRouter trekking profile](https://github.com/abrensch/brouter/blob/master/misc/profiles2/trekking.brf)
- [ZVV single tickets](https://www.zvv.ch/de/abos-und-tickets/tickets/einzelbillette.html)
- [Z-Pass prices](https://www.zvv.ch/de/abos-und-tickets/weitere-angebote/tarifverbund-z-pass/abo-und-billette.html) and [A-Welle/ZVV zone map](https://www.zvv.ch/content/dam/zpass/zonenplaene/dez_2025/3051-ZPass-396x228-AWelle-25-low.pdf)
- [SBB bicycle carriage](https://www.sbb.ch/fr/informations-voyages/besoins-individuels/voyager-avec-velo/transport-velo-train.html), [day pass](https://www.sbb.ch/de/angebote/velo-tageskarte), [reservations](https://www.sbb.ch/en/help-and-contact/products-services/tickets/switzerland/bikes.html)
- [ZVV bicycle transport and Uetliberg restriction](https://www.zvv.ch/en/travelcards-and-tickets/tickets/self-service-bicycle-transport.html)
- [OJP Fare limitations](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/)
