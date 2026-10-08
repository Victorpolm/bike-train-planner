# Journey view and departure-to-arrival time — 8 October 2026

## Scope and authorization

**Decision:** Implement the approved first two interface proposals: a selected Journey view and clear time semantics. The owner's preset/objective ideas in the same request are **brainstorming**, recorded in [Personalized objectives proposal](PERSONALIZED_OBJECTIVES_PROPOSAL_2026-10-08.md). This release does not change Commuter/Bikepacking defaults, category selection, the strict fewest-boardings rule, or implement scenic routing.

## Interface

Phone navigation is **Plan / Map / Journey**. Desktop keeps planning and comparison on the left, with **Map / Journey** on the right. Selecting a result opens its Journey; a separate View map action selects the same result and opens Map. The map stays mounted so its layers, center, zoom and editing state survive view switches. Phone views retain their scroll positions; opening another result starts its Journey at the top. Desktop Journey has its own scrolling area.

Journey contains the timed itinerary, cycling terrain, fare breakdown and bicycle conditions grouped by service. All existing operator instructions, evidence and source links remain available. Result cards retain permission/uncertainty, required-reservation and unknown-requirement summaries, known/partial prices and a CFF/SBB link. The link opens SBB's general site; it does not claim a prefilled itinerary or a completed booking. Required actions are not hidden behind the third view. Passenger-only trips say to continue on foot rather than push a bicycle. Cycling-only has a Journey view with timing and terrain, without irrelevant transit requirements. Before results, the view explains how to select a journey.

## Time meanings

The input labels are **Depart after** (ready to leave) and **Arrive by**, in Swiss local time. Cards show **Leave … → Arrive …** and **… journey**. For a departure search, any available time at the origin is labelled relative to the requested time, not as a live countdown. Details also show the elapsed time from that request and the cycling / walking / on-board / connections-and-boarding breakdown. Platform-access walking is included under walking; other required allowances and connection waits remain within journey duration.

Let r be the departure search's ready time, d the suggested origin departure, and a final arrival. Preserve all three quantities:

- Time before leaving: d − r.
- Journey duration: a − d, including access, all service changes and final cycling/walking.
- Elapsed time from the request: a − r.

**Decision:** Earliest-arrival ranking still uses the original search elapsed time. The shorter displayed duration cannot make a much later departure win Fastest. The card label now says **Earliest arrival with transit**, and trade-off text says **arrives later**, rather than ambiguously comparing journey durations. Arrive-by searches retain their existing latest-departure objective and deadline.

## Checked origin scheduling

`src/journeyTiming.ts` is a pure scheduling/presentation layer over an already feasible journey. It preserves the original search journey and its metrics. It finds the first fixed timed leg and moves only the preceding flexible access movements later, using the existing `boardingCheck` with the dated service, platform and coordinate evidence. Minute-aligned departure is rounded earlier, never beyond readiness. The moved prefix is checked again. A 241-second platform requirement is not rounded down to four minutes.

Flexible movements are app-generated cycling, checked pedestrian paths and materialized station-access steps without provider itinerary/fare attachments. Provider-timetabled walking, transit, unknown movements and fare-bearing legs remain fixed. Connection waiting after boarding is never subtracted. A fixed initial provider walk can limit the departure adjustment; this is deliberately conservative, not a proof of the latest possible departure for every physical path. Unknown or invalid readiness cannot authorize a later start.

Only prefix waypoint times move; visits after the first fixed leg keep their dates. The map, itinerary and edit/detour contexts use the same presented schedule. All fixed service objects, dated bicycle evidence and fare sources retain identity. For departure searches, cycling edits may restore available time at the origin before rebuilding access; the displayed departure is then recalculated. Arrival-mode editing retains its existing start/deadline semantics. A facility detour preview evaluates the displayed departure and does not automatically move it earlier.

This is linear in itinerary length, adds no provider calls or routing state, and does not alter hard cycling/walking limits, bicycle custody, permission scopes, candidate discovery, Pareto dominance, category definitions or horizon feasibility. The original network search remains bounded and sampled.

## Verification

**418 tests in 11 suites pass**, including nine new golden/regression cases in `journeyTiming.test.ts`. TypeScript, frontend/Worker production builds, Knip and React formatting pass. A source audit before editing compared all 228 application files against GitHub `main` at `f73d197a4ee02423c2be1b5cb3e9fa2a1bd963e1`; all matched the deployed version-56 source.

Golden example: ready 09:00 Swiss time, cycle ten minutes, train 09:30–10:00, cycle five minutes. With the three-minute boarding allowance, the proposed origin departure is 09:17, final arrival 10:05, journey duration 48 minutes, time before leaving 17 minutes and request-to-arrival 65 minutes. A later service with a shorter on-journey duration still cannot replace the earlier-arriving winner.

Additional cases cover exact OJP access before/after materialization; fixed provider walks; unchanged connection waits; ordered visits; independently timed walking; unknown readiness; overnight/historical dates; and a longer access edit that leaves earlier while retaining the exact selected service. Existing arrival-deadline and edit regressions pass.

**Verification limit:** Browser/phone interaction and visual QA remain pending: the managed Sites preview requires the control-browser capability, which is unavailable in this session. No preview server or alternative browser-control path was started. No new live transport-provider check is claimed for this presentation release.

Next acceptance pass: choose a familiar journey on a phone, switch through all three views, inspect reservation requirements, compare ready/departure/arrival times, and return to the same map layers. On desktop, verify the right-panel switch, keyboard focus, a long Journey and 200% zoom. Also check passenger-only walking, cycling-only, a required intermediate visit and a later-departure result.

## Publication

Owner-private **version 57** published successfully on **8 October 2026 at 15:18:35 UTC** (17:18:35 Europe/Zurich), environment revision **3**, from Site source `bef0e130cc796d22bf03b13869ef99b17394eb08`. Phone Plan / Map / Journey, the desktop Map / Journey switch, grouped bicycle requirements and checked departure-to-arrival time are delivered. **418 tests** in 11 suites, formatting, Knip and TypeScript/frontend/Worker builds pass. Browser/phone interaction and visual QA remain pending because the required preview capability was unavailable. Runtime keys and owner-only audience are unchanged.

Saved version `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_57bd624de2ac8191a1e9107561aa3980`; deployment `appgdep_6ac7b435681081919ce447c6b858c325` reports **succeeded**. The saved version identifies that exact source commit. [Open the existing private website](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site).
