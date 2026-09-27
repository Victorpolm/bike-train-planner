# OJP Fare integration and ten random checks

27 September 2026. The newly added **GitHub Actions** secret `OJP_FARE_API_KEY` successfully accesses OJP Fare 2.0. The Site runtime still has no environment entries. A repository secret is not automatically a website runtime secret, and stored GitHub secrets cannot be read back for transfer.

## Observed live results

[Actions run 36331308071](https://github.com/Victorpolm/bike-train-planner/actions/runs/36331308071) completed all ten cases in approximately 107 seconds, with seed `20260927`, randomly sampled distinct Swiss station pairs, randomized daytime departures on **29 September 2026**, and checkpoints after every fare request. There were 10 journey requests and 30 fare requests. All journey requests and 29 fare requests succeeded. Full-fare and Half Fare passenger prices were returned for **10/10** journeys; bicycle prices for **9/10**.

These are **provider beta/test prices**, not verified production purchase offers. The table shows gross CHF amounts for a complete transit itinerary: second class for passengers and class-independent bicycle tickets. A standard through product is preferred where available; otherwise the returned second-class supersaver product is retained with its name. Bicycle route prices below are raw provider quotes, before comparison with a published Bike Day Pass. Reservations are separate.

| # | Actual requested locations | Passenger, no travelcard | Half Fare passenger | Bicycle route ticket |
|---|---|---:|---:|---:|
| 1 | Chur → Luzern | 32.60 | 18.60 | 25.50 |
| 2 | Burgdorf → Winterthur | 36.80 | 20.40 | 25.50 |
| 3 | Lugano → Chur | 69.60 | 34.80 | 34.80 |
| 4 | Luzern → Winterthur | 26.80 | 14.20 | 17.00 |
| 5 | Basel SBB → Luzern | 22.80 | 12.80 | 18.00 |
| 6 | Basel SBB → Genève | 52.20 | 29.80 | 40.00 |
| 7 | Burgdorf → Le Pont | 55.20 | 29.00 | 32.40 |
| 8 | Zürich Triemli → Luzern | 30.80 | 15.40 | 15.40 |
| 9 | Zug → Le Pont | 73.60 | 40.20 | Unavailable |
| 10 | Luzern → Fribourg/Freiburg | 33.40 | 18.80 | 26.50 |

Case 9's bicycle request returned HTTP 400 with the provider's error: “There was no valid NOVA response.” Its passenger quotes succeeded. This is an upstream fare failure; a bicycle fare must remain unknown or use an independently applicable published product.

The initial probe contained incorrect human-readable labels for five station IDs. Inspection of OJP's actual stop/transfer names identified and corrected them: `8505300` Lugano, `8502204` Zug, `8503054` Zürich Triemli, `8508005` Burgdorf, `8501100` Le Pont. The sampled IDs and requests were not changed. The corrected report retains the original labels for audit. Future probes record resolved endpoint names directly. The sample includes rail + bus combinations, not only mainline trains.

## Application changes

- Server-only `/api/fares/status` and `/api/fares/quote`, using `OJP_FARE_API_KEY` at the separate `/ojpfare` endpoint. A fare-only itinerary lookup succeeded in the live sample, so this adapter can operate without `OJP_API_KEY`; it uses the timetable key when separately available.
- OJP 2.0 itinerary lookup with scheduled times, followed by separate explicit adult/full, adult/HTA and Bicycle requests as needed. Preserve intermediate stops, tariff attributes and namespaces. Resolve platform parents only from provider context.
- Match every transit segment's stops and scheduled departure/arrival, and dated service reference when available. Across legacy IDs/SLOIDs, require matching names, close coordinates and exact times; do not invent ID mappings. No substitute route is priced.
- Accept only complete first-to-last transit-leg coverage, CHF, eligible travel class/cards and actual gross prices. Reject missing prices, proto-products, partial products and mismatched trip IDs. Do not sum overlapping fare alternatives.
- Shared asynchronous card/details lookup, short-lived caches, request deduplication, timeouts, response-size limits, upstream pacing and authorization/rate-error cooldown. Keys stay in runtime bindings; no browser credential or secret extraction.
- Display named **OJP test fare estimates**, keep passenger/bicycle/reservation separate, and retain published tariff fallbacks. A fare does not establish bicycle permission or reserve a place. Intermediate cycling interrupts the fare itinerary and remains unsupported by this through-fare adapter.

## Validation and remaining gate

185 application tests pass, including eight new tests using recorded live responses. Coverage includes first-class/NetPrice exclusion, HTA entitlement, class-independent bicycle prices, through-ticket scope, the real NOVA error, exact route matching, XML namespaces, credential handling, deduplication and separate bicycle/day-pass calculations. TypeScript, Vite and Worker production builds pass; the 13 existing Python evaluation tests also pass. The app parser was replayed across all ten original responses and accepted the 29 eligible quotes shown above.

These checks validate fare access and integration behavior. They are not ten end-to-end cycling-route/UI audits, a fare comparison against SBB checkout, or proof of production-data accuracy.

**Activation gate:** add `OJP_FARE_API_KEY` as a secret in this existing Site's runtime configuration, then deploy to apply that environment revision. The new integration is ready but cannot fetch online fares on the website while that binding is absent. Never transfer the GitHub key through logs, artifacts or source. The existing owner-only audience is preserved.

Evidence: [verified-results JSON](experiments/ojp-fares-2026-09-27.json), [sanitized raw request/response artifact](https://github.com/Victorpolm/bike-train-planner/actions/runs/36331308071/artifacts/10935737942) (30-day retention), and representative permanent fixtures under `prototype-v0/src/fixtures/fares-2026-09-27/`. Probe source commit: `f261f7c4614ac28b5249fea21da416726b53ae61`. The workflow is now manual-only; it has no recurring schedule.

Provider references: [OJP Fare cookbook](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/), [API product](https://api-manager.opentransportdata.swiss/portal/catalogue-products/tedp_ojpfare-1), [reference implementation](https://github.com/openTdataCH/ojp-nova).

## Publication

Owner-private Site version **22** deployed successfully on 27 September 2026 at 16:12:28 UTC from source commit `9f411232376cf36147282cec929a5cf83da54a52`. Deployment `appgdep_6ab9405c0ab48191861f21e7160a3bec` used environment revision **0**, so online fare fetching on the website remains inactive until its runtime secret is configured. The compiled Worker contains the new fare adapter; GitHub Actions holds the separately verified test credential.
