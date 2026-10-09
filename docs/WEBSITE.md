# Website access and development

**Current publication:** Owner-private **version 61**, 9 October 2026 16:01:35 UTC, environment revision 3, Site source `414c08bd1dfb97d097c12de12dc1391ae2332fc9`. Realtime selected-service updates, persistent map caches and shared cycling candidates are delivered. **468 tests**, production builds, formatting and Knip pass. Live OJP estimates and EPFL–Basel candidate ordering checked; browser/phone acceptance remains pending. [Evidence and limits](REALTIME_AND_SPEED_2026-10-09.md).

**Previous publication:** Owner-private **version 60** published successfully on **9 October 2026 at 13:41:22 UTC**, environment revision **3**, from Site source `2f0d2bcff6466dd0f6125b0dfe4da1ef375b2508`. The update-review fixes preserve reservation evidence, improve missing-platform transfers, clarify recommendations, admit bounded concurrent fare checks and respect experimental cycling pace. **452 tests** in 11 suites, TypeScript/frontend/Worker builds, formatting and Knip pass. Realtime was the next priority at that release and is implemented in version 61 above. Browser/phone acceptance remains pending; no fresh live-provider check is claimed. Runtime secrets and owner-only access are unchanged. [Fixes, limits and release IDs](UPDATE_REVIEW_FIXES_2026-10-09.md).

**Previous publication:** Owner-private **version 59** published successfully on **8 October 2026 at 21:46:47 UTC** (23:46:47 Europe/Zurich), environment revision **3**, from Site source `f3c22542a5b46eb75487d2a1e9b8b7aca499360b`. The boarding compromise now values each avoided boarding at **30 minutes**, with a **25% overall extra-time ceiling** and no fixed 30-minute cap. Its candidate window is independent of the other objectives' general 60-minute window. **441 tests** in 11 suites, TypeScript/frontend/Worker builds, React formatting and Knip pass. No fresh live-provider or browser/phone check is claimed. Runtime secrets and owner-only access are unchanged. [Contract, checks and release IDs](JOURNEY_OBJECTIVES_2026-10-08.md).

**Previous publication:** Owner-private **version 58** published successfully on **8 October 2026 at 19:41:40 UTC** (21:41:40 Europe/Zurich), environment revision **3**, from Site source `82ceea9078c13a38be215ed58bb115e7a3f2e11e`. Commuter/Bikepacking objective sets, Personalized objectives, the proportional boarding compromise, mapped traffic comparison, known reservation counts and complete checked-price ranking are delivered. **437 tests** in 11 suites, React formatting, Knip and TypeScript/frontend/Worker builds pass. Browser/phone interaction and visual QA remain pending; no new live-provider observation is claimed. Runtime keys and owner-only audience are unchanged. The exact pushed source and matching frontend/Worker archive were deployed. [Behaviour and release evidence](JOURNEY_OBJECTIVES_2026-10-08.md).

**Previous publication:** Owner-private **version 57** published successfully on **8 October 2026 at 15:18:35 UTC** (17:18:35 Europe/Zurich), environment revision **3**, from Site source `bef0e130cc796d22bf03b13869ef99b17394eb08`. Phone Plan / Map / Journey, the desktop Map / Journey switch, grouped bicycle requirements and checked departure-to-arrival time are delivered. **418 tests** in 11 suites, formatting, Knip and TypeScript/frontend/Worker builds pass. Browser/phone interaction and visual QA remain pending because the required preview capability was unavailable. Runtime keys and owner-only audience are unchanged. The exact pushed source and matching frontend/Worker archive were deployed. [Implementation, checks and limits](JOURNEY_VIEW_AND_TIMING_2026-10-08.md).

