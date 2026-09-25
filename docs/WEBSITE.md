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

Private **version 20** succeeded on **25 September 2026 at 13:36:57 UTC**, from Site source 8a0a7d7ca02e7f06471aa694c1b2831940646868. All 97 tracked application files match GitHub implementation commit cead54c468ea570eed97ae551797915f3d3fb5e9. The saved version is appgprj_6a9bdfc1819481918c7085729f869ca9~appgver_d99ab12a1be48191ad3e3721cc98f15a; deployment appgdep_6ab678e7f15881919572aaea0f6a7f59 reports succeeded. Access was rechecked and remains owner-only, with no external visitors.

This publication places supported bicycle ticket/reservation prices below boardings on collapsed cards and adds Swiss named-place suggestions with venue type and address. A live query for fortyseven baden resolves the bath instead of Baden town. Partial town matches can no longer silently replace the typed destination. See PLACE_SEARCH.md for sources and external-service limits.

The existing train prerequisites, fare profiles, bicycle parking, cycling profiles, three carriage scopes, rail-exit improvements and bounded searches remain. The optional national timetable bridge remains disabled. Environment revision is still 0: public timetable symbols and reviewed rules work without the optional OJP key. No new paid service or hosting was added.

**163 application tests passed**, with TypeScript and frontend/Worker production builds. React server rendering verified collapsed-card price placement and all fare-profile states. A fresh live FORTYSEVEN lookup selected the bath's coordinates; the venue response arrived in 8.937 seconds. No new browser visual/interaction verification is claimed. The unrelated national timetable, import/GPX and OJP Python tests retain their prior verification record in EXPERIMENTS.md.

Current project documentation is authoritative in GitHub. Older project-documentation snapshots in Site history are historical. Application-file equality was checked after publication. Later documentation-only commits do not change the published application.

## Cost and privacy boundary

The Site remains owner-only. The existing GitHub source repository is public; personal recordings and secrets must not be committed. National data files and the experimental service remain local. Ask the owner before any hosting costs or production infrastructure purchase. No recurring data-refresh job or public tunnel was created.

See [implementation and remaining gates](SWISS_IMPLEMENTATION.md) and [GPX recording guide](GPX_RECORDING.md).
