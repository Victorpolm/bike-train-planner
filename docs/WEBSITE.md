# Website access and development

## Open the private website

[**Open private website**](https://bike-train-prototype-victorpolm.tim-gehrunge-2308.chatgpt.site)

The Site is restricted to its owner. Use the same ChatGPT account used to publish it; sign in if prompted. Knowing the address does not grant someone else access.

To open it from GitHub, visit the [repository home page](https://github.com/Victorpolm/bike-train-planner) and click **Open private website** near the top of the README. No download or local installation is needed.

## Run from Git on your computer

Install Git and Node.js 24, the version used for verification. The source repository is public; the deployed website is separately owner-private. Then run:

```bash
git clone https://github.com/Victorpolm/bike-train-planner.git
cd bike-train-planner/prototype-v0
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

The optional production OJP source needs a secret named `OJP_API_KEY` in this existing Site's runtime environment. GitHub Actions has a separately stored key that passed live checks, but GitHub cannot return a stored secret value for automatic transfer. Never expose the key through a workflow artifact or the frontend. Configure it in the Site and deploy the saved version to apply the environment revision. The application checks `/api/ojp/status` before selecting its provider and uses the public search.ch connection feed when OJP is unconfigured. Public bicycle symbols do not require that secret.

## Last verified publication

Private **version 19** succeeded on **25 September 2026 at 11:48:41 UTC**, from Site source ed0c5b1f5ef2433c1309df2b3f67539d0c3851fa. Its deployable application files exactly match GitHub implementation commit 809e740aab7371c58a9f22dee22f20fa20f1140e. The saved version is appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_14c9a967a0148191ad5a6345496662a9; deployment appgdep_6ab65f872c088191a485ada4e104c96b reports succeeded. Access was rechecked: one owner, no additional users/groups or external viewers.

This publication adds sourced date-aware train bicycle rules, ticket/reservation price guidance, full fare/Half Fare/GA and annual-bike-pass preferences, an official bicycle-parking layer, and a 60-second deadline retaining useful results. The existing cycling profiles, three carriage scopes and rail-exit improvements remain. The optional national timetable bridge is present but **disabled**; its local service is not production-ready and no host was purchased. Environment revision remains **0**: the optional OJP runtime key remains unconfigured; public timetable symbols and reviewed rules work without it.

**180 automated tests passed:** 157 application, five national timetable, five import/GPX and 13 OJP Python tests. TypeScript and frontend/Worker production builds passed. React server rendering verified train prerequisites and GA bicycle-price presentation. Fresh live Baden and late Zürich–Chur–Laax checks found useful routes, with remaining exploration cut off at 60 seconds. The late-search first transit result took 25.3 seconds; the preferred initial latency target remains a release gate. Browser preview was unavailable and browser installation failed, so no new visual/interaction pass is claimed.

Current project documentation is authoritative in GitHub. Older project-documentation snapshots in Site history are historical. Application-file equality was checked after publication. Later documentation-only commits do not change the published application.

## Cost and privacy boundary

The Site remains owner-only. The existing GitHub source repository is public; personal recordings and secrets must not be committed. National data files and the experimental service remain local. Ask the owner before any hosting costs or production infrastructure purchase. No recurring data-refresh job or public tunnel was created.

See [implementation and remaining gates](SWISS_IMPLEMENTATION.md) and [GPX recording guide](GPX_RECORDING.md).
