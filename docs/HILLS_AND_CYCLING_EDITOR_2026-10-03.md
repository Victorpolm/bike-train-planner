# Climbing preferences and cycling-section editing

**Historical version-49 report:** the later 3 October [station-time and climbing correction](STATION_TIMES_2026-10-03.md) supersedes the Less climbing control, Climbing heading and Least cycling ascent label below. Current controls use Cycling hills plus an optional Reduce climbing proposition. The earlier test observations remain historical.

_Implemented 3 October 2026 on `feature/novice-interface-profiles`. The branch remains separate from main._

## Traveller controls

Under **Personalized → Preferences → Climbing**:

| Control | Behaviour |
|---|---|
| No hill preference | Preserve the selected fastest, fewest-turns or lower-traffic cycling preference |
| Less climbing | Prefer less cumulative positive elevation gain among checked cycling alternatives |
| Gentler slopes | Prefer less climbing above a chosen uphill percentage, then less distance above it, then total ascent |
| Prefer to avoid uphill slopes above (%) | User-adjustable 1–20%, default 6%; the control steps by 0.5 percentage points |
| Extra minutes allowed per cycling section | 0–60 minutes, default 15, above the fastest checked cycling alternative; existing total cycling and journey budgets still apply |
| Use public transport to reduce climbing | Independent whole-journey **Least cycling ascent** category; keeps the three main categories and compares transit alternatives within 60 extra journey minutes |

Gentler slopes also adds **Gentlest cycling**. A journey may win multiple categories. The public-transport option minimizes ascent on the bicycle; it does not require that the train/tram itself travels uphill. A saving is shown only against a cycling-only route with complete elevation. Missing elevation remains unknown and cannot win a climbing category.

The percentage is a **soft preference, not a maximum-gradient guarantee**. Elevation is sampled/smoothed at roughly 100 m, so short ramps, bridges and tunnels may be misrepresented. The route cards show approximate ascent and, for gentle mode, distance above the selected percentage. The search checks a bounded set of alternatives; it does not establish a national optimum or objective safety. Commuter/Bikepacking retain their existing defaults; choose Personalized for these trip preferences. Traveller-profile storage is unchanged.

## Modify a cycling path

1. Select a journey, open the map and choose **Edit cycling path**.
2. Select the cycling section. Tap/click to add up to six ordered shaping points; drag the numbered markers to move them. Expand the point list to change order or remove a point. Keyboard users can focus and pan the map, then press Enter to add its centre.
3. The dashed purple preview updates automatically. **Undo**, **Reset points**, retry and section switching are available. No separate Show detour button is needed.
4. **Apply cycling change** is available only after the complete preview passes its checks. The itinerary, map, duration, arrival, distance and ascent update together. Transit edits appear as **Your edited journey**, without inheriting an unsupported optimization badge. The original proposal remains available.
5. **Restore original route** removes the applied edit. Edits are for the current search/session, not a saved journey or cross-device profile.

Only the selected cycling section is rerouted. Its endpoints and mandatory waypoint boundaries stay fixed. Public-transport leg objects, departure times, bicycle evidence and underlying fare query are preserved; there is no new timetable request. Earlier arrival adds waiting, while longer cycling is accepted only if it fits the same services. Unknown timing, missed connections (including walking and the boarding buffer), per-section/total cycling violations and the journey horizon block Apply. Repeated edits cannot evade a section's cap by splitting it into several pieces. Beginning-only/end-only constraints remain enforced. Cycling-only comparison edits stay a labelled reference even outside the transit cycling preference.

The existing facility detour panel remains a preview with explicit visit duration. This release does not turn it into saved facility-stop insertion, add indoor/entrance routing or include visit time in ordinary shaping points. Search for different public-transport services explicitly if the edited ride cannot catch the selected connection.

## Implementation

