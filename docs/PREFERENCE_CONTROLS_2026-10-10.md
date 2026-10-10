# Re.route — preference controls, 10 October 2026

The owner's follow-up authorizes the previously proposed custom cycling minimum/maximum and Extra-category regrouping. Discover compromises and scenic Bikepacking routing remain proposals.

## Delivered behaviour

- Commuter and Bikepacking show their profile choices without the **Show alternatives for** fieldset. Personalized retains the six objective checkboxes.
- **Where would you like to cycle?** restricts feasible cycling positions. **Less cycling or walking at start/arrival** are extra ranking categories; they do not forbid cycling elsewhere. The ambiguous Endpoint preference dropdown is removed.
- **Extra categories** contains four independent checkboxes: less cycling/walking at the start, less at arrival, Reduce climbing and Gentler slopes. Both endpoint categories can coexist, including their separate Pareto resources. Slope threshold and detour-minute controls appear when Gentler slopes is selected.
- **How much cycling?** offers At most, At least and No preference, existing 40/45/90/150-minute quick choices and a custom whole-minute field (0–1,440). Commuter resets to At most 45; Bikepacking resets to No preference. There are no tighter section caps with the new control; the overall 24-hour horizon and all other feasibility rules still apply.
- The duration is the sum of existing cycling-section estimates across the whole journey, including intermediate requested stops. These estimates include short pushing/access connectors. Walking-only sections, transit, waiting and facility visits are excluded. This is not a promise of measured pedalling time.
- Cycling-only remains a separately labelled reference. An under-minimum or over-maximum reference cannot receive the fastest badge or qualify for navigation replacement.
- Gentler path collection preserves ordinary candidates, shares the same bounded terrain-checked provider candidates and caches, and re-solves the changed paths against actual connections, bicycle permissions, cycling bounds and deadlines. No unrestricted routing call loop is introduced. Incomplete elevation remains ineligible for a hill winner.

## Routing and editing contract

A lower cycling bound cannot be enforced only after the ordinary Pareto search: a useful longer prefix would already have been discarded. Both solvers add the resource `-min(cycling-so-far, requested-minimum)` while a minimum is requested, retain the existing upper-bound resources, and filter complete journeys against both bounds. Once the minimum is reached, extra cycling provides no further resource benefit. Under-minimum journeys cannot establish the category comparison window.

Arrive-by acquisition resets the minimum for partial suffix searches, because cycling may occur in an earlier stage; the final complete journey still enforces it. Edits and facility stops recheck the minimum without crediting visit time. Explicit navigation recalculation subtracts completed cycling from both remaining bounds and retains the existing custody/unfinished-visit restrictions.

The search remains bounded. A minimum may produce no eligible result even when some route outside the acquired candidate network exists. It does not add invented duration or promise a globally complete set of long routes. Discover/scenic routing is not implemented by this change.

## Verification

- **566 JavaScript tests in 11 suites**, all passing, including 14 additional tests and strengthened simultaneous-endpoint assertions.
- **168 independently enumerated lower/upper-bound combinations** across both routing modes and both solvers. Golden case: a 2-minute access prefix normally dominates an 8-minute prefix at a common interchange; requesting at least 8 minutes must retain the latter. At least 9 correctly has no result. Separate checks cover whole-journey accumulation, walking/waiting exclusion, arrival deadlines and suffix acquisition.
- Edit/visit minimum validation, remaining navigation budgets, gentler path cache/fork preservation, missed-versus-caught boarding times, and unchanged ordinary alternatives are tested.
- **576 full-result comparisons** against pre-change Site source `d10c8af18f011c104756035d8a07f3d174236a82`, with no minimum set, pass with identical journeys, recommendations, retained/explored counts and cap flags. Covers 96 seeded networks, both modes, three bicycle scopes, hydrated/missing transfer metadata, deadlines, DST/midnight and expired feeds. [Machine-readable report](experiments/preferences-solver-equivalence-2026-10-10.json).
- **13 Python tests** pass. Existing facility timing cases retain their 1,372-combination sweep.
- **Eight preference rendering/callback panels** plus **six existing facility rendering panels** pass. Tests cover preset visibility, all duration modes, custom/empty fields, multiple endpoint selection, hills controls and disabled states. These are React server-rendering/pure-callback checks, not browser automation.
- TypeScript/frontend/Worker builds, formatting, unused-code analysis and Git whitespace checks pass. The existing frontend size warning remains; this release makes no measured phone-performance claim.

Reproduce from `prototype-v0/`:

```sh
npm test
python3 -m unittest discover -s scripts -p 'test_*.py'
node scripts/check-preferences-presentation.mjs
node scripts/check-facility-presentation.mjs
npm run format:check
npm run check:unused
npm run build
node scripts/stress-solver.mjs /absolute/path/to/pre-change-checkout 96
```

## What browser/phone acceptance means

Automated tests and a successful build check logic and generated output. They do not establish that a person can complete the actual interaction in a browser or on a phone. Still to verify: choosing modes and numbers with keyboard/touch, mobile layout and scrolling, opening the extra controls, switching profile and searching, map/itinerary updates, plus real GPS permission, foreground/background resume and wake-lock behaviour on iOS Safari/Android Chrome. These checks have not been performed in this environment; the required Browser plugin is unavailable. This is a verification limit, not a claim that a browser defect is known.

## Remaining three priorities

1. Discover compromises and scenic/interesting-place Bikepacking routes remain design proposals. Custom minimum/maximum controls and Extra regrouping are now implemented following the owner's latest instruction.
2. Before wider access, implement global API quota control and refresh transfer data before the pinned feed expires on **12 December 2026**. Per-isolate bounds and cache reuse do not supply a global quota. No scheduled reminder is created.
3. Scope Europe separately: country/provider coverage, bicycle-carriage rules, fares, station transfers and licensing. Current coverage remains Switzerland-first.

## Publication and synchronization

Owner-private **version 66** published successfully on **10 October 2026 at 16:11:45 UTC** (18:11:45 Europe/Zurich), environment revision **3**, from Site source `32a5a6ed3677b2d969bd2c9b654d998bada70794`. The pushed source and matching frontend/Worker archive were deployed. **566 JavaScript tests in 11 suites**, **13 Python tests**, 168 independent duration-bound cases, 576 previous-release full-result comparisons and 14 React render panels/callback checks pass, together with builds, formatting and unused-code analysis. Interactive browser and physical-phone acceptance remain unverified. Re.route, the existing URL and the owner-only audience are preserved.

Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_f917e584b51481919080139edfbacd85`; deployment: `appgdep_6aca63ac7e9c81919787d5d15e8bba3f` (`succeeded`).

GitHub synchronization and CI evidence are recorded below when complete.
