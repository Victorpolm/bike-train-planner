# Explicit bicycle actions at intermediate stops — 26 November 2026

## Decision and user-visible behaviour

The owner requested a simple interface: bicycle status stays unchanged unless the user explicitly changes it. A new journey starts with **Bike with me at the start** enabled. Every intermediate stop defaults to **Keep current status**; the two alternatives are **Pick up a bike** and **Leave a bike**. Stop actions remain attached through edits, map movement, reordering, saving and planning again.

Riding placement and willingness to take a bicycle aboard do not change possession. With a bicycle and carriage disabled, public transport is unavailable until an explicit Leave action. Without a bicycle, passenger public transport ignores bicycle restrictions and charges. Collection allows further cycling and compatible public transport. Ordinary visits never park or collect automatically.

This supersedes the implicit first-boarding parking/last-alighting availability convention of 7 October and the Site's later hidden final-pickup positioning rule. Existing saved dated itineraries remain readable; on the newer Site, an explicitly stored legacy pickup is exposed as an ordinary collection stop when planning again. A legacy Site form exceeding the current stop limit retains its inputs and receives validation rather than silently dropping a stop. Ambiguous older off-transit snapshots remain inspectable but cannot be followed or replanned until the initial status and required actions are declared in Plan.

## Model and implementation

- `Place.bicycleAction?: "park" | "collect"` is optional. Absence means no change.
- `Options.bicycleAtOrigin` defaults to true independently of cycling placement and carriage willingness.
- Possession is deterministic between requested stops. It changes after arrival and any requested visit dwell, at an explicit action leg.
- Impossible sequences (collect while already with a bicycle, leave without one) fail before acquisition. Actions belong to intermediate stops, not endpoints.
- The waypoint search keeps shared time, cycling minimum/maximum, walking, boarding and transfer resources across actions. Passenger eligibility is checked before acquisition pruning; actual possession determines bicycle eligibility before label dominance.
- Transit legs retain `bicycleOnBoard`; movement and action legs retain `bicycleWithTraveller`. Bicycle fares, reservations, warnings and ticket handoffs use the actual transit sections.
- Incoming and outgoing paths at an action stop use the status on the corresponding side. Fixed action coordinates cannot be replaced by a station-ID alias; the existing endpoint geometry tolerance and checked approach rules remain binding.
- Arrive-by acquisition and departure seeds carry the same ordered state changes. Zero-transit journeys with requested actions remain representable.
- Bicycle-only comparisons do not bypass a pickup/leave requirement or invent a bicycle for a passenger-only request.
- Navigation changes status only after the action stage is explicitly confirmed. Replanning retains remaining actions and consumed budgets; zero remaining boardings stays zero. Internal `cyclingFinished` preserves a consumed beginning-only riding phase without removing the bicycle.
- Reverse route reverses stop order, swaps Pick up/Leave and starts with the original final status. It does not assert that the outward journey was actually completed.

The existing label state retains stop/stage, time, riding phase, possession, cycling/walking resources, boardings and transfer context; action transitions preserve those resources and alter only possession after the requested dwell. Dominance remains within compatible stage, possession, phase and transfer/fare contexts, with no worse resource vector. Ranking objectives and raw route attributes remain separate. Walking uses checked directed paths, cycling requires possession and the available riding phase, and boarding applies timetable readiness and bicycle eligibility for the actual state. Missing carriage evidence remains uncertain.

For a fixed ordered request, possession validation is linear in the number of stops, and each action adds a constant-time state update. It introduces no search over possible pickup/parking choices. The existing bounded multi-label search and its potentially large Pareto frontiers remain; this is not a new polynomial-complexity claim or an exhaustive-network algorithm.

The interface does not introduce automatic parking-site choice, bicycle rental, space reservations, new providers or a new routing backend. The user's selected location supplies the requested action; physical availability, permission to leave a bike and rack/platform access remain as qualified by existing data.

## Regression journeys

