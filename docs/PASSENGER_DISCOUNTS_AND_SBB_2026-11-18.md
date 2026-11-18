# Passenger discounts and SBB handoff — 18 November 2026

## Decision and starting point

The owner requested implementation on the existing ChatGPT Site: start from the fare already adjusted for the traveller, search only for cheaper eligible tickets, keep processing and the interface small, and prefill the SBB handoff wherever supported. Passenger ticket inventory, City/local passes, school/group products, specialist concessions and whole-day/group optimization remain deferred.

The implementation starts from private Site version 97, source `124aa133a769c9da2bd54c4bf759b42b5edc08b6`. That source is newer than GitHub's application snapshot. Its explicit 12 November decision already enables labelled, non-binding OJP integration estimates and propagates age/class; this change preserves that decision. Earlier GitHub statements that the adapter is disabled describe the older GitHub code, not the current Site. No production-price claim follows from the integration endpoint being available.

## Fare comparison

- Preserve the provider's profile-specific baseline in `OnlineFare.passenger`. Retain up to eight distinct, strictly cheaper, understood offers from the same fare response in `passengerAlternatives`; do not request another route or apply a second Half Fare/child percentage.
- Enforce whole-itinerary leg scope, currency, requested class and required entitlement. A new train-bound alternative requires nonempty matching service references on every selected transit leg; matching endpoints and times alone is insufficient. Explicit stale itinerary metadata also invalidates the baseline. Preserve supplied conditions; reject inapplicable quota/validity/category evidence. Unhandled conditions cannot become a new cheaper recommendation.
- New alternatives currently recognize ordinary product 125 and standard Supersaver product 84004. Other Supersaver/Flex variants are not classified from their names. A sole restricted/unknown baseline remains labelled with its known restrictions; it is not reinterpreted as a flexible ticket.
- Compare three fixed national passenger products locally: Day Pass for the Half Fare Travelcard, Day Pass for Children (6–15), and Friends Day Pass for Youth (under 25, including solo use). Use existing age, class and entitlement inputs. Require independently reviewed passenger GA-area coverage for every public-transport leg and one valid travel-day window ending before 05:00 the following Swiss-calendar day.
- These passenger coverage checks are independent of bicycle-pass coverage, bicycle prohibitions and reservation rules. The currently reviewed domestic operator/mode subset remains deliberately narrower than the entire GA network. Coverage is reviewed through 12 December 2026; the announced 13 December Half Fare Day Pass prices are recorded without extending that coverage review.
- Improve only a known, positive baseline. Preserve zero entitlements, missing prices and the unchanged baseline when no eligible candidate is cheaper. A fixed day pass can be compared to a known published baseline as well as an API estimate. Do not fabricate savings from an unavailable fare.
- Keep the baseline and cheaper candidates as separate qualified prices. Show the selected product, its conditions and savings; qualify savings as estimated whenever either side uses integration data. Passenger, bicycle and reservation components remain separate. A bicycle prohibition does not erase a valid passenger-only price.
- Preserve the existing flexible-ticket journey-ranking policy. `flexibleTotalPrice` retains the cheapest checked flexible alternative even when the card displays a lower train-bound price. The category now explicitly says **Lowest checked flexible price**.

The OJP mapper currently provides no verified Saver Day Pass purchase/validity contract suitable for new automatic recommendations. Product 80040 appearing in a catalogue is insufficient. No advertised “from” amount is used as a quote, and no speculative Saver Day Pass request is added. A supported, applicable live offer remains a prerequisite for that extension.

## Processing cost and interface

The discount comparison adds **zero upstream fare requests**. It reuses the existing response and evaluates a small fixed catalogue locally; existing request coalescing, cache, provider quotas and deadlines stay in force. This is an operation-count property, not a claim about measured whole-search latency.

No new traveller questions, passenger-day-ticket inventory, party-management controls or route searches are introduced. Deferred concessions do not suppress an otherwise valid standard per-person baseline; the price explains that those additional discounts were not evaluated.

## SBB handoff

The existing builder already uses SBB's documented public timetable parameters. Preserve the actual transport boarding/alighting stops, Swiss date/time, transfer vias, direct-service option and bicycle-carriage filter. Split links at cycling breaks so SBB is not asked to reconstruct a different all-transit journey. Never use `selected_trip=0` as an exact-connection identifier: it is an index in SBB's regenerated result list.

All purchase buttons now receive the current traveller profile and display **Profile to confirm in SBB (not transferred)**, including age, entitlement, requested class, distinct GA class and relevant bicycle/pass details. The public timetable contract does not document transfer of these passenger/purchase fields. They are not added as invented URL parameters. A bicycle timetable filter does not buy a bicycle ticket or reserve space.

## Evidence