**Previous publication:** Owner-private **version 56** published successfully on **7 October 2026 at 12:04:52 UTC** (14:04:52 Europe/Zurich), environment revision **3**, from Site source `21ddd7c3793b488ed7ee08806df1ee803c725a8d`. The exact tested source was pushed and its matching frontend/Worker archive deployed. Access remains owner-only, with no groups or external visitors; runtime keys are unchanged. **409 tests** in 11 suites pass, plus formatting, Knip and production builds. Browser interaction/visual QA remains pending. Beginning/end-only now uses pedestrian paths at the opposite end, with an explicit bicycle-on-transit choice and independent city passenger fare display. [Implementation, live checks and limits](WALKING_ENDPOINTS_AND_CITY_FARES_2026-10-07.md).

**Earlier publication:** Owner-private **version 55** published on **7 October 2026 at 10:52:25 UTC** (12:52:25 Europe/Zurich), environment revision **3**, Site source `68c182b244670c385f26b561538038f49f6c1044`. Compact time controls, historical-date regressions and a road-oriented Simplest candidate are delivered. **395 regressions** in 11 suites, formatting, Knip and TypeScript/frontend/Worker builds pass. The live ETH HG–Stadelhofen reproduction improves from 1.774 km / 16 turns to 1.551 km / 11 turns and uses Rämistrasse. Browser interaction/visual QA remains pending. Runtime keys and audience are unchanged. [Implementation and release evidence](SIMPLE_ROUTES_AND_TIME_CONTROLS_2026-10-07.md).

Open **Map filters** and enable Water, Toilets or Food to load the additional sources. In the Water panel, optionally select **Show topographic fountains and springs (drinkability unknown)**. Select a journey to filter by its paths; adjust the route distance or disable Along selected journey to explore more widely. Click overlapping markers at detailed zoom to inspect separate floors/sources. Closest remains straight-line from A. Once a journey is selected, click a facility and choose **Preview cycling detour**; adjust the section and stop duration, the dashed purple preview draws and frames automatically. Original cards and fares stay unchanged. Entrances, indoor paths and opening at arrival are not verified.

OJP runtime keys are unchanged. Compact timetable requests preserve exact city-fare evidence; stationary zero-time connectors no longer block fares. Real cycling gaps still do not receive an unsupported through quote. [Current checks](SEARCH_RELIABILITY_2026-10-03.md) · [Earlier fare pipeline and limitations](OJP_EXACT_TRIP_FARES_2026-09-28.md).

## Open the private website

[**Open private website**](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site)

The Site is restricted to its owner. Use the same ChatGPT account used to publish it; sign in if prompted. Knowing the address does not grant someone else access.

