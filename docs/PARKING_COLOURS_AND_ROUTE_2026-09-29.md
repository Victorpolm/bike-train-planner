# Parking colours and selected-journey filter

_Initial delivery 29 September 2026, private version 34; marker refinement in version 35._

**Version-36 follow-up:** Bollards and handlebar holders now join green preferred equipment. [Water and toilets](WATER_AND_TOILETS_2026-09-29.md) add their own toggles, symbols and closest actions with the shared corridor.

**Version-35 refinement, following the owner’s readability feedback:** Other mapped equipment and unknown rack types now share grey; the legend has three entries. Parking uses square P badges, explored stops small hollow circles, and the closest parking a larger outlined P. Popup text still distinguishes other mapped types from missing information. The version-34 account below preserves the initial release; route filtering is unchanged.


## User request and delivered behaviour

After positive feedback on the loading correction, the owner requested colours that distinguish wall loops from preferable parking equipment, and parking restricted to a selected journey's path.

Enable **Bike parking** as before. The map dots, closest-parking P marker, tooltip, popup and legend now share these equipment categories:

| Colour | Mapped equipment | Interpretation |
|---|---|---|
| Red | `wall_loops`, `rack`, `ground_slots` | Wheel-only support, less preferred than frame-support stands; a mixed facility containing these tags keeps the warning colour |
| Green | `stands`, `wide_stands`, `safe_loops` | Frame-support equipment mapped |
| Blue | Recognised other forms, including lockers, building/shed, handlebar holders and two-tier arrangements | Inspect the supplied type; no automatic support/security ranking |
| Grey | Missing or unrecognised rack type | Unknown; cover, capacity and a broad bicycle-station type do not establish the rack form |

Classification uses structured `bicycle_parking` information, including semicolon-separated values, based on the [OSM key definitions](https://wiki.openstreetmap.org/wiki/Key:bicycle_parking). Green requires all supplied types to be recognised frame-support forms. Text labels accompany colour. Access, fees, cover, source attribution and other existing details remain separate; colours do not guarantee theft protection, public entry or available spaces. Restricted facilities remain labelled rather than silently becoming recommended public parking.

With a selected transit or cycling-only result, **Along selected journey** defaults on. Eligible parking lies within **about 100 m** of its real cycling paths, explicitly identified walking paths, requested locations, or boarding/alighting endpoints. The checkbox restores all loaded parking when unchecked. Selecting another result updates the filter; the faint, unselected cycling-only reference does not contribute to a transit journey's parking corridor.

The filter does not run along rail/bus lines between stops or join disconnected cycling legs. Current timetable walking geometries are generally schematic stop-to-stop lines, not confirmed street paths. Those sections and snapped cycling connectors contribute their known endpoints only; a visible note explains the incomplete path coverage. A future walking adapter must explicitly mark street geometry as `geometryKind: "path"` to use it as a corridor. No new path request or route-search budget is introduced.

**Find closest parking** still measures straight-line distance from starting point **A**, now within the eligible set when the journey filter is on. It never adds an off-corridor closest exception. A different journey/filter scope removes the previous highlight from that scope. Without a journey, closest searches all loaded records as before. GPS remains deferred.

Filtered pins can appear at the whole-journey zoom; the all-parking view retains zoom 10 for official and 13 for OSM-only records. Both retain viewport drawing and the 1,500-marker cap with a zoom notice. Counts and closest selection use the eligible records independently of those display limits. Empty corridor results explain how to restore all parking.

## Implementation and limits

[`parkingMap.ts`](../prototype-v0/src/parkingMap.ts) keeps equipment classification, journey geometry extraction and point-to-segment proximity separate from Leaflet presentation. A geographic grid indexes the loaded facilities; the filter checks segment distance with a local latitude-adjusted metre approximation. The band is deliberately described as approximate geographic proximity, not a routed detour or entrance distance. Areas still use their supplied representative centres.

[`MapView.tsx`](../prototype-v0/src/MapView.tsx) applies the current eligible set consistently to pins and closest selection. Existing loader, upstream caching, source records, fares and route timings remain unchanged. Parking is still an information layer; selecting a facility does not add a stop or leave the bicycle behind.

## Verification

**230 application tests passed**, 11 suites, zero failures/skips/cancellations. TypeScript, frontend and Worker production builds passed; `git diff --check` passed. The existing bundle-size advisory remains non-blocking.

Ten new regressions cover real ETH stands/wall-loop records, unknown/restricted/mixed equipment, proximity to the middle of a segment and the 100 m boundary, disconnected legs and transit exclusion, baseline access/egress, intermediate cycling and selected-result switching, schematic versus routed walking geometry, missing/invalid geometry and connector gaps, cycling-only stages, and closest-to-A within the filtered set.

The previously downloaded 29 September national OSM snapshot classifies **20,728** records as 4,351 wheel-only, 7,354 frame-support, 4,237 other and 4,786 unknown. A local synthetic 1,000-segment scale check indexed it in 5.89 ms and filtered it in 2.80 ms, selecting 76 records. This is a single Node execution, not a navigable route, browser benchmark or latency guarantee. [Machine-readable evidence](experiments/parking-colours-route-2026-09-29.json).

Browser visual/interaction QA was unavailable because the required managed browser-control skill was absent. No click-through or screenshot verification is claimed. Next user check: select a familiar ETH journey, enable parking, compare the coloured rack details, switch journey cards and uncheck **Along selected journey** to compare coverage. The 100 m band can be adjusted after this first trial; barriers and actual entrance detours remain later work.

## Publication

Private **version 34** succeeded at **2026-09-29 15:51:24 UTC**, environment revision **3**, Site source `b74ad2037d5d59ebe5fe621995b3e54856a33953`, deployment `appgdep_6abbde69b5c481919b40ca869d880882`. Owner role and zero external visitors were rechecked. The matching GitHub application contains 141 tracked files, including the two new parking-map modules. No new service, key, schedule, sharing change or paid hosting was introduced.

[Open the planner](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site).

## Version 35 marker refinement

Published **2026-09-29 17:03:36 UTC**, Site source `2a8cc24a9582d090f89489f88c1e6e8e62d754e3`, deployment `appgdep_6abbef56120481918960ef7f0851925e`, environment revision 3. Owner-private access remains unchanged.

The owner requested one colour for other/unknown equipment and reported that parking dots resembled explored stops. Both equipment groups now use grey, with a single combined legend entry while retaining their different detail text. Regular parking uses a 22 px square P badge in a 28 px keyboard-focusable marker; the closest result uses a 30 px badge with an additional outline. Explored stops use 12 px hollow circles, and the map legend shows the different symbols.

All **230 existing tests** and frontend/Worker builds pass; no new tests were added for this presentation-only change. All 141 tracked application files match the published source. Browser visual/interaction verification remains unavailable because the managed browser-control skill is absent. Next check: enable both parking and explored stops on a familiar map area and compare the distinct symbols.
