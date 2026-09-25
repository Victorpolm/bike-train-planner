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

Private **version 18** succeeded on **24 September 2026 at 22:06:03 UTC**, from Site source `ac87a6cee810faed5071f9bee7dfdd41e712a2f2`. The saved version is `appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_68c9e666df048191b334d8e8dd8c6712`; deployment `appgdep_6ab59ebb764881919cdb5826e4ea0fed` reports `succeeded`. Owner-only access was preserved.

This publication updates the presets to City 15, Relaxed 20, Regular 25 (default), Sportive 30 and Electric 25 km/h. All remain editable. It retains the prior changes that separate verified access from ticket/reservation uncertainty, label actual journey permission, apply reviewed ordinary ZVV-operator/tpg bus/tram rules, and provide adjustable City/Relaxed/Regular/Sportive/Electric cycling profiles with slope-dependent timing and profile-aware caching. The earlier all-mode selector, public service symbols, SBB IR/SOB defaults and overnight rail-exit fixes remain. The prior Baden/provider-recovery fixes remain. Environment revision remains **0**: OJP runtime activation is pending, while keyless public bicycle details are active.

**145 application tests**, TypeScript and frontend/Worker builds pass. React server-render checks verified speed controls, the slope table, cycling explanations and verified PostBus ticket/reservation fields. Replaying the recorded Chur–Laax road geometry produces distinct timings for each rider profile; see [EXPERIMENTS.md](EXPERIMENTS.md). Browser preview infrastructure was unavailable, so no new desktop/mobile visual verification is claimed. The unchanged Python suite was last verified at 13 tests.

Older `SOURCE.md` and `project-documentation` files in Site history are dated snapshots. Current project documentation is authoritative here in GitHub. All tracked app files match this exact deployed Site source. A GitHub push alone does not publish a Site version.
