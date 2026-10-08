# Editing the interface in modules

_2 October 2026 · feature/novice-interface-profiles. This guide covers modular presentation; the later routing changes are documented separately below._

## What you can change in one place

The interface is now made of separate React sections. The central [layout settings](../prototype-v0/src/ui/plannerLayout.ts) control the search-form order and its heading/button text. [Interface styles](../prototype-v0/src/ui/interface.css) contain the redesign and named layout variables. This is code-based modular editing; there is no drag-and-drop editor in the application yet.

| Change | File or setting |
|---|---|
| Rearrange locations, date/time, trip presets and preferences | `src/ui/plannerLayout.ts` → `PLANNER_MODULES` |
| Change the main heading, subtitle or search-button wording | `src/ui/plannerLayout.ts` → `PLANNER_COPY` |
| Desktop planning/map proportions | `src/ui/interface.css` → `--planner-column-share` (currently 50%) |
| Horizontal planning-panel padding | `--planner-panel-padding` |
| Space between search sections | `--planner-section-gap` |
| Space between From/To/intermediate fields | `--location-field-gap` (currently 4px) |
| Reverse-circle size | `--route-swap-size` (44px touch target) |
| Profile-panel width | `--profile-panel-width` |
| Header brand and profile placement | `src/ui/AppHeader.tsx` |
| Profile icon, modal and keyboard close/focus behaviour | `src/ui/ProfilePanel.tsx` |
| Saved-profile creation, selection, renaming and explicit saving | `src/TravellerProfiles.tsx`; shared list/selection in `App.tsx`, persistence boundary in `travellerProfiles.ts` |
| Rider, age, travelcard, annual bicycle pass and electric assistance | `src/PersonalSettingsFields.tsx` |
| From/To, reversing and ordered intermediate stops | `src/ui/RouteFields.tsx` |
| Date/time and Leave now | `src/ui/DepartureControls.tsx` |
| Trip-style cards and saved traveller cards under Your trip | `src/ui/TripPresetPicker.tsx` |
| Model, cycling position, bicycle access, route preference, cycling cap and extra category | `src/ui/TripPreferences.tsx` |
| Composition of the form, module wrappers and submit button | `src/ui/PlannerForm.tsx` |
| Map, results and journey details | Existing `MapView.tsx`, `JourneyPlan.tsx`, `JourneyPrice.tsx` and related components |

Paths above are relative to `prototype-v0/`. `src/main.tsx` loads the interface stylesheet after the base/feature styles. Change the named values instead of appending competing spacing overrides to `styles.css`.

For example, to put trip choice before departure, use:

```ts
export const PLANNER_MODULES = ["locations", "presets", "departure", "preferences"] as const;
```

Keep every module exactly once. This changes reading and keyboard order together; React retains stable module keys. The routing options remain in App/model code. Changing a label does not implement a new planning capability.

## Profile and spacing follow-up

The header's upper-right circular person button opens all personal controls: saved profile/Guest selection, creation, rename/delete, age, riding preset/custom speed, electric assistance, travelcard and annual bicycle pass. Explicit Save to profile is preserved. The panel is a native modal dialog with keyboard focus containment, Escape/close/Done and focus return; it becomes a scrollable compact panel on phones. The underlying planner is not remounted. Invalid personal settings reopen the panel before a search instead of issuing an invalid routing request. Journey-specific route/access/time choices remain in Preferences.

The reverse button sits beside the boundary between the location fields instead of occupying a full row. The field gap is now controlled by one spacing value. Reversing still swaps both endpoints and reverses the intermediate-stop order.

**Saved profiles in Your trip:** named cards appear below the three trip styles as soon as a profile is created. A card applies its saved personal settings; trip style, bicycle-access scope, cycling limits and model stay selected. Header selection and cards share one list and active ID, so save, rename and deletion update both immediately. The active card identifies trip-only edits and can restore the saved values. Explicit saving and device-only storage remain unchanged; failed saves do not add/remove cards, and an unremembered selection is labelled as applying only for this visit. Guest remains available in the header.

## What Extended means