- [SBB Half Fare Day Pass](https://www.sbb.ch/en/offers/day-pass-for-the-half-fare-travelcard): CHF 78/128 (second/first); CHF 81/134 from 13 December 2026; Half Fare requirement and GA-area/day validity.
- [SBB Day Pass for Children](https://www.sbb.ch/en/offers/day-pass-children): CHF 19/33, ages 6 to under 16, including unaccompanied travel.
- [SBB Friends Day Pass for Youth](https://www.sbb.ch/en/offers/friends-day-pass-youth): CHF 80/120, under 25, expressly permits solo use; no further Half Fare reduction, bicycle separate, refund before validity only.
- [SBB Saver Day Pass](https://www.sbb.ch/en/offers/saver-day-pass): actual quota/price and advance-purchase conditions matter; advertised minima are not available offers.
- [Official OJP Fare description](https://opentransportdata.swiss/de/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/) and [official OJP–NOVA response mapper](https://github.com/openTdataCH/ojp-nova/blob/master/map_nova_to_ojp2.py): integration estimates and the returned product metadata.
- [Official SBB timetable deep-link guide](https://company.sbb.ch/content/dam/internet/corporate/downloads/en/sbb-als-geschaeftspartner/dienstleistungen/fahrplanintegration/Deep_Linking_SBB_Fahrplan.pdf.sbbdownload.pdf): documented URL parameters. Direct PDF download returned 403 during this review; the official indexed parameter tables/code template were available. No interactive SBB form acceptance is claimed.

## Verification and remaining limits

Verification: **908 JavaScript tests and 129 rendered interface panels pass**, including profile/itinerary mismatches, no second discount, fare scope and conditions, exact service identity, fixed-pass age/class/date/05:00 boundaries, bicycle separation, flexible-baseline ranking, missing-component restriction labels, SBB parameter allowlists and profile escaping. TypeScript and frontend/Worker production builds pass; the publication workflow rebuilds the exact source before packaging. The API regression measures unchanged physical request counts: two for retained passenger+bicycle, one for passenger-only and zero for invalid retained identities.

The existing hosted fare status endpoint returned HTTP 200 with `available: true, environment: test` on 18 November. Managed browser preview is unavailable (`preview relay unavailable`); rendered component tests validate content and escaping, not interactive browser acceptance. Post-publication receipt and live checks are recorded in GitHub's release note.

Renew passenger coverage at the timetable change. A supported Saver Day Pass quote channel, complete discount coverage, production purchase-price accuracy and automatic profile transfer into SBB remain unresolved. The separate synchronization of the newer Site application into GitHub is not part of this bounded Site change; repository documentation records the Site source/deployment provenance.

## Publication receipt and deployed check

- Published **private Site version 98** on **18 November 2026 at 11:30 Europe/Zurich**; deployment reported `succeeded`.
- Site project: `appgprj_6a9bdfc1819481918c7085729f869ca9`.
- Exact pushed and deployed source: `af6f20675fa208fa32dd011cb408f2e772029757`.
- Deployment: `appgdep_6afd7e1b3f288191a20e0df72d558b65`; runtime environment revision 4. Existing owner-only audience and D1 binding are preserved.
- Archive SHA-256: `1bf986a546165d003bb266f24b3012ab2028320c85b0f925385241c77e6bc19d`.
- Live Site: https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site

A fresh deployed check used the retained **IC1 Zürich HB–Genève, 20 November 2026, 09:32–12:25 Europe/Zurich**, second class, passenger-only. The timetable request and all three fare requests returned HTTP 200. Fare requests completed in approximately 5.5, 1.6 and 1.4 seconds; these individual probes are not a whole-search benchmark.

| Existing traveller profile | API baseline | Selected passenger price | Outcome |
|---|---:|---:|---|
| Age 30, no discount travelcard | CHF 60.20 Supersaver | CHF 60.20 | Existing discounted baseline retained, with train-binding and test provenance |
| Age 24, no discount travelcard | CHF 60.20 Supersaver | CHF 60.20 | The CHF 80 Friends Day Pass is more expensive and is not substituted |
| Age 12, no discount travelcard | CHF 19.00 Child Day Pass | CHF 19.00 | Already a child day-pass baseline; no second reduction or claimed saving |

These are **OJP integration estimates**, not verified purchase inventory or production prices. The observed responses contained no additional cheaper candidates; same-response alternative selection is covered by controlled protocol/integration regressions. The generated SBB link contains verified stop IDs, Swiss local date/time and documented timetable options. The actual SBB form and interactive Site browser flow remain unverified because managed preview is unavailable.

This GitHub change records durable decisions and release evidence only. It does not replace the older `prototype-v0/` application with the newer Site source. A separate source synchronization is still required before treating that application directory as version 98. No new branch was created.
