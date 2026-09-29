# Water fountains, toilets and preferred parking equipment

_Delivered 29 September 2026, owner-private version 36._

## User request and delivered behaviour

The owner requested green bollards and handlebar holders, then the same map features for water fountains and toilets. This authorises these two useful-stop categories ahead of the remaining shop/repair work.

- **Parking:** `bollard` and `handlebar_holder` join stands in the green preferred-equipment group. The label now says preferred equipment, rather than claiming that every green type supports the frame. Mixed records containing wall loops/wheel-only equipment remain red. Other/unknown equipment remains grey.
- **Water:** a separate map toggle shows water-drop symbols. Blue means mapped drinking water, red means explicitly non-drinking water, amber means restricted/unavailable, and grey means drinkability is unconfirmed. A restriction takes priority over the positive blue colour; an explicit non-drinking tag remains red.
- **Toilets:** a separate toggle shows WC badges. Green means explicitly mapped public/permissive access, amber means restricted/unavailable, and grey means access is unspecified. Fee and accessibility information are independent of the colour.

Both new categories use the same optional **Along selected journey** filter as parking: approximately 100 m around selected cycling paths, explicitly routed walking paths, requested locations and boarding/alighting endpoints. Schematic transit/walking lines do not create corridors. Missing geometry is disclosed. With no journey, all loaded records are eligible for exploration; ordinary pins appear from zoom 13. Each new category has a 1,000-marker viewport cap and a zoom notice; the full eligible set participates in closest selection.

Each panel offers **Find closest drinking water** or **Find closest toilet**, measured from **A**, with a larger highlighted symbol. Closest water requires positive mapped potability. Both searches exclude explicit access restrictions, conditional access, applicable key requirements, locked facilities and known closures. Missing access/hours remain unknown rather than being certified public/open. Selecting a closest result in one category replaces the previous closest highlight, avoiding competing map focus actions. GPS is not used.

Popups preserve source links, access, fee/charge, raw hours, seasonal and intermittent operation, bottle-filling information, wheelchair access, changing tables and applicable toilet details. Shared water/toilet places retain one OSM identity; when both layers are enabled their symbols are slightly offset so each can be inspected. Distances still use the actual supplied point or representative area centre.

These are mapped facilities, not live flow, water-quality, opening or availability checks. Entrances and detours are unverified; a nearby point across a barrier may be inconvenient. Inspecting a facility does not add a stop or change the journey/timetable. Municipal enrichment, evaluating hours at arrival, visit durations and explicit route insertion remain later work.

## Source and interpretation

One fixed query to the existing [Swiss regional Overpass endpoint](https://overpass.osm.ch/api/interpreter) selects nodes, ways and relations with `amenity=drinking_water|fountain|toilets`, `drinking_water=yes`, or `man_made=drinking_fountain`. It sends no user route or start coordinate. Other service tags such as `toilets=yes` inside an unrelated business are not independently imported in this first release.

The parser follows the primary OSM definitions for [drinking water](https://wiki.openstreetmap.org/wiki/Tag:amenity=drinking_water), [fountains](https://wiki.openstreetmap.org/wiki/Tag:amenity=fountain), [potability attributes](https://wiki.openstreetmap.org/wiki/Key:drinking_water) and [toilets/access](https://wiki.openstreetmap.org/wiki/Tag:amenity=toilets). An unspecified decorative fountain is not drinking water. Explicit negative/conflicting tags override implicit positive amenity tags; conditional/boil/other ambiguous values and `drinking_water:legal=no` are unconfirmed and excluded from closest drinking-water results. Lifecycle-inactive records and invalid coordinates/IDs are excluded.

The 29 September raw download contained **38,575 objects**, normalised to **38,552 records**: **30,686 water points**, **8,216 toilets**, including **350 shared places**. Water classification: 23,016 mapped drinking, 1,562 non-drinking and 6,108 unconfirmed. 945 toilet records carry restrictions/unavailability under the documented rules. These are mapped records, not audited distinct public facilities. Nearby separate OSM identities are not merged by distance. [Source audit and public sample points](experiments/water-toilets-source-2026-09-29.json).

The endpoint `/api/amenities/v1` is separate from parking and journey APIs. Both toggles share one download, one in-flight request and daily memory/edge caching. Failures have a 60-second cooldown and at most seven-day stale fallback. The upstream response is capped at 16 MiB with a 40-second deadline; the browser has a body-inclusive 50-second deadline and one bounded transient retry. Browser caching is bypassed, cached schema/source content is validated, and sign-in/network/data errors remain distinguishable. OSM attribution is visible. No new key, paid service or recurring job was introduced.

## Verification and release

**245 tests passed**, 11 suites, zero failures/skips/cancellations; TypeScript/frontend/Worker builds and whitespace checks passed. Fifteen new tests cover real Swiss source records, conflicting potability, inactive/invalid records, shared services and area centres, seasonal/fee/accessibility details, restrictive/unknown access, closest-from-A within the corridor, caching/stale fallback, source validation, authentication/errors, bounded retry/cancellation and a stalled response body. Existing parking tests now include green bollards and handlebar holders.

Private **version 36** succeeded at **2026-09-29 18:02:13 UTC**, environment revision **3**, Site source `a0ac4ff86a2427387060adc0c1dbebe156015884`, deployment `appgdep_6abbfd179904819194413d0a3787512b`. Owner role and zero external visitors were rechecked. The matching application consists of 148 tracked files.

Browser visual/interaction QA remains unavailable because the required managed browser-control skill is absent. The next user check is a familiar journey near ETH: toggle Water and Toilets, inspect the tags, switch journey cards and try each closest button. This is separate from the authenticated endpoint verification recorded below.


**Deployed verification passed at 18:03:05 UTC.** The exact client loader received HTTP 200/JSON, schema 1 and private/no-store headers from the live endpoint. It accepted 38,552 fresh records (30,686 water, 8,216 toilets, 350 shared places) without retry. This uncached load took 32.55 seconds, so first-load latency is a practical limit; both toggles then reuse the loaded data. The authenticated Node check is not a browser cookie or click-through check. [Evidence](experiments/water-toilets-live-2026-09-29.json).

| Public test start | Closest mapped drinking water | Closest eligible toilet |
|---|---:|---:|
| ETH Zentrum | 40 m; access unspecified | 32 m; public access mapped |
| Bern station | 159 m; area centre, access unspecified | 38 m; area centre, access unspecified |
| Biel/Bienne station | 309 m; access unspecified | 47 m; public access mapped |

These are straight-line calculations from the documented public coordinates, without a selected journey filter. They do not establish entrances, current opening, flow or a usable detour. Source IDs and exact starts are in the evidence file.