- **Baseline:** cycle to the first public-transport service and from the last service to the destination; ordinary service changes and walking transfers remain possible.
- **Extended:** also allow up to two automatic cycling connections between public-transport services. Example: bike → train → bike to another station → train → bike.
- The same total cycling/time limits, bicycle-access scope and rider settings apply. Extended does not require extra cycling or select Bikepacking. Actual fares still depend on the services chosen.
- Requested intermediate stops split a journey into stages; the two automatic cycling connections are shared across the entire journey. The UI explains this beside the model selector.

**Where would you like to cycle?** adds hard beginning-only/end-only choices separately from the optional endpoint ranking category. They switch to Baseline and disable intermediate cycling. The non-cycling end now uses a directed pedestrian route to/from an address, with a separate walking allowance; the take-bike-on-transit checkbox controls bicycle eligibility and charges. This constraint applies across requested stops and stays selected when a profile or trip style changes. [Two-round routing, exact semantics and remaining limits](MULTIPLE_CYCLING_TRANSFERS.md).

## A possible visual editor

If direct manipulation is wanted next, add an owner-only layout preview with move-up/down or drag handles, spacing controls and Reset. Preview changes should be separate from Save/publish, and should use the same module list and style variables. The current update supplies the modular foundation but does not add editor controls to travellers' screens or change the ChatGPT Sites editor itself.

## Verification and manual checks

322 offline tests in 11 suites pass, including profile persistence and ten new two-transfer/discovery/position regressions. React formatting and Knip pass; the production TypeScript/frontend/Worker build passes. The saved-profile schema is unchanged. Routing now supports two automatic connections; through-fare quoting across cycling gaps remains unsupported.

Browser interaction/visual QA is unavailable in this session. Check the header icon at desktop/phone widths; opening/closing by keyboard, Escape and backdrop; profile creation by keyboard; invalid speed/age handling; compact From/To spacing with zero/four intermediate stops; and 200% zoom. Check that switching phone views and opening the profile preserve the selected map and filters. These manual checks remain pending, not claimed as automated results.

For the new cards: create two profiles, close the header panel, select either card and reopen the panel to confirm selection. Rename/delete and confirm the list immediately changes; change only this trip and use its card to restore saved settings; verify trip style/model are preserved. Check long names, phone widths, keyboard selection, reload and blocked storage. These interaction checks are also pending.


## Historical publication — 2 October

The following records the original release. PR #1 and the transfer-ZIP PR were subsequently merged on 6 October; the current application is version 59. See [current state](PROJECT_STATE.md) and [remaining acceptance](NEXT_STEPS.md).

