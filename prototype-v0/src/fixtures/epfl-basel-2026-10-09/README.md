# EPFL–Basel cycling candidate regression

Recorded from the public BRouter service on 9 October 2026. Approximate endpoints:
EPFL `(46.5226, 6.5664)` → Basel SBB `(47.5476, 7.5896)`.

Both requests use alternativeidx=0, GeoJSON, processUnusedTags=1, maxSpeed=45,
allow_ferries=0, waypointCatchingRange=200, timode=2 and turnInstructionMode=2.
Trekking uses allow_steps=1, ignore_cycleroutes=0, avoid_unsafe=1. Fastbike uses
allow_steps=0, allow_motorways=0, considerTurnRestrictions=1.

Each JSON contains base64 gzip of the original geometry and the four properties
consumed by our parser: track-length, total-time, messages, voicehints. This is
lossless for those fields. No route simplification or estimated times were added.

At a selected flat pace of 25 km/h without electric assistance, before a separate
swisstopo terrain check: trekking is 203.124 km / 556 min / 374 turns; fastbike is
184.779 km / 504 min / 176 turns. Both Fastest and Simplest select 504 min from
this same pool. At 15 and 20 km/h the ordering also holds. These are sampled
candidates, not a global optimum. They do not reproduce the user's exact 406/424
minutes: the original coordinates/profile/provider responses were not captured.

Source: https://brouter.de/brouter
Map data: © OpenStreetMap contributors https://www.openstreetmap.org/copyright
