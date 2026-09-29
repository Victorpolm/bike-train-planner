# First parking trial — 29 September 2026

## Requested and implemented scope

The user requested a small first trial: a parking-filter icon on the map and an option to find the closest bicycle parking to the entered **starting point**. GPS is explicitly later.

- **Bike parking** is a labelled P/bicycle icon toggle, with an accessible pressed state, that shows/hides the existing official parking layer.
- **Find closest parking** searches every loaded facility relative to point A, independently of the destination, map centre, zoom or current viewport. It works before running a journey search.
- The selected facility has a distinct P marker and distance label; the map fits A and the result. A card beneath the map shows its name, origin and distance, access caution and facility link where supplied.
- A changed A recomputes an active closest result. Clearing A disables the action and explains how to select a start. Repeating the action refocuses the map. Hiding the filter clears the closest selection; it does not change the journey.
- Loading, empty and failed-source states are visible, with a Retry button. Source/download date, incomplete coverage, stale fallback and unknown live availability remain explicit. Parking-pin clicks do not trigger the map's location picker.

## Meaning of closest

This first trial uses geographic great-circle distance (Haversine), displayed as **straight-line distance**. It is the nearest listed facility in the loaded dataset, not the nearest reachable entrance, shortest road route, guaranteed public facility or available space. Restricted access is retained and labelled; unknown access is not upgraded to unrestricted entry. No walking/cycling time is fabricated, no parking waypoint is inserted and no bicycle is left behind automatically.

The helper accepts a coordinate rather than a place-search-specific object. A later explicit GPS action can supply a permission-granted location through the same calculation. This release does not call the browser geolocation API, request location permission or add a GPS button.

The trial uses the existing official/partner source. Municipal/OSM enrichment, equipment/security filters, entrance routing, multiple recommendations and the other amenity categories remain proposed work in [BIKE_PARKING.md](BIKE_PARKING.md), [CYCLING_AMENITIES.md](CYCLING_AMENITIES.md) and [APP_ROADMAP.md](APP_ROADMAP.md).

## Verification

**206 application tests passed**, including three new cases for geographic ranking and changed starts, missing/invalid/empty input, stable ties and preservation of restricted/unknown access. Existing data-filter, upstream-failure and shared-download tests also pass. TypeScript, frontend and Worker production builds succeeded. Dependency manifests and lockfiles are unchanged.

**Live data check:** At 12:45:32 UTC the existing hosted `/api/parking` returned 1,608 facilities, freshly fetched at 12:45:31 UTC with `stale: false`. The new helper, run against that real response, returned:

| Starting coordinate (latitude, longitude) | Closest listed facility | Straight-line distance |
|---|---|---:|
| Zürich HB: 47.378177, 8.540192 | Veloparking Zürich HB | 51 m |
| Bern station: 46.948825, 7.439122 | Bern Bollwerk | 115 m |
| Biel/Bienne station: 47.132970, 7.242240 | Veloparking Biel/Bienne | 51 m |

These are facility-point distances from the stated inputs, not entrance/route/occupancy checks. The direct development-environment download timed out at the upstream redirect/storage path; the hosted API check succeeded without changing its implementation. No credentials or full dataset were saved in Git.

Browser interaction/visual QA was unavailable: the managed-preview browser-control skill was absent after checking the skill catalogue and available skill files. The current verification is automated logic/build plus the hosted data check, not a claimed browser pass. No extra browser path or public preview was created.

## Publication

Implementation and verification are complete; publication confirmation will be recorded here after the existing owner-private Site reports success.