Owner-private **version 46** published on **2 October 2026 at 21:45:56 UTC**, environment revision **3**, Site source `043d35340c35317a2c54b3f473e3bf0a85d30125`. All **198 current application files** match `feature/novice-interface-profiles`; at that release, the branch and [then-draft PR #1](https://github.com/Victorpolm/bike-train-planner/pull/1) were unmerged. Sharing and runtime secrets are unchanged.


## 3 October help and later-departure modules

`src/ui/InlineHelp.tsx` owns the persistent question-mark button; content remains in `TripPreferences.tsx`. In version 48, **What does Extended add?** moves beside the **Journey options** legend, matching the other two preference headings. The complete text and conditional waypoint note are retained, with click/tap and Escape behaviour supplied by the existing component. The legend fills the fieldset so the explanation can use the available form width on phones. `src/laterDepartures.ts` calculates the next departure boundary and runs a bounded search. `App.tsx` keeps prior result batches and their source sessions, so map selection, fare lookup and later pages refer to the correct itinerary. [Behaviour and checks](SEARCH_RELIABILITY_2026-10-03.md).

## 3 October climbing and cycling editor modules

`TripPreferences.tsx` owns the Climbing fieldset and separate public-transport climbing objective. `hills.ts` owns typed hill preferences/metrics; route acquisition and solver pruning remain in `cyclingClient.ts`, `api.ts`, `model.ts` and `waypoints.ts`. Do not implement hill optimization as a card-only sort.

`CyclingEditor.tsx` owns the ordered-point form and map preview. `cyclingEditor.ts` owns pure application and validation, independently tested. `MapView.tsx` mounts the editor, suppresses whole-journey endpoint picking while editing, and keeps draggable shaping points separate from fixed endpoints. `App.tsx` owns session-local edited results, correct source sessions for later departures, restored originals and coherent map/card selection. `interface.css` contains hill/editor styles.

[Current controls, 343 regressions, live smoke evidence and pending browser checks](HILLS_AND_CYCLING_EDITOR_2026-10-03.md). The facility detour panel still has its separate visit-duration preview; adding a shaping point does not imply a timed facility visit.

## Station-time and climbing follow-up, 3 October

`TripPreferences.tsx` places help beside **Cycling hills** and keeps the optional **Offer a Reduce climbing alternative** checkbox separate. There is no global Less climbing mode. `model.ts` ranks the extra **Reduce climbing** proposition without changing the three main ranking functions. `transferTimes.ts` owns shared readiness checks; `ojp.ts` extracts exact access/interchange evidence, while `JourneyPlan.tsx` presents source explanations. Do not encode station times in the UI. [Rules, fallbacks and tests](STATION_TIMES_2026-10-03.md).

## 8 October — Three views and explicit journey timing

`App.tsx` keeps Plan and the map mounted; phone state selects planning/map/journey, and desktop state selects the right-hand Map/Journey view. The selected schedule is memoized per source journey and search session. The map visibility signal includes the current viewport so revealing it triggers sizing without resetting its state. Selection opens Journey, while a separate card action selects and opens Map. Conditions, full fare breakdown and cycling terrain moved to the selected Journey panel.

`src/journeyTiming.ts` computes feasible later origin departure without changing raw search metrics. `src/ui/JourneyTimeSummary.tsx` presents leave/arrive times, duration and the optional detailed breakdown. `JourneyPlan.tsx` retains chronological movement and groups bicycle conditions by service. `cyclingEditor.ts` can restore departure-search origin slack before applying an edit. `ui/interface.css` owns the desktop switch, independently scrolling desktop Journey and three phone navigation buttons.

The input now says Depart after / Arrive by. Do not replace earliest-arrival ranking with the displayed on-journey duration. Do not subtract connection or platform time as if it were free origin time. Preserve fixed service and fare evidence when displaying a retimed prefix. [Timing, regressions and manual acceptance checks](JOURNEY_VIEW_AND_TIMING_2026-10-08.md).

## 8 October — Objectives separate from Preferences

`src/ui/JourneyObjectives.tsx` owns objective checkboxes, descriptions and the at-least-one selection rule. `src/tripPresets.ts` owns Commuter/Bikepacking defaults. `App.tsx` stores objectives separately from profiles and Preferences; a custom selection switches to Personalized. `TripPreferences.tsx` keeps all previous controls, renaming Extra category to Endpoint preference. `ui/interface.css` owns the objective grid. Cycling only remains an independent reference; duplicate winning cards retain multiple badges and objective explanations.

`src/journeyObjectives.ts` owns types, labels, the 30-minutes-per-boarding / 1.25 boarding constants (no fixed absolute cap), evidence-aware reservation/traffic resources and complete fare evaluation. `model.ts` gives Fewer boardings its own proportional candidate window, while other objectives and fare sampling keep the general window. `model.ts` and `waypoints.ts` preserve these resources and fare histories during routing, then `recommendations.ts` combines independent permission scopes and missing-objective messages. `cyclingClient.ts` retains ordinary and optional traffic routes separately; `api.ts` re-solves checked variants.

`src/objectiveFares.ts` samples at most eight distinct fare queries per batch; `useObjectiveFares.ts` acquires them after discovery and updates ranking. `onlineFareClient.ts` serializes and shares cached requests with `useOnlineFare.ts`/cards. Do not replace unknown prices with zero or choose a cheapest badge from passenger-only pricing when the bicycle travels too. [Current behaviour, tests and pending phone/desktop acceptance](JOURNEY_OBJECTIVES_2026-10-08.md).