- `hills.ts`: separate elevation resources, validation, summaries and BRouter uphill parameters. Total ascent counts positive gain, never net endpoint height. Above-threshold distance and excess positive gain distinguish a short severe climb from a gentler ride.
- `cyclingClient.ts` / `cyclingPreferences.ts`: request a hill-penalized trekking alternative using BRouter `uphillcost`/`uphillcutoff`; compare it with the primary route within the detour allowance. Hill settings are part of cache keys and survive forks. At most 12 hill alternatives and the existing 32 cycling requests per client; the search deadline stays bounded. Stair penalties can combine with hill preferences.
- `api.ts`: reserve a checked low-ascent station pair and useful low-ascent exits during acquisition. This is a bounded candidate-search improvement, not simply a final-card sort.
- `model.ts` / `waypoints.ts`: carry elevation resources through dominance pruning and shared waypoint budgets so a slower low-climb/gentler state is not discarded before ranking. Permission filtering and the existing three categories are retained.
- `cyclingEditor.ts`: pure section rebuilding, fixed-service feasibility and budget validation. `CyclingEditor.tsx`: ordered-point editing and cancellable preview requests. `MapView.tsx` / `App.tsx`: map integration, correct source session for later departures, applied custom results and restore.

Official profile reference checked 3 October: [BRouter profile developer guide](https://brouter.de/brouter/profile_developers_guide.txt) and [trekking profile](https://brouter.de/brouter/profiles2/trekking.brf). Costs influence route choice; they do not ban a road above the chosen grade.

## Verification

**343 offline regression cases in 11 suites pass**; `npm test` passes all 40 test files. Sixteen new cases cover uphill/downhill separation, threshold changes, detour limits, missing elevation, hill-sensitive pruning in both solvers, reserved acquisition candidates, permission boundaries, cache isolation, ordered edits, exact transit/fare preservation, missed connections/walking/buffer, repeated section budgets, stale/disconnected routes, waypoint visits and cancellation.

A live check used the modified local planning/editing core against the existing private Site's unchanged backend, checked at **2026-10-03 14:43 UTC**, for **5 October 2026 at 08:00 Europe/Zurich**, Zürich HB → Zürich Zoo entrance. These are dated provider results, not guarantees for other departures.

| Checked result | Distance / time | Cycling ascent | Meaning |
|---|---|---|---|
| Ordinary cycling | 4.403 km / 45 min | 207 m | Steepest sampled uphill section about 14.2% |
| Less-climbing cycling | 4.403 km / 45 min | 207 m | No better-ascent candidate found in this check |
| Gentler cycling, requested 5% | 5.137 km / 46 min | 207 m | Steepest sampled uphill section about 10.2%; excess gain above 5% fell from 72.6 to 39.5 m, but distance above 5% did not fall |
| Least cycling ascent using transit | 26 min, tram 6 | 3 m | About 204 m less cycling ascent than the checked cycling-only route |
| Applied access-section edit | 26 min before/after | Recomputed | Two real routed pieces; exact transit objects and fare query retained |

The transit search completed with three feasible journeys, 14 timetable and 26 cycling requests. One result won all four categories; a separate deterministic regression proves a distinct lower-climb winner survives. All 69 HTTP calls across route, plan and edit checks succeeded. This is a targeted live smoke test, not a 250-route Swiss benchmark. [Sanitized evidence](experiments/hills-and-editing-2026-10-03.json).

**Browser visual/interaction QA remains pending:** the required managed-browser capability was unavailable. Check desktop dragging and touch point placement; keyboard point insertion; reordering/removal/undo/reset; narrow-screen editor scrolling; an edit that misses the next service; Apply and Restore; later-departure and repeated-waypoint journeys. No manual browser result is claimed.

## Next bounded step

Try the editor on a familiar real ride on desktop and phone, then compare gentle/low-ascent/transit choices on a small fixed set of hilly Swiss journeys. Use the outcomes to tune profile costs and candidate coverage. Facility-stop Apply with visit duration, saved editable routes, finer elevation validation and GPS/navigation remain separate work.

## Publication

Owner-private **version 49** published on **3 October 2026 at 14:57:43 UTC**, environment revision **3**, Site source `3b245df2d8507c07ff381e48e06ffe0e14bd069c`. Deployment `appgdep_6ac117d46eb88191a36a530d4b989b83` succeeded; all 206 current app files match the GitHub interface branch. The branch and draft PR #1 remain unmerged. React formatting, Knip and production TypeScript/frontend/Worker builds pass. The existing Vite large-chunk advisory remains; no new hosting, secrets or audience changes were introduced.
