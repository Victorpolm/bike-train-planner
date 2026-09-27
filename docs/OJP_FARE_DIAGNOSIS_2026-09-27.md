# OJP Fare: current integration gaps and proposed validation

Investigated 27 September 2026. This records a diagnosis and proposed next steps; no fare adapter or deployment was implemented in this investigation.

**Later follow-up:** the user added the fare secret to GitHub Actions. [Ten live fare checks and the implemented adapter](OJP_FARE_RESULTS_2026-09-27.md) supersede the application-state and proposed-next-step sections below. This file preserves the earlier diagnosis.

## Confirmed application state

- GitHub `main` remains `dd2bb05ddddc3ac0b8b0983403db24568220d993`.
- The current OJP handler targets `/ojp20` and implements connection and TripInfo requests. There is no OJPFare request builder, fare response parser or fare API route in the application.
- `src/fares.ts` calculates published bicycle/day-pass/reservation amounts and uses the small corridor table in `src/fareCatalog.ts`. It does not fetch live prices.
- The existing private Site is version 21. Its runtime environment was checked again: revision 0, no entries. Neither a timetable OJP key nor a fare key is configured there.
- Earlier successful GitHub Actions timetable tests establish timetable access in Actions, not access to the separate fare product or availability of that key inside the Site.

The current situation is an incomplete integration. We have not established that OJP Fare cannot return prices. No authenticated fare request was made during this investigation because no fare credential is available in the Site runtime.

## Confirmed provider evidence

1. The [dedicated OJP Fare cookbook](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-fare/) explicitly lists support for OJP 1.0 and 2.0. An [older/conflicting best-practices statement](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojp-best-practices/) still says 1.0 only. The [provider reference implementation](https://github.com/openTdataCH/ojp-nova#handling-ojp-10-and-ojp-20) corroborates 2.0 support with its version-specific request/mapping code.
2. [OJP Fare is a separate API product](https://api-manager.opentransportdata.swiss/portal/catalogue-products/tedp_ojpfare-1), with endpoint `https://api.opentransportdata.swiss/ojpfare`. The normal `/ojp20` timetable integration does not itself implement this fare request. Obtain the product-specific access through the API Manager; do not presume a timetable key authorizes fares.
3. The cookbook supports full/Half Fare queries for future Swiss public-transport trips. An actual trip must be included in the fare request; the response can contain different products, classes and supersaver offers. Its documented exceptions mean coverage of every imaginable trip cannot be guaranteed.
4. The publisher still describes the available endpoint as using integration/test data and non-binding prices. Production data/access must be clarified with the provider before treating these as live purchase quotations.
5. The [OJP 2.0 reference mapping](https://github.com/openTdataCH/ojp-nova/blob/master/map_ojp2_to_nova.py) maps `PassengerCategoryEnumeration.BICYCLE` to NOVA `VELO`. This is positive implementation evidence for bicycle requests, not proof of deployed bicycle-product coverage or reservation prices. Test those separately.

## Proposed next steps

1. Obtain OJP Fare product access. Use a dedicated server secret such as `OJP_FARE_API_KEY`; this name is proposed and is not supported by the current app yet. The separate timetable `OJP_API_KEY` also needs configuring in the Site if that integration is to be active. Keep keys out of browser assets, logs and repository files.
2. Build a small diagnostic before changing the user interface: three public journeys (Zürich–Baden, Zürich–Bern, and a local bus/tram journey), each on an explicit future date. Obtain an OJP 2.0 trip with scheduled rather than short-term real-time timings. Preserve the exact itinerary and relevant response context for commercial stop identifiers and tariff codes. Submit adult full-fare, adult Half Fare and bicycle fare requests with explicit traveller parameters.
3. Retain sanitized requests/responses and inspect HTTP status, XML status/errors, fare products, currency, class, entitlement, covered leg range and validity. Missing authorization, an invalid request, no applicable product and partial pricing must remain distinguishable. Compare representative amounts with the official booking channel for the same dated trip and profile.
4. Ask the provider (`opendata@sbb.ch`) to confirm production-data access, bicycle products and bike-reservation price coverage. No message was sent. A test response alone must not silently replace the existing production price labels.
5. After validation, add a server fare adapter and load prices for the few displayed proposals asynchronously. Match each quote to the exact dated itinerary and traveller profile, invalidate it when either changes, and use bounded caching/rate limits. Avoid blindly adding one ticket per transit leg, which can overstate through or zone fares. Validate intermediate-cycling cases separately.
6. Keep passenger, bicycle and reservation components separate. A total requires all applicable components; a missing amount must never be presented as zero. A supersaver passenger product does not automatically establish the bicycle tariff or bike reservation availability.

## First acceptance gate

An authenticated OJP 2.0 trip-to-fare exchange produces an inspectable CHF product for one future Swiss journey with the requested class/profile. Then demonstrate full/Half Fare and bicycle results on the three fixed cases, documenting any unsupported case. Only then integrate the provider into journey cards and broaden coverage.

This investigation changed documentation only. The private Site, credentials, application source and GitHub branch were not changed remotely. The earlier restriction against displaying integration-test prices as production quotes remains in effect.
