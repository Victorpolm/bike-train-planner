# Realtime, caching and cycling consistency — 9 October 2026

The owner requested live public-transport data, faster map filters and option computation, and a fix for EPFL → Basel SBB where Simplest displayed 6:46 while Fastest displayed 7:04.

## Delivered behaviour

- OJP connection and exact-service TripInfo requests use `UseRealtimeData=explanatory`. Published departures/arrivals, journey references, fare sources and bicycle-evidence identities remain unchanged. Estimates, cancellations, skipped boarding/alighting stops, undefined delays, platforms and check timestamps are separate data.
- Both routing models, ordered visits and arrival-deadline checks use estimated times when supplied. Cancelled services cannot be proposed, even in the unrestricted bicycle scope. Transfer walks can follow a delayed incoming service while keeping their original scheduled identity.
- The selected Journey view refreshes today's OJP services every 30 seconds while visible, with two client checks at a time, shared requests and the existing serialized provider pacing. It pauses on hidden pages/other views and offers manual refresh. Server and detail-client caches last 15 seconds. Historical/future and unsupported fallback services remain timetable-only; absent estimates are never called on time.
- Delays and planned times, current/changed platforms and freshness are displayed per service. Estimates older than two minutes are labelled out of date. A selected cancelled or broken connection remains visible with a warning to search again; it is not silently replaced. Final arrival and the requested deadline are re-evaluated.
- Changed platforms trigger a fresh lookup in the imported station-transfer table. Dated OJP transfer/access evidence for the original platform is not reused as exact evidence for the new one. Explicitly identified station membership permits resolving the new platform; unknown identities and contradictory stations remain rejected. Unverified new-platform allowances are warned about.
- Parking, water/toilets, repairs, food and supplemental station/rural/topographic map sources now use asynchronous IndexedDB persistence and a bounded memory cache. A fresh validated dataset is reused for 24 hours across page reloads. Data up to seven days old appears immediately with an older-cache label while one shared background refresh runs. Invalid, future-dated or expired persisted data is rejected. Storage failures retain the normal network/memory fallback. Public map data is cached; live transit is not put in that durable cache.
- The OSM amenity/service Worker also serves a valid older edge-cache dataset immediately while refreshing it with `waitUntil`. First-ever uncached downloads still depend on upstream availability and dataset size.
- Fastest, Simplest and Lower traffic stress acquire the same bounded trekking/road-profile pair with the same alternate timeout and terrain checks, then rank it. The complete checked candidate pool is reused for 30 minutes across preference switches, separately by endpoints, cycling pace, assistance and hills. Incomplete comparisons are not persisted as complete pools. Equal Fastest/Simplest times are valid; among the same eligible checked candidates, Fastest cannot be slower.
- Search vectors, category metrics and fare-path comparison keys are computed once per local calculation. The three bicycle scopes reuse a solve only if their eligible edge sets are identical; genuinely different graphs still solve independently. Static location responses receive a longer cache lifetime. No provider budget, safety/permission boundary or discovery limit was relaxed.

## Evidence

**468 tests in 11 suites pass**, including the existing exhaustive solver comparisons and new cache/realtime/route-ordering cases. TypeScript, frontend and Worker production builds, Prettier and Knip pass.

**Live EPFL–Basel candidate check:** approximate points `(46.5226, 6.5664)` → `(47.5476, 7.5896)`, recorded on 9 October. At 25 km/h selected flat pace without assistance, before a separate swisstopo check, trekking returned 203.124 km / 556 min / 374 turns; fastbike returned 184.779 km / 504 min / 176 turns. Both preferences now choose 504 minutes from that pool. Ordering also passes at 15 and 20 km/h. The raw fields used by the parser are retained losslessly in compressed fixtures with provenance. The user's precise 406/424-minute result was not reproduced: its original coordinates/profile/provider responses were unavailable. This proves the candidate-set defect and corrected ordering, not a global cycling optimum or a full phone reproduction.

**Live deployed OJP check, 16:02 UTC:** status, connections and exact TripInfo all returned HTTP 200 for Zürich HB → Bern. IC1 scheduled 16:32:00–17:28:00 UTC returned estimates 16:32:30–17:28:48 UTC in both connection and TripInfo responses. Scheduled identities were retained; 12 fare sources remained available; no connection-query warnings. These were actual provider estimates, not injected test delays. Endpoint round trips were about 7.7–8.0 seconds including the private deployment/network path. Cancellation and platform-change handling are regression-tested, not claimed as observed live disruptions.

**Performance:** an offline 240-candidate ranking benchmark with 2,033 recorded elevation points per endpoint improved median category computation from **216.1 ms to 172.9 ms (about 20%)**, seven measured runs after two warmups, with identical proposals. `prototype-v0/scripts/benchmark-options.mjs` reproduces the current case and accepts an older adjacent model module for comparison. The smaller 280-edge mixed-network benchmark was already only a few milliseconds and showed timing noise, so no general solver or complete live-search speedup is claimed. Cache regressions verify zero extra downloads after reload and zero new route requests on preference switch after a complete pair.

## Publication and limits

Owner-private **version 61** published successfully **9 October 2026 at 16:01:35 UTC** (18:01:35 Europe/Zurich), environment revision **3**.

- Site source: `414c08bd1dfb97d097c12de12dc1391ae2332fc9`
- Version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_7e7367f26ab88191ba14147989c4ca79`
- Deployment: `appgdep_6ac90fc8f0ac8191be85edc3c60cf64b`
- URL: https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site

The tested source was pushed and its matching archive deployed. Runtime secrets, owner-only access and costs are unchanged. Browser/phone interaction and real-device IndexedDB acceptance remain pending because browser QA was unavailable. Cold downloads and new provider searches can still take seconds; this release does not migrate the national routing engine. Live bicycle spaces, booking and traffic volumes are not included.

## Next checks

1. On phone and desktop, open a today's journey, verify automatic/manual refresh, a known delayed service and a platform/connection warning; hide/reopen the page.
2. Load map layers once, reload and toggle them; record actual transferred bytes and latency. If cold nationwide food data remains problematic, investigate compact geographic batches.
3. Repeat the owner's precise EPFL → Basel input/profile and track full search phase timings; retain the other Zürich–Laax/Baden–Witikon reports with exact inputs before further algorithm changes.
4. Continue the already planned parking/useful-stop acceptance and station-feed maintenance in [NEXT_STEPS.md](NEXT_STEPS.md).

## Protocol sources

- [Swiss OJP TripRequest 2.0](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptriprequest-2-0/)
- [Swiss OJP TripInfoRequest 2.0](https://opentransportdata.swiss/en/cookbook/open-journey-planner-ojp-landing-page/ojptripinforequest-2-0/)
- [VDV OJP 2.0 schema tables](https://vdvde.github.io/OJP/release/2.0/documentation-tables/ojp.html): ServiceStatus, ServiceTime, StopCallStatus and EstimatedQuay.
