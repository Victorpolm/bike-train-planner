# ETH HG to Zürich Stadelhofen routing regression

Public BRouter GeoJSON responses retrieved on 7 October 2026, BRouter 1.7.10. Start: representative ETH HG building pin (47.376427, 8.548112), about 16 m from the official Rämistrasse 101 address point. End: the planner's Zürich Stadelhofen station anchor (47.36661115, 8.54848502). This reproduces the reported corridor, not an exact user-selected entrance.

`requests.json` preserves request parameters. Raw messages, coordinates, elevation and instructions remain intact. The production requests use `maxSpeed=45`, as the app does when a rider pace is set; the app computes displayed time separately from the chosen flat-ground pace. All requests use the bicycle profiles, not a car router.

| Fixture | Request | Distance | Actual turn/fork decisions |
| --- | --- | --- | --- |
| current-primary.json | Production trekking primary | 1,774 m | 16 |
| legacy-alternative.json | Old client alternative: trekking, steps off, avoid_unsafe on | 1,774 m | 16 |
| road-candidate.json | New client alternative: fastbike, steps/motorways/ferries off, turn restrictions on | 1,551 m | 11 |
| current-alternative.json | Exploratory trekking alternative index 1, maxSpeed 25 | 1,925 m | 15 |

The old client returned the same geometry for both requests. The new road candidate is shorter, has fewer instructions and no mapped stair section. A separate live OpenStreetMap API check matched about 334 m of its segments within 3 m of named Rämistrasse road ways (521436341, 521441691, 521460740, 559462246, 559462248 and 559462249). This confirms use of the street; it does not certify the whole path or station entrance. The exploratory index-1 route supports timeout/fallback regressions and is not presented as the old app's selected route.

Sources: https://brouter.de/brouter ; https://github.com/abrensch/brouter ; https://api.openstreetmap.org/api/0.6/map?bbox=8.545,47.369,8.553,47.376 . Map data © OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright . These are small public routing fixtures, not a national dataset. Tests use them offline.
