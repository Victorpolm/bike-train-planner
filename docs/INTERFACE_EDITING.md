# Editing the interface in modules

_2 October 2026 · feature/novice-interface-profiles. These changes affect presentation; the search state and routing remain in their existing layers._

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
| Saved-profile creation, selection, renaming and explicit saving | `src/TravellerProfiles.tsx` |
| Rider, age, travelcard, annual bicycle pass and electric assistance | `src/PersonalSettingsFields.tsx` |
| From/To, reversing and ordered intermediate stops | `src/ui/RouteFields.tsx` |
| Date/time and Leave now | `src/ui/DepartureControls.tsx` |
| Commuter/Bikepacking/Personalized cards and their wording | `src/ui/TripPresetPicker.tsx` |
| Model, bicycle access, route preference, cycling cap and extra category | `src/ui/TripPreferences.tsx` |
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

## What Extended means

- **Baseline:** cycle to the first public-transport service and from the last service to the destination; ordinary service changes and walking transfers remain possible.
- **Extended:** also allow at most one automatic cycling connection between public-transport services. Example: bike → train → bike to another station → train → bike.
- The same total cycling/time limits, bicycle-access scope and rider settings apply. Extended does not require extra cycling or select Bikepacking. Actual fares still depend on the services chosen.
- Requested intermediate stops split a journey into stages; the one extra automatic cycling transfer is shared across the entire journey. The UI explains this beside the model selector.

## A possible visual editor

If direct manipulation is wanted next, add an owner-only layout preview with move-up/down or drag handles, spacing controls and Reset. Preview changes should be separate from Save/publish, and should use the same module list and style variables. The current update supplies the modular foundation but does not add editor controls to travellers' screens or change the ChatGPT Sites editor itself.

## Verification and manual checks

309 existing offline tests in 11 suites pass, including profile roundtrip/isolation, invalid values, and the Baseline/Extended routing cases. React formatting and Knip pass; the production TypeScript/frontend/Worker build passes. No routing algorithm, fare support or saved-profile schema is changed.

Browser interaction/visual QA is unavailable in this session. Check the header icon at desktop/phone widths; opening/closing by keyboard, Escape and backdrop; profile creation by keyboard; invalid speed/age handling; compact From/To spacing with zero/four intermediate stops; and 200% zoom. Check that switching phone views and opening the profile preserve the selected map and filters. These manual checks remain pending, not claimed as automated results.


## Publication

Owner-private version **44** succeeded on **2 October 2026 at 20:32:54 UTC**, environment revision **3**, from Site source `fc0591d62b03d959c210e687289d43538e7d2c07`. All **197 current application files** match the feature branch. No change to main or sharing. The existing [draft PR #1](https://github.com/Victorpolm/bike-train-planner/pull/1) remains the review point. GitHub CI is checked on the follow-up commit separately.
