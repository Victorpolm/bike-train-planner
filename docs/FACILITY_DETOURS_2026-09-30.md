# Readable facility details and cycling-only detour previews

**10 October implementation update:** [Facility stops and useful choices](FACILITY_STOPS_AND_CHOICES_2026-10-10.md) supersedes the older preview-only/suitability/opening-gap status below. Add as stop, repeated visits, budget/connection checks, parking destination/station/map-point lists with collection/maxstay checks, conservative weekly hours and per-cycling-section refill gaps are implemented. Physical entrances, live stock/flow/occupancy, saved journeys and custody-aware parking remain unverified or separate work. Earlier proposals and dated evidence below retain their historical scope.

_Implemented 30 September 2026. This report supersedes earlier statements that all facility detour and visit-duration work remains unimplemented._

## User request and outcome

The owner reported that facility details disappeared when clicking a food or other interactive map symbol: the map moved, and the text survived only while hovering. The owner also asked to propose a facility detour without recalculating the complete journey, preserving public transport and changing only cycling.

**Popup cause:** Leaflet auto-pans to fit the popup. The amenity/parking viewport listener redraws markers on `moveend`/`zoomend`, removing the marker that owned the bound popup. Hover tooltips then appeared to be the only remaining details. Popups now belong directly to the map, independently of temporary markers. This applies to individual and grouped facility records, parking, explored stops, boarding/alighting markers and endpoints. Long content has a responsive scrolling height, an explicit close button and no hover requirement. Clicking a different location can still open its own details. Numbered food/repair groups at overview zoom still zoom in deliberately.

**Detour workflow:** calculate/select a journey, enable a facility category, click a facility and choose **Preview cycling detour**. A panel below the map preselects the nearest cycling section by its full geometry; the rider can choose another section. Two directed cycling links replace that section in the preview: section start → facility → section end. All section endpoints and required intermediate stops remain fixed. Existing pace, routing preference, terrain/access checks and provider fallback are reused. The original journey cards, public-transport services and price quotes remain unchanged.

The panel displays distance change, travel-time change, chosen stop time (editable; initially 5 minutes), arrival at the facility and the timing effect. The dashed purple map path distinguishes the preview from the original route. Adjusting stop time recalculates timing locally and does not fetch either cycling link again. Stop time is explicit and limited to 0–180 minutes. Only one facility preview is active at once.

## Timing and request boundaries

- Before the next fixed public-transport leg, include the new cycling duration, chosen visit duration, any intervening cycling/walking duration and the existing three-minute boarding buffer. Show the remaining margin, or explain that the selected connection no longer fits. A failed connection is not replaced automatically.
- When the next service still fits, preserve its departure, subsequent transit services and original destination arrival. After the last transit leg, or for cycling-only journeys, shift destination arrival by the added travel plus visit time.
- Missing onward leg details produce an unknown connection check, never a positive catchability claim.
- Use an independent cycling client, cancellation controller and 60-second preview deadline. Routing preferences can cause alternative-path and terrain requests inside those two links; “two links” does not mean exactly two HTTP requests.
- No timetable search, OJP trip query, fare request, recommendation/ranking update or main journey budget is triggered by a preview. The original route stays usable after failure/cancellation. Closing it, changing the selected journey or editing inputs aborts outstanding preview work. Late aborted results are discarded.

## Data and product limits

Unknown/non-potable water cannot be suggested as a drinking stop; explicitly restricted/unavailable amenities and parking are not offered for detours. Customer-access food/repair businesses remain eligible, with their normal access information. Eligibility does not establish opening at arrival, stock, live water flow, quality or equipment condition.

Routing reaches the mapped location, which may be an area/building centre. Known endpoint gaps remain disclosed and use the existing walking-connector estimates; gaps beyond the existing 250 m routing limit are rejected. These are not verified entrances or indoor paths. The rider must allow for floors, queues and access. An ordinary repair preview assumes the bicycle can still travel using the cycling profile; pushing-only broken-bike routing remains deferred.

This is a **preview**, not saved stop insertion: original cards, fares, categories and search-limit compliance are not rewritten. It replaces the complete affected cycling section, not only a short local subpath. An explicit Apply/save step, multiple facility stops, evaluated hours, verified entrances, local leave/rejoin optimisation, stricter broken-bike handling and revalidation of original cycling/time budgets remain future work. Parking previews visit the location and continue with the bicycle; they do not implement park-and-ride.

## Verification

**290 tests in 11 suites pass**, including twelve new regressions. TypeScript, Vite frontend and Worker builds pass. The existing large frontend-bundle warning remains non-blocking.

New checks cover persistent popup lifetime during transient-marker removal/map/hover events; bounded scrolling; two-link-only request orchestration and unchanged transit objects; stop-time-only updates; origin/middle/egress and cycling-only timing; walking before boarding; required waypoint boundaries; nearest full-geometry selection; unknown/missed connections; partial/blocked results; cancellation between/in-flight links; endpoint gaps; negative deltas; invalid visit durations; water/access eligibility and indoor-location caveats. See `prototype-v0/src/readablePopup.test.ts`, `prototype-v0/src/cyclingDetour.test.ts` and [golden timing cases](EXPERIMENTS.md#2026-09-30--stable-facility-popups-and-fixed-transit-detour-previews).

**Not verified:** browser visual/interaction QA and live provider detour journeys. The managed Sites workflow requires its browser-control skill for UI automation; that skill is unavailable in this workspace. Event-lifecycle regressions and production builds are evidence for the correction, not a claim that an actual browser click was exercised. No fresh provider/source/fare audit is claimed for this UI/routing-preview change.

## Release and next check

Deployment evidence is recorded in [WEBSITE.md](WEBSITE.md). Existing owner-only audience, OJP secrets and environment revision 3 remain unchanged.

Next check: in the published site, select a journey with an origin cycling leg, open a food/fountain popup near the edge of the map, move the pointer away and scroll its text. Preview the detour, increase the stop time until the connection warning changes, then cancel/close and verify that the original journey remains selected. Repeat once on mobile and with a grouped multi-floor station facility. After that, prioritise rural refill gaps and access evidence, then an explicit Apply action with budget checks.

