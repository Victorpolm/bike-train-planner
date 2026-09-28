# Exact selected-trip pricing — 28 September 2026

## Problem and correction

The route-price correction published earlier today fixed station identity and request handling, but pricing still issued a new origin/destination OJP search and looked for the selected services among six returned alternatives. A correct selected journey could therefore have no price even when OJP Fare could price that journey.

Version 30 retains the complete provider Trip, inherited XML namespaces, intermediate calls, service identity, attributes and tariff-related fields when the routing response is acquired. The existing explicit platform-to-commercial-parent mapping remains; this is a preserved structured trip, not a byte-for-byte XML archive. Transit and internal walking graph edges keep references to their source trips across unfiltered/filtered merges and repeated acquisitions. A fare request sends only the needed unique sources.

An unchanged transit itinerary goes directly to OJP Fare using its retained trip. A selected subtrip or combination is assembled from the exact retained timed legs. The server checks stops, every scheduled departure/arrival and journey references. Walking evidence is retained even when it comes from a third response independent of both selected services. Connections between different commercial stops require an actual retained provider walking transfer that fits the available time. Trip-wide duration, start/end, transfer count and unique leg IDs are recalculated; the complete selected service-leg contents are retained. Missing service/transfer evidence fails explicitly rather than pricing a substitute route.

The response records `itinerarySource: retained | assembled | lookup` for diagnosis. The retained and assembled paths make **no new OJPTripRequest**. Full passenger plus bicycle pricing needs two upstream fare requests instead of the old three-request trip/fare/fare exchange; GA and annual bike-pass selections continue to skip unneeded traveller requests.

## Data integrity and operational bounds

Public timetable data is carried as a signed, self-contained payload, so another Worker instance or a restart can verify and price it without an in-memory trip cache. HMAC-SHA-256 is scoped to this application/protocol and uses the existing server-side OJP key; neither API key is sent to the browser. No new secret or storage service is required. Key rotation invalidates old source signatures; rerunning the search obtains current ones. Quote validation still requires future journeys within 180 days.

Sources are limited to eight per fare request and 256,000 UTF-8 bytes per source. The complete request is bounded at 2,100,000 bytes. A source is sent once even when several selected legs share it. Signatures, duplicate-source checks and size checks run before cached quotes are returned. Invalid retained data never triggers a fallback search. An unusually large provider trip remains usable for routing but cannot be retained for direct fares.

Legacy/public-timetable results without complete retained OJP sources still use the previous exact-match lookup path, explicitly identified as `lookup`. Intermediate bicycle legs still interrupt the through-fare journey; separate-ticket pricing is not implemented here. Provider failures, missing eligible fare products, unknown bicycle permission/reservation requirements and OJP's test-environment limitations remain visible.

## Verification

203 application tests pass, including eight new regressions covering acquisition-to-quote propagation, duplicate graph merges, cross-instance verification, complete-trip reuse, selected subtrips, assembled services with different XML namespace prefixes, real walking transfers (including a third independent source) and insufficient transfer time, payload tampering/size/duplicate rejection, and changed service identities/times. Tests assert that retained and assembled quotes do not call the trip-search endpoint. Existing whole-itinerary coverage and Full/Half Fare/GA/bicycle rules remain tested. TypeScript, frontend and Worker builds pass.

Live checks use the actual hosted endpoints and application acquisition, graph, recommendation, fare-query and fare-row functions. They are not a browser interaction test. Test journeys use public station endpoints, full-fare adult, second class, departure 29 September 2026 at 10:00 Europe/Zurich unless noted below.

## Live planner results

| Journey on 29 September (Swiss time) | Passenger | Raw bicycle quote | Pricing path |
|---|---:|---:|---|
| Zürich HB 10:31 → Bern 11:28, IC1 | CHF 36.20 | CHF 26.50 | Retained original trip |
| Zürich HB 10:12 → Chur 11:48, IR35; Chur Postautostation 11:58 → Laax 12:48, bus 81 | CHF 45.80 | CHF 29.60 | Assembled from two original trips |

Both quote statuses were `quoted`; fare rows displayed numeric passenger prices. Bern's bicycle row selected the covered CHF 15 day pass. The Laax bicycle row retained the CHF 29.60 provider estimate and its reservation row remained “Quote needed”. The passenger quote is independent of that unknown reservation charge.

The live Laax graph combined the IR35 obtained from a Zürich–Chur query with the bus retained from a Zürich–Laax trip originally using a different IC3. This is an actual planner-produced combination, not a substitution made by the fare service. Both searches reached the existing 90-second exploration limit after retaining usable proposals; full alternative coverage and optimum journey ranking are not established. The first Laax process was interrupted by the execution environment and was restarted successfully. Initial full planner results were checked on version 29; final walking-provenance support is in version 30.

## Final-version targeted checks

Version 30 also returned passenger CHF 45.80 and bicycle CHF 29.60 for the original IR35 combined with the later 12:28–13:18 bus 81. This used three signed sources: train, selected walking connection and later bus. The walk's already-retained complete trip was supplied explicitly because the saved version-29 graph predates walking provenance; automatic acquisition/preservation of walking sources is covered by the new regression. Pricing only the original 11:58–12:48 Chur Postautostation–Laax bus leg returned passenger CHF 17.20 (`125`, Streckenbillett). Both responses identified `assembled`, with no new trip search during quoting.

[Sanitized machine-readable results](experiments/exact-trip-fares-2026-09-28.json) record the exact services, times, prices, request sizes, version/method and limits without source payloads, signatures, credentials or private endpoints.

## Publication

- Existing owner-private Site: version **30**, succeeded **2026-09-28 17:10:19 UTC**, environment revision **3**.
- Source: `aee01405a58e955c51ef28cb172d4e6ef433dabb`.
- Deployment: `appgdep_6aba9f67032c81918df1d25e631f10a4`.
- Owner-only access rechecked; no external visitors, new paid hosting or recurring jobs.

Refresh the website and start a fresh search so the journey carries retained trip data. Historical results from an already-open older page lack that data.

## References

- [Earlier route-price correction](OJP_ROUTE_FARES_2026-09-28.md)
- [Official OJP Fare documentation](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/)
- [OJP 2.0 schema documentation](https://vdvde.github.io/OJP/release/2.0/documentation-tables/ojp.html)