| Case | Required result |
| --- | --- |
| Ordinary intermediate visit | Status before and after is identical. |
| Carriage disabled while starting with a bike | No automatic parking; a transit journey needs an explicit Leave stop. |
| Start without a bike, no pickup | Walking/passenger transit only; no bicycle charges or invented collection. |
| Ride → Leave → bike-prohibited bus → Pick up → train with bike | Bus allowed as a passenger; bicycle permission, reservations and fares apply to the later train. |
| Pickup before an ordinary visit | Collection remains at the requested position; later public transport is possible. |
| Multiple explicit changes | Ordered actions and final status are preserved. |
| Slower prefix with useful cycling/boarding budget | Shared frontier retains the prefix needed for complete feasibility. |
| Arrive by | Latest feasible departure respects the same actions, handling paths and shared budgets. |
| Shared station ID, different rack coordinates | No teleportation; actual action location must be reached. |
| Save/reopen and navigation | Stops persist; reaching coordinates alone does not confirm an action. |
| No public transport | Walking/cycling/action-only journeys have zero public-transport cost; stale transit quotes are ignored and unknown modes remain unpriced. |
| Reverse | Action order and starting status are consistently reversed. |
| Return to the same facility | Each occurrence retains its own action and dwell; confirmed dwell is not repeated. |
| Finished cycling phase | Checked walking retains possession; cached references cannot restart riding. |
| Edit a zero-transit action journey | Preserve actions, dwell, shared limits, exact coordinates and arrive-by timing. |

## Verification and publication

The repository implementation was applied directly to the exact GitHub `main` baseline `3e5bdb1a9faee2076b039929892567ae36eba2f9`, preserving its existing algorithms, fare catalogue, dependencies and data. It is a narrow feature backport, not a replacement by the newer Site application.

Verified on 26 November 2026:

- Repository `prototype-v0`: **801/801 tests passed**, 11 suites; `npm run build` passed TypeScript, client/Worker production bundles and source/third-party-notice checks. `npm run format:check` passed.
- Current Site: **1,051/1,051 tests passed** and TypeScript/client/Worker production builds passed. React presentation checks passed for **33 preference, 12 continuity and 6 facility panels**.
- Existing large-bundle build advisories remain. No dependencies, credentials, generated build output or unrelated data are committed.

Published owner-private Site **version 106** successfully from exact source `11e3b97a39af5a1e1456295ed4bec07243bc3a97`, deployment `appgdep_6b084d14b61c8191aa7a46969f4b2bf1`, environment revision 4. URL: https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site . The Site source includes the concurrent global cycling-stress work at `e492358d75c2c77da03b5676f7ecb792a4b48e40`; both changes were merged and the combined source was reverified. That separate Site change is not imported into this repository feature backport.

Browser preview in this workspace reports `preview relay unavailable`; interactive desktop/phone acceptance is not claimed. No new live-provider or field-validation claim is made.

## Post-push CI correction — 26 November 2026

GitHub commit `7eb7c0c3a424405025516c5c2435e0ad238f1251` passed formatting, unused-code checks, all 801 JavaScript tests and 16 Python tests in Actions. Its preference-presentation gate then failed because the older fixture omitted the new starting-status prop and a global checked-checkbox count included an unrelated control.

The presentation harness now supplies the explicit starting status, scopes existing extra-category checks to their own fieldset, verifies that starting possession and carriage/riding preferences are independent, and checks the Keep/Pick up/Leave controls and callbacks. Continuity assertions use the actual recorded per-leg state and explicit actions. Application behaviour and the published Site are unchanged by this test-harness correction.

Local presentation rechecks passed: **33 preference, 13 continuity, 6 facility, 35 quality and 6 source panels**. These are rendered-component and callback checks; they do not replace interactive browser or physical-phone acceptance.

## Remaining limits and next check

Search and provider candidate bounds remain unchanged; no exhaustive-network claim is added. Pickup/leave handling currently has no invented fixed duration; an explicit visit duration is retained. The model tracks whether a bicycle accompanies one traveller, not a general multi-vehicle inventory optimizer.

Next: on the existing private app, try a familiar journey with one Leave stop and another with a Pick up stop followed by public transport; verify the displayed actions and final status against the intended physical arrangement.