To open it from GitHub, visit the [repository home page](https://github.com/Victorpolm/bike-train-planner) and click **Open private website** near the top of the README. No download or local installation is needed.

## Run from Git on your computer

Install Git and Node.js 24, the version used for verification. The source repository is public; the deployed website is separately owner-private. Then run:

```bash
git clone https://github.com/Victorpolm/bike-train-planner.git
cd bike-train-planner
git switch main
cd prototype-v0
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. Keep the terminal running while using the app; press Ctrl+C to stop it. The app needs internet access for map tiles, place lookup and transit schedules. Basic searches work without a key. To add OJP bicycle-filter and TripInfo data alongside public bicycle symbols, set `OJP_API_KEY` in a local ignored `.env`; the Vite server handles OJP requests. Do not use a `VITE_` prefix.

For an existing clone with no uncommitted changes, run `git pull --ff-only` from the repository, then run the commands in `prototype-v0/` above. Keep any local changes before pulling.

To check the production build locally:

```bash
npm test
npm run build
npm run preview
```

Open the preview URL printed in the terminal, normally `http://localhost:4173`. Opening `index.html` directly in GitHub or from the filesystem does not run the application.

## Publishing changes

GitHub is the authoritative source. The hosted Site has its own source repository and publication history; pushing to GitHub alone does **not** republish it. Ask Codex to publish the latest `prototype-v0/` to the existing private Bike + Train Site after code changes.

`prototype-v0/.openai/hosting.json` identifies the existing Site. The build creates a Worker at `dist/server/index.js` with embedded frontend assets. Reuse this identity; do not create a replacement Site. Preserve owner-only access unless explicitly instructed otherwise. The file contains no authentication credentials.

Publishing must use the tested app source from the chosen GitHub revision, build its Worker and frontend output, push that exact source to the Site repository, and save/deploy the corresponding version. Confirm successful deployment before reporting an update. Do not commit dependencies, build output, tokens or local environment files.

The app uses real road-following cycling and estimated durations. One bicycle-access choice applies to every public-transport mode and controls routing. Keyless search.ch timetable symbols and reviewed applicable operator/service rules supply permission and prerequisites with sources. Missing evidence remains unknown. The protected OJP backend adds a bicycle-filter/TripInfo source when configured. No live capacity or booking transaction is integrated. See [current project state](PROJECT_STATE.md).

## Runtime secret

`OJP_API_KEY` and `OJP_FARE_API_KEY` are configured as secrets in this Site's runtime environment as of 28 September. GitHub Actions has separately stored test keys; it does not automatically configure the hosted Site. Never expose keys through workflow artifacts or the frontend. After changing Site secrets, redeploy a saved version to apply the new environment revision. OJP routing checks configuration before selecting the provider; fares request a quote directly. Status alone is not an authenticated provider health check. Public search.ch timetable data remains the fallback.

## 25 September publication (historical)

Private **version 20** succeeded on **25 September 2026 at 13:36:57 UTC**, from Site source 8a0a7d7ca02e7f06471aa694c1b2831940646868. All 97 tracked application files match GitHub implementation commit cead54c468ea570eed97ae551797915f3d3fb5e9. The saved version is appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_d99ab12a1be48191ad3e3721cc98f15a; deployment appgdep_6ab678e7f15881919572aaea0f6a7f59 reports succeeded. Access was rechecked and remains owner-only, with no external visitors.

This publication places supported bicycle ticket/reservation prices below boardings on collapsed cards and adds Swiss named-place suggestions with venue type and address. A live query for fortyseven baden resolves the bath instead of Baden town. Partial town matches can no longer silently replace the typed destination. See PLACE_SEARCH.md for sources and external-service limits.

The existing train prerequisites, fare profiles, bicycle parking, cycling profiles, three carriage scopes, rail-exit improvements and bounded searches remain. The optional national timetable bridge remains disabled. Environment revision is still 0: public timetable symbols and reviewed rules work without the optional OJP key. No new paid service or hosting was added.

**163 application tests passed**, with TypeScript and frontend/Worker production builds. React server rendering verified collapsed-card price placement and all fare-profile states. A fresh live FORTYSEVEN lookup selected the bath's coordinates; the venue response arrived in 8.937 seconds. No new browser visual/interaction verification is claimed. The unrelated national timetable, import/GPX and OJP Python tests retain their prior verification record in EXPERIMENTS.md.

Current project documentation is authoritative in GitHub. Older project-documentation snapshots in Site history are historical. Application-file equality was checked after publication. Later documentation-only commits do not change the published application.

## Cost and privacy boundary

The Site remains owner-only. The existing GitHub source repository is public; personal recordings and secrets must not be committed. National data files and the experimental service remain local. Ask the owner before any hosting costs or production infrastructure purchase. No recurring data-refresh job or public tunnel was created.

See [implementation and remaining gates](SWISS_IMPLEMENTATION.md) and [GPX recording guide](GPX_RECORDING.md).

## OJP Fare implementation (27 September 2026; activated 28 September)

The fare adapter accepts the separate server-only `OJP_FARE_API_KEY` and can retrieve its itinerary through `/ojpfare` using that key alone. Keep it secret, with no `VITE_` prefix. Local Vite uses `.env.local`; hosted operation requires the Site runtime binding and a deployment to apply it. The GitHub Actions secret passed ten live fare tests. `/api/fares/status` reports configuration presence only. Both hosted integrations were activated and verified on 28 September; see the current publication above. [Earlier results and limitations](OJP_FARE_RESULTS_2026-09-27.md).

Private version 22 successfully published at 16:12:28 UTC on 27 September 2026 from Site commit `9f411232376cf36147282cec929a5cf83da54a52`, environment revision 0. It adds the fare adapter and explicit estimate labels; activation remains pending the Site fare secret.

