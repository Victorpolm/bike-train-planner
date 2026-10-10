# From your location and compact preference controls — 10 October 2026

## Delivered behaviour

- **From your location** requests a single browser location reading after an explicit click/tap. It sets the exact coordinates as From, labels the origin Your location and shows its reported accuracy. It does not start journey following, reverse-geocode the point or store a GPS trace. The existing map/route request behaviour still applies once the point is used.
- Permission denial, unavailable/blocked APIs, stale/imprecise coordinates and timeout give actionable messages and retain the prior origin. Editing a trip, selecting a map point, reversing or unmounting cancels the application request; late callbacks cannot overwrite a newer origin. Search submission is disabled while locating. The browser prompt itself is controlled by the browser.
- Reuse the existing accepted-location criteria: finite valid coordinates, positive accuracy at most 60 m, age at most 20 seconds and no timestamp more than one second in the future. Request high accuracy, no cached location and a 15-second browser timeout, with a 16-second application fallback. These values favour a useful cycling start; a coarse desktop reading may require choosing a map point instead.
- Cycling quick choices: **20, 45, 90, 150 minutes**. Selecting Commuter sets **At most 30 minutes**, including the shared routing budgets. Bikepacking and Personalized behaviour otherwise continues. The 30-minute default remains editable through the custom input even though it is not one of the four quick choices.
- **How much cycling** appears once, with its duration explanation in clickable question-mark help. Where would you like to cycle and Extra categories also hold their introductions in help. Extra categories opens a native collapsible multi-select, showing the selected count when closed. Existing slope and endpoint selections remain independent.
- **Follow your journey** keeps its heading and Start button, with introductory/location text in question-mark help. Active navigation controls and operational messages remain visible.

## Verification

- **576 JavaScript tests in 11 suites:** all pass, including ten new one-shot location tests for the requested reading/options, cancellation/races, denial/unavailability/timeout, blocked API, stale/invalid/imprecise coordinates and late callbacks.
- **13 Python tests:** all pass.
- **19 actual React server-rendered panels:** 13 preferences/location/navigation/preset panels and six existing facility panels. Check the four cycling choices, 30-minute Commuter, hidden help, native closed multi-select, pending-location submission, and existing callback transitions. These are rendering/callback checks, not a real browser interaction claim.
- **Golden Commuter boundary:** a fixed train with a routed 30-minute access ride is eligible; changing only the ride to 31 minutes makes it ineligible, in both routing modes. The minimum-duration and facility timing regression suites remain passing.
- Formatting, unused-code analysis and TypeScript/frontend/server-Worker production builds pass. Publication evidence is recorded below after completion.
- No real browser permission prompt, touch layout, outdoor GPS reading or physical-phone route was tested. The available Sites workflow did not provide its supported browser preview capability. This is the specific outstanding acceptance work.

## Search-duration investigation

The reproducible command is `node scripts/benchmark-cycling-limits.mjs 24 3`, run alone with Node 24. It uses fixed synthetic geometry/timetables and the actual bundled station-transfer rules: 24 stations, 1,674 edges, a three-hour horizon and four boardings. Each condition has one warmup and three measured solves. The script checks complete-result stability and all returned cycling-duration bounds. Thirty-two solves ran in total. [Raw measurements](experiments/cycling-limits-2026-10-10.json).

| Whole-journey cycling rule | Baseline median | Extended median | Extended search allowance reached |
|---|---:|---:|---|
| At most 30 min | 0.674 s | 1.344 s | No |
| At most 45 min | 0.646 s | 1.344 s | No |
| No preference | 0.704 s | 1.392 s | No |
| At least 30 min | 1.846 s | 9.150 s | Yes |

These are individual solver CPU measurements, not live whole-search timings, phone performance, a before/after optimization comparison or completeness evidence. In this fixture At least 30 costs about 2.7 times the Baseline CPU and 6.8 times the Extended CPU of At most 30. The minimum preserves partial routes that could still satisfy the required riding time. The Extended minimum case reaches the existing label allowance, so it must retain its incomplete-search warning. The new 30-minute Commuter default does **not** show a meaningful speed improvement over 45 minutes here.

Code inspection also identifies repeated work in `src/api.ts`: a timetable update invokes `refresh`, then `refreshRoads` immediately invokes it again before adding road data. Further solves cover distinct bicycle-permission graphs, Baseline/one/two connections and requested traffic/gentler variants. Existing identical-permission-graph reuse is already present; unsafe post-filtering of permissive results must not replace separate strict solves. Network/provider waits are additional and were not newly timed here.

Recommended next performance work:

1. Instrument time to first usable result and total completion, splitting provider/queue waits, road acquisition and each solver invocation. Reproduce the owner's slow route and settings before setting a target.
2. Reuse results only for unchanged graph/options/evidence and coalesce adjacent duplicate refreshes. Validate complete results, preserved uncertainty and cancellation against the current implementation, including capped minimum cases.
3. Run heavy solving in a Web Worker so controls remain responsive. Preserve early usable results and stage optional comparisons after them where possible. Worker isolation helps responsiveness; it does not remove provider waiting or solve complexity.

This release delivers the requested controls and the investigation; it does not claim to fix end-to-end search duration or introduce unbounded provider parallelism. Global API quota control, the transfer-data refresh before **12 December 2026**, later European coverage, Discover compromises and scenic Bikepacking proposals remain tracked in [Next steps](NEXT_STEPS.md).

Primary references checked 10 October 2026: [MDN getCurrentPosition](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition) for permission/secure-context/options behaviour; [MDN Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) for background computation without blocking the interface. No browser/library dependency was added.

## Publication and synchronization

Owner-private **version 67** published successfully on **10 October 2026 at 17:06:36 UTC** (19:06:36 Europe/Zurich), environment revision **3**, from Site source `8cae50704eaedc42d4af6cdb1dee1b34c0724f8a`. The exact pushed source and matching frontend/server-Worker archive were deployed. **576 JavaScript tests in 11 suites**, **13 Python tests** and **19 rendered panels** pass, together with formatting, unused-code analysis and production builds. One-shot GPS origin, compact help, an Extra categories dropdown, 20/45/90/150 quick choices and a 30-minute Commuter default are delivered. Real-phone location/touch and browser interaction remain unverified.

Saved version: `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_1105be390f9081919ac79d5089358068`; deployment: `appgdep_6aca708795488191a732ecb9251bc81f` (`succeeded`).

The Site remains Re.route at its existing URL, with one owner and no groups/external visitors. GitHub main contains implementation commit `bee44a5115fb9e36a22addd93f76d0d0d80428ff`. All **280 application files** match deployed Site source `8cae50704eaedc42d4af6cdb1dee1b34c0724f8a` by Git blob hash. [GitHub CI run 38070557151](https://github.com/Victorpolm/bike-train-planner/actions/runs/38070557151) completed successfully, including JavaScript and Python tests, both React rendering checks, formatting, unused-code analysis and production builds. The following documentation confirmation changes no application files.
